# API map

All endpoints are prefixed with `/api`. JSON requests are validated with Zod. Errors use `{ "error": { "code", "message", "details" } }`.

| Area | Routes |
|---|---|
| Health/auth | `GET /health`, `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Projects | `GET/POST /projects`, `GET /projects/:id/tree`, `PATCH/DELETE /projects/:id` |
| Assets | CRUD `/models`, `/datasets`, `/experiments` |
| Jobs | `GET/POST /jobs`, `GET /jobs/:id/history`, `GET /jobs/:id/explanation`, `POST /jobs/:id/schedule|cancel|retry` |
| Infrastructure | CRUD `/servers`, `/gpus` (admin writes); reads are available to signed-in users |
| Users | `GET/POST /users`, `PATCH/DELETE /users/:id` (admin) |
| Analytics | `GET /analytics/overview`, `/q1`, `/q2/:jobId`, `/q3`, `/utilization` |
| Monitoring/search | `GET /monitoring/events`, `/monitoring/summary`, `POST /search/semantic` |
| Scheduler/ingest | `POST /scheduler/run` (admin), `POST /ingest/telemetry` (service token) |
| Audit | `GET /audit`, `/audit/verify`, `/audit/head` (admin) |

Project-scoped list and write routes only return resources owned by the caller unless the caller is an admin. A missing or out-of-scope resource returns 404 where applicable.
