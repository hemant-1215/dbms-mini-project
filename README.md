# AI-CRMS

AI Compute Resource Management System for managing GPU infrastructure, projects, datasets, experiments, training jobs, telemetry, and INR chargeback.

The application runs in Docker Compose, so Windows, macOS, and Linux use the same database, API, and web containers. A host Node.js install is optional for application use; Docker Desktop or Docker Engine with the Compose plugin is required. The local MongoDB Atlas image provides Search and Vector Search for development and university demonstration workloads.

## Start on Windows, macOS, or Linux

1. Install Docker Desktop (Windows/macOS) or Docker Engine plus the Compose plugin (Linux). Allow Docker at least 4 GB of memory.
2. Copy `.env.example` to `.env`. In PowerShell use `Copy-Item .env.example .env`; in macOS/Linux shells use `cp .env.example .env`.
3. Replace every `REPLACE_...` value with an owner-chosen secret. Use different URL-safe hexadecimal passwords for MySQL and MongoDB account values; they are interpolated into the MySQL bootstrap script and MongoDB URI. Use at least 32 characters for `JWT_SECRET` and `INGEST_TOKEN`.
4. Start the databases: `docker compose up -d mysql mongodb`.
5. Build the API and web containers: `docker compose build api web`.
6. Apply migrations: `docker compose run --rm api node dist/scripts/migrate.js`.
7. Start the application: `docker compose up -d api web`.
8. Load the deterministic demonstration dataset: `docker compose exec api node dist/scripts/seed.js`.
9. Open [http://localhost:3000](http://localhost:3000). The API health route is [http://localhost:4000/api/health](http://localhost:4000/api/health).

The first seed run downloads the embedding model into the persistent `model_cache` volume. It requires outbound network access from the API container. The application stores MongoDB events with embeddings and provisions a real 384-dimension cosine vector index; it does not fall back to keyword search.

## Demonstration accounts

`seed` creates 3 admins, 6 researchers, and 11 students. Their usernames are `demo_admin1`–`demo_admin3`, `demo_researcher1`–`demo_researcher6`, and `demo_student1`–`demo_student11`. The local seed password is `DemoPass!2026`; replace it before exposing the demo beyond localhost.

## Useful Compose commands

```text
docker compose ps
docker compose logs -f api
docker compose logs -f mongodb
docker compose exec api node dist/scripts/simulate.js 10
docker compose exec api node dist/scripts/migrate.js
docker compose exec api node dist/scripts/mongo-demo.js
docker compose exec api node dist/scripts/eval-search.js
```

With the `.env` file in the project root and backend dependencies installed, use `node benchmark/run.mjs` for the indexed/unindexed query benchmark. `demo/privileges.sql` documents allowed and intentionally denied statements for each database account.

To stop the containers without deleting persistent data, run `docker compose down`. `docker compose down -v` deletes the database volumes and all local project data; use it only when you intentionally want a clean reset.

## Development

Node.js 24 LTS and npm are pinned in the container images. For local iteration, install Node.js 24 LTS, then run `npm ci`, `npm run build`, and `npm test` inside `backend/`. `frontend/` has its own lockfile and `npm run build` command. The project lockfiles pin the exact verified dependency versions. When running the API directly on the host, change `MYSQL_HOST` to `127.0.0.1` and point `MONGODB_URI` to `127.0.0.1` with the configured host ports; the example file's `mysql` and `mongodb` names are for Compose networking.

## Main components

- `db/mysql/`: numbered schema, indexes, grants, functions, procedures, triggers, views, and seed-rate migrations.
- `db/queries/`: chargeback, scheduler-candidate, and failure-trend queries.
- `backend/`: Express API, MySQL connection pools, audit chain, scheduler integrations, telemetry, semantic search, seed, and simulator.
- `frontend/`: Next.js App Router pages that fetch metrics and records from the API.
- `db/mongo/`: MongoDB JSON Schema and vector-index definition.
- `docs/`: architecture, schema notes, role design, API map, audit limitations, test plan, and evidence.

The MongoDB Atlas Local Docker image is intended for local development and testing, not production deployment. See [MongoDB's local Search and Vector Search quickstart](https://www.mongodb.com/docs/search/self-managed/current/installation/quick-start/).
