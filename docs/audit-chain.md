# Tamper-evident audit chain

Each audit record hashes the previous row hash concatenated with RFC 8785 canonical JSON for the audit fields. The record covers the database ID, actor, action, entity, UTC timestamp with six fractional digits, and JSON payload. The backend serializes appends by locking the single sentinel row in `audit_chain_lock` inside the same transaction as the business write, then reads the latest audit head. This keeps runtime audit rights limited to SELECT/INSERT on `audit_log` while still making concurrent appends atomic.

The genesis record uses a previous hash of 64 zeroes. Verification recomputes each row in ID order and reports the first broken ID. Runtime roles can insert and select audit rows; update and delete are also rejected by triggers.

This chain is tamper-evident, not tamper-proof. A privileged database administrator can rewrite the whole chain or drop the triggers. External anchoring of the latest head hash is required to detect a full privileged rewrite. `GET /api/audit/head` exposes the current head for that purpose.

Timestamps are stored as `DATETIME(6)` and the same six-digit UTC value is hashed. `mysql2` uses `dateStrings` and UTC timezone settings to preserve fractional seconds during verification.
