# Roles and privileges

| MySQL role | Runtime use | Scope |
|---|---|---|
| `ai_crms_app` | Normal API routes | Project, asset, experiment, job, requirements, allocation, usage, results, and audit insert/select rights; read access to servers, GPUs, and rates; execute scheduler routines. No DDL or user/role management. |
| `ai_crms_admin` | Admin-only API pool | Business-table CRUD and routine execution. Audit log is select/insert only; triggers reject update/delete. |
| `ai_crms_readonly` | Analyst/demo connection | Read-only data access. No password hash access. |
| `ai_crms_migrator` | Migration command only | Schema/routine/trigger creation and migration-time role/grant management. Not loaded by API pools. |

Self-registration inserts a user without a role column, so MySQL's default role is `student`. Only the admin route can change a role. Database roles supplement the API's project-owner checks.

The account bootstrap script creates the non-root accounts. `003_roles_grants.sql` assigns table privileges after the schema migration; `008_view_grants.sql` grants reporting view access after the views exist. `demo/privileges.sql` contains commands for an admin and read-only session.
