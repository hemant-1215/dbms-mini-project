-- Run each block with the matching account. mysql -h 127.0.0.1 -u crms_app -p ai_crms
-- The -p option prompts for a password. Do not put secrets in this file.

-- As crms_app: allowed reads
SELECT project_id, name, status FROM projects LIMIT 1;
SELECT audit_id, action, curr_hash FROM audit_log ORDER BY audit_id DESC LIMIT 1;
-- As crms_app: expected to fail (table-level audit permission is SELECT/INSERT only)
-- UPDATE audit_log SET action=action WHERE audit_id=1;
-- CREATE TABLE forbidden_from_app(id INT);

-- As crms_admin: allowed user administration
SELECT user_id, username, role FROM users LIMIT 1;
-- As crms_admin: expected to fail; audit rows remain append-only
-- UPDATE audit_log SET action=action WHERE audit_id=1;

-- As crms_readonly: allowed reporting reads
SELECT project_id, name, status FROM projects LIMIT 1;
-- As crms_readonly: expected to fail (the role cannot read credentials or write)
-- SELECT password_hash FROM users LIMIT 1;
-- INSERT INTO projects(owner_id, name) VALUES (1, 'forbidden');
