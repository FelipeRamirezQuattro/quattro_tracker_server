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
- `POST /api/auth/login` — Authenticate user and receive JWT token
- `POST /api/auth/logout` — Invalidate user session
- `POST /api/auth/refresh` — Refresh JWT token

**Clients** (CRUD)
- `GET /api/clients` — List all clients (admin/user)
- `POST /api/clients` — Create new client (admin)
- `GET /api/clients/:id` — Retrieve specific client (admin/user)
- `PUT /api/clients/:id` — Update client (admin/user)
- `DELETE /api/clients/:id` — Delete client (admin)

**Projects** (CRUD)
- `GET /api/projects` — List all projects (admin/user/final_user)
- `POST /api/projects` — Create new project (admin)
- `GET /api/projects/:id` — Retrieve specific project (admin/user/final_user)
- `PUT /api/projects/:id` — Update project (admin/user)
- `DELETE /api/projects/:id` — Delete project (admin)

**Users** (CRUD)
- `GET /api/users` — List all users (admin)
- `POST /api/users` — Create new user (admin)
- `GET /api/users/:id` — Retrieve specific user (admin)
- `PUT /api/users/:id` — Update user (admin)
- `DELETE /api/users/:id` — Delete user (admin)

### Phase 1 — Scrum Core (Epics, Sprints, Tasks, Subtasks)

**Epics** (CRUD)
- `GET /api/epics` — List all epics (admin/user)
- `POST /api/epics` — Create new epic (admin/user)
- `GET /api/epics/:id` — Retrieve specific epic (admin/user)
- `PUT /api/epics/:id` — Update epic (admin/user)
- `DELETE /api/epics/:id` — Delete epic (admin)

**Project Epics** (nested routes, CRUD)
- `GET /api/projects/:projectId/epics` — List epics for project (admin/user/final_user)
- `POST /api/projects/:projectId/epics` — Create epic in project (admin/user)
- `GET /api/projects/:projectId/epics/:epicId` — Retrieve project epic (admin/user/final_user)
- `PUT /api/projects/:projectId/epics/:epicId` — Update project epic (admin/user)
- `DELETE /api/projects/:projectId/epics/:epicId` — Delete project epic (admin)

**Sprints** (CRUD)
- `GET /api/sprints` — List all sprints (admin/user)
- `POST /api/sprints` — Create new sprint (admin/user)
- `GET /api/sprints/:id` — Retrieve specific sprint (admin/user)
- `PUT /api/sprints/:id` — Update sprint (admin/user)
- `DELETE /api/sprints/:id` — Delete sprint (admin)

**Project Sprints** (nested routes, CRUD)
- `GET /api/projects/:projectId/sprints` — List sprints for project (admin/user/final_user)
- `POST /api/projects/:projectId/sprints` — Create sprint in project (admin/user)
- `GET /api/projects/:projectId/sprints/:sprintId` — Retrieve project sprint (admin/user/final_user)
- `PUT /api/projects/:projectId/sprints/:sprintId` — Update project sprint (admin/user)
- `DELETE /api/projects/:projectId/sprints/:sprintId` — Delete project sprint (admin)

**Tasks** (CRUD)
- `GET /api/tasks` — List all tasks (admin/user)
- `POST /api/tasks` — Create new task (admin/user)
- `GET /api/tasks/:id` — Retrieve specific task (admin/user)
- `PUT /api/tasks/:id` — Update task (admin/user)
- `DELETE /api/tasks/:id` — Delete task (admin)
- `POST /api/tasks/:id/status` — Update task status (admin/user)

**Subtasks** (nested under tasks, CRUD)
- `GET /api/tasks/:taskId/subtasks` — List subtasks for task (admin/user/final_user)
- `POST /api/tasks/:taskId/subtasks` — Create subtask (admin/user)
- `GET /api/tasks/:taskId/subtasks/:subtaskId` — Retrieve specific subtask (admin/user/final_user)
- `PUT /api/tasks/:taskId/subtasks/:subtaskId` — Update subtask (admin/user)
- `DELETE /api/tasks/:taskId/subtasks/:subtaskId` — Delete subtask (admin)
