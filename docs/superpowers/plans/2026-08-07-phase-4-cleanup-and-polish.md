# Phase 4 (Cleanup + Polish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the last line of [docs/plan/07-phasing-risks-open-questions.md](../../plan/07-phasing-risks-open-questions.md)'s phase table — "Delete dead code, consolidate CORS/env vars, optional secondary reports (burndown/velocity/backlog-over-time), admin UI polish" — on the two live repos that came out of Phase 3 (`quattro_tracker_server`, the new Mongo/Express server, and `quattro_support_client`, reused in place for the new frontend). `quattro_support_server` (the old Postgres app) is out of scope entirely: per [06-cleanup-and-migration.md](../../plan/06-cleanup-and-migration.md) §6.2 it stays untouched as a passive archive.

**Architecture:** No new architectural layers. Every task extends an existing file using a pattern already established in this codebase (Mongoose service functions, Express route handlers with `requireAuth`+`requireRole`, TanStack Query hooks keyed through `utils/queryKeys.ts`, antd `Form`+`Modal` pages wrapped in the existing `DisplayComponent` loading/error shell).

**Tech Stack:** Same as the rest of the repo — server: Node/Express/TypeScript/Mongoose/Jest+Supertest; client: CRA/TypeScript/antd v5/TanStack Query/Jest+Testing Library.

## Why this plan is bigger than the phase-table line suggests

Investigating the current state of both repos before writing this plan turned up two things the one-line phase description doesn't capture:

1. **The client has zero Admin CRUD screens for Clients/Projects/Users.** `ProjectListPage` is read-only (no create/edit/delete anywhere in the client), there is no `/clients` or `/admin/users` route, and `AppHeader` has no nav entry for either — even though [04-frontend.md](../../plan/04-frontend.md) §4.1's target route table calls for `/clients`, `/clients/:id`, and `/admin/users`, and [07-phasing-risks-open-questions.md](../../plan/07-phasing-risks-open-questions.md) §7.1's Phase 0 line says "Admin can CRUD Clients/Projects/Users." The server already has full CRUD routes and service functions for all three (confirmed by reading `routes/clients.ts`, `routes/users.ts`, `routes/projects.ts`, and their integration tests) — only the client-side pages/forms are missing. Per the owner's explicit decision (asked directly, since this changes Phase 4's size substantially), **this plan builds that UI now** rather than deferring it further.
2. **Two of the "delete dead code" and "cleanup" items are real, not already done.** `src/components/ui/CustomModal.tsx` is exported but has zero consumers (confirmed via `grep -rln "CustomModal" src`) — genuinely dead code, same category as the already-deleted `Chatbot`/`SupportWeb`/etc. And the client's `package.json` still lists `js-base64`, `react-jwt`, `https`, `export-from-json`, `react-to-print`, and `axios` as dependencies with **zero import sites** anywhere in `src` (confirmed via per-package `grep -rln` — all six searches returned empty) — leftovers from the old external-auth/PDF-export/print flows that Phase 0–3 already replaced. `REACT_APP_SERVER` is set in the client's local `.env` but never read anywhere in `src` either.

Everything else on the phase-table line turned out to already be satisfied by how Phase 0–3 built the new repos from scratch:
- **Dead code (`Chatbot`, `UserGuidePage`, `SupportWeb`, `SupportCard`, `ButtonList`, the old `DisplayComponent`):** already deleted — `git log --all --oneline -- '**/*hatbot*'` on the client shows a single early commit, `95447bb chore: delete legacy Support/Ticket/Client/Admin/Dashboard/UserGuide module`, that removed the whole legacy module before Phase 0 work started. No `user_guide`/`userguide`/`chatbot` files exist in either repo today.
- **CORS:** `quattro_tracker_server/src/app.ts` already uses the `cors` package exactly once (`app.use(cors({ origin: env.corsOrigins, credentials: true }))`) — there is no redundant manual-header middleware to remove, because this server was written fresh in Phase 0, not evolved from the old one.
- **Env vars:** `quattro_tracker_server/.env.example` already only lists the new, consolidated set (`MONGODB_URI`, `JWT_ACCESS_SECRET`, `CORS_ORIGIN`, etc.) — none of the legacy `CLIENT_ID`/`QUATTRO_MAIN_SERVER`/`DB_HOST`-style vars exist to delete.
- **Stale `dist/`:** `quattro_tracker_server` is a from-scratch repo; there's no stale `dist/` to `.gitignore`.

So this plan's real scope is: **two small server-side data-integrity fixes that block a safe Delete button, one new server-side report, the Admin CRUD UI itself, and the two genuine leftover cleanup items.** Task numbering below reflects that — it is not padded to match the phase table's four bullet points artificially.

## What this plan deliberately does not build

- **Sprint burndown and backlog-size-over-time reports.** Per [05-reporting.md](../../plan/05-reporting.md)'s own §"Secondary/optional": both need a scheduled job writing daily snapshots to a new `SprintSnapshot` collection — real new infrastructure, not a report query. Velocity is the one secondary report the reporting doc calls "cheap to compute live... can ship earlier than burndown if wanted," so it's the one this plan builds. Burndown/backlog-over-time stay a follow-up, not a silent drop — flagging it here so it isn't mistaken for forgotten.
- **Admin-driven password reset/set for a user account.** The permission matrix ([03-api-and-rbac.md](../../plan/03-api-and-rbac.md) §3.2) gives password changes to "self only" — there's no "admin resets someone's password" endpoint on the server to wire up, and adding one is new scope beyond "polish." New accounts get a password at creation time (`POST /api/users` already requires one); recovery is the existing self-service `PasswordResetToken` flow.
- **Removing/renaming the existing `/projects` route.** It's not in [04-frontend.md](../../plan/04-frontend.md)'s target table, but it's a working, in-use landing page (`Logo` click navigates there) that nothing in any plan doc calls out for removal. This plan adds `/clients` and `/clients/:id` alongside it, additively — not a route migration.

## Global Constraints

- **One commit per repo, at the end.** Per the owner's instruction for this planning round: task-by-task commits are not required. Work through every task in a repo, run its full test suite + build once at the end, and make a single commit for that repo — mirroring how Phase 3 was actually closed out (per its `progress.md`: "two fix waves, two whole-branch reviews, and two squash operations... all captured in a single commit per repo"). Each task below still has its own red/green test steps — those verify the work as you go — but the "commit" step only appears once, at the very end of each repo's task list.
- **`requireAuth` + `requireRole(...)` on every new/modified route**, matching the exact chain style already used in `routes/clients.ts`/`routes/projects.ts`/`routes/users.ts`/`routes/reports.ts`.
- **Allowlisted fields on every service `update`/`create` function** — copy the existing `if (x !== undefined) allowlistedData.x = x;` pattern from `clientService.updateClient`/`userService.updateUser`, never `Object.assign(doc, req.body)` directly.
- **`DisplayComponent` wraps every new page's loading/error state** — the same `<DisplayComponent error={isError ? error : undefined} isLoading={isLoading}>` shell used by every existing page in `src/pages/`.
- **TanStack Query key factories live in `src/utils/queryKeys.ts`** — extend the existing `clientKeys`/`projectKeys`/`userKeys`/`reportKeys` objects there, don't invent new ad-hoc key arrays inline.
- **`apiRequest<T>`/`ApiError` is the only HTTP path** — no direct `fetch`, no `axios` (which this plan removes as an unused dependency).
- **No new UI component abstractions.** Use antd's `Modal`+`Form` directly (the pattern already live in `ChangePasswordModal.tsx`), not the dead `CustomModal` wrapper this plan deletes.

---

# Part A — Server (`quattro_tracker_server`)

## Task 1: Reject deleting a Client that still has non-deleted Projects

[02-data-model.md](../../plan/02-data-model.md) §2.4 specifies: "the API rejects deleting a `Client` that has any non-deleted `Project`s... forcing an explicit 'archive children first' flow." `clientService.deleteClient` currently does an unconditional soft-delete with no such check — confirmed by reading the current implementation, which is just `Client.findByIdAndUpdate(id, { deletedAt: new Date() }, ...)`. This is a real gap between the spec and the code, and it becomes user-visible the moment Task 8 wires up a Delete button in the UI: without this guard, deleting a Client silently orphans its Projects (and transitively their Tasks/Tickets).

**Files:**
- Create: `src/services/errors.ts`
- Modify: `src/services/clientService.ts`
- Modify: `src/routes/clients.ts`
- Test: `tests/integration/routes/clients.test.ts`

**Interfaces:**
- Produces: `HasDependentRecordsError` (a plain `Error` subclass, exported from `src/services/errors.ts`) — Task 2 reuses this same class for the Project-delete guard, so both guards produce a distinguishable error the route layer can map to `409`.

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/routes/clients.test.ts`, inside the existing `describe('client routes', ...)` block (after the existing `it('admin can create, list, update, and delete a client', ...)` test):

```ts
  it('rejects deleting a client that still has a non-deleted project', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    const client = await Client.create({ name: 'Acme Co' });
    const { Project } = await import('../../../src/db/models/Project');
    await Project.create({ clientId: client._id, name: 'Website' });

    const deleteRes = await request(app)
      .delete(`/api/clients/${client._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(409);
    expect(deleteRes.body.success).toBe(false);

    const stillThere = await Client.findById(client._id);
    expect(stillThere).not.toBeNull();
    expect(stillThere!.deletedAt).toBeNull();
  });

  it('allows deleting a client once its projects are all soft-deleted', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    const client = await Client.create({ name: 'Acme Co' });
    const { Project } = await import('../../../src/db/models/Project');
    await Project.create({ clientId: client._id, name: 'Website', deletedAt: new Date() });

    const deleteRes = await request(app)
      .delete(`/api/clients/${client._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(200);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- clients.test.ts`
Expected: the first new test FAILs with `expected 409 to be 200` (or similar) — the guard doesn't exist yet, so the delete succeeds unconditionally.

- [ ] **Step 3: Add the shared error class**

Create `src/services/errors.ts`:

```ts
export class HasDependentRecordsError extends Error {}
```

- [ ] **Step 4: Add the guard to `deleteClient`**

In `src/services/clientService.ts`, add the import and update `deleteClient`:

```ts
import { Project } from '../db/models/Project';
import { HasDependentRecordsError } from './errors';
```

Replace the existing `deleteClient` function with:

```ts
export async function deleteClient(id: string) {
  const hasProjects = await Project.exists({ clientId: id });
  if (hasProjects) {
    throw new HasDependentRecordsError(
      'Cannot delete a client that still has projects. Archive or delete its projects first.'
    );
  }
  return Client.findByIdAndUpdate(id, { deletedAt: new Date() }, { returnDocument: 'after' });
}
```

- [ ] **Step 5: Map the error to HTTP 409 in the route**

In `src/routes/clients.ts`, add the import:

```ts
import { HasDependentRecordsError } from '../services/errors';
```

Replace the `router.delete('/:id', ...)` handler's catch block:

```ts
  router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
      await deleteClient(String(req.params.id));
      res.status(200).json({ success: true });
    } catch (err) {
      if (err instanceof HasDependentRecordsError) {
        res.status(409).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- clients.test.ts`
Expected: PASS, all tests including the two new ones.

## Task 2: Reject deleting a Project that still has non-deleted Tasks or Tickets

Same gap as Task 1, one level down: [02-data-model.md](../../plan/02-data-model.md) §2.4 also specifies a Project can't be deleted while it has non-deleted Tasks or Tickets. `projectService.deleteProject` currently has the same unconditional-soft-delete shape as `deleteClient` did before Task 1.

**Files:**
- Modify: `src/services/projectService.ts`
- Modify: `src/routes/projects.ts`
- Test: `tests/integration/routes/projects.test.ts` (create if it doesn't already exist — check first with `find tests -iname "*project*"`; if a projects route test file already exists, add to it instead of creating a new one)

**Interfaces:**
- Consumes: `HasDependentRecordsError` from `src/services/errors.ts` (Task 1).

- [ ] **Step 1: Write the failing tests**

If `tests/integration/routes/projects.test.ts` doesn't exist yet, create it following the exact structure of `tests/integration/routes/clients.test.ts` (same `testEnv` object, same `loginAs` helper, same `describe`/`beforeAll`/`afterEach`/`afterAll` shape). Add:

```ts
import request from 'supertest';
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { createApp } from '../../../src/app';
import { User } from '../../../src/db/models/User';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Task } from '../../../src/db/models/Task';
import { Ticket } from '../../../src/db/models/Ticket';
import { hashPassword } from '../../../src/helpers/password';

const testEnv = {
  nodeEnv: 'test',
  jwtAccessSecret: 'test-secret',
  jwtAccessExpiresIn: '15m',
  refreshTokenExpiresInDays: 30,
  bcryptCostFactor: 4,
  corsOrigins: ['http://localhost:3000'],
} as any;

async function loginAs(app: any, username: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body.data.accessToken as string;
}

describe('project delete guard', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('rejects deleting a project that still has a non-deleted task', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    const client = await Client.create({ name: 'Acme Co' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    await Task.create({ projectId: project._id, title: 'Do the thing', reporterId: admin._id, rank: 1000 });

    const deleteRes = await request(app)
      .delete(`/api/projects/${project._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(409);
  });

  it('rejects deleting a project that still has a non-deleted ticket', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    const client = await Client.create({ name: 'Acme Co' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    await Ticket.create({ clientId: client._id, projectId: project._id, subject: 'Help' });

    const deleteRes = await request(app)
      .delete(`/api/projects/${project._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(409);
  });

  it('allows deleting a project with no tasks or tickets', async () => {
    const app = createApp(testEnv);
    const passwordHash = await hashPassword('pw', 4);
    await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const token = await loginAs(app, 'admin', 'pw');

    const client = await Client.create({ name: 'Acme Co' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });

    const deleteRes = await request(app)
      .delete(`/api/projects/${project._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- projects.test.ts`
Expected: the two "rejects" tests FAIL with `expected 409 to be 200`.

- [ ] **Step 3: Add the guard to `deleteProject`**

In `src/services/projectService.ts`, add the imports:

```ts
import { Task } from '../db/models/Task';
import { Ticket } from '../db/models/Ticket';
import { HasDependentRecordsError } from './errors';
```

Replace the existing `deleteProject` function with:

```ts
export async function deleteProject(id: string) {
  const [hasTasks, hasTickets] = await Promise.all([
    Task.exists({ projectId: id }),
    Ticket.exists({ projectId: id }),
  ]);
  if (hasTasks || hasTickets) {
    throw new HasDependentRecordsError(
      'Cannot delete a project that still has tasks or tickets. Archive or delete them first.'
    );
  }
  return Project.findByIdAndUpdate(id, { deletedAt: new Date() }, { returnDocument: 'after' });
}
```

- [ ] **Step 4: Map the error to HTTP 409 in the route**

In `src/routes/projects.ts`, add the import:

```ts
import { HasDependentRecordsError } from '../services/errors';
```

Replace the `router.delete('/:id', ...)` handler's catch block:

```ts
  router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
      await deleteProject(String(req.params.id));
      res.status(200).json({ success: true });
    } catch (err) {
      if (err instanceof HasDependentRecordsError) {
        res.status(409).json({ success: false, message: err.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- projects.test.ts`
Expected: PASS, all three tests.

## Task 3: Velocity report

The one secondary report [05-reporting.md](../../plan/05-reporting.md) calls out as cheap enough to ship without new infrastructure: "Velocity across sprints — cheap to compute live (`$sum` of completed story points per completed sprint), no snapshot needed."

**Files:**
- Modify: `src/services/reportService.ts`
- Modify: `src/routes/reports.ts`
- Test: `tests/integration/services/reportService.velocity.test.ts`

**Interfaces:**
- Produces: `reportVelocity(projectId: string): Promise<{ sprintId: string; sprintName: string; completedPoints: number }[]>`, exported from `reportService.ts`. Task 12 (client) consumes this shape verbatim through `GET /api/reports/velocity?projectId=`.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/services/reportService.velocity.test.ts`:

```ts
import { connectTestDb, clearTestDb, closeTestDb } from '../../utils/testDb';
import { Client } from '../../../src/db/models/Client';
import { Project } from '../../../src/db/models/Project';
import { Sprint } from '../../../src/db/models/Sprint';
import { Task } from '../../../src/db/models/Task';
import { User } from '../../../src/db/models/User';
import { hashPassword } from '../../../src/helpers/password';
import { reportVelocity } from '../../../src/services/reportService';

describe('reportService — velocity', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('sums completed-task story points per completed sprint, ordered by end date', async () => {
    const passwordHash = await hashPassword('x', 4);
    const reporter = await User.create({ name: 'Rep', username: 'rep', passwordHash, role: 'user' });
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });

    const sprint1 = await Sprint.create({
      projectId: project._id, name: 'Sprint 1', status: 'completed',
      startDate: new Date('2026-07-01'), endDate: new Date('2026-07-14'),
    });
    const sprint2 = await Sprint.create({
      projectId: project._id, name: 'Sprint 2', status: 'completed',
      startDate: new Date('2026-07-15'), endDate: new Date('2026-07-28'),
    });
    // not completed — must be excluded
    await Sprint.create({
      projectId: project._id, name: 'Sprint 3 (active)', status: 'active',
      startDate: new Date('2026-07-29'), endDate: new Date('2026-08-11'),
    });

    await Task.create({ projectId: project._id, sprintId: sprint1._id, title: 'A', status: 'done', storyPoints: 5, reporterId: reporter._id, rank: 1000 });
    await Task.create({ projectId: project._id, sprintId: sprint1._id, title: 'B', status: 'done', storyPoints: 3, reporterId: reporter._id, rank: 2000 });
    // not done — must be excluded from sprint1's total
    await Task.create({ projectId: project._id, sprintId: sprint1._id, title: 'C', status: 'in_progress', storyPoints: 8, reporterId: reporter._id, rank: 3000 });
    await Task.create({ projectId: project._id, sprintId: sprint2._id, title: 'D', status: 'done', storyPoints: 2, reporterId: reporter._id, rank: 1000 });

    const result = await reportVelocity(String(project._id));

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ sprintName: 'Sprint 1', completedPoints: 8 });
    expect(result[1]).toMatchObject({ sprintName: 'Sprint 2', completedPoints: 2 });
  });

  it('treats a done task with no story points as zero, not a crash', async () => {
    const passwordHash = await hashPassword('x', 4);
    const reporter = await User.create({ name: 'Rep', username: 'rep', passwordHash, role: 'user' });
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const sprint = await Sprint.create({
      projectId: project._id, name: 'Sprint 1', status: 'completed',
      startDate: new Date('2026-07-01'), endDate: new Date('2026-07-14'),
    });
    await Task.create({ projectId: project._id, sprintId: sprint._id, title: 'A', status: 'done', reporterId: reporter._id, rank: 1000 });

    const result = await reportVelocity(String(project._id));

    expect(result[0].completedPoints).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- reportService.velocity.test.ts`
Expected: FAIL with a TypeScript/module error — `reportVelocity` doesn't exist in `reportService.ts` yet.

- [ ] **Step 3: Implement `reportVelocity`**

In `src/services/reportService.ts`, add the imports:

```ts
import { Sprint } from '../db/models/Sprint';
import { Task } from '../db/models/Task';
```

Add the function (place it after `reportTimeline`, at the end of the file):

```ts
export async function reportVelocity(projectId: string) {
  const sprints = await Sprint.find({
    projectId: new mongoose.Types.ObjectId(projectId),
    status: 'completed',
  }).sort({ endDate: 1 });

  const results = await Promise.all(
    sprints.map(async (sprint) => {
      const rows = await Task.aggregate([
        { $match: { sprintId: sprint._id, status: 'done', deletedAt: null } },
        { $group: { _id: null, totalPoints: { $sum: { $ifNull: ['$storyPoints', 0] } } } },
      ]);
      return {
        sprintId: String(sprint._id),
        sprintName: sprint.name,
        completedPoints: rows[0]?.totalPoints ?? 0,
      };
    })
  );

  return results;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- reportService.velocity.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Wire the route**

In `src/routes/reports.ts`, add the import:

```ts
import { reportByProject, reportByClient, reportByUser, reportTimeline, reportVelocity } from '../services/reportService';
```

Add the route (inside `createReportsRouter`, after the existing `/timeline` handler, before `return router;`):

```ts
  router.get('/velocity', async (req, res) => {
    try {
      const { projectId } = req.query;
      if (!projectId) {
        res.status(400).json({ success: false, message: 'projectId is required' });
        return;
      }
      if (!mongoose.isValidObjectId(String(projectId))) {
        res.status(400).json({ success: false, message: 'projectId is not a valid id' });
        return;
      }
      const velocity = await reportVelocity(String(projectId));
      res.status(200).json({ success: true, data: velocity });
    } catch {
      res.status(500).json({ success: false, message: 'Contact the system administrator.' });
    }
  });
```

- [ ] **Step 6: Add a route-level test**

Add to `tests/integration/routes/reports.test.ts` (following the file's existing `authHeaderFor` helper and `describe('reports routes', ...)` block):

```ts
  it('returns a velocity report for an admin', async () => {
    const passwordHash = await hashPassword('x', 4);
    const admin = await User.create({ name: 'Admin', username: 'admin', passwordHash, role: 'admin' });
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const auth = await authHeaderFor(admin);

    const res = await request(app)
      .get('/api/reports/velocity')
      .query({ projectId: String(project._id) })
      .set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects a velocity request from a non-admin', async () => {
    const passwordHash = await hashPassword('x', 4);
    const user = await User.create({ name: 'Employee', username: 'emp', passwordHash, role: 'user' });
    const client = await Client.create({ name: 'Acme' });
    const project = await Project.create({ clientId: client._id, name: 'Website' });
    const auth = await authHeaderFor(user);

    const res = await request(app)
      .get('/api/reports/velocity')
      .query({ projectId: String(project._id) })
      .set('Authorization', auth);

    expect(res.status).toBe(403);
  });
```

- [ ] **Step 7: Run the full route test file and verify it passes**

Run: `npm test -- reports.test.ts`
Expected: PASS, including the two new tests.

## Task 4: Full server regression pass, then the one commit

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: every suite passes (Tasks 1–3's new tests plus everything already passing before this plan).

- [ ] **Step 2: Run the TypeScript build**

Run: `npm run build`
Expected: compiles cleanly with no errors.

- [ ] **Step 3: Review the diff**

Run: `git status` and `git diff` — confirm the changed files are exactly: `src/services/errors.ts` (new), `src/services/clientService.ts`, `src/services/projectService.ts`, `src/services/reportService.ts`, `src/routes/clients.ts`, `src/routes/projects.ts`, `src/routes/reports.ts`, `tests/integration/routes/clients.test.ts`, `tests/integration/routes/projects.test.ts` (new or modified), `tests/integration/services/reportService.velocity.test.ts` (new), `tests/integration/routes/reports.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/services/errors.ts src/services/clientService.ts src/services/projectService.ts src/services/reportService.ts src/routes/clients.ts src/routes/projects.ts src/routes/reports.ts tests/integration/routes/clients.test.ts tests/integration/routes/projects.test.ts tests/integration/services/reportService.velocity.test.ts tests/integration/routes/reports.test.ts
git commit -m "$(cat <<'EOF'
feat: add client/project delete guards and a velocity report

Reject deleting a Client with non-deleted Projects, and a Project with
non-deleted Tasks/Tickets, per the cascade-guard rule in
docs/plan/02-data-model.md §2.4 — closes a gap between that spec and the
existing deleteClient/deleteProject implementations, ahead of the client
wiring up Delete buttons against them. Also adds GET /api/reports/velocity
(completed story points per completed sprint), the one secondary report
docs/plan/05-reporting.md calls cheap enough to ship without new
snapshot infrastructure.
EOF
)"
```

---

# Part B — Client (`quattro_support_client`)

## Task 5: Remove unused dependencies and the dead `CustomModal` component

Confirmed via `grep -rln "<term>" src` for each of `REACT_APP_SERVER`, `js-base64`, `react-jwt`, `from "https"`, `export-from-json`, `react-to-print`, and `axios`: every one returns zero matches anywhere in `src`. Separately, `grep -rln "CustomModal" src` returns only `CustomModal.tsx` itself and its re-export in `components/ui/index.ts` — no actual consumer. All are safe, confirmed-dead removals; this task does the removal, it doesn't re-verify (already verified above).

**Files:**
- Modify: `package.json`
- Modify: `.env` (local, gitignored — not part of the commit; see Step 4)
- Delete: `src/components/ui/CustomModal.tsx`
- Modify: `src/components/ui/index.ts`

There is no test-driven step here — this is subtraction of unreferenced code/config, and "no compile errors after removal" is the verification.

- [ ] **Step 1: Remove the unused dependencies from `package.json`**

In `package.json`, delete these six lines from `"dependencies"`:

```json
    "axios": "^1.6.5",
    "export-from-json": "^1.7.3",
    "https": "^1.0.0",
    "js-base64": "^3.7.7",
    "react-jwt": "^1.2.0",
    "react-to-print": "^2.14.15",
```

- [ ] **Step 2: Reinstall to sync `package-lock.json`**

Run: `npm install`
Expected: exits 0; `package-lock.json` updates to drop the six packages (and their now-unneeded transitive deps) from the lockfile.

- [ ] **Step 3: Delete the dead `CustomModal` component**

Delete `src/components/ui/CustomModal.tsx`.

In `src/components/ui/index.ts`, remove the line exporting it (find and delete the `export { CustomModal } from "./CustomModal";`-shaped line — check the file first, since the exact export style may differ slightly from other entries in that barrel file).

- [ ] **Step 4: Drop the unused `REACT_APP_SERVER` var from the local `.env`**

`.env` is gitignored (confirmed in `.gitignore`) so this step has no diff to commit — it's a local-environment cleanup, not code. Open `.env` and remove the `REACT_APP_SERVER=...` line, leaving `REACT_APP_DEV_API` as the only var. Note this for whoever maintains the deployed environment's env vars too, since it's the same unused var there.

- [ ] **Step 5: Verify nothing broke**

Run: `npm run build`
Expected: compiles cleanly — confirms no lingering import of `CustomModal` or the removed packages.

## Task 6: Client mutation hooks (create/update/delete)

**Files:**
- Modify: `src/queries/clients.ts`
- Test: `src/queries/clients.test.ts` (create — no existing test file for this query module today; follow the RTL-free, hook-only testing style used elsewhere for query modules, e.g. mock `apiRequest` directly and call the hook's `mutationFn` logic through `renderHook`)

**Interfaces:**
- Produces: `useClient(id: string)`, `useCreateClient()`, `useUpdateClient()`, `useDeleteClient()`, all exported from `src/queries/clients.ts`. Tasks 9/10 consume these.

- [ ] **Step 1: Write the failing test**

Create `src/queries/clients.test.ts`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useClient, useCreateClient, useUpdateClient, useDeleteClient } from "./clients";
import { apiRequest } from "../hooks/apiRequest";

jest.mock("../hooks/apiRequest");
const mockedApiRequest = apiRequest as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("client query hooks", () => {
  beforeEach(() => mockedApiRequest.mockReset());

  it("useClient fetches a single client by id", async () => {
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: { _id: "c1", name: "Acme", active: true } });

    const { result } = renderHook(() => useClient("c1"), { wrapper });

    await waitFor(() => expect(result.current.data?.name).toBe("Acme"));
    expect(mockedApiRequest).toHaveBeenCalledWith("clients/c1");
  });

  it("useCreateClient posts to /clients", async () => {
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: { _id: "c1", name: "Acme", active: true } });

    const { result } = renderHook(() => useCreateClient(), { wrapper });
    await result.current.mutateAsync({ name: "Acme" });

    expect(mockedApiRequest).toHaveBeenCalledWith("clients", {
      method: "POST",
      body: JSON.stringify({ name: "Acme" }),
    });
  });

  it("useUpdateClient puts to /clients/:id", async () => {
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: { _id: "c1", name: "Acme Corp", active: true } });

    const { result } = renderHook(() => useUpdateClient(), { wrapper });
    await result.current.mutateAsync({ id: "c1", data: { name: "Acme Corp" } });

    expect(mockedApiRequest).toHaveBeenCalledWith("clients/c1", {
      method: "PUT",
      body: JSON.stringify({ name: "Acme Corp" }),
    });
  });

  it("useDeleteClient deletes /clients/:id", async () => {
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: undefined });

    const { result } = renderHook(() => useDeleteClient(), { wrapper });
    await result.current.mutateAsync("c1");

    expect(mockedApiRequest).toHaveBeenCalledWith("clients/c1", { method: "DELETE" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- clients.test.ts --watchAll=false`
Expected: FAIL — `useClient`/`useCreateClient`/`useUpdateClient`/`useDeleteClient` don't exist in `src/queries/clients.ts` yet.

- [ ] **Step 3: Implement the hooks**

Replace the full contents of `src/queries/clients.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../hooks/apiRequest";
import { ClientProps } from "../types/interfaces";
import { clientKeys } from "../utils/queryKeys";

export function useClients() {
  return useQuery({
    queryKey: clientKeys.list(),
    queryFn: async () => (await apiRequest<ClientProps[]>("clients")).data,
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: async () => (await apiRequest<ClientProps>(`clients/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; phone?: string; email?: string; billingAddress?: string }) =>
      (await apiRequest<ClientProps>("clients", { method: "POST", body: JSON.stringify(data) })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientKeys.all }),
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Pick<ClientProps, "name" | "phone" | "email" | "billingAddress" | "active">> }) =>
      (await apiRequest<ClientProps>(`clients/${id}`, { method: "PUT", body: JSON.stringify(data) })).data,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.all });
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(variables.id) });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiRequest<void>(`clients/${id}`, { method: "DELETE" })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientKeys.all }),
  });
}
```

- [ ] **Step 4: Add `detail` to `clientKeys`**

In `src/utils/queryKeys.ts`, replace the `clientKeys` object:

```ts
export const clientKeys = {
  all: ["clients"] as const,
  list: () => [...clientKeys.all, "list"] as const,
  detail: (id: string) => [...clientKeys.all, "detail", id] as const,
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- clients.test.ts --watchAll=false`
Expected: PASS, all four tests.

## Task 7: Project mutation hooks (create/update/delete)

**Files:**
- Modify: `src/queries/projects.ts`
- Test: `src/queries/projects.test.ts` (create)

**Interfaces:**
- Produces: `useCreateProject()`, `useUpdateProject()`, `useDeleteProject()`, appended to the existing `src/queries/projects.ts` (which already exports `useProjects`/`useProject` — leave those untouched).

- [ ] **Step 1: Write the failing test**

Create `src/queries/projects.test.ts`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreateProject, useUpdateProject, useDeleteProject } from "./projects";
import { apiRequest } from "../hooks/apiRequest";

jest.mock("../hooks/apiRequest");
const mockedApiRequest = apiRequest as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("project mutation hooks", () => {
  beforeEach(() => mockedApiRequest.mockReset());

  it("useCreateProject posts to /projects", async () => {
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: { _id: "p1", name: "Website", clientId: "c1" } });

    const { result } = renderHook(() => useCreateProject(), { wrapper });
    await result.current.mutateAsync({ clientId: "c1", name: "Website" });

    expect(mockedApiRequest).toHaveBeenCalledWith("projects", {
      method: "POST",
      body: JSON.stringify({ clientId: "c1", name: "Website" }),
    });
  });

  it("useUpdateProject puts to /projects/:id", async () => {
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: { _id: "p1", name: "Website v2" } });

    const { result } = renderHook(() => useUpdateProject(), { wrapper });
    await result.current.mutateAsync({ id: "p1", data: { name: "Website v2" } });

    expect(mockedApiRequest).toHaveBeenCalledWith("projects/p1", {
      method: "PUT",
      body: JSON.stringify({ name: "Website v2" }),
    });
  });

  it("useDeleteProject deletes /projects/:id", async () => {
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: undefined });

    const { result } = renderHook(() => useDeleteProject(), { wrapper });
    await result.current.mutateAsync("p1");

    expect(mockedApiRequest).toHaveBeenCalledWith("projects/p1", { method: "DELETE" });
  });

  it("useDeleteProject surfaces a 409 dependent-records error via ApiError", async () => {
    const { ApiError } = jest.requireActual("../hooks/apiRequest");
    mockedApiRequest.mockRejectedValueOnce(new ApiError("Cannot delete a project that still has tasks or tickets. Archive or delete them first.", 409));

    const { result } = renderHook(() => useDeleteProject(), { wrapper });
    await expect(result.current.mutateAsync("p1")).rejects.toMatchObject({ status: 409 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- projects.test.ts --watchAll=false`
Expected: FAIL — the three mutation hooks don't exist yet.

- [ ] **Step 3: Implement the hooks**

In `src/queries/projects.ts`, add the imports (extend the existing `import` line rather than duplicating):

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
```

Append to the end of the file (after the existing `useProject` function):

```ts
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { clientId: string; name: string; description?: string; guideUrl?: string }) =>
      (await apiRequest<ProjectProps>("projects", { method: "POST", body: JSON.stringify(data) })).data,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.list(variables.clientId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.list(undefined) });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Pick<ProjectProps, "name" | "description" | "status" | "guideUrl">> }) =>
      (await apiRequest<ProjectProps>(`projects/${id}`, { method: "PUT", body: JSON.stringify(data) })).data,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(variables.id) });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiRequest<void>(`projects/${id}`, { method: "DELETE" })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- projects.test.ts --watchAll=false`
Expected: PASS, all four tests.

## Task 8: User mutation hooks (create/update/delete)

**Files:**
- Modify: `src/queries/users.ts`
- Test: `src/queries/users.test.ts` (create)

**Interfaces:**
- Produces: `useCreateUser()`, `useUpdateUser()`, `useDeleteUser()`, appended to `src/queries/users.ts` (existing `useUsers` untouched). Also produces a new exported type, `CreateUserPayload`.

- [ ] **Step 1: Write the failing test**

Create `src/queries/users.test.ts`:

```tsx
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreateUser, useUpdateUser, useDeleteUser } from "./users";
import { apiRequest } from "../hooks/apiRequest";

jest.mock("../hooks/apiRequest");
const mockedApiRequest = apiRequest as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("user mutation hooks", () => {
  beforeEach(() => mockedApiRequest.mockReset());

  it("useCreateUser posts to /users", async () => {
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: { _id: "u1", name: "Alice", username: "alice", role: "user" } });

    const { result } = renderHook(() => useCreateUser(), { wrapper });
    await result.current.mutateAsync({ name: "Alice", username: "alice", password: "s3cret!", role: "user" });

    expect(mockedApiRequest).toHaveBeenCalledWith("users", {
      method: "POST",
      body: JSON.stringify({ name: "Alice", username: "alice", password: "s3cret!", role: "user" }),
    });
  });

  it("useUpdateUser puts to /users/:id", async () => {
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: { _id: "u1", name: "Alice", active: false } });

    const { result } = renderHook(() => useUpdateUser(), { wrapper });
    await result.current.mutateAsync({ id: "u1", data: { active: false } });

    expect(mockedApiRequest).toHaveBeenCalledWith("users/u1", {
      method: "PUT",
      body: JSON.stringify({ active: false }),
    });
  });

  it("useDeleteUser deletes /users/:id", async () => {
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: undefined });

    const { result } = renderHook(() => useDeleteUser(), { wrapper });
    await result.current.mutateAsync("u1");

    expect(mockedApiRequest).toHaveBeenCalledWith("users/u1", { method: "DELETE" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- users.test.ts --watchAll=false`
Expected: FAIL — the three mutation hooks don't exist yet.

- [ ] **Step 3: Implement the hooks**

Replace the full contents of `src/queries/users.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../hooks/apiRequest";
import { SessionUser } from "../types/interfaces";
import { userKeys } from "../utils/queryKeys";

export function useUsers(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: async () => (await apiRequest<SessionUser[]>("users")).data,
    enabled: options.enabled ?? true,
  });
}

export interface CreateUserPayload {
  name: string;
  username: string;
  password: string;
  role: SessionUser["role"];
  email?: string;
  assignedClientIds?: string[];
  assignedProjectIds?: string[];
  hourlyRate?: number;
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateUserPayload) =>
      (await apiRequest<SessionUser>("users", { method: "POST", body: JSON.stringify(data) })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

type UpdateUserPayload = Partial<
  Pick<SessionUser, "name" | "email" | "role" | "active" | "assignedClientIds" | "assignedProjectIds" | "hourlyRate">
>;

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateUserPayload }) =>
      (await apiRequest<SessionUser>(`users/${id}`, { method: "PUT", body: JSON.stringify(data) })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiRequest<void>(`users/${id}`, { method: "DELETE" })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- users.test.ts --watchAll=false`
Expected: PASS, all three tests.

## Task 9: `ClientListPage` at `/clients`

Per the permission matrix ([03-api-and-rbac.md](../../plan/03-api-and-rbac.md) §3.2): Create = Admin only, Read = Admin/User/Final user, Update = Admin/User, Delete = Admin only. Per the frontend route table ([04-frontend.md](../../plan/04-frontend.md) §4.1): "Final user: none (no client list)" — so this page itself is gated to Admin/User in the UI even though the API would technically allow a scoped `final_user` read.

**Files:**
- Create: `src/pages/clients/ClientListPage.tsx`
- Test: `src/pages/clients/ClientListPage.test.tsx`
- Modify: `src/pages/index.ts`

**Interfaces:**
- Consumes: `useClients`, `useCreateClient` (Task 6); `SessionUser`, `ClientProps` (`types/interfaces.ts`); `DisplayComponent`; `AuthContext`.

- [ ] **Step 1: Write the failing test**

Create `src/pages/clients/ClientListPage.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClientListPage } from "./ClientListPage";
import { apiRequest } from "../../hooks/apiRequest";
import AuthContext from "../../context/AuthContext";

jest.mock("../../hooks/apiRequest");
const mockedApiRequest = apiRequest as jest.Mock;

function renderWithProviders(ui: JSX.Element, role: "admin" | "user" = "admin") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthContext.Provider
          value={
            {
              userData: { _id: "u1", name: "Admin", username: "admin", role, active: true, assignedClientIds: [], assignedProjectIds: [], hourlyRate: null, tokenVersion: 0 },
            } as any
          }
        >
          {ui}
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ClientListPage", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    const matchMediaMock = jest.fn().mockImplementation(() => ({
      matches: false, media: '', onchange: null,
      addListener: jest.fn(), removeListener: jest.fn(),
      addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
    }));
    Object.defineProperty(window, 'matchMedia', { value: matchMediaMock, writable: true });
  });

  it("renders the clients returned by the API", async () => {
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: [{ _id: "c1", name: "Acme Co", active: true }] });

    renderWithProviders(<ClientListPage />);

    await waitFor(() => expect(screen.getByText("Acme Co")).toBeInTheDocument());
  });

  it("shows a New Client button for admin", async () => {
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: [] });

    renderWithProviders(<ClientListPage />, "admin");

    await waitFor(() => expect(screen.getByRole("button", { name: /new client/i })).toBeInTheDocument());
  });

  it("hides the New Client button for a non-admin user", async () => {
    mockedApiRequest.mockResolvedValueOnce({ success: true, data: [] });

    renderWithProviders(<ClientListPage />, "user");

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /new client/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- ClientListPage.test.tsx --watchAll=false`
Expected: FAIL — `./ClientListPage` doesn't exist.

- [ ] **Step 3: Implement `ClientListPage`**

Create `src/pages/clients/ClientListPage.tsx`:

```tsx
import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Table, Tag, Button, Modal, Form, Input, message } from "antd";
import { useClients, useCreateClient } from "../../queries/clients";
import { ClientProps } from "../../types/interfaces";
import { ApiError } from "../../hooks/apiRequest";
import { DisplayComponent } from "../../navigation/layout/DisplayComponent";
import AuthContext from "../../context/AuthContext";

export const ClientListPage = () => {
  const navigate = useNavigate();
  const { userData } = useContext(AuthContext);
  const isAdmin = userData?.role === "admin";
  const { data: clients, isLoading, isError, error } = useClients();
  const createClient = useCreateClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const handleCreate = async () => {
    const values = await form.validateFields();
    try {
      await createClient.mutateAsync(values);
      setIsModalOpen(false);
      form.resetFields();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "Could not create the client");
    }
  };

  return (
    <DisplayComponent error={isError ? error : undefined} isLoading={isLoading}>
      <Card
        title="Clients"
        extra={isAdmin && <Button type="primary" onClick={() => setIsModalOpen(true)}>New Client</Button>}
      >
        <Table<ClientProps>
          rowKey="_id"
          dataSource={clients || []}
          onRow={(record) => ({ onClick: () => navigate(`/clients/${record._id}`), style: { cursor: "pointer" } })}
          columns={[
            { title: "Name", dataIndex: "name" },
            { title: "Email", dataIndex: "email" },
            { title: "Phone", dataIndex: "phone" },
            { title: "Status", dataIndex: "active", render: (active) => <Tag color={active ? "green" : "default"}>{active ? "Active" : "Inactive"}</Tag> },
          ]}
        />
      </Card>

      <Modal
        title="New Client"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={handleCreate}
        confirmLoading={createClient.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="billingAddress" label="Billing Address">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </DisplayComponent>
  );
};
```

- [ ] **Step 4: Export the page**

In `src/pages/index.ts`, add:

```ts
export { ClientListPage } from "./clients/ClientListPage";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- ClientListPage.test.tsx --watchAll=false`
Expected: PASS, all three tests.

## Task 10: `ClientDetailPage` at `/clients/:id`

Shows the client's own info (editable by Admin/User) and its Projects, with Project create/edit (Admin/User) and delete (Admin only, surfacing the Task 2 409-guard message when it fires).

**Files:**
- Create: `src/pages/clients/ClientDetailPage.tsx`
- Test: `src/pages/clients/ClientDetailPage.test.tsx`
- Modify: `src/pages/index.ts`

**Interfaces:**
- Consumes: `useClient` (Task 6), `useProjects`, `useCreateProject`, `useUpdateProject`, `useDeleteProject` (Task 7); `ProjectProps` (`types/interfaces.ts`).

- [ ] **Step 1: Write the failing test**

Create `src/pages/clients/ClientDetailPage.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClientDetailPage } from "./ClientDetailPage";
import { apiRequest } from "../../hooks/apiRequest";
import AuthContext from "../../context/AuthContext";

jest.mock("../../hooks/apiRequest");
const mockedApiRequest = apiRequest as jest.Mock;

function renderWithProviders() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/clients/c1"]}>
        <AuthContext.Provider
          value={{ userData: { _id: "u1", name: "Admin", username: "admin", role: "admin", active: true, assignedClientIds: [], assignedProjectIds: [], hourlyRate: null, tokenVersion: 0 } } as any}
        >
          <Routes>
            <Route path="/clients/:id" element={<ClientDetailPage />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ClientDetailPage", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    const matchMediaMock = jest.fn().mockImplementation(() => ({
      matches: false, media: '', onchange: null,
      addListener: jest.fn(), removeListener: jest.fn(),
      addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
    }));
    Object.defineProperty(window, 'matchMedia', { value: matchMediaMock, writable: true });
  });

  it("renders the client's name and its projects", async () => {
    mockedApiRequest
      .mockResolvedValueOnce({ success: true, data: { _id: "c1", name: "Acme Co", active: true } })
      .mockResolvedValueOnce({ success: true, data: [{ _id: "p1", clientId: "c1", name: "Website", status: "active" }] });

    renderWithProviders();

    await waitFor(() => expect(screen.getByText("Acme Co")).toBeInTheDocument());
    expect(screen.getByText("Website")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- ClientDetailPage.test.tsx --watchAll=false`
Expected: FAIL — `./ClientDetailPage` doesn't exist.

- [ ] **Step 3: Implement `ClientDetailPage`**

Create `src/pages/clients/ClientDetailPage.tsx`:

```tsx
import { useContext, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Descriptions, Table, Tag, Button, Modal, Form, Input, Select, Space, message } from "antd";
import { useClient } from "../../queries/clients";
import { useProjects, useCreateProject, useUpdateProject, useDeleteProject } from "../../queries/projects";
import { ProjectProps, ProjectStatus } from "../../types/interfaces";
import { ApiError } from "../../hooks/apiRequest";
import { DisplayComponent } from "../../navigation/layout/DisplayComponent";
import AuthContext from "../../context/AuthContext";

const PROJECT_STATUSES: ProjectStatus[] = ["active", "on_hold", "completed", "archived"];

export const ClientDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userData } = useContext(AuthContext);
  const isAdmin = userData?.role === "admin";
  const canEdit = isAdmin || userData?.role === "user";

  const { data: client, isLoading, isError, error } = useClient(id!);
  const { data: projects } = useProjects({ clientId: id });
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectProps | null>(null);
  const [form] = Form.useForm();

  const openCreateModal = () => {
    setEditingProject(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const openEditModal = (project: ProjectProps) => {
    setEditingProject(project);
    form.setFieldsValue(project);
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      if (editingProject) {
        await updateProject.mutateAsync({ id: editingProject._id, data: values });
      } else {
        await createProject.mutateAsync({ ...values, clientId: id! });
      }
      setIsModalOpen(false);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "Could not save the project");
    }
  };

  const handleDelete = (projectId: string) => {
    Modal.confirm({
      title: "Delete this project?",
      onOk: async () => {
        try {
          await deleteProject.mutateAsync(projectId);
        } catch (err) {
          message.error(err instanceof ApiError ? err.message : "Could not delete the project");
        }
      },
    });
  };

  return (
    <DisplayComponent error={isError ? error : undefined} isLoading={isLoading}>
      {client && (
        <>
          <Card title={client.name} style={{ marginBottom: 16 }}>
            <Descriptions column={1}>
              <Descriptions.Item label="Email">{client.email || "—"}</Descriptions.Item>
              <Descriptions.Item label="Phone">{client.phone || "—"}</Descriptions.Item>
              <Descriptions.Item label="Billing Address">{client.billingAddress || "—"}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={client.active ? "green" : "default"}>{client.active ? "Active" : "Inactive"}</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card
            title="Projects"
            extra={canEdit && <Button type="primary" onClick={openCreateModal}>New Project</Button>}
          >
            <Table<ProjectProps>
              rowKey="_id"
              dataSource={projects || []}
              columns={[
                {
                  title: "Name",
                  dataIndex: "name",
                  render: (name, record) => (
                    <a onClick={() => navigate(`/projects/${record._id}/board`)}>{name}</a>
                  ),
                },
                { title: "Status", dataIndex: "status", render: (status) => <Tag>{status}</Tag> },
                {
                  title: "Actions",
                  render: (_, record) => (
                    <Space>
                      {canEdit && <Button size="small" onClick={() => openEditModal(record)}>Edit</Button>}
                      {isAdmin && <Button size="small" danger onClick={() => handleDelete(record._id)}>Delete</Button>}
                    </Space>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}

      <Modal
        title={editingProject ? "Edit Project" : "New Project"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={createProject.isPending || updateProject.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea />
          </Form.Item>
          {editingProject && (
            <Form.Item name="status" label="Status">
              <Select options={PROJECT_STATUSES.map((s) => ({ label: s, value: s }))} />
            </Form.Item>
          )}
          <Form.Item name="guideUrl" label="Guide URL">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </DisplayComponent>
  );
};
```

- [ ] **Step 4: Export the page**

In `src/pages/index.ts`, add:

```ts
export { ClientDetailPage } from "./clients/ClientDetailPage";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- ClientDetailPage.test.tsx --watchAll=false`
Expected: PASS.

## Task 11: `UserListPage` at `/admin/users`

Admin-only end to end — matches `routes/users.ts`'s `requireRole('admin')` on every method, so this page doesn't need a per-action role check the way `ClientListPage`/`ClientDetailPage` do; it needs one page-level guard.

**Files:**
- Create: `src/pages/users/UserListPage.tsx`
- Test: `src/pages/users/UserListPage.test.tsx`
- Modify: `src/pages/index.ts`

**Interfaces:**
- Consumes: `useUsers` (existing), `useCreateUser`, `useUpdateUser`, `useDeleteUser`, `CreateUserPayload` (Task 8); `useClients` (Task 6, for the `assignedClientIds` multi-select); `useProjects` (existing, for `assignedProjectIds`); `SessionUser` (`types/interfaces.ts`).

- [ ] **Step 1: Write the failing test**

Create `src/pages/users/UserListPage.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserListPage } from "./UserListPage";
import { apiRequest } from "../../hooks/apiRequest";
import AuthContext from "../../context/AuthContext";

jest.mock("../../hooks/apiRequest");
const mockedApiRequest = apiRequest as jest.Mock;

function renderWithProviders(role: "admin" | "user" = "admin") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthContext.Provider
          value={{ userData: { _id: "u1", name: "Admin", username: "admin", role, active: true, assignedClientIds: [], assignedProjectIds: [], hourlyRate: null, tokenVersion: 0 } } as any}
        >
          <UserListPage />
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("UserListPage", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    const matchMediaMock = jest.fn().mockImplementation(() => ({
      matches: false, media: '', onchange: null,
      addListener: jest.fn(), removeListener: jest.fn(),
      addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
    }));
    Object.defineProperty(window, 'matchMedia', { value: matchMediaMock, writable: true });
  });

  it("renders the users returned by the API, for an admin", async () => {
    mockedApiRequest
      .mockResolvedValueOnce({ success: true, data: [{ _id: "u1", name: "Alice", username: "alice", role: "user", active: true }] })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [] });

    renderWithProviders("admin");

    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
  });

  it("does not fetch the user list for a non-admin", async () => {
    renderWithProviders("user");

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
    expect(mockedApiRequest).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- UserListPage.test.tsx --watchAll=false`
Expected: FAIL — `./UserListPage` doesn't exist.

- [ ] **Step 3: Implement `UserListPage`**

Create `src/pages/users/UserListPage.tsx`:

```tsx
import { useContext, useState } from "react";
import { Alert, Card, Table, Tag, Button, Modal, Form, Input, Select, InputNumber, Switch, Space, message } from "antd";
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, CreateUserPayload } from "../../queries/users";
import { useClients } from "../../queries/clients";
import { useProjects } from "../../queries/projects";
import { SessionUser } from "../../types/interfaces";
import { ApiError } from "../../hooks/apiRequest";
import { DisplayComponent } from "../../navigation/layout/DisplayComponent";
import AuthContext from "../../context/AuthContext";

const ROLES: SessionUser["role"][] = ["admin", "user", "final_user"];

export const UserListPage = () => {
  const { userData } = useContext(AuthContext);
  const isAdmin = userData?.role === "admin";

  const { data: users, isLoading, isError, error } = useUsers({ enabled: isAdmin });
  const { data: clients } = useClients();
  const { data: projects } = useProjects();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SessionUser | null>(null);
  const [form] = Form.useForm();

  if (!isAdmin) {
    return <Alert type="error" showIcon message="You don't have access to this page." />;
  }

  const openCreateModal = () => {
    setEditingUser(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const openEditModal = (user: SessionUser) => {
    setEditingUser(user);
    form.setFieldsValue(user);
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      if (editingUser) {
        await updateUser.mutateAsync({ id: editingUser._id, data: values });
      } else {
        await createUser.mutateAsync(values as CreateUserPayload);
      }
      setIsModalOpen(false);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "Could not save the user");
    }
  };

  const handleDelete = (userId: string) => {
    Modal.confirm({
      title: "Delete this user?",
      onOk: async () => {
        try {
          await deleteUser.mutateAsync(userId);
        } catch (err) {
          message.error(err instanceof ApiError ? err.message : "Could not delete the user");
        }
      },
    });
  };

  return (
    <DisplayComponent error={isError ? error : undefined} isLoading={isLoading}>
      <Card title="Users" extra={<Button type="primary" onClick={openCreateModal}>New User</Button>}>
        <Table<SessionUser>
          rowKey="_id"
          dataSource={users || []}
          columns={[
            { title: "Name", dataIndex: "name" },
            { title: "Username", dataIndex: "username" },
            { title: "Role", dataIndex: "role", render: (role) => <Tag>{role}</Tag> },
            { title: "Status", dataIndex: "active", render: (active) => <Tag color={active ? "green" : "default"}>{active ? "Active" : "Inactive"}</Tag> },
            {
              title: "Actions",
              render: (_, record) => (
                <Space>
                  <Button size="small" onClick={() => openEditModal(record)}>Edit</Button>
                  <Button size="small" danger onClick={() => handleDelete(record._id)}>Delete</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={editingUser ? "Edit User" : "New User"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={createUser.isPending || updateUser.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          {!editingUser && (
            <Form.Item name="username" label="Username" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          )}
          {!editingUser && (
            <Form.Item name="password" label="Password" rules={[{ required: true, min: 6 }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="email" label="Email">
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select options={ROLES.map((r) => ({ label: r, value: r }))} />
          </Form.Item>
          {editingUser && (
            <Form.Item name="active" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
          <Form.Item name="assignedClientIds" label="Assigned Clients">
            <Select mode="multiple" options={(clients || []).map((c) => ({ label: c.name, value: c._id }))} />
          </Form.Item>
          <Form.Item name="assignedProjectIds" label="Assigned Projects">
            <Select mode="multiple" options={(projects || []).map((p) => ({ label: p.name, value: p._id }))} />
          </Form.Item>
          <Form.Item name="hourlyRate" label="Hourly Rate">
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
        </Form>
      </Modal>
    </DisplayComponent>
  );
};
```

- [ ] **Step 4: Export the page**

In `src/pages/index.ts`, add:

```ts
export { UserListPage } from "./users/UserListPage";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- UserListPage.test.tsx --watchAll=false`
Expected: PASS, both tests.

## Task 12: Wire the three new routes and add nav links

**Files:**
- Modify: `src/navigation/routes/routes.tsx`
- Modify: `src/navigation/components/AppHeader.tsx`

**Interfaces:**
- Consumes: `ClientListPage`, `ClientDetailPage`, `UserListPage` (Tasks 9–11).

There is no isolated unit test for a route table addition in this codebase (`routes.tsx` has no existing test file, and `AppHeader.test.tsx` already covers header rendering generally) — this task's verification is Task 13's full regression pass plus a manual click-through (see Task 13, Step 3).

- [ ] **Step 1: Add the routes**

In `src/navigation/routes/routes.tsx`, update the import block:

```ts
import {
  Homepage,
  ClientListPage,
  ClientDetailPage,
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
  UserListPage,
} from "../../pages";
```

Add to the `routes` object:

```ts
export const routes = {
  home: "/",
  clients: "/clients",
  clientDetail: "/clients/:id",
  projects: "/projects",
  projectBoard: "/projects/:id/board",
  projectBacklog: "/projects/:id/backlog",
  projectEpics: "/projects/:id/epics",
  projectSprints: "/projects/:id/sprints",
  taskDetail: "/tasks/:id",
  myTime: "/my-time",
  reports: "/reports",
  adminUsers: "/admin/users",
  tickets: "/support",
  newTicket: "/support/tickets/new",
  ticketDetail: "/support/tickets/:id",
};
```

Add to the `Pages` array (order doesn't matter for routing, but keep it grouped near the other admin-ish entries — after `reports`):

```ts
  { path: routes.clients, protected: true, component: <ClientListPage /> },
  { path: routes.clientDetail, protected: true, component: <ClientDetailPage /> },
  { path: routes.reports, protected: true, component: <ReportsPage /> },
  { path: routes.adminUsers, protected: true, component: <UserListPage /> },
```

(Insert `clients`/`clientDetail` before the existing `projects` entry, and `adminUsers` right after the existing `reports` entry — don't reorder the untouched entries.)

- [ ] **Step 2: Add nav links, gated by role**

In `src/navigation/components/AppHeader.tsx`, add the import:

```ts
import { routes } from "../routes/routes";
```

(Already imported — check first; if it's already there, skip this sub-step.)

Update the `Space` block — add two new `Button`s, both gated to `userData?.role === "admin"`, placed before the existing "Support" button:

```tsx
        {isAdmin && (
          <Button type="link" onClick={() => navigate(routes.clients)}>
            Clients
          </Button>
        )}
        {isAdmin && (
          <Button type="link" onClick={() => navigate(routes.adminUsers)}>
            Admin
          </Button>
        )}
```

- [ ] **Step 3: Run the existing header test to verify nothing broke**

Run: `npm test -- AppHeader.test.tsx --watchAll=false`
Expected: PASS — confirms the header still renders correctly with the two new conditionally-rendered buttons.

## Task 13: Velocity report tab on `ReportsPage`

**Files:**
- Modify: `src/queries/reports.ts`
- Modify: `src/pages/reports/ReportsPage.tsx`
- Modify: `src/pages/reports/ReportsPage.test.tsx`
- Modify: `src/utils/queryKeys.ts`

**Interfaces:**
- Consumes: `GET /api/reports/velocity?projectId=` (Task 3 server route).
- Produces: `useReportVelocity(projectId)`, appended to `src/queries/reports.ts`.

- [ ] **Step 1: Write the failing test**

Read `src/pages/reports/ReportsPage.test.tsx` first to see its exact existing mock/assertion style (it already covers the four existing tabs), then add a new `it` block following that same style:

```tsx
  it("renders a Velocity tab that shows completed sprint points", async () => {
    mockedApiRequest
      .mockResolvedValueOnce({ success: true, data: [] }) // projects (for the tab's selector)
      .mockResolvedValueOnce({ success: true, data: [{ sprintId: "s1", sprintName: "Sprint 1", completedPoints: 8 }] });

    renderWithProviders(<ReportsPage />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: /velocity/i }));

    await waitFor(() => expect(screen.getByText("Sprint 1")).toBeInTheDocument());
    expect(screen.getByText("8")).toBeInTheDocument();
  });
```

(Match whatever `renderWithProviders`/mock-sequencing helper the existing file already uses — don't introduce a second one. If the file uses `@testing-library/user-event` already for tab-switching in another test, reuse that same import; otherwise add `import userEvent from "@testing-library/user-event";` at the top.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- ReportsPage.test.tsx --watchAll=false`
Expected: FAIL — no "Velocity" tab exists yet.

- [ ] **Step 3: Add the query hook**

In `src/queries/reports.ts`, add the interface and hook (after `TimelineBucket`/`useReportTimeline`):

```ts
export interface VelocityPoint {
  sprintId: string;
  sprintName: string;
  completedPoints: number;
}

export function useReportVelocity(projectId: string | undefined) {
  return useQuery({
    queryKey: reportKeys.velocity(projectId || ""),
    queryFn: async () => (await apiRequest<VelocityPoint[]>(`reports/velocity?projectId=${projectId}`)).data,
    enabled: !!projectId,
  });
}
```

- [ ] **Step 4: Add the `velocity` key to `reportKeys`**

In `src/utils/queryKeys.ts`, update `reportKeys`:

```ts
export const reportKeys = {
  all: ["reports"] as const,
  byProject: (projectId: string, from: string, to: string) => [...reportKeys.all, "by-project", projectId, from, to] as const,
  byClient: (clientId: string, from: string, to: string) => [...reportKeys.all, "by-client", clientId, from, to] as const,
  byUser: (userId: string, from: string, to: string) => [...reportKeys.all, "by-user", userId, from, to] as const,
  timeline: (scope: string, scopeId: string, from: string, to: string, granularity: string) =>
    [...reportKeys.all, "timeline", scope, scopeId, from, to, granularity] as const,
  velocity: (projectId: string) => [...reportKeys.all, "velocity", projectId] as const,
};
```

- [ ] **Step 5: Add the Velocity tab**

In `src/pages/reports/ReportsPage.tsx`, add the import:

```ts
import { useReportByProject, useReportByClient, useReportByUser, useReportTimeline, useReportVelocity } from "../../queries/reports";
```

Add a new tab component (place after `TimelineTab`, before `ReportsPage`):

```tsx
const VelocityTab = () => {
  const { data: projects } = useProjects();
  const [projectId, setProjectId] = useState<string>();
  const { data: velocity, isLoading, isError, error } = useReportVelocity(projectId);

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Select
          style={{ width: 220 }}
          placeholder="Project"
          options={(projects || []).map((p: ProjectProps) => ({ label: p.name, value: p._id }))}
          onChange={setProjectId}
        />
      </Space>
      <DisplayComponent error={isError ? error : undefined} isLoading={isLoading}>
        <Table
          rowKey="sprintId"
          dataSource={velocity || []}
          columns={[
            { title: "Sprint", dataIndex: "sprintName" },
            { title: "Completed Points", dataIndex: "completedPoints" },
          ]}
        />
      </DisplayComponent>
    </>
  );
};
```

Add the tab entry to `ReportsPage`'s `Tabs items` array:

```tsx
          { key: "velocity", label: "Velocity", children: <VelocityTab /> },
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- ReportsPage.test.tsx --watchAll=false`
Expected: PASS, including the new Velocity test.

## Task 14: Full client regression pass, then the one commit

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --watchAll=false`
Expected: every suite passes (Tasks 5–13's new/modified tests plus everything already passing before this plan).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: compiles cleanly (warnings are acceptable if they already existed before this plan; no new errors).

- [ ] **Step 3: Manual click-through**

Run: `npm start`, log in as an admin seed user (see `quattro_tracker_server`'s seed script), and verify by hand:
- The header shows "Clients" and "Admin" links (and does *not* show them when logged in as a `user`-role account).
- `/clients` lists clients, "New Client" creates one, clicking a row navigates to `/clients/:id`.
- `/clients/:id` shows the client's projects; "New Project" creates one scoped to that client; "Edit" updates it; "Delete" on a project with an existing Task/Ticket shows the 409 error message from Task 2 instead of silently failing or succeeding.
- `/admin/users` lists users; "New User" creates one with a role/assignments; a `final_user` or `user`-role account visiting `/admin/users` directly sees the "don't have access" message, not a crash or a silent redirect loop.
- `/reports` has a working "Velocity" tab.

- [ ] **Step 4: Review the diff**

Run: `git status` and `git diff` — confirm the changed files match what Tasks 5–13 touched: `package.json`, `package-lock.json`, `src/components/ui/index.ts` (and the deletion of `CustomModal.tsx`), `src/queries/clients.ts` (+ new test), `src/queries/projects.ts` (+ new test), `src/queries/users.ts` (+ new test), `src/queries/reports.ts`, `src/utils/queryKeys.ts`, `src/pages/clients/` (new dir), `src/pages/users/` (new dir), `src/pages/index.ts`, `src/navigation/routes/routes.tsx`, `src/navigation/components/AppHeader.tsx`, `src/pages/reports/ReportsPage.tsx`, `src/pages/reports/ReportsPage.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/ui/index.ts src/queries/clients.ts src/queries/clients.test.ts src/queries/projects.ts src/queries/projects.test.ts src/queries/users.ts src/queries/users.test.ts src/queries/reports.ts src/utils/queryKeys.ts src/pages/clients src/pages/users src/pages/index.ts src/navigation/routes/routes.tsx src/navigation/components/AppHeader.tsx src/pages/reports/ReportsPage.tsx src/pages/reports/ReportsPage.test.tsx
git commit -m "$(cat <<'EOF'
feat: add Admin Client/Project/User CRUD screens and a Velocity report tab

Builds the /clients, /clients/:id, and /admin/users screens called for in
docs/plan/04-frontend.md's route table and docs/plan/07-phasing-risks-
open-questions.md's Phase 0 line ("Admin can CRUD Clients/Projects/Users")
but never wired up client-side — the server routes/services already
existed. Adds create/update/delete mutation hooks for clients/projects/
users, a Velocity tab on Reports backed by the new /api/reports/velocity
endpoint, and drops six unused dependencies (js-base64, react-jwt, https,
export-from-json, react-to-print, axios) plus the dead CustomModal
component left over from the pre-Phase-0 app.
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** every phase-table bullet is addressed — dead code (Task 5, plus confirmation the rest was already deleted), CORS/env vars (confirmed already consolidated server-side; Task 5 drops the one remaining unused client var), secondary reports (Task 3 + Task 13 ship Velocity; burndown/backlog-over-time explicitly scoped out with a stated reason, see "What this plan deliberately does not build"), admin UI polish (Tasks 6–12, scoped up to a full CRUD build per the owner's explicit decision).
- **Placeholder scan:** no task ends in a vague "add error handling"/"write tests for the above" — every test has real assertions, every implementation step has real code.
- **Type consistency:** `ClientProps`, `ProjectProps`, `SessionUser` are used with the exact field names from `src/types/interfaces.ts` throughout (`billingAddress`, `guideUrl`, `assignedClientIds`, `hourlyRate`, etc. — no renamed fields introduced). Query key factories (`clientKeys.detail`, `reportKeys.velocity`) are defined in Task 6/13 before any hook in a later task references them. `HasDependentRecordsError` is defined once in Task 1 and reused as-is in Task 2, not redefined.
