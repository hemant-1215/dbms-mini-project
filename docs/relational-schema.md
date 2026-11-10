# Relational schema

The MySQL schema uses InnoDB and `utf8mb4`. The numbered migrations create `users`, `projects`, `servers`, `gpus`, `models`, `datasets`, `experiments`, `training_jobs`, `job_requirements`, `job_gpu_allocation`, `resource_usage`, `experiment_results`, `job_status_history`, `audit_log`, and `billing_rates`.

## Relationship summary

- A user owns projects and submits jobs; a project contains models, datasets, and experiments.
- An experiment uses optional model and dataset registrations and has many training jobs.
- A job has one requirements row, many allocations, usage measurements, results, and status-history events.
- A server hosts GPUs. A generated `active_gpu_id` plus a unique key ensures a GPU has no more than one unreleased allocation.
- Billing rates are effective-dated and keyed by resource type, GPU model when applicable, and start time.

## Referential actions

Every ordinary foreign key explicitly declares an update action; most use `ON UPDATE CASCADE`. Project deletion cascades to its assets and jobs; deleting a server cascades to its GPUs. Parent-project deletion sets child parent references to `NULL`. User references for ownership/authorship restrict deletion. Historical usage and changed-by references are kept with `SET NULL` where defined. GPU deletion is restricted when allocation history exists. The allocation-to-GPU key uses `ON UPDATE RESTRICT` because MySQL prohibits `ON UPDATE CASCADE` on a base column referenced by a generated column; preserving the generated active-GPU unique key provides the database-level no-double-booking guarantee.

MySQL 8.4 rejects a `CHECK` that references a column used by an `ON DELETE SET NULL` foreign key. The plan's self-parent project rule is therefore enforced by paired `BEFORE INSERT`/`BEFORE UPDATE` triggers, while quota, resource, and job bounds remain `CHECK` constraints. `db/mysql/001_schema.sql` contains the DDL; `db/mysql/002_indexes.sql` adds query indexes.
