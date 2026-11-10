CREATE ROLE IF NOT EXISTS ai_crms_admin, ai_crms_app, ai_crms_readonly, ai_crms_migrator;

GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.users TO ai_crms_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.projects TO ai_crms_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.servers TO ai_crms_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.gpus TO ai_crms_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.models TO ai_crms_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.datasets TO ai_crms_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.experiments TO ai_crms_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.training_jobs TO ai_crms_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.job_requirements TO ai_crms_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.job_gpu_allocation TO ai_crms_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.resource_usage TO ai_crms_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.experiment_results TO ai_crms_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.job_status_history TO ai_crms_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.billing_rates TO ai_crms_admin;
GRANT SELECT, INSERT ON ai_crms.audit_log TO ai_crms_admin;
GRANT SELECT, UPDATE ON ai_crms.audit_chain_lock TO ai_crms_admin;
GRANT EXECUTE ON ai_crms.* TO ai_crms_admin;

GRANT SELECT (user_id, username, email, password_hash, full_name, role, is_active, created_at, updated_at) ON ai_crms.users TO ai_crms_app;
GRANT INSERT (username, email, password_hash, full_name) ON ai_crms.users TO ai_crms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.projects TO ai_crms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.models TO ai_crms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.datasets TO ai_crms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.experiments TO ai_crms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.training_jobs TO ai_crms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.job_requirements TO ai_crms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.job_gpu_allocation TO ai_crms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.resource_usage TO ai_crms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_crms.experiment_results TO ai_crms_app;
GRANT SELECT ON ai_crms.job_status_history TO ai_crms_app;
GRANT SELECT, INSERT ON ai_crms.audit_log TO ai_crms_app;
GRANT SELECT, UPDATE ON ai_crms.audit_chain_lock TO ai_crms_app;
GRANT SELECT ON ai_crms.servers TO ai_crms_app;
GRANT SELECT ON ai_crms.gpus TO ai_crms_app;
GRANT SELECT ON ai_crms.billing_rates TO ai_crms_app;
GRANT EXECUTE ON ai_crms.* TO ai_crms_app;

GRANT SELECT ON ai_crms.projects TO ai_crms_readonly;
GRANT SELECT ON ai_crms.servers TO ai_crms_readonly;
GRANT SELECT ON ai_crms.gpus TO ai_crms_readonly;
GRANT SELECT ON ai_crms.models TO ai_crms_readonly;
GRANT SELECT ON ai_crms.datasets TO ai_crms_readonly;
GRANT SELECT ON ai_crms.experiments TO ai_crms_readonly;
GRANT SELECT ON ai_crms.training_jobs TO ai_crms_readonly;
GRANT SELECT ON ai_crms.job_requirements TO ai_crms_readonly;
GRANT SELECT ON ai_crms.job_gpu_allocation TO ai_crms_readonly;
GRANT SELECT ON ai_crms.resource_usage TO ai_crms_readonly;
GRANT SELECT ON ai_crms.experiment_results TO ai_crms_readonly;
GRANT SELECT ON ai_crms.job_status_history TO ai_crms_readonly;

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES, CREATE VIEW, SHOW VIEW,
  CREATE ROUTINE, ALTER ROUTINE, EXECUTE, TRIGGER, EVENT ON ai_crms.* TO ai_crms_migrator;

GRANT ai_crms_app TO 'crms_app'@'%';
GRANT ai_crms_admin TO 'crms_admin'@'%';
GRANT ai_crms_readonly TO 'crms_readonly'@'%';
GRANT ai_crms_migrator TO 'crms_migrator'@'%';
SET DEFAULT ROLE ai_crms_app TO 'crms_app'@'%';
SET DEFAULT ROLE ai_crms_admin TO 'crms_admin'@'%';
SET DEFAULT ROLE ai_crms_readonly TO 'crms_readonly'@'%';
SET DEFAULT ROLE ai_crms_migrator TO 'crms_migrator'@'%';
