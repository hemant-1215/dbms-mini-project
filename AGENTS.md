# AI-CRMS project guidance

The project is a university DBMS demonstration. Keep the SQL and application code readable enough to explain in a viva.

## Architecture rules

- Next.js App Router, React, TypeScript, Tailwind, Recharts, and Lucide for the web application.
- Express, TypeScript, Zod, JWT, bcrypt, and `mysql2/promise` for the API.
- MySQL 8.4 is the relational source of truth. MongoDB Atlas Local stores monitoring events and vector indexes.
- Use parameterized SQL. Do not add an ORM or construct SQL from user-controlled identifiers.
- Runtime application traffic uses `crms_app`; admin-only writes use `crms_admin`; migrations use the separate `crms_migrator` account.
- Semantic search must use MongoDB `$vectorSearch` and the 384-dimensional `Xenova/all-MiniLM-L6-v2` embeddings.
- UI metrics come from API responses. Do not add sample or hardcoded dashboard metrics.
- Schema and routine changes go in numbered `db/mysql/` migrations.
- Secrets live in `.env`; keep `.env.example` current and never commit `.env`.

## Data safety

- Avoid destructive database and Git commands without an explicit user request. This includes `docker compose down -v`, dropping databases, deleting volumes, hard resets, and force pushes.
- Keep seed data clearly labelled as a local demonstration fixture; do not use it as production data.
- Audit writes must be in the same MySQL transaction as the business change. The app and admin roles cannot update or delete audit rows.

## Verification

- Run the relevant build and test commands after changes and record the real output in `docs/test-evidence/`.
- Include negative cases for authorization and database constraints.
- Do not report a feature as complete if it depends on an unverified database capability.
