# Project requirements and implementation choices

This project follows the supplied AI-CRMS brief: a live DBMS-centered web application for GPU resources, projects, model and dataset registration, experiments, scheduled jobs, chargeback, MongoDB telemetry, semantic log retrieval, and tamper-evident auditing.

The implementation includes the 15 relational tables, explicit foreign-key update/delete rules, row-level job status checks, role grants, one cost function, three scheduler/reporting procedures, triggers, views, API routes, a responsive UI, deterministic demo data, vector-search evaluation scaffolding, a telemetry simulator, and an index benchmark harness.

The recommended initial choices are applied: configurable billing rates, a separate migration account, separate app/admin MySQL pools, student-only self-registration, a labelled simulator and token-protected telemetry ingest route, INR, and a smaller default student quota. Students can use up to 10 GPU-hours per project; researchers default to 100 GPU-hours.

The application is packaged with Docker Compose and does not use host-specific database paths or shell-only runtime scripts. Compose volumes hold database state and named service DNS names connect the API to MySQL/MongoDB on all supported Docker hosts.

The user-provided ZIP was unavailable at project-generation time, so this file records the requirements from the earlier full read and does not claim to be a byte-for-byte copy of the original plan.
