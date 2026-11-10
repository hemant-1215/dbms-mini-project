# Test plan

| ID | Area | Command / method | Expected proof |
|---|---|---|---|
| UT-01 | SQL splitter | `npm test` in `backend/` | Stored-program delimiters are preserved. |
| UT-02 | Audit canonical hash | `npm test` in `backend/` | Key order is stable; record/previous-hash changes alter the digest. |
| API-01 | Health | `npm test` in `backend/` | Health route returns the API status. |
| DB-01 | Schema | `docker compose run --rm api node dist/scripts/migrate.js` | All numbered migrations apply. |
| DB-02 | Constraints/cascades | `npm run db:test` in `backend/` | Required, unique, check, FK, CASCADE, and RESTRICT behavior. |
| DB-03 | Routines/triggers | `npm run db:test` in `backend/` | Legal transitions and billing/scheduling behavior; illegal transition rejected. |
| RBAC-01 | Database grants | `demo/privileges.sql` | Allowed statements succeed; forbidden statements fail. |
| API-02 | Auth/API | `npm test` and integration suite | Student registration, login, 401/403/404/409 responses. |
| AUD-01 | Hash chain | `npm test` and integration suite | Verify success, tamper detection, concurrent appends, atomic rollback. |
| MONGO-01 | Collection/index | `docker compose exec api node dist/scripts/mongo-demo.js` | Strict validation, indexes, CRUD, aggregation. |
| VEC-01 | Semantic search | `docker compose exec api node dist/scripts/eval-search.js` | Index readiness, P@5/Recall@5/MRR on 30 prompts. |
| WEB-01 | Frontend | `npm run build` in `frontend/` | Next.js routes compile and render. |
| BENCH-01 | Index benchmark | `node benchmark/run.mjs` | Indexed vs. unindexed medians for three representative queries, CSV output. |

Actual run output belongs in `docs/test-evidence/`. Database and vector tests need a configured `.env`, Docker Compose, and the local Atlas Search image.
