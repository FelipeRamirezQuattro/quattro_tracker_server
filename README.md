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
