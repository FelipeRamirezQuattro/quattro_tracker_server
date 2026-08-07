# Phase 3 — Ticket Re-parenting + Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `Ticket`/`Comment` domain — re-parented onto `Client`+`Project` instead of the old Postgres `client_product_id` — with real RBAC scoping for all three roles, an attachment pipeline that fixes the legacy IDOR and weak-key bugs, and a ticket-to-task promotion action, as described in `docs/plan/07-phasing-risks-open-questions.md` §7.1's Phase 3 row. This is also the cutover phase: once this ships and is verified, the old Postgres-backed `quattro_support_server`/its current client are retired in favor of `quattro_tracker_server` + `quattro_support_client` running against a clean, empty MongoDB. This plan covers the **application code** for that; the actual DNS/deploy cutover is a separate ops runbook (Part C) with no code deliverable.

**Architecture:** Backend work lands in `quattro_tracker_server`, following the exact `routes → services → Mongoose-models` layering and `services/scope.ts` query-scoping pattern Phases 0–2 established. `Ticket` is the first entity that needs **two different** scoping shapes on the same collection depending on role (`clientId` for `final_user`, `projectId` for `user`), so it gets a small role-dispatching helper (`scopeTicketFilter`, in `ticketService.ts`) on top of one new primitive in `scope.ts` (`scopeByClientIdFilter`), the same way Phase 1 added `scopeByProjectIdFilter` and Phase 2 added `scopeOwnUserFilter`. Attachments are new infrastructure for this codebase — a small S3 vendor-boundary service (`attachmentService.ts`) — and the file-download route resolves ownership against the parent Ticket/Comment before ever touching S3, which is the actual fix for the legacy `/api/file?path=` IDOR. Frontend work lands in `quattro_support_client` in place; the ticket UI is a **fresh build**, not a port — the old Support/Ticket UI was already deleted (`95447bb chore: delete legacy Support/Ticket/Client/Admin/Dashboard/UserGuide module`) and nothing under `src/components/pages/ticket/` or similar survives to reuse.

**Tech Stack:** unchanged from Phases 0–2 — server: Express, TypeScript, Mongoose, Jest + ts-jest + supertest + mongodb-memory-server, plus two new dependencies this phase introduces (`multer` for multipart parsing, `@aws-sdk/client-s3` for attachment storage); client: CRA, TypeScript, AntD v5 (`Upload` component, new to this phase), `@tanstack/react-query`.

## Global Constraints

- Every field, index, and scoping rule for `Ticket`/`Comment` must match `docs/plan/02-data-model.md` §2.2/§2.3 and `docs/plan/03-api-and-rbac.md` §3.1/§3.2 exactly. Fields: `clientId` (ObjectId ref Client, required, indexed), `projectId` (ObjectId ref Project, required, indexed), `subject` (String, required), `solved` (Boolean, required, default false, indexed), `comments` (embedded array, not a separate collection — "Ticket comment threads are bounded... always read together with their ticket"), `promotedTaskId` (ObjectId ref Task, nullable), `deletedAt`. Embedded `Comment`: `userId` (required), `comment` (required), `isAdmin` (default false, computed as `role !== 'final_user'` at write time), `attachmentKey` (nullable S3 key), `createdAt`. Indexes: `{clientId:1, projectId:1}`, `{projectId:1, solved:1}`.
- **Referential integrity, enforced in the service layer, not the schema:** a Ticket's `projectId` must actually belong to its `clientId`. `createTicket` looks both documents up and rejects (returns `null` → 404) if `project.clientId !== clientId`.
- **RBAC scoping for Ticket is role-dependent on which foreign key gates access** (`docs/plan/03-api-and-rbac.md` §3.2, Ticket row): `final_user` is scoped by `clientId ∈ assignedClientIds`; `user` (employee) is scoped by `projectId ∈ assignedProjectIds`; `admin` is unrestricted. This applies to **both listing/reading and creating** — a `final_user` can only create a ticket for a client in their `assignedClientIds`, and a `user` can only create one for a project in their `assignedProjectIds`. Do not reuse `clientService.getClient`/`projectService.getProject` for this validation (their scoping helpers apply the same rule to *any* non-admin, which is coincidentally correct for `user`'s project check but not precise enough to express the two-different-fields-per-role rule cleanly) — `ticketService.createTicket` does its own raw `Client`/`Project` existence + membership checks.
- **Known contradiction in the source plan — resolved conservatively, flag before implementing:** `docs/plan/03-api-and-rbac.md` §3.2's Ticket row lists **Update: "Admin, User (status/comments on assigned projects)"** — no `final_user` — but the same row's scoping-rule column says "Final user: create/read/**reopen-close** only on `clientId ∈ assignedClientIds`," implying a final_user *can* toggle `solved`. This plan follows the explicit **Update** column (`PUT /api/tickets/:id` is `admin`+`user` only, no `final_user`) since it's the more specific of the two conflicting statements, and every other PUT route in this codebase is a flat `requireRole(...)` list with no per-role scope-shape switch inside the handler. **Confirm with the owner before Task 7** whether final_user-driven reopen/close is a real requirement; if so it needs its own route or a body-level restriction (e.g. final_user may only ever send `{solved: true}` on their own ticket), not a change to this plan's `PUT` role list alone.
- **Weak-key fix:** any new S3 key this phase generates uses `crypto.randomUUID()` (`attachmentService.generateAttachmentKey`), never a `Math.random()`/`Date.now()`-based scheme like the legacy app's `generateRandomString()`.
- **IDOR fix:** `GET /api/files/:attachmentId` takes a **Comment subdocument `_id`**, never a raw S3 key, and resolves it via `commentService.findAttachment(user, attachmentId)` — which reuses `scopeTicketFilter` to verify the caller can see the parent ticket — before ever calling S3. The raw S3 key is never returned to or accepted from the client in any response or request body.
- **No legacy component reuse.** `src/components/pages/ticket/` (or wherever `TicketList`/`SupportForm`/`CommentForm`/`UploadInput` used to live) was deleted in commit `95447bb` along with the rest of the old Support module. `src/components/pages/` currently contains only `home/` and `login/`. Build the ticket UI fresh against this codebase's current AntD v5 + TanStack Query conventions (see `TaskDetailPage.tsx`/`TimesheetPage.tsx` for the patterns to follow) — an older planning doc (`docs/plan/04-frontend.md`) assumed those components would survive to be "modified," but that assumption predates the deletion and no longer holds.
- **No cascade deletes, no data migration, no dual-write cutover** — all standing project-wide decisions (`docs/plan/06-cleanup-and-migration.md` §6.2, `docs/plan/07-phasing-risks-open-questions.md` §7.3) that also apply here: `deleteTicket` is a plain admin-only soft-delete with no cascade to anything else, and nothing in this phase writes an import/migration path against the old Postgres data — see Part C.
- No new client-side routing abstraction (no "RoleProtectedRoute" component) — same convention as Phase 2: hide nav entries a role can't use, let the server's 403/404 plus the existing `DisplayComponent` handle anyone who reaches a page/query they're not allowed to use. The one exception, consistent with the RBAC table above: the `/support` nav link is shown to **all** roles (unlike `My Time`/`Reports`), since every role has *some* access to tickets.
- New AWS env vars (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`) are added to `config/env.ts` as **optional** (`process.env.X || ''`), not `required()`. Every existing route/service test file sets `process.env.*` by hand and does not set any AWS vars — making them `required()` would break every pre-existing integration test. Production deployment (Part C) is where these actually need real values.
- No comments in code except where a decision is genuinely non-obvious from reading it (matches Phase 1/2's constraint).
- **Git/commit strategy — matches Phase 2, not Phase 0/1.** No task below has a commit step. Work stays uncommitted across all of Part A and Part B. The **only** commits in this entire phase are the two in the final task (Task 15) — one commit in `quattro_tracker_server` covering every server file this phase touched, one commit in `quattro_support_client` covering every client file this phase touched. Do not push, open a PR, or touch any branch beyond the local commit.

## File Structure

| File | Action |
|---|---|
| `quattro_tracker_server/src/db/models/Ticket.ts` | create |
| `quattro_tracker_server/src/services/scope.ts` | modify — add `scopeByClientIdFilter` |
| `quattro_tracker_server/src/services/ticketService.ts` | create |
| `quattro_tracker_server/src/services/commentService.ts` | create |
| `quattro_tracker_server/src/services/ticketPromotionService.ts` | create |
| `quattro_tracker_server/src/services/attachmentService.ts` | create |
| `quattro_tracker_server/src/routes/tickets.ts` | create |
| `quattro_tracker_server/src/routes/files.ts` | create |
| `quattro_tracker_server/src/app.ts` | modify — mount `/api/tickets`, `/api/files` |
| `quattro_tracker_server/src/config/env.ts` | modify — add optional AWS_* fields |
| `quattro_tracker_server/.env.example` | modify — document AWS_* vars |
| `quattro_tracker_server/package.json` | modify — add `multer`, `@aws-sdk/client-s3`, `@types/multer` |
| `quattro_support_client/src/hooks/apiRequest.ts` | modify — FormData support + `apiDownload` |
| `quattro_support_client/src/types/interfaces.ts` | modify — add `TicketProps`, `CommentProps` |
| `quattro_support_client/src/utils/queryKeys.ts` | modify — add `ticketKeys` |
| `quattro_support_client/src/queries/tickets.ts` | create |
| `quattro_support_client/src/navigation/routes/routes.tsx` | modify — add `tickets`, `newTicket`, `ticketDetail` |
| `quattro_support_client/src/navigation/components/AppHeader.tsx` | modify — add "Support" nav link |
| `quattro_support_client/src/pages/index.ts` | modify — barrel-export 3 new pages |
| `quattro_support_client/src/pages/tickets/TicketListPage.tsx` (+`.test.tsx`) | create |
| `quattro_support_client/src/pages/tickets/TicketNewPage.tsx` (+`.test.tsx`) | create |
| `quattro_support_client/src/pages/tickets/TicketDetailPage.tsx` (+`.test.tsx`) | create |
| `quattro_support_client/src/pages/tickets/CommentThread.tsx` | create |

---

# Part A — Server (`quattro_tracker_server`)

### Task 1: `Ticket` model + embedded `Comment` subdocument

**Files:**
- Create: `quattro_tracker_server/src/db/models/Ticket.ts`
- Test: `quattro_tracker_server/tests/unit/db/models/Ticket.test.ts`

**Interfaces:**
- Consumes: `softDeletePlugin` (`src/db/models/plugins/softDelete.ts`, Phase 0).
- Produces: `IComment`, `ITicket` interfaces, `Ticket` Mongoose model. Comments live in `ticket.comments: mongoose.Types.DocumentArray<IComment>` — the same embedded-`DocumentArray` shape `Task.ts` already uses for `subtasks`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/db/models/Ticket.test.ts
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../../utils/testDb';
import { Ticket } from '../../../../src/db/models/Ticket';

describe('Ticket model', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('creates a ticket with defaults', async () => {
    const ticket = await Ticket.create({
      clientId: new mongoose.Types.ObjectId(),
      projectId: new mongoose.Types.ObjectId(),
      subject: 'Cannot log in',
    });
    expect(ticket.solved).toBe(false);
    expect(ticket.comments).toHaveLength(0);
    expect(ticket.promotedTaskId).toBeNull();
    expect(ticket.deletedAt).toBeNull();
  });

  it('requires clientId, projectId, and subject', async () => {
    await expect(Ticket.create({} as any)).rejects.toThrow();
  });

  it('defaults an embedded comment\'s isAdmin to false and attachmentKey to null', async () => {
    const ticket = await Ticket.create({
      clientId: new mongoose.Types.ObjectId(),
      projectId: new mongoose.Types.ObjectId(),
      subject: 'X',
      comments: [{ userId: new mongoose.Types.ObjectId(), comment: 'First reply' }],
    });
    expect(ticket.comments[0].isAdmin).toBe(false);
    expect(ticket.comments[0].attachmentKey).toBeNull();
    expect(ticket.comments[0].createdAt).toBeInstanceOf(Date);
  });

  it('is excluded from find() once soft-deleted', async () => {
    const ticket = await Ticket.create({
      clientId: new mongoose.Types.ObjectId(),
      projectId: new mongoose.Types.ObjectId(),
      subject: 'X',
      deletedAt: new Date(),
    });
    expect(await Ticket.findById(ticket._id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/db/models/Ticket.test.ts`
Expected: FAIL — cannot find module `../../../../src/db/models/Ticket`.

- [ ] **Step 3: Create `src/db/models/Ticket.ts`**

```typescript
import mongoose, { Schema, Types } from 'mongoose';
import { softDeletePlugin } from './plugins/softDelete';

export interface IComment {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  comment: string;
  isAdmin: boolean;
  attachmentKey: string | null;
  createdAt: Date;
}

export interface ITicket {
  clientId: Types.ObjectId;
  projectId: Types.ObjectId;
  subject: string;
  solved: boolean;
  comments: mongoose.Types.DocumentArray<IComment>;
  promotedTaskId: Types.ObjectId | null;
  deletedAt: Date | null;
}

const commentSchema = new Schema<IComment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    comment: { type: String, required: true },
    isAdmin: { type: Boolean, required: true, default: false },
    attachmentKey: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const ticketSchema = new Schema<ITicket>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    subject: { type: String, required: true },
    solved: { type: Boolean, required: true, default: false, index: true },
    comments: [commentSchema],
    promotedTaskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
  },
  { timestamps: true }
);

ticketSchema.index({ clientId: 1, projectId: 1 });
ticketSchema.index({ projectId: 1, solved: 1 });

softDeletePlugin(ticketSchema);

export const Ticket = mongoose.model<ITicket>('Ticket', ticketSchema);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/db/models/Ticket.test.ts`
Expected: PASS (4/4)

---

### Task 2: Extend `scope.ts` with a client-id scoping filter

**Files:**
- Modify: `quattro_tracker_server/src/services/scope.ts`
- Test: `quattro_tracker_server/tests/unit/services/scope.byClientId.test.ts`

**Interfaces:**
- Consumes: `AuthUser` (Phase 0, already in `scope.ts`).
- Produces: `scopeByClientIdFilter(user: AuthUser, baseFilter?: Record<string, any>): Record<string, any>` — same shape/behavior as `scopeByProjectIdFilter` (Phase 1) but merges `{ clientId: { $in: user.assignedClientIds } }` instead of a `projectId` condition. This is the primitive `ticketService.scopeTicketFilter` (Task 3) dispatches to for a `final_user`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/services/scope.byClientId.test.ts
import { scopeByClientIdFilter, AuthUser } from '../../../src/services/scope';

const adminUser: AuthUser = {
  id: 'admin1', role: 'admin', tokenVersion: 0, assignedClientIds: [], assignedProjectIds: [],
};
const scopedUser: AuthUser = {
  id: 'contact1', role: 'final_user', tokenVersion: 0, assignedClientIds: ['c1'], assignedProjectIds: [],
};

describe('scopeByClientIdFilter', () => {
  it('returns the base filter unchanged for admin', () => {
    expect(scopeByClientIdFilter(adminUser, { solved: false })).toEqual({ solved: false });
  });

  it('merges a clientId $in filter for a non-admin', () => {
    expect(scopeByClientIdFilter(scopedUser, { solved: false })).toEqual({
      solved: false,
      clientId: { $in: ['c1'] },
    });
  });

  it('wraps in $and when the base filter already has a clientId key', () => {
    expect(scopeByClientIdFilter(scopedUser, { clientId: 'other-client' })).toEqual({
      $and: [{ clientId: 'other-client' }, { clientId: { $in: ['c1'] } }],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/services/scope.byClientId.test.ts`
Expected: FAIL — `scopeByClientIdFilter` is not exported yet.

- [ ] **Step 3: Add `scopeByClientIdFilter` to `src/services/scope.ts`**

```typescript
export function scopeByClientIdFilter(user: AuthUser, baseFilter: Record<string, any> = {}) {
  if (user.role === 'admin') return baseFilter;
  const scopeCondition = { clientId: { $in: user.assignedClientIds } };
  if ('clientId' in baseFilter) {
    return { $and: [baseFilter, scopeCondition] };
  }
  return { ...baseFilter, ...scopeCondition };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/services/scope.byClientId.test.ts`
Expected: PASS (3/3)

---

### Task 3: `ticketService.ts` — `scopeTicketFilter` + CRUD

**Files:**
- Create: `quattro_tracker_server/src/services/ticketService.ts`
- Test: `quattro_tracker_server/tests/integration/services/ticketService.test.ts`

**Interfaces:**
- Consumes: `Ticket` (Task 1), `scopeByClientIdFilter` (Task 2), `scopeByProjectIdFilter` (Phase 1, already in `scope.ts`), `Client`/`Project` models (Phase 0).
- Produces: `scopeTicketFilter(user: AuthUser, baseFilter?): Record<string, any>` — dispatches to `scopeByClientIdFilter` for `final_user`, `scopeByProjectIdFilter` for everyone else (admin is unrestricted inside either branch). `listTickets(user, filters)`, `getTicket(user, id)`, `createTicket(user, data)`, `updateTicket(user, id, data)`, `deleteTicket(id)` — same `null`-means-"not found or not yours" convention as every other service in this codebase.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/services/ticketService.test.ts
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Ticket } from '../../../src/db/models/Ticket';
import {
  listTickets,
  getTicket,
  createTicket,
  updateTicket,
  deleteTicket,
} from '../../../src/services/ticketService';
import { AuthUser } from '../../../src/services/scope';

function authUserFor(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: String(new mongoose.Types.ObjectId()),
    role: 'user',
    tokenVersion: 0,
    assignedClientIds: [],
    assignedProjectIds: [],
    ...overrides,
  };
}

describe('ticketService', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('lets an admin create a ticket for any client/project', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const admin = authUserFor({ role: 'admin' });

    const ticket = await createTicket(admin, {
      clientId: String(client._id), projectId: String(project._id), subject: 'Cannot log in',
    });
    expect(ticket).not.toBeNull();
    expect(String(ticket!.clientId)).toBe(String(client._id));
  });

  it('refuses to create a ticket for a final_user outside their assignedClientIds', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const outsider = authUserFor({ role: 'final_user', assignedClientIds: [String(new mongoose.Types.ObjectId())] });

    const ticket = await createTicket(outsider, {
      clientId: String(client._id), projectId: String(project._id), subject: 'X',
    });
    expect(ticket).toBeNull();
  });

  it('refuses to create a ticket for a user outside their assignedProjectIds', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const outsider = authUserFor({ role: 'user', assignedProjectIds: [String(new mongoose.Types.ObjectId())] });

    const ticket = await createTicket(outsider, {
      clientId: String(client._id), projectId: String(project._id), subject: 'X',
    });
    expect(ticket).toBeNull();
  });

  it('rejects a projectId that does not belong to the given clientId', async () => {
    const clientA = await Client.create({ name: 'Acme' });
    const clientB = await Client.create({ name: 'Globex' });
    const projectOfB = await Project.create({ clientId: clientB._id, name: 'Mobile' });
    const admin = authUserFor({ role: 'admin' });

    const ticket = await createTicket(admin, {
      clientId: String(clientA._id), projectId: String(projectOfB._id), subject: 'X',
    });
    expect(ticket).toBeNull();
  });

  it('only returns a final_user\'s own client\'s tickets from listTickets', async () => {
    const clientA = await Client.create({ name: 'Acme' });
    const clientB = await Client.create({ name: 'Globex' });
    const projectA = await Project.create({ clientId: clientA._id, name: 'Website' });
    const projectB = await Project.create({ clientId: clientB._id, name: 'Mobile' });
    await Ticket.create({ clientId: clientA._id, projectId: projectA._id, subject: 'A ticket' });
    await Ticket.create({ clientId: clientB._id, projectId: projectB._id, subject: 'B ticket' });

    const contact = authUserFor({ role: 'final_user', assignedClientIds: [String(clientA._id)] });
    const results = await listTickets(contact, {});
    expect(results).toHaveLength(1);
    expect(results[0].subject).toBe('A ticket');
  });

  it('only returns a user\'s own assigned project\'s tickets from listTickets', async () => {
    const client = await Client.create({ name: 'Acme' });
    const projectA = await Project.create({ clientId: client._id, name: 'Website' });
    const projectB = await Project.create({ clientId: client._id, name: 'Mobile' });
    await Ticket.create({ clientId: client._id, projectId: projectA._id, subject: 'A ticket' });
    await Ticket.create({ clientId: client._id, projectId: projectB._id, subject: 'B ticket' });

    const employee = authUserFor({ role: 'user', assignedProjectIds: [String(projectA._id)] });
    const results = await listTickets(employee, {});
    expect(results).toHaveLength(1);
    expect(results[0].subject).toBe('A ticket');
  });

  it('allowlists only subject/solved on updateTicket', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'Old' });
    const employee = authUserFor({ role: 'user', assignedProjectIds: [String(project._id)] });

    const updated = await updateTicket(employee, String(ticket._id), { subject: 'New', solved: true });
    expect(updated!.subject).toBe('New');
    expect(updated!.solved).toBe(true);
  });

  it('soft-deletes rather than removing the document', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });

    const deleted = await deleteTicket(String(ticket._id));
    expect(deleted!.deletedAt).not.toBeNull();
    expect(await Ticket.findById(ticket._id)).toBeNull();
  });

  it('getTicket returns null for a ticket outside the caller\'s scope', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const outsider = authUserFor({ role: 'user', assignedProjectIds: [String(new mongoose.Types.ObjectId())] });

    expect(await getTicket(outsider, String(ticket._id))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/services/ticketService.test.ts`
Expected: FAIL — cannot find module `../../../src/services/ticketService`.

- [ ] **Step 3: Create `src/services/ticketService.ts`**

```typescript
import mongoose from 'mongoose';
import { Ticket } from '../db/models/Ticket';
import { Client } from '../db/models/Client';
import { Project } from '../db/models/Project';
import { AuthUser, scopeByProjectIdFilter, scopeByClientIdFilter } from './scope';

interface TicketFilters {
  projectId?: string;
  clientId?: string;
  solved?: boolean;
}

// Ticket is the one entity scoped by two different foreign keys depending on
// role: a final_user's portal account is tied to a client, not individual
// projects, so they're scoped by clientId; an employee ("user") is scoped by
// projectId like every other Scrum entity. Admin is unrestricted either way.
export function scopeTicketFilter(user: AuthUser, baseFilter: Record<string, any> = {}) {
  if (user.role === 'final_user') return scopeByClientIdFilter(user, baseFilter);
  return scopeByProjectIdFilter(user, baseFilter);
}

export async function listTickets(user: AuthUser, filters: TicketFilters) {
  const baseFilter: Record<string, any> = {};
  if (filters.projectId) baseFilter.projectId = filters.projectId;
  if (filters.clientId) baseFilter.clientId = filters.clientId;
  if (filters.solved !== undefined) baseFilter.solved = filters.solved;
  return Ticket.find(scopeTicketFilter(user, baseFilter)).sort({ createdAt: -1 });
}

export async function getTicket(user: AuthUser, id: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    return await Ticket.findOne(scopeTicketFilter(user, { _id: objectId }));
  } catch {
    return null;
  }
}

// Deliberately does NOT reuse clientService.getClient/projectService.getProject:
// those scope Client/Project lookups by assignedClientIds/assignedProjectIds
// for any non-admin, which doesn't express Ticket's actual rule ("final_user
// gated by clientId, user gated by projectId — not both, per role"). This does
// its own raw existence + referential-integrity check instead.
export async function createTicket(
  user: AuthUser,
  data: { clientId: string; projectId: string; subject: string }
) {
  if (user.role === 'final_user' && !user.assignedClientIds.includes(data.clientId)) return null;
  if (user.role === 'user' && !user.assignedProjectIds.includes(data.projectId)) return null;

  let client, project;
  try {
    client = await Client.findOne({ _id: data.clientId, deletedAt: null });
    project = await Project.findOne({ _id: data.projectId, deletedAt: null });
  } catch {
    return null;
  }
  if (!client || !project) return null;
  if (String(project.clientId) !== String(client._id)) return null;

  return Ticket.create({
    clientId: client._id,
    projectId: project._id,
    subject: data.subject,
    solved: false,
    comments: [],
  });
}

// PUT is admin/user only (route-guarded) — final_user never reaches this, so
// scopeTicketFilter's clientId branch is unreachable here in practice, but
// calling the shared dispatcher (rather than scopeByProjectIdFilter directly)
// keeps this in lockstep if that route guard ever changes.
export async function updateTicket(user: AuthUser, id: string, data: { subject?: string; solved?: boolean }) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    const filter = scopeTicketFilter(user, { _id: objectId });
    const allowlisted: Record<string, any> = {};
    if (data.subject !== undefined) allowlisted.subject = data.subject;
    if (data.solved !== undefined) allowlisted.solved = data.solved;
    return await Ticket.findOneAndUpdate(filter, allowlisted, { returnDocument: 'after' });
  } catch {
    return null;
  }
}

// DELETE is admin-only (route-guarded) — unscoped, mirrors deleteProject/deleteClient.
export async function deleteTicket(id: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(id);
    return await Ticket.findOneAndUpdate({ _id: objectId }, { deletedAt: new Date() }, { returnDocument: 'after' });
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/services/ticketService.test.ts`
Expected: PASS (9/9)

---

### Task 4: `commentService.ts` — `addComment` + `findAttachment`

**Files:**
- Create: `quattro_tracker_server/src/services/commentService.ts`
- Test: `quattro_tracker_server/tests/integration/services/commentService.test.ts`

**Interfaces:**
- Consumes: `Ticket` (Task 1), `scopeTicketFilter` (Task 3).
- Produces: `addComment(user, ticketId, data: { comment: string; attachmentKey?: string | null }): Promise<ITicket | null>`, `findAttachment(user, attachmentId): Promise<{ ticket: ITicket; comment: IComment } | null>`. `findAttachment` is the ownership-check query `routes/files.ts` (Task 8) uses — it reuses the exact same scoping as reading the ticket, so a caller can download an attachment iff they could see the parent ticket at all.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/services/commentService.test.ts
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Ticket } from '../../../src/db/models/Ticket';
import { addComment, findAttachment } from '../../../src/services/commentService';
import { AuthUser } from '../../../src/services/scope';

function authUserFor(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: String(new mongoose.Types.ObjectId()),
    role: 'user', tokenVersion: 0, assignedClientIds: [], assignedProjectIds: [],
    ...overrides,
  };
}

describe('commentService', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('appends a comment with isAdmin=false for a final_user', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const contact = authUserFor({ role: 'final_user', assignedClientIds: [String(client._id)] });

    const updated = await addComment(contact, String(ticket._id), { comment: 'When will this be fixed?' });
    expect(updated!.comments).toHaveLength(1);
    expect(updated!.comments[0].isAdmin).toBe(false);
    expect(updated!.comments[0].attachmentKey).toBeNull();
  });

  it('appends a comment with isAdmin=true for an employee', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const employee = authUserFor({ role: 'user', assignedProjectIds: [String(project._id)] });

    const updated = await addComment(employee, String(ticket._id), { comment: 'Looking into it', attachmentKey: 'tickets/key-1' });
    expect(updated!.comments[0].isAdmin).toBe(true);
    expect(updated!.comments[0].attachmentKey).toBe('tickets/key-1');
  });

  it('returns null when the caller is out of scope for the parent ticket', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const outsider = authUserFor({ role: 'final_user', assignedClientIds: [String(new mongoose.Types.ObjectId())] });

    expect(await addComment(outsider, String(ticket._id), { comment: 'Hi' })).toBeNull();
  });

  it('findAttachment returns the ticket and comment for an in-scope caller', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const contact = authUserFor({ role: 'final_user', assignedClientIds: [String(client._id)] });
    const updated = await addComment(contact, String(ticket._id), { comment: 'See attached', attachmentKey: 'tickets/key-1' });
    const commentId = String(updated!.comments[0]._id);

    const found = await findAttachment(contact, commentId);
    expect(found).not.toBeNull();
    expect(found!.comment.attachmentKey).toBe('tickets/key-1');
  });

  it('findAttachment returns null for an out-of-scope caller (IDOR guard)', async () => {
    const clientA = await Client.create({ name: 'Acme' });
    const clientB = await Client.create({ name: 'Globex' });
    const projectA = await Project.create({ clientId: clientA._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: clientA._id, projectId: projectA._id, subject: 'X' });
    const ownerContact = authUserFor({ role: 'final_user', assignedClientIds: [String(clientA._id)] });
    const updated = await addComment(ownerContact, String(ticket._id), { comment: 'See attached', attachmentKey: 'tickets/key-1' });
    const commentId = String(updated!.comments[0]._id);

    const outsiderContact = authUserFor({ role: 'final_user', assignedClientIds: [String(clientB._id)] });
    expect(await findAttachment(outsiderContact, commentId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/services/commentService.test.ts`
Expected: FAIL — cannot find module `../../../src/services/commentService`.

- [ ] **Step 3: Create `src/services/commentService.ts`**

```typescript
import mongoose from 'mongoose';
import { Ticket } from '../db/models/Ticket';
import { AuthUser } from './scope';
import { scopeTicketFilter } from './ticketService';

export async function addComment(
  user: AuthUser,
  ticketId: string,
  data: { comment: string; attachmentKey?: string | null }
) {
  try {
    const objectId = new mongoose.Types.ObjectId(ticketId);
    const ticket = await Ticket.findOne(scopeTicketFilter(user, { _id: objectId }));
    if (!ticket) return null;

    ticket.comments.push({
      userId: new mongoose.Types.ObjectId(user.id),
      comment: data.comment,
      isAdmin: user.role !== 'final_user',
      attachmentKey: data.attachmentKey ?? null,
    } as any);
    await ticket.save();
    return ticket;
  } catch {
    return null;
  }
}

export async function findAttachment(user: AuthUser, attachmentId: string) {
  try {
    const objectId = new mongoose.Types.ObjectId(attachmentId);
    const ticket = await Ticket.findOne(scopeTicketFilter(user, { 'comments._id': objectId }));
    if (!ticket) return null;
    const comment = ticket.comments.id(objectId);
    if (!comment) return null;
    return { ticket, comment };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/services/commentService.test.ts`
Expected: PASS (5/5)

---

### Task 5: `ticketPromotionService.ts` — `promoteTicket`

**Files:**
- Create: `quattro_tracker_server/src/services/ticketPromotionService.ts`
- Test: `quattro_tracker_server/tests/integration/services/ticketPromotionService.test.ts`

**Interfaces:**
- Consumes: `Ticket` (Task 1), `Task` model + `nextRank` (Phase 1, `src/helpers/rank.ts`), `scopeByProjectIdFilter` (Phase 1).
- Produces: `class AlreadyPromotedError extends Error {}`, `promoteTicket(user, ticketId): Promise<{ ticket: ITicket; task: ITask } | null>`. Creates a `Task` in the ticket's project with `status: 'backlog'`, links it via `ticket.promotedTaskId`, and never syncs again after creation (matches `docs/plan/02-data-model.md`'s "no automatic sync after creation" decision).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/services/ticketPromotionService.test.ts
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Ticket } from '../../../src/db/models/Ticket';
import { Task } from '../../../src/db/models/Task';
import { promoteTicket, AlreadyPromotedError } from '../../../src/services/ticketPromotionService';
import { AuthUser } from '../../../src/services/scope';

function authUserFor(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: String(new mongoose.Types.ObjectId()),
    role: 'user', tokenVersion: 0, assignedClientIds: [], assignedProjectIds: [],
    ...overrides,
  };
}

describe('ticketPromotionService', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('creates a backlog task in the ticket\'s project and links promotedTaskId', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'Cannot log in' });
    const employee = authUserFor({ role: 'user', assignedProjectIds: [String(project._id)] });

    const result = await promoteTicket(employee, String(ticket._id));
    expect(result).not.toBeNull();
    expect(result!.task.status).toBe('backlog');
    expect(result!.task.title).toBe('Cannot log in');
    expect(String(result!.task.projectId)).toBe(String(project._id));
    expect(String(result!.ticket.promotedTaskId)).toBe(String(result!.task._id));

    const persisted = await Ticket.findById(ticket._id);
    expect(String(persisted!.promotedTaskId)).toBe(String(result!.task._id));
  });

  it('throws AlreadyPromotedError on a second promotion attempt', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const employee = authUserFor({ role: 'user', assignedProjectIds: [String(project._id)] });

    await promoteTicket(employee, String(ticket._id));
    await expect(promoteTicket(employee, String(ticket._id))).rejects.toBeInstanceOf(AlreadyPromotedError);
  });

  it('returns null when the ticket is outside the caller\'s scope', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const outsider = authUserFor({ role: 'user', assignedProjectIds: [String(new mongoose.Types.ObjectId())] });

    expect(await promoteTicket(outsider, String(ticket._id))).toBeNull();
  });

  it('assigns an incrementing rank consistent with existing backlog tasks', async () => {
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    await Task.create({ projectId: project._id, title: 'Existing', reporterId: client._id, rank: 1000, status: 'backlog' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'New from ticket' });
    const employee = authUserFor({ role: 'user', assignedProjectIds: [String(project._id)] });

    const result = await promoteTicket(employee, String(ticket._id));
    expect(result!.task.rank).toBe(2000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/services/ticketPromotionService.test.ts`
Expected: FAIL — cannot find module `../../../src/services/ticketPromotionService`.

- [ ] **Step 3: Create `src/services/ticketPromotionService.ts`**

```typescript
import mongoose from 'mongoose';
import { Ticket } from '../db/models/Ticket';
import { Task } from '../db/models/Task';
import { AuthUser, scopeByProjectIdFilter } from './scope';
import { nextRank } from '../helpers/rank';

export class AlreadyPromotedError extends Error {}

export async function promoteTicket(user: AuthUser, ticketId: string) {
  let ticket;
  try {
    const objectId = new mongoose.Types.ObjectId(ticketId);
    ticket = await Ticket.findOne(scopeByProjectIdFilter(user, { _id: objectId }));
  } catch {
    return null;
  }
  if (!ticket) return null;
  if (ticket.promotedTaskId) {
    throw new AlreadyPromotedError('This ticket has already been promoted to a task');
  }

  const maxRankDoc = await Task.findOne({ projectId: ticket.projectId, status: 'backlog' }).sort({ rank: -1 });
  const task = await Task.create({
    projectId: ticket.projectId,
    title: ticket.subject,
    description: '',
    reporterId: user.id,
    status: 'backlog',
    rank: nextRank(maxRankDoc ? maxRankDoc.rank : null),
  });

  ticket.promotedTaskId = task._id;
  await ticket.save();
  return { ticket, task };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/services/ticketPromotionService.test.ts`
Expected: PASS (4/4)

---

### Task 6: `attachmentService.ts` + S3/multer dependencies + env vars

**Files:**
- Create: `quattro_tracker_server/src/services/attachmentService.ts`
- Modify: `quattro_tracker_server/package.json` (add `@aws-sdk/client-s3`, `multer`, `@types/multer`)
- Modify: `quattro_tracker_server/src/config/env.ts` (add optional `awsAccessKeyId`/`awsSecretAccessKey`/`awsRegion`/`awsS3Bucket`)
- Modify: `quattro_tracker_server/.env.example`
- Test: `quattro_tracker_server/tests/unit/services/attachmentService.test.ts`

**Interfaces:**
- Consumes: nothing from this codebase — this is the only file that imports `@aws-sdk/client-s3`, kept Mongo-free so it's fully mockable.
- Produces: `generateAttachmentKey(originalFilename: string): string` (uses `crypto.randomUUID()` — the weak-key fix), `uploadAttachment(key, buffer, contentType?): Promise<void>`, `getAttachmentObject(key): Promise<{ stream: Readable; contentType?: string }>`.

- [ ] **Step 1: Install dependencies**

Run: `npm install @aws-sdk/client-s3 multer && npm install -D @types/multer`

- [ ] **Step 2: Add optional AWS fields to `src/config/env.ts`**

```typescript
export interface Env {
  nodeEnv: string;
  port: number;
  mongoUri: string;
  jwtAccessSecret: string;
  jwtAccessExpiresIn: string;
  refreshTokenExpiresInDays: number;
  corsOrigins: string[];
  emailFrom: string;
  emailPassword: string;
  bcryptCostFactor: number;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;
  awsS3Bucket: string;
}
```

Append inside the returned object in `loadEnv()`:

```typescript
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    awsRegion: process.env.AWS_REGION || '',
    awsS3Bucket: process.env.AWS_S3_BUCKET || '',
```

- [ ] **Step 3: Append to `.env.example`**

```
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_S3_BUCKET=
```

- [ ] **Step 4: Write the failing test**

```typescript
// tests/unit/services/attachmentService.test.ts
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

import { generateAttachmentKey, uploadAttachment, getAttachmentObject } from '../../../src/services/attachmentService';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

describe('attachmentService', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('generates a key namespaced under tickets/ with a UUID and a sanitized filename', () => {
    const key = generateAttachmentKey('My Screenshot (1).png');
    expect(key).toMatch(/^tickets\/[0-9a-f-]{36}-My_Screenshot__1_\.png$/);
  });

  it('generates a unique key on every call', () => {
    const a = generateAttachmentKey('a.png');
    const b = generateAttachmentKey('a.png');
    expect(a).not.toBe(b);
  });

  it('uploadAttachment sends a PutObjectCommand with the right bucket/key/contentType', async () => {
    mockSend.mockResolvedValueOnce({});
    await uploadAttachment('tickets/key-1', Buffer.from('hi'), 'image/png');
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Key: 'tickets/key-1', ContentType: 'image/png' })
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('getAttachmentObject sends a GetObjectCommand and returns the stream/contentType', async () => {
    const fakeStream = {} as any;
    mockSend.mockResolvedValueOnce({ Body: fakeStream, ContentType: 'image/png' });
    const result = await getAttachmentObject('tickets/key-1');
    expect(GetObjectCommand).toHaveBeenCalledWith(expect.objectContaining({ Key: 'tickets/key-1' }));
    expect(result.stream).toBe(fakeStream);
    expect(result.contentType).toBe('image/png');
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test -- tests/unit/services/attachmentService.test.ts`
Expected: FAIL — cannot find module `../../../src/services/attachmentService`.

- [ ] **Step 6: Create `src/services/attachmentService.ts`**

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.AWS_S3_BUCKET || '';

function sanitize(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// crypto.randomUUID() replaces the legacy app's Math.floor(Math.random()*Date.now())
// key generator — this is the weak-key fix for this rewrite.
export function generateAttachmentKey(originalFilename: string): string {
  return `tickets/${randomUUID()}-${sanitize(originalFilename)}`;
}

export async function uploadAttachment(key: string, buffer: Buffer, contentType?: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));
}

export async function getAttachmentObject(key: string): Promise<{ stream: Readable; contentType?: string }> {
  const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return { stream: result.Body as Readable, contentType: result.ContentType };
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- tests/unit/services/attachmentService.test.ts`
Expected: PASS (4/4)

---

### Task 7: `routes/tickets.ts` + wire into `app.ts`

**Files:**
- Create: `quattro_tracker_server/src/routes/tickets.ts`
- Modify: `quattro_tracker_server/src/app.ts`
- Test: `quattro_tracker_server/tests/integration/routes/tickets.test.ts`

**Interfaces:**
- Consumes: `listTickets`/`getTicket`/`createTicket`/`updateTicket`/`deleteTicket` (Task 3), `addComment` (Task 4), `promoteTicket`/`AlreadyPromotedError` (Task 5), `generateAttachmentKey`/`uploadAttachment` (Task 6), `requireAuth`/`requireRole` (Phase 0).
- Produces: `createTicketsRouter(env: Env): Router`, mounted flat at `/api/tickets`. Per-verb roles: GET (list/detail) and POST (create) and POST `/:id/comments` → `admin, user, final_user`; PUT and POST `/:id/promote` → `admin, user`; DELETE → `admin` only.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/routes/tickets.test.ts
import request from 'supertest';
import { createApp } from '../../../src/app';
import { loadEnv } from '../../../src/config/env';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { User } from '../../../src/db/models/User';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Ticket } from '../../../src/db/models/Ticket';
import { hashPassword } from '../../../src/helpers/password';
import { signAccessToken } from '../../../src/helpers/jwt';

jest.mock('../../../src/services/attachmentService', () => ({
  generateAttachmentKey: jest.fn(() => 'tickets/mock-key-1-screenshot.png'),
  uploadAttachment: jest.fn().mockResolvedValue(undefined),
}));

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_SECRET = 'test-secret';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS = '30';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.BCRYPT_COST_FACTOR = '4';

const env = loadEnv();
const app = createApp(env);

async function authHeaderFor(user: any) {
  const token = signAccessToken(
    { sub: String(user._id), role: user.role, tokenVersion: user.tokenVersion },
    env.jwtAccessSecret,
    env.jwtAccessExpiresIn
  );
  return `Bearer ${token}`;
}

describe('tickets routes', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('lets an admin create a ticket for any client/project', async () => {
    const passwordHash = await hashPassword('x', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const auth = await authHeaderFor(admin);

    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', auth)
      .send({ clientId: String(client._id), projectId: String(project._id), subject: 'Cannot log in' });

    expect(res.status).toBe(201);
    expect(res.body.data.subject).toBe('Cannot log in');
  });

  it('404s a final_user creating a ticket for a client they are not assigned to', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const contact = await User.create({ name: 'Contact', username: 'contact', passwordHash, role: 'final_user' });
    const auth = await authHeaderFor(contact);

    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', auth)
      .send({ clientId: String(client._id), projectId: String(project._id), subject: 'X' });

    expect(res.status).toBe(404);
  });

  it('only lists a final_user\'s own client\'s tickets', async () => {
    const passwordHash = await hashPassword('x', 4);
    const clientA = await Client.create({ name: 'Acme' });
    const clientB = await Client.create({ name: 'Globex' });
    const projectA = await Project.create({ clientId: clientA._id, name: 'Website' });
    const projectB = await Project.create({ clientId: clientB._id, name: 'Mobile' });
    await Ticket.create({ clientId: clientA._id, projectId: projectA._id, subject: 'A ticket' });
    await Ticket.create({ clientId: clientB._id, projectId: projectB._id, subject: 'B ticket' });
    const contact = await User.create({
      name: 'Contact', username: 'contact', passwordHash, role: 'final_user', assignedClientIds: [clientA._id],
    });
    const auth = await authHeaderFor(contact);

    const res = await request(app).get('/api/tickets').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].subject).toBe('A ticket');
  });

  it('403s a user (non-admin) on DELETE', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const employee = await User.create({
      name: 'Employee', username: 'employee', passwordHash, role: 'user', assignedProjectIds: [project._id],
    });
    const auth = await authHeaderFor(employee);

    const res = await request(app).delete(`/api/tickets/${ticket._id}`).set('Authorization', auth);
    expect(res.status).toBe(403);
  });

  it('adds a comment with an uploaded attachment and stores the generated key', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'X' });
    const employee = await User.create({
      name: 'Employee', username: 'employee', passwordHash, role: 'user', assignedProjectIds: [project._id],
    });
    const auth = await authHeaderFor(employee);

    const res = await request(app)
      .post(`/api/tickets/${ticket._id}/comments`)
      .set('Authorization', auth)
      .field('comment', 'Here is a screenshot')
      .attach('attachment', Buffer.from('fake-image-bytes'), 'screenshot.png');

    expect(res.status).toBe(201);
    const comments = res.body.data.comments;
    expect(comments[comments.length - 1].attachmentKey).toBe('tickets/mock-key-1-screenshot.png');
  });

  it('promotes a ticket to a task, then 400s a second promotion attempt', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'Cannot log in' });
    const employee = await User.create({
      name: 'Employee', username: 'employee', passwordHash, role: 'user', assignedProjectIds: [project._id],
    });
    const auth = await authHeaderFor(employee);

    const first = await request(app).post(`/api/tickets/${ticket._id}/promote`).set('Authorization', auth);
    expect(first.status).toBe(200);
    expect(first.body.data.task.status).toBe('backlog');

    const second = await request(app).post(`/api/tickets/${ticket._id}/promote`).set('Authorization', auth);
    expect(second.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/routes/tickets.test.ts`
Expected: FAIL — `/api/tickets` isn't mounted yet.

- [ ] **Step 3: Create `src/routes/tickets.ts`**

```typescript
import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { Env } from '../config/env';
import { requireAuth } from '../middlewares/requireAuth';
import { requireRole } from '../middlewares/requireRole';
import { listTickets, getTicket, createTicket, updateTicket, deleteTicket } from '../services/ticketService';
import { addComment } from '../services/commentService';
import { promoteTicket, AlreadyPromotedError } from '../services/ticketPromotionService';
import { generateAttachmentKey, uploadAttachment } from '../services/attachmentService';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export function createTicketsRouter(env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get('/', requireRole('admin', 'user', 'final_user'), async (req, res) => {
    try {
      const { projectId, clientId, solved } = req.query;
      const tickets = await listTickets(req.authUser!, {
        projectId: projectId ? String(projectId) : undefined,
        clientId: clientId ? String(clientId) : undefined,
        solved: solved === undefined ? undefined : solved === 'true',
      });
      res.status(200).json({ success: true, data: tickets });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.post('/', requireRole('admin', 'user', 'final_user'), async (req, res) => {
    try {
      const ticket = await createTicket(req.authUser!, req.body);
      if (!ticket) {
        res.status(404).json({ success: false, message: 'Client or project not found' });
        return;
      }
      res.status(201).json({ success: true, data: ticket });
    } catch (err) {
      if (err instanceof mongoose.Error.ValidationError) {
        res.status(400).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.get('/:id', requireRole('admin', 'user', 'final_user'), async (req, res) => {
    try {
      const ticket = await getTicket(req.authUser!, String(req.params.id));
      if (!ticket) {
        res.status(404).json({ success: false, message: 'Ticket not found' });
        return;
      }
      res.status(200).json({ success: true, data: ticket });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  // Admin/user only — see Global Constraints for the source-plan contradiction
  // around a final_user "reopen-close" ability that this route does not grant.
  router.put('/:id', requireRole('admin', 'user'), async (req, res) => {
    try {
      const ticket = await updateTicket(req.authUser!, String(req.params.id), req.body);
      if (!ticket) {
        res.status(404).json({ success: false, message: 'Ticket not found' });
        return;
      }
      res.status(200).json({ success: true, data: ticket });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
      const ticket = await deleteTicket(String(req.params.id));
      if (!ticket) {
        res.status(404).json({ success: false, message: 'Ticket not found' });
        return;
      }
      res.status(200).json({ success: true });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  router.post(
    '/:id/comments',
    requireRole('admin', 'user', 'final_user'),
    (req, res, next) => {
      // app.ts has no global Express error-handling middleware, so a thrown
      // MulterError (e.g. file too large) must be caught right here or it
      // bypasses this route's own try/catch entirely.
      upload.single('attachment')(req, res, (err) => {
        if (err) {
          res.status(400).json({ success: false, message: err.message });
          return;
        }
        next();
      });
    },
    async (req, res) => {
      try {
        let attachmentKey: string | null = null;
        if (req.file) {
          attachmentKey = generateAttachmentKey(req.file.originalname);
          await uploadAttachment(attachmentKey, req.file.buffer, req.file.mimetype);
        }
        const ticket = await addComment(req.authUser!, String(req.params.id), {
          comment: req.body.comment,
          attachmentKey,
        });
        if (!ticket) {
          res.status(404).json({ success: false, message: 'Ticket not found' });
          return;
        }
        res.status(201).json({ success: true, data: ticket });
      } catch (err) {
        if (err instanceof mongoose.Error.ValidationError) {
          res.status(400).json({ success: false, message: err.message });
          return;
        }
        res.status(500).json({ success: false, message: 'Contact the system administrator.' });
      }
    }
  );

  router.post('/:id/promote', requireRole('admin', 'user'), async (req, res) => {
    try {
      const result = await promoteTicket(req.authUser!, String(req.params.id));
      if (!result) {
        res.status(404).json({ success: false, message: 'Ticket not found' });
        return;
      }
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AlreadyPromotedError) {
        res.status(400).json({ success: false, message: (err as Error).message });
        return;
      }
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });

  return router;
}
```

- [ ] **Step 4: Wire into `src/app.ts`**

```typescript
import { createTicketsRouter } from './routes/tickets';
// ...
app.use('/api/tickets', createTicketsRouter(env));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/integration/routes/tickets.test.ts`
Expected: PASS (6/6)

---

### Task 8: `routes/files.ts` (IDOR-fixed attachment download) + wire into `app.ts`

**Files:**
- Create: `quattro_tracker_server/src/routes/files.ts`
- Modify: `quattro_tracker_server/src/app.ts`
- Test: `quattro_tracker_server/tests/integration/routes/files.test.ts`

**Interfaces:**
- Consumes: `findAttachment` (Task 4), `getAttachmentObject` (Task 6), `requireAuth` (Phase 0).
- Produces: `createFilesRouter(env: Env): Router`, mounted flat at `/api/files`. `GET /:attachmentId` — `:attachmentId` is a Comment subdocument `_id`, resolved through the same scoping as reading the parent ticket, **before** ever touching S3. This route (plus its test below) is the actual IDOR fix and regression test for the legacy `/api/file?path=` endpoint.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/routes/files.test.ts
import request from 'supertest';
import { Readable } from 'stream';
import { createApp } from '../../../src/app';
import { loadEnv } from '../../../src/config/env';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { User } from '../../../src/db/models/User';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Ticket } from '../../../src/db/models/Ticket';
import { hashPassword } from '../../../src/helpers/password';
import { signAccessToken } from '../../../src/helpers/jwt';

jest.mock('../../../src/services/attachmentService', () => ({
  generateAttachmentKey: jest.fn(() => 'tickets/mock-key-1-screenshot.png'),
  uploadAttachment: jest.fn().mockResolvedValue(undefined),
  getAttachmentObject: jest.fn().mockResolvedValue({
    stream: Readable.from([Buffer.from('fake-image-bytes')]),
    contentType: 'image/png',
  }),
}));

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_SECRET = 'test-secret';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS = '30';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.BCRYPT_COST_FACTOR = '4';

const env = loadEnv();
const app = createApp(env);

async function authHeaderFor(user: any) {
  const token = signAccessToken(
    { sub: String(user._id), role: user.role, tokenVersion: user.tokenVersion },
    env.jwtAccessSecret,
    env.jwtAccessExpiresIn
  );
  return `Bearer ${token}`;
}

describe('files route (IDOR regression)', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('streams the attachment for a caller in scope for the parent ticket', async () => {
    const passwordHash = await hashPassword('x', 4);
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const ticket = await Ticket.create({
      clientId: client._id, projectId: project._id, subject: 'X',
      comments: [{ userId: client._id, comment: 'See attached', attachmentKey: 'tickets/key-1' }],
    });
    const contact = await User.create({
      name: 'Contact', username: 'contact', passwordHash, role: 'final_user', assignedClientIds: [client._id],
    });
    const auth = await authHeaderFor(contact);
    const commentId = ticket.comments[0]._id;

    const res = await request(app).get(`/api/files/${commentId}`).set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });

  it('404s a final_user from a different client requesting the same attachment (IDOR guard)', async () => {
    const passwordHash = await hashPassword('x', 4);
    const clientA = await Client.create({ name: 'Acme' });
    const clientB = await Client.create({ name: 'Globex' });
    const projectA = await Project.create({ clientId: clientA._id, name: 'Website' });
    const ticket = await Ticket.create({
      clientId: clientA._id, projectId: projectA._id, subject: 'X',
      comments: [{ userId: clientA._id, comment: 'See attached', attachmentKey: 'tickets/key-1' }],
    });
    const outsiderContact = await User.create({
      name: 'Outsider', username: 'outsider', passwordHash, role: 'final_user', assignedClientIds: [clientB._id],
    });
    const auth = await authHeaderFor(outsiderContact);
    const commentId = ticket.comments[0]._id;

    const res = await request(app).get(`/api/files/${commentId}`).set('Authorization', auth);
    expect(res.status).toBe(404);
  });

  it('404s a random/unknown attachmentId rather than 500ing', async () => {
    const passwordHash = await hashPassword('x', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const auth = await authHeaderFor(admin);

    const res = await request(app).get('/api/files/not-a-real-object-id').set('Authorization', auth);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/routes/files.test.ts`
Expected: FAIL — `/api/files` isn't mounted yet.

- [ ] **Step 3: Create `src/routes/files.ts`**

```typescript
import { Router } from 'express';
import { Env } from '../config/env';
import { requireAuth } from '../middlewares/requireAuth';
import { findAttachment } from '../services/commentService';
import { getAttachmentObject } from '../services/attachmentService';

export function createFilesRouter(env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get('/:attachmentId', async (req, res) => {
    try {
      const found = await findAttachment(req.authUser!, String(req.params.attachmentId));
      if (!found || !found.comment.attachmentKey) {
        res.status(404).json({ success: false, message: 'File not found' });
        return;
      }
      const { stream, contentType } = await getAttachmentObject(found.comment.attachmentKey);
      res.setHeader('Content-Type', contentType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${found.comment.attachmentKey.split('/').pop()}"`
      );
      stream.pipe(res);
    } catch {
      res.status(404).json({ success: false, message: 'File not found' });
    }
  });

  return router;
}
```

- [ ] **Step 4: Wire into `src/app.ts`**

```typescript
import { createFilesRouter } from './routes/files';
// ...
app.use('/api/files', createFilesRouter(env));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/integration/routes/files.test.ts`
Expected: PASS (3/3)

---

### Task 9: Full server regression run

**Files:** none (verification-only task).

- [ ] **Step 1: Run the full server test suite**

Run: `npm test`
Expected: every suite passes, including everything from Phases 0–2 — no regressions from the new `Ticket`/`Comment`/attachment code.

---

# Part B — Client (`quattro_support_client`)

### Task 10: `apiRequest.ts` — FormData support + `apiDownload`

**Files:**
- Modify: `quattro_support_client/src/hooks/apiRequest.ts`
- Modify: `quattro_support_client/src/hooks/apiRequest.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `apiDownload(endpoint: string): Promise<{ blob: Blob; filename: string }>` (new export), plus a `buildHeaders` fix so a `FormData` body no longer gets a hardcoded `Content-Type: application/json` (which would break the browser's multipart boundary). The existing single-flight-refresh logic is extracted into an internal `fetchWithAuthRetry` and reused by both `apiRequest` and `apiDownload` — it must not be duplicated, per this file's own comment about refresh-token reuse/theft detection.

- [ ] **Step 1: Write the failing tests (append to the existing `describe("apiRequest", ...)` file)**

```typescript
// added to src/hooks/apiRequest.test.ts
import { apiRequest, apiDownload, ApiError } from "./apiRequest";

// ...(existing describe("apiRequest", ...) block stays as-is)...

describe("apiDownload", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it("returns the blob and a filename parsed from Content-Disposition", async () => {
    localStorage.setItem("info", "token123");
    const fakeBlob = new Blob(["fake-bytes"]);
    jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Disposition": 'attachment; filename="screenshot.png"' }),
      blob: async () => fakeBlob,
    } as any);

    const result = await apiDownload("files/abc123");
    expect(result.filename).toBe("screenshot.png");
    expect(result.blob).toBe(fakeBlob);
  });

  it("throws ApiError on a failed download", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ success: false, message: "File not found" }),
    } as any);

    await expect(apiDownload("files/missing")).rejects.toMatchObject({ message: "File not found", status: 404 });
  });
});

describe("apiRequest with a FormData body", () => {
  it("does not set Content-Type, letting the browser set the multipart boundary", async () => {
    localStorage.setItem("info", "token123");
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: {} }),
    } as any);

    const formData = new FormData();
    formData.append("comment", "hi");
    await apiRequest("tickets/1/comments", { method: "POST", body: formData });

    const [, options] = fetchSpy.mock.calls[0];
    expect((options!.headers as any)["Content-Type"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test -- --watchAll=false --testPathPattern=apiRequest`
Expected: FAIL — `apiDownload` is not exported yet; the FormData test fails because `Content-Type` is always set today.

- [ ] **Step 3: Replace `src/hooks/apiRequest.ts` with the refactored version**

```typescript
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function buildHeaders(token: string | null, body: BodyInit | null | undefined, extra?: HeadersInit): HeadersInit {
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  return {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

async function rawFetch(endpoint: string, options: RequestInit, token: string | null): Promise<Response> {
  return fetch(`${process.env.REACT_APP_DEV_API}/${endpoint}`, {
    ...options,
    headers: buildHeaders(token, options.body, options.headers),
    credentials: "include",
  });
}

async function tryRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${process.env.REACT_APP_DEV_API}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    const body = await res.json();
    const newToken = body?.data?.accessToken;
    if (!newToken) return null;
    localStorage.setItem("info", newToken);
    return newToken;
  } catch {
    return null;
  }
}

// Single-flight guard: if multiple calls hit a 401 concurrently, they must
// share one in-flight refresh instead of each presenting the same rotating
// refresh cookie independently — the server treats a reused refresh token as
// theft/replay and revokes the whole chain. See docs/plan/03-api-and-rbac.md §3.3.
let refreshPromise: Promise<string | null> | null = null;

function getOrStartRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = tryRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

const AUTH_ENDPOINTS_EXCLUDED_FROM_REFRESH = ["auth/login", "auth/logout", "auth/refresh"];

function isExcludedFromRefresh(endpoint: string): boolean {
  return AUTH_ENDPOINTS_EXCLUDED_FROM_REFRESH.some(
    (excluded) => endpoint === excluded || endpoint.startsWith(`${excluded}?`)
  );
}

// Shared by apiRequest and apiDownload so both go through the same
// single-flight 401/refresh/retry dance rather than duplicating it.
async function fetchWithAuthRetry(endpoint: string, options: RequestInit = {}, _isRetry = false): Promise<Response> {
  const token = localStorage.getItem("info");
  const response = await rawFetch(endpoint, options, token);

  if (response.status === 401 && !_isRetry && !isExcludedFromRefresh(endpoint)) {
    const newToken = await getOrStartRefresh();
    if (newToken) {
      return fetchWithAuthRetry(endpoint, options, true);
    }
    localStorage.removeItem("info");
    window.dispatchEvent(new Event("auth:logout"));
  }

  return response;
}

async function parseErrorMessage(response: Response): Promise<string> {
  let message = "Request failed";
  try {
    const body = await response.json();
    message = body.message || message;
  } catch {
    // response had no JSON body
  }
  return message;
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const response = await fetchWithAuthRetry(endpoint, options);
  if (!response.ok) throw new ApiError(await parseErrorMessage(response), response.status);
  if (response.status === 204) return undefined as unknown as ApiEnvelope<T>;
  return response.json() as Promise<ApiEnvelope<T>>;
}

export async function apiDownload(endpoint: string): Promise<{ blob: Blob; filename: string }> {
  const response = await fetchWithAuthRetry(endpoint, { method: "GET" });
  if (!response.ok) throw new ApiError(await parseErrorMessage(response), response.status);
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  return { blob: await response.blob(), filename: match ? match[1] : "download" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --watchAll=false --testPathPattern=apiRequest`
Expected: PASS (all original cases + 3 new ones)

---

### Task 11: Ticket types + query keys + `queries/tickets.ts`

**Files:**
- Modify: `quattro_support_client/src/types/interfaces.ts`
- Modify: `quattro_support_client/src/utils/queryKeys.ts`
- Create: `quattro_support_client/src/queries/tickets.ts`

**Interfaces:**
- Consumes: `apiRequest`/`apiDownload` (Task 10).
- Produces: `TicketProps`, `CommentProps` types; `ticketKeys` factory; `useTickets(filters)`, `useTicket(id)`, `useCreateTicket()`, `useUpdateTicket()`, `useDeleteTicket()`, `useAddComment(ticketId)`, `usePromoteTicket(ticketId)`. No dedicated test file for this task — this codebase has no per-hook query tests anywhere (`queries/*.ts` has zero `.test.ts` siblings); hooks are exercised through the page tests in Tasks 12–14, matching the existing convention exactly.

- [ ] **Step 1: Append to `src/types/interfaces.ts`**

```typescript
export interface CommentProps {
  _id: string;
  userId: string;
  comment: string;
  isAdmin: boolean;
  attachmentKey: string | null;
  createdAt: string;
}

export interface TicketProps {
  _id: string;
  clientId: string;
  projectId: string;
  subject: string;
  solved: boolean;
  comments: CommentProps[];
  promotedTaskId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Append to `src/utils/queryKeys.ts`**

```typescript
export const ticketKeys = {
  all: ["tickets"] as const,
  list: (filters: Record<string, string | undefined>) => [...ticketKeys.all, "list", filters] as const,
  detail: (id: string) => [...ticketKeys.all, "detail", id] as const,
};
```

- [ ] **Step 3: Create `src/queries/tickets.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../hooks/apiRequest";
import { TicketProps, TaskProps } from "../types/interfaces";
import { ticketKeys } from "../utils/queryKeys";

interface TicketFilters {
  projectId?: string;
  clientId?: string;
  solved?: boolean;
}

function toQueryString(filters: TicketFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  return params.toString();
}

export function useTickets(filters: TicketFilters) {
  return useQuery({
    queryKey: ticketKeys.list({ ...filters, solved: filters.solved === undefined ? undefined : String(filters.solved) }),
    queryFn: async () => (await apiRequest<TicketProps[]>(`tickets?${toQueryString(filters)}`)).data,
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ticketKeys.detail(id),
    queryFn: async () => (await apiRequest<TicketProps>(`tickets/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { clientId: string; projectId: string; subject: string }) =>
      (await apiRequest<TicketProps>("tickets", { method: "POST", body: JSON.stringify(data) })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ticketKeys.all }),
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { subject?: string; solved?: boolean } }) =>
      (await apiRequest<TicketProps>(`tickets/${id}`, { method: "PUT", body: JSON.stringify(data) })).data,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.all });
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(variables.id) });
    },
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiRequest<void>(`tickets/${id}`, { method: "DELETE" })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ticketKeys.all }),
  });
}

export function useAddComment(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ comment, attachment }: { comment: string; attachment?: File | null }) => {
      const formData = new FormData();
      formData.append("comment", comment);
      if (attachment) formData.append("attachment", attachment);
      return (await apiRequest<TicketProps>(`tickets/${ticketId}/comments`, { method: "POST", body: formData })).data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ticketKeys.detail(ticketId) }),
  });
}

export function usePromoteTicket(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await apiRequest<{ ticket: TicketProps; task: TaskProps }>(`tickets/${ticketId}/promote`, { method: "POST" })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ticketKeys.detail(ticketId) }),
  });
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run build` (CRA's `fork-ts-checker` will surface any type error; no dedicated `tsc --noEmit` script exists in this repo)
Expected: compiles clean (build may still emit the pre-existing unrelated warnings noted in earlier phases).

---

### Task 12: Route/nav wiring + `TicketListPage`

**Files:**
- Modify: `quattro_support_client/src/navigation/routes/routes.tsx`
- Modify: `quattro_support_client/src/navigation/components/AppHeader.tsx`
- Modify: `quattro_support_client/src/pages/index.ts`
- Create: `quattro_support_client/src/pages/tickets/TicketListPage.tsx`
- Test: `quattro_support_client/src/pages/tickets/TicketListPage.test.tsx`

**Interfaces:**
- Consumes: `useTickets`/`useTickets` filters (Task 11), `useProjects` (Phase 1, unchanged), `DisplayComponent` (Phase 1).
- Produces: `routes.tickets`/`routes.newTicket`/`routes.ticketDetail` path constants, a role-unconditional "Support" nav link (every role has some Ticket access, unlike `My Time`/`Reports`), `TicketListPage` component.

- [ ] **Step 1: Modify `src/navigation/routes/routes.tsx`**

```typescript
import {
  Homepage,
  ProjectListPage,
  EpicListPage,
  SprintListPage,
  BacklogPage,
  BoardPage,
  TaskDetailPage,
  TimesheetPage,
  ReportsPage,
  TicketListPage,
  TicketNewPage,
  TicketDetailPage,
} from "../../pages";

export const routes = {
  home: "/",
  projects: "/projects",
  projectBoard: "/projects/:id/board",
  projectBacklog: "/projects/:id/backlog",
  projectEpics: "/projects/:id/epics",
  projectSprints: "/projects/:id/sprints",
  taskDetail: "/tasks/:id",
  myTime: "/my-time",
  reports: "/reports",
  tickets: "/support",
  newTicket: "/support/tickets/new",
  ticketDetail: "/support/tickets/:id",
};

export const Pages = [
  { path: routes.home, protected: false, component: <Homepage /> },
  { path: routes.projects, protected: true, component: <ProjectListPage /> },
  { path: routes.projectBoard, protected: true, component: <BoardPage /> },
  { path: routes.projectBacklog, protected: true, component: <BacklogPage /> },
  { path: routes.projectEpics, protected: true, component: <EpicListPage /> },
  { path: routes.projectSprints, protected: true, component: <SprintListPage /> },
  { path: routes.taskDetail, protected: true, component: <TaskDetailPage /> },
  { path: routes.myTime, protected: true, component: <TimesheetPage /> },
  { path: routes.reports, protected: true, component: <ReportsPage /> },
  { path: routes.tickets, protected: true, component: <TicketListPage /> },
  { path: routes.newTicket, protected: true, component: <TicketNewPage /> },
  { path: routes.ticketDetail, protected: true, component: <TicketDetailPage /> },
];
```

- [ ] **Step 2: Modify `src/navigation/components/AppHeader.tsx`** — add a role-unconditional Support link

```tsx
import { useNavigate } from "react-router-dom";
import { routes } from "../routes/routes";
// ...inside the <Space> block, alongside the existing My Time / Reports buttons:
<Button type="link" onClick={() => navigate(routes.tickets)}>
  Support
</Button>
```

- [ ] **Step 3: Append to `src/pages/index.ts`**

```typescript
export { TicketListPage } from "./tickets/TicketListPage";
export { TicketNewPage } from "./tickets/TicketNewPage";
export { TicketDetailPage } from "./tickets/TicketDetailPage";
```

(`TicketNewPage`/`TicketDetailPage` don't exist until Tasks 13–14 — this barrel export will not compile until then. Either stub two placeholder files now and fill them in during Tasks 13–14, or do Steps 1–3 of this task together with Tasks 13–14 as one uncommitted working set before running the build check in Step 6 below. There is no commit boundary inside this phase to worry about breaking — see Global Constraints.)

- [ ] **Step 4: Write the failing test**

```typescript
// src/pages/tickets/TicketListPage.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TicketListPage } from "./TicketListPage";
import { apiRequest } from "../../hooks/apiRequest";
import AuthContext from "../../context/AuthContext";
import { ALERT_INITIAL_STATE } from "../../utils/data";

jest.mock("../../hooks/apiRequest");
const mockedApiRequest = apiRequest as jest.Mock;

function renderWithProviders(role: "admin" | "user" | "final_user" = "user") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider
        value={{
          isLoggedIn: true, username: "", password: "", isSuccess: ALERT_INITIAL_STATE, isError: ALERT_INITIAL_STATE,
          isLoading: false, isAdmin: role === "admin",
          userData: { _id: "u1", name: "Me", username: "me", role, active: true, assignedClientIds: [], assignedProjectIds: [], hourlyRate: null, tokenVersion: 0 },
          isModalRecoverOpen: false, isModalChangePasswordVisible: false, isModalResetPasswordVisible: false,
          onOpenCloseModalRecover: () => {}, openCloseModalPassword: () => {}, openCloseModalResetPassword: () => {},
          handleSendResetPassword: () => {}, handleChangePassword: () => {}, onChangeUsername: () => {},
          onChangePassword: () => {}, handleLogin: () => {}, onLogout: () => {}, validateToken: () => true,
        }}
      >
        <MemoryRouter initialEntries={["/support"]}>
          <Routes>
            <Route path="/support" element={<TicketListPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe("TicketListPage", () => {
  it("lists tickets returned by the scoped GET /tickets call", async () => {
    mockedApiRequest.mockResolvedValueOnce({
      success: true,
      data: [{ _id: "t1", clientId: "c1", projectId: "p1", subject: "Cannot log in", solved: false, comments: [], promotedTaskId: null }],
    });

    renderWithProviders("final_user");

    await waitFor(() => expect(screen.getByText("Cannot log in")).toBeInTheDocument());
  });

  it("shows a New Ticket action", async () => {
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: [] });
    renderWithProviders("user");
    await waitFor(() => expect(screen.getByText(/new ticket/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test -- --watchAll=false --testPathPattern=TicketListPage`
Expected: FAIL — `./TicketListPage` module doesn't exist yet.

- [ ] **Step 6: Create `src/pages/tickets/TicketListPage.tsx`**

```tsx
import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Table, Select, Tag, Button, Space } from "antd";
import AuthContext from "../../context/AuthContext";
import { useTickets } from "../../queries/tickets";
import { useProjects } from "../../queries/projects";
import { TicketProps, ProjectProps } from "../../types/interfaces";
import { DisplayComponent } from "../../navigation/layout/DisplayComponent";
import { routes } from "../../navigation/routes/routes";

export const TicketListPage = () => {
  const navigate = useNavigate();
  const { userData } = useContext(AuthContext);
  const [projectId, setProjectId] = useState<string | undefined>();
  const [solved, setSolved] = useState<boolean | undefined>(false);

  const { data: projects } = useProjects();
  const { data: tickets, isLoading, isError, error } = useTickets({ projectId, solved });

  return (
    <DisplayComponent error={isError ? error : undefined} isLoading={isLoading}>
      <Card
        title="Support"
        extra={
          <Button type="primary" onClick={() => navigate(routes.newTicket)}>
            New Ticket
          </Button>
        }
      >
        {userData?.role !== "final_user" && (
          <Space style={{ marginBottom: 16 }}>
            <Select
              allowClear
              style={{ width: 200 }}
              placeholder="Filter by project"
              value={projectId}
              onChange={setProjectId}
              options={(projects || []).map((p: ProjectProps) => ({ label: p.name, value: p._id }))}
            />
            <Select
              style={{ width: 160 }}
              value={solved}
              onChange={setSolved}
              options={[
                { label: "Open", value: false },
                { label: "Solved", value: true },
              ]}
            />
          </Space>
        )}

        <Table<TicketProps>
          rowKey="_id"
          loading={isLoading}
          dataSource={tickets || []}
          onRow={(ticket) => ({ onClick: () => navigate(routes.ticketDetail.replace(":id", ticket._id)) })}
          columns={[
            { title: "Subject", dataIndex: "subject" },
            { title: "Status", dataIndex: "solved", render: (v) => <Tag color={v ? "green" : "orange"}>{v ? "Solved" : "Open"}</Tag> },
            { title: "Comments", dataIndex: "comments", render: (comments: TicketProps["comments"]) => comments.length },
          ]}
        />
      </Card>
    </DisplayComponent>
  );
};
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- --watchAll=false --testPathPattern=TicketListPage`
Expected: PASS (2/2)

---

### Task 13: `TicketNewPage`

**Files:**
- Create: `quattro_support_client/src/pages/tickets/TicketNewPage.tsx`
- Test: `quattro_support_client/src/pages/tickets/TicketNewPage.test.tsx`

**Interfaces:**
- Consumes: `useClients` (Phase 0, already scoped server-side), `useProjects` (Phase 1), `useCreateTicket` (Task 11).
- Produces: `TicketNewPage` component — client Select → project Select (client-side filtered to the selected client) → subject Input → create, then navigate to the new ticket's detail page.

- [ ] **Step 1: Write the failing test**

```typescript
// src/pages/tickets/TicketNewPage.test.tsx
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TicketNewPage } from "./TicketNewPage";
import { apiRequest } from "../../hooks/apiRequest";
import AuthContext from "../../context/AuthContext";
import { ALERT_INITIAL_STATE } from "../../utils/data";

jest.mock("../../hooks/apiRequest");
const mockedApiRequest = apiRequest as jest.Mock;

function renderWithProviders() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider
        value={{
          isLoggedIn: true, username: "", password: "", isSuccess: ALERT_INITIAL_STATE, isError: ALERT_INITIAL_STATE,
          isLoading: false, isAdmin: false,
          userData: { _id: "u1", name: "Me", username: "me", role: "final_user", active: true, assignedClientIds: ["c1"], assignedProjectIds: [], hourlyRate: null, tokenVersion: 0 },
          isModalRecoverOpen: false, isModalChangePasswordVisible: false, isModalResetPasswordVisible: false,
          onOpenCloseModalRecover: () => {}, openCloseModalPassword: () => {}, openCloseModalResetPassword: () => {},
          handleSendResetPassword: () => {}, handleChangePassword: () => {}, onChangeUsername: () => {},
          onChangePassword: () => {}, handleLogin: () => {}, onLogout: () => {}, validateToken: () => true,
        }}
      >
        <MemoryRouter initialEntries={["/support/tickets/new"]}>
          <Routes>
            <Route path="/support/tickets/new" element={<TicketNewPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe("TicketNewPage", () => {
  it("renders client and project selects and a subject input", async () => {
    mockedApiRequest
      .mockResolvedValueOnce({ success: true, data: [{ _id: "c1", name: "Acme", active: true }] })
      .mockResolvedValueOnce({ success: true, data: [{ _id: "p1", clientId: "c1", name: "Website", status: "active", assignedUserIds: [] }] });

    renderWithProviders();

    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
    expect(screen.getByPlaceholderText(/subject/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false --testPathPattern=TicketNewPage`
Expected: FAIL — `./TicketNewPage` module doesn't exist yet.

- [ ] **Step 3: Create `src/pages/tickets/TicketNewPage.tsx`**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Form, Select, Input, Button, message } from "antd";
import { useClients } from "../../queries/clients";
import { useProjects } from "../../queries/projects";
import { useCreateTicket } from "../../queries/tickets";
import { ProjectProps } from "../../types/interfaces";
import { ApiError } from "../../hooks/apiRequest";
import { routes } from "../../navigation/routes/routes";

export const TicketNewPage = () => {
  const navigate = useNavigate();
  const { data: clients } = useClients();
  const { data: projects } = useProjects();
  const createTicket = useCreateTicket();
  const [clientId, setClientId] = useState<string | undefined>();
  const [form] = Form.useForm();

  const projectsForClient = (projects || []).filter((p: ProjectProps) => p.clientId === clientId);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      const ticket = await createTicket.mutateAsync(values);
      navigate(routes.ticketDetail.replace(":id", ticket._id));
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "Could not create the ticket");
    }
  };

  return (
    <Card title="New Ticket">
      <Form form={form} layout="vertical" style={{ maxWidth: 480 }}>
        <Form.Item name="clientId" label="Client" rules={[{ required: true }]}>
          <Select
            options={(clients || []).map((c) => ({ label: c.name, value: c._id }))}
            onChange={(value) => {
              setClientId(value);
              form.setFieldValue("projectId", undefined);
            }}
          />
        </Form.Item>
        <Form.Item name="projectId" label="Project" rules={[{ required: true }]}>
          <Select
            disabled={!clientId}
            options={projectsForClient.map((p) => ({ label: p.name, value: p._id }))}
          />
        </Form.Item>
        <Form.Item name="subject" label="Subject" rules={[{ required: true }]}>
          <Input placeholder="Subject" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" onClick={handleSubmit} loading={createTicket.isPending}>
            Create Ticket
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watchAll=false --testPathPattern=TicketNewPage`
Expected: PASS (1/1)

---

### Task 14: `TicketDetailPage` + `CommentThread`

**Files:**
- Create: `quattro_support_client/src/pages/tickets/CommentThread.tsx`
- Create: `quattro_support_client/src/pages/tickets/TicketDetailPage.tsx`
- Test: `quattro_support_client/src/pages/tickets/TicketDetailPage.test.tsx`

**Interfaces:**
- Consumes: `useTicket`, `useAddComment`, `usePromoteTicket`, `useDeleteTicket` (Task 11), `apiDownload` (Task 10).
- Produces: `CommentThread` (comment list + textarea + antd `Upload` with `beforeUpload={() => false}` to capture the file without auto-uploading, wired to `useAddComment`; each comment with an `attachmentKey` gets a Download link that calls `apiDownload('files/' + comment._id)` — note the URL param is the **comment's `_id`**, matching the server's `routes/files.ts`, never `attachmentKey`), `TicketDetailPage` (header, `CommentThread`, admin/user-only "Promote to Task" button gated on `promotedTaskId == null`, admin-only Delete).

- [ ] **Step 1: Write the failing test**

```typescript
// src/pages/tickets/TicketDetailPage.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TicketDetailPage } from "./TicketDetailPage";
import { apiRequest } from "../../hooks/apiRequest";
import AuthContext from "../../context/AuthContext";
import { ALERT_INITIAL_STATE } from "../../utils/data";

jest.mock("../../hooks/apiRequest");
const mockedApiRequest = apiRequest as jest.Mock;

function renderWithProviders(role: "admin" | "user" | "final_user") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider
        value={{
          isLoggedIn: true, username: "", password: "", isSuccess: ALERT_INITIAL_STATE, isError: ALERT_INITIAL_STATE,
          isLoading: false, isAdmin: role === "admin",
          userData: { _id: "u1", name: "Me", username: "me", role, active: true, assignedClientIds: [], assignedProjectIds: [], hourlyRate: null, tokenVersion: 0 },
          isModalRecoverOpen: false, isModalChangePasswordVisible: false, isModalResetPasswordVisible: false,
          onOpenCloseModalRecover: () => {}, openCloseModalPassword: () => {}, openCloseModalResetPassword: () => {},
          handleSendResetPassword: () => {}, handleChangePassword: () => {}, onChangeUsername: () => {},
          onChangePassword: () => {}, handleLogin: () => {}, onLogout: () => {}, validateToken: () => true,
        }}
      >
        <MemoryRouter initialEntries={["/support/tickets/t1"]}>
          <Routes>
            <Route path="/support/tickets/:id" element={<TicketDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe("TicketDetailPage", () => {
  it("shows the subject and existing comments", async () => {
    mockedApiRequest.mockResolvedValueOnce({
      success: true,
      data: {
        _id: "t1", clientId: "c1", projectId: "p1", subject: "Cannot log in", solved: false, promotedTaskId: null,
        comments: [{ _id: "cm1", userId: "u2", comment: "Looking into it", isAdmin: true, attachmentKey: null, createdAt: "2026-08-05T00:00:00.000Z" }],
      },
    });

    renderWithProviders("final_user");

    await waitFor(() => expect(screen.getByText("Cannot log in")).toBeInTheDocument());
    expect(screen.getByText("Looking into it")).toBeInTheDocument();
  });

  it("shows a Promote to Task action for an employee when the ticket is not yet promoted", async () => {
    mockedApiRequest.mockResolvedValueOnce({
      success: true,
      data: { _id: "t1", clientId: "c1", projectId: "p1", subject: "X", solved: false, promotedTaskId: null, comments: [] },
    });

    renderWithProviders("user");

    await waitFor(() => expect(screen.getByText(/promote to task/i)).toBeInTheDocument());
  });

  it("hides the Promote to Task action for a final_user", async () => {
    mockedApiRequest.mockResolvedValueOnce({
      success: true,
      data: { _id: "t1", clientId: "c1", projectId: "p1", subject: "X", solved: false, promotedTaskId: null, comments: [] },
    });

    renderWithProviders("final_user");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    expect(screen.queryByText(/promote to task/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watchAll=false --testPathPattern=TicketDetailPage`
Expected: FAIL — `./TicketDetailPage` module doesn't exist yet.

- [ ] **Step 3: Create `src/pages/tickets/CommentThread.tsx`**

```tsx
import { useState } from "react";
import { List, Avatar, Input, Button, Upload, Space, message } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { CommentProps } from "../../types/interfaces";
import { apiDownload, ApiError } from "../../hooks/apiRequest";
import { useAddComment } from "../../queries/tickets";

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const CommentThread = ({ ticketId, comments }: { ticketId: string; comments: CommentProps[] }) => {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const addComment = useAddComment(ticketId);

  const handleDownload = async (commentId: string) => {
    try {
      const { blob, filename } = await apiDownload(`files/${commentId}`);
      triggerBrowserDownload(blob, filename);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "Could not download the attachment");
    }
  };

  const handleSubmit = async () => {
    if (!text.trim()) return;
    try {
      await addComment.mutateAsync({ comment: text.trim(), attachment });
      setText("");
      setAttachment(null);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "Could not add the comment");
    }
  };

  return (
    <div>
      <List<CommentProps>
        dataSource={comments}
        renderItem={(comment) => (
          <List.Item>
            <List.Item.Meta
              avatar={<Avatar>{comment.isAdmin ? "S" : "C"}</Avatar>}
              title={dayjs(comment.createdAt).format("YYYY-MM-DD HH:mm")}
              description={
                <>
                  <div>{comment.comment}</div>
                  {comment.attachmentKey && (
                    <Button type="link" size="small" onClick={() => handleDownload(comment._id)}>
                      Download attachment
                    </Button>
                  )}
                </>
              }
            />
          </List.Item>
        )}
      />
      <Space.Compact style={{ marginTop: 12, width: "100%" }}>
        <Input.TextArea
          rows={2}
          value={text}
          placeholder="Add a comment"
          onChange={(e) => setText(e.target.value)}
        />
        <Upload beforeUpload={(file) => { setAttachment(file); return false; }} maxCount={1} showUploadList={!!attachment}>
          <Button icon={<UploadOutlined />} />
        </Upload>
        <Button type="primary" onClick={handleSubmit} loading={addComment.isPending}>
          Add Comment
        </Button>
      </Space.Compact>
    </div>
  );
};
```

- [ ] **Step 4: Create `src/pages/tickets/TicketDetailPage.tsx`**

```tsx
import { useContext } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, Tag, Button, Space, message, Popconfirm } from "antd";
import AuthContext from "../../context/AuthContext";
import { useTicket, usePromoteTicket, useDeleteTicket } from "../../queries/tickets";
import { ApiError } from "../../hooks/apiRequest";
import { DisplayComponent } from "../../navigation/layout/DisplayComponent";
import { CommentThread } from "./CommentThread";
import { routes } from "../../navigation/routes/routes";

export const TicketDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userData, isAdmin } = useContext(AuthContext);
  const { data: ticket, isLoading, isError, error } = useTicket(id!);
  const promoteTicket = usePromoteTicket(id!);
  const deleteTicket = useDeleteTicket();

  const canPromote = userData?.role !== "final_user" && !ticket?.promotedTaskId;

  const handlePromote = async () => {
    try {
      await promoteTicket.mutateAsync();
      message.success("Ticket promoted to a task");
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "Could not promote the ticket");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTicket.mutateAsync(id!);
      navigate(routes.tickets);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "Could not delete the ticket");
    }
  };

  return (
    <DisplayComponent error={isError ? error : undefined} isLoading={isLoading}>
      {ticket && (
        <Card
          title={ticket.subject}
          extra={
            <Space>
              <Tag color={ticket.solved ? "green" : "orange"}>{ticket.solved ? "Solved" : "Open"}</Tag>
              {canPromote && (
                <Button onClick={handlePromote} loading={promoteTicket.isPending}>
                  Promote to Task
                </Button>
              )}
              {isAdmin && (
                <Popconfirm title="Delete this ticket?" onConfirm={handleDelete}>
                  <Button danger>Delete</Button>
                </Popconfirm>
              )}
            </Space>
          }
        >
          <CommentThread ticketId={ticket._id} comments={ticket.comments} />
        </Card>
      )}
    </DisplayComponent>
  );
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --watchAll=false --testPathPattern=TicketDetailPage`
Expected: PASS (3/3)

---

### Task 15: Full client regression run + final commits

**Files:** none beyond what Tasks 10–14 already touched.

- [ ] **Step 1: Run the full client test suite**

Run: `npm test -- --watchAll=false`
Expected: every suite passes, including everything from Phases 0–2 — no regressions.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: compiles clean (pre-existing warnings from earlier phases are fine; no new type errors).

- [ ] **Step 3: Commit the server changes**

```bash
cd quattro_tracker_server
git add -A
git commit -m "feat: add Ticket/Comment domain, attachment pipeline, and IDOR-fixed file download"
```

- [ ] **Step 4: Commit the client changes**

```bash
cd quattro_support_client
git add -A
git commit -m "feat: add /support ticket list/detail/new pages with comment attachments"
```

---

# Part C — Cutover checklist (ops runbook, not code)

This is the actual "cut DNS/deploy over" half of Phase 3's scope statement. It has no TDD tasks — it's an operational sequence to run once Parts A and B are implemented, reviewed, and merged.

1. **Confirm prod env config for `quattro_tracker_server`**: `MONGODB_URI` points at the clean/empty prod cluster, `JWT_ACCESS_SECRET`/refresh config set, `SEED_ADMIN_USERNAME`/`SEED_ADMIN_PASSWORD` set, and — new for this phase — `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION`/`AWS_S3_BUCKET` all set to real prod values (these are optional at the code level specifically so tests don't need them; production needs them for real).
2. **CORS check**: `CORS_ORIGIN` in prod (`config/env.ts`, comma-split list) must contain the exact production client origin, not a leftover localhost/staging value.
3. **Run `npm run seed`** against the new prod MongoDB to create the first admin account — confirm this runs against the actual prod DB, not a stale dev/staging one.
4. **Deploy `quattro_tracker_server`**; hit `/api/health`.
5. **Deploy `quattro_support_client`** built against the tracker server's prod API base URL (`REACT_APP_DEV_API` — the name is a known oddity, it's used in all environments, not just dev).
6. **Full smoke test in prod, before the DNS flip**: admin login → create a Client/Project → create a Ticket (as each of the three roles if practical) → add a comment with an attachment → download that attachment → promote a ticket to a Task. This exercises every Phase 3 code path including the IDOR-fixed file route.
7. **Announce a maintenance window** to users — there is no dual-write/dual-read parallel run (a deliberate, documented decision); a single deploy plus a short downtime window is the accepted approach.
8. **DNS/routing cutover**: repoint the production domain from the old Postgres-backed `quattro_support_server` to `quattro_support_client`/`quattro_tracker_server`. Exact mechanism (CNAME change vs. load-balancer target swap) is infra-specific — fill in with the team's actual DNS/LB setup.
9. **Leave the old Postgres database running, untouched, unrouted** — it is the passive, indefinite, read-only archive per `docs/plan/06-cleanup-and-migration.md` §6.2. Nothing in the new stack ever connects to it. No import/ETL tooling is built against it, ever.
10. **Post-cutover monitoring window** (e.g. 24–48h) watching `quattro_tracker_server` error logs/metrics before declaring the cutover final.
11. **Rollback plan, decided before cutover starts**: if a critical failure surfaces shortly after cutover, revert DNS to the still-intact old Postgres stack. There is no sync path back — any tickets/comments/data entered in the new system between cutover and a rollback would need to be manually re-entered again after a rollback. Define the rollback trigger/threshold and an owner ahead of time, not during an incident.
12. **Sign off on manual data re-entry scope/timing** with whoever (the admin) owns re-entering old data into the clean database post-cutover — agree this before the maintenance window, not during it.
