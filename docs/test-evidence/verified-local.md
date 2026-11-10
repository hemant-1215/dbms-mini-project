# Verification evidence

Validation run: 2026-11-10, Linux host using the same Docker Compose services intended for Windows, macOS, and Linux. The test stack used an isolated Compose project name and non-default host ports.

| Area | Result |
|---|---|
| Backend unit tests | 3 files, 4 tests passed. |
| Backend TypeScript build | Passed. |
| Frontend production build | Passed; all 14 App Router routes compiled. |
| npm audit | 0 findings for backend and frontend lockfiles. |
| MySQL 8.4 migrations | All 9 migrations applied; rerun is idempotent. |
| MySQL database/RBAC checks | 19 passed: constraints, cascades, status triggers, cost function, concurrent scheduler, transaction rollback, 50 concurrent audit appends, audit immutability, DDL denial, and readonly column access. |
| Compose API/web images | Production builds passed; MySQL and Atlas Local health checks passed. |
| Live API auth | Registration, login, 401/403, student quota, project ownership isolation, immediate DB-backed role refresh, and audit verification passed. |
| MongoDB | 2,000 documents, strict validator rejection, standard indexes, and `monitoring_vector` status `READY` verified. |
| Semantic search | 30 labeled prompts; Precision@5 0.60, Recall@5 0.60, MRR 0.60 on the synthetic event labels. Project-scoped API search returned only accessible projects. |
| Seed | 20 users, 10 servers, 40 GPUs, 25 projects, 25 models, 25 datasets, 60 experiments, 300 jobs, 100,000 usage rows, and 2,000 monitoring events. |
| Index benchmark | 5 iterations per query mode on the seeded dataset; output CSV in `benchmark/results/`. |

The MongoDB image is the pinned Atlas Local preview image intended for local development/testing. Production deployments should use an appropriately managed MongoDB Search deployment and operational controls.
