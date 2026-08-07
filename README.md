# quattro_tracker_server

Phase 0 of the Quattro Support → task tracker migration. See
`../docs/plan/` for the full design and `../docs/superpowers/plans/` for
the implementation plan this codebase was built from.

## Commands

npm run dev      # ts-node-dev, hot reload
npm run build     # tsc --build tsconfig.build.json -> dist/
npm start         # node dist/index.js (build first)
npm test          # jest --runInBand
npm run seed      # requires SEED_ADMIN_USERNAME + SEED_ADMIN_PASSWORD in env

## Environment

Copy `.env.example` to `.env` and fill in real values before running
`npm run dev` or `npm run seed`.

## API Endpoints

### Phase 0 — Authentication, Clients, Projects, Users

**Auth**
- `POST /api/auth/login` — Authenticate user and receive an access token (sets refresh-token cookie)
- `POST /api/auth/refresh` — Exchange the refresh-token cookie for a new access token
- `POST /api/auth/logout` — Invalidate the current refresh token
- `GET /api/auth/me` — Retrieve the authenticated user's profile (authenticated)
- `PUT /api/auth/change-password` — Change the authenticated user's own password (authenticated)
- `POST /api/auth/reset-password/request` — Request a password-reset token by username/email
- `POST /api/auth/reset-password/confirm` — Confirm a password reset using a reset token

**Clients** (CRUD)
- `GET /api/clients` — List all clients (admin, user, final_user)
- `POST /api/clients` — Create new client (admin)
- `GET /api/clients/:id` — Retrieve specific client (admin, user, final_user)
- `PUT /api/clients/:id` — Update client (admin, user)
- `DELETE /api/clients/:id` — Delete client (admin)

**Projects** (CRUD)
- `GET /api/projects` — List all projects (admin, user, final_user)
- `POST /api/projects` — Create new project (admin)
- `GET /api/projects/:id` — Retrieve specific project (admin, user, final_user)
- `PUT /api/projects/:id` — Update project (admin, user)
- `DELETE /api/projects/:id` — Delete project (admin)

**Users** (CRUD)
- `GET /api/users` — List all users (admin)
- `POST /api/users` — Create new user (admin)
- `GET /api/users/:id` — Retrieve specific user (admin)
- `PUT /api/users/:id` — Update user (admin)
- `DELETE /api/users/:id` — Delete user (admin)

### Phase 1 — Scrum Core (Epics, Sprints, Tasks, Subtasks)

There is no standalone `/api/epics` or `/api/sprints` list/create route — epics
and sprints are always listed/created nested under their project
(`/api/projects/:projectId/epics`, `/api/projects/:projectId/sprints`). Once
created, an individual epic/sprint can be read/updated/deleted via the flat
`/api/epics/:id` / `/api/sprints/:id` routes below.

`final_user` has no access to any Epic, Sprint, Task, or SubTask route — every
route for these four entities requires `admin` or `user`.

**Project Epics** (nested routes)
- `GET /api/projects/:projectId/epics` — List epics for project (admin, user)
- `POST /api/projects/:projectId/epics` — Create epic in project (admin, user)

**Epics** (flat routes, by epic id)
- `GET /api/epics/:id` — Retrieve specific epic (admin, user)
- `PUT /api/epics/:id` — Update epic (admin, user)
- `DELETE /api/epics/:id` — Delete epic (admin, user)

**Project Sprints** (nested routes)
- `GET /api/projects/:projectId/sprints` — List sprints for project (admin, user)
- `POST /api/projects/:projectId/sprints` — Create sprint in project (admin, user)

**Sprints** (flat routes, by sprint id)
- `GET /api/sprints/:id` — Retrieve specific sprint (admin, user)
- `PUT /api/sprints/:id` — Update sprint (admin, user)
- `DELETE /api/sprints/:id` — Delete sprint (admin, user)

**Tasks** (CRUD)
- `GET /api/tasks` — List tasks for a project (`projectId` query param required; optional `status`, `sprintId`, `epicId`, `assigneeId` filters) (admin, user)
- `POST /api/tasks` — Create new task (admin, user)
- `GET /api/tasks/:id` — Retrieve specific task (admin, user)
- `PUT /api/tasks/:id` — Update task (any field except `status`, which is ignored here — see the status route below) (admin, user)
- `DELETE /api/tasks/:id` — Delete task (admin, user)
- `PUT /api/tasks/:id/status` — Transition task status through the workflow matrix, enforcing the Definition-of-Ready gate when leaving `backlog` (admin, user)

**Subtasks** (embedded in the parent task's document — no standalone GET route; read them as part of `GET /api/tasks/:id`)
- `POST /api/tasks/:id/subtasks` — Add a subtask to a task (admin, user)
- `PUT /api/tasks/:id/subtasks/:subId` — Update a subtask (admin, user)
- `DELETE /api/tasks/:id/subtasks/:subId` — Delete a subtask (admin, user)
