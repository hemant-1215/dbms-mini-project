CREATE OR REPLACE VIEW v_gpu_availability AS
SELECT s.server_id,s.hostname,s.location,s.status AS server_status,
       g.gpu_id,g.gpu_index,g.model_name,g.memory_gb,g.compute_capability,
       g.status AS gpu_status,g.utilization_pct,g.memory_used_gb
  FROM servers s JOIN gpus g ON g.server_id=s.server_id;

CREATE OR REPLACE VIEW v_job_overview AS
SELECT j.job_id,j.status,j.priority,j.submitted_at,j.started_at,j.finished_at,j.failure_reason,j.scheduler_note,
       e.experiment_id,e.name AS experiment_name,p.project_id,p.name AS project_name,
       u.user_id,u.username,r.gpu_count,r.min_gpu_memory_gb,r.cpu_cores,r.ram_gb
  FROM training_jobs j JOIN experiments e ON e.experiment_id=j.experiment_id
  JOIN projects p ON p.project_id=e.project_id JOIN users u ON u.user_id=j.submitted_by
  LEFT JOIN job_requirements r ON r.job_id=j.job_id;

CREATE OR REPLACE VIEW v_project_costs AS
SELECT p.project_id,p.name AS project_name,COUNT(DISTINCT j.job_id) AS job_count,
       COALESCE(SUM(fn_job_cost(j.job_id)),0) AS cost_inr
  FROM projects p LEFT JOIN experiments e ON e.project_id=p.project_id
  LEFT JOIN training_jobs j ON j.experiment_id=e.experiment_id
 GROUP BY p.project_id,p.name;

CREATE OR REPLACE VIEW v_user_usage AS
SELECT u.user_id,u.username,COUNT(DISTINCT j.job_id) AS job_count,
       COALESCE(SUM(fn_job_cost(j.job_id)),0) AS cost_inr
  FROM users u LEFT JOIN training_jobs j ON j.submitted_by=u.user_id
 GROUP BY u.user_id,u.username;

CREATE OR REPLACE VIEW v_users_public AS
SELECT user_id,username,email,full_name,role,is_active,created_at,updated_at FROM users;
