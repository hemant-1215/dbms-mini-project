-- AI-CRMS relational foundation. MySQL 8.4 / InnoDB / utf8mb4.
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role ENUM('admin','researcher','student') NOT NULL DEFAULT 'student',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS projects (
  project_id INT AUTO_INCREMENT PRIMARY KEY,
  parent_project_id INT NULL,
  owner_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  gpu_hour_quota DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (gpu_hour_quota >= 0),
  status ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_projects_owner_name (owner_id, name),
  CONSTRAINT fk_projects_parent FOREIGN KEY (parent_project_id) REFERENCES projects(project_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS servers (
  server_id INT AUTO_INCREMENT PRIMARY KEY,
  hostname VARCHAR(100) NOT NULL UNIQUE,
  ip_address VARCHAR(45) NULL,
  location VARCHAR(100) NULL,
  total_cpu_cores INT NOT NULL CHECK (total_cpu_cores > 0),
  total_ram_gb INT NOT NULL CHECK (total_ram_gb > 0),
  total_storage_gb INT NOT NULL CHECK (total_storage_gb > 0),
  status ENUM('online','offline','maintenance') NOT NULL DEFAULT 'online',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS gpus (
  gpu_id INT AUTO_INCREMENT PRIMARY KEY,
  server_id INT NOT NULL,
  gpu_index TINYINT UNSIGNED NOT NULL,
  model_name VARCHAR(50) NOT NULL,
  memory_gb INT NOT NULL CHECK (memory_gb > 0),
  compute_capability DECIMAL(3,1) NOT NULL CHECK (compute_capability > 0),
  status ENUM('available','allocated','maintenance','offline') NOT NULL DEFAULT 'available',
  utilization_pct DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (utilization_pct BETWEEN 0 AND 100),
  memory_used_gb DECIMAL(6,2) NOT NULL DEFAULT 0 CHECK (memory_used_gb >= 0),
  UNIQUE KEY uq_gpus_server_index (server_id, gpu_index),
  CONSTRAINT ck_gpus_memory_used CHECK (memory_used_gb <= memory_gb),
  CONSTRAINT fk_gpus_server FOREIGN KEY (server_id) REFERENCES servers(server_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS models (
  model_id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  registered_by INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  version VARCHAR(30) NOT NULL,
  framework VARCHAR(50) NULL,
  parameter_count BIGINT NULL CHECK (parameter_count IS NULL OR parameter_count > 0),
  artifact_uri VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_models_project_name_version (project_id, name, version),
  CONSTRAINT fk_models_project FOREIGN KEY (project_id) REFERENCES projects(project_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_models_registrar FOREIGN KEY (registered_by) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS datasets (
  dataset_id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  registered_by INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  version VARCHAR(30) NOT NULL,
  size_gb DECIMAL(10,2) NULL CHECK (size_gb IS NULL OR size_gb >= 0),
  format VARCHAR(30) NULL,
  row_count BIGINT NULL CHECK (row_count IS NULL OR row_count >= 0),
  storage_uri VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_datasets_project_name_version (project_id, name, version),
  CONSTRAINT fk_datasets_project FOREIGN KEY (project_id) REFERENCES projects(project_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_datasets_registrar FOREIGN KEY (registered_by) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS experiments (
  experiment_id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  model_id INT NULL,
  dataset_id INT NULL,
  created_by INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  hyperparameters JSON NULL,
  status ENUM('draft','active','finished') NOT NULL DEFAULT 'draft',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_experiments_project_name (project_id, name),
  CONSTRAINT fk_experiments_project FOREIGN KEY (project_id) REFERENCES projects(project_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_experiments_model FOREIGN KEY (model_id) REFERENCES models(model_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_experiments_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(dataset_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_experiments_creator FOREIGN KEY (created_by) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS training_jobs (
  job_id INT AUTO_INCREMENT PRIMARY KEY,
  experiment_id INT NOT NULL,
  submitted_by INT NOT NULL,
  priority TINYINT UNSIGNED NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  status ENUM('queued','scheduled','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
  submitted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  started_at DATETIME(6) NULL,
  finished_at DATETIME(6) NULL,
  failure_reason VARCHAR(255) NULL,
  scheduler_note TEXT NULL,
  CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at),
  CONSTRAINT fk_jobs_experiment FOREIGN KEY (experiment_id) REFERENCES experiments(experiment_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_jobs_submitter FOREIGN KEY (submitted_by) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS job_requirements (
  job_id INT PRIMARY KEY,
  gpu_count TINYINT UNSIGNED NOT NULL CHECK (gpu_count BETWEEN 1 AND 16),
  min_gpu_memory_gb INT NOT NULL CHECK (min_gpu_memory_gb > 0),
  min_compute_capability DECIMAL(3,1) NOT NULL DEFAULT 0 CHECK (min_compute_capability >= 0),
  cpu_cores INT NOT NULL CHECK (cpu_cores > 0),
  ram_gb INT NOT NULL CHECK (ram_gb > 0),
  storage_gb INT NOT NULL CHECK (storage_gb >= 0),
  est_duration_hours DECIMAL(8,2) NOT NULL CHECK (est_duration_hours > 0),
  CONSTRAINT fk_requirements_job FOREIGN KEY (job_id) REFERENCES training_jobs(job_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS job_gpu_allocation (
  allocation_id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  gpu_id INT NOT NULL,
  allocated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  released_at DATETIME(6) NULL,
  active_gpu_id INT GENERATED ALWAYS AS (IF(released_at IS NULL, gpu_id, NULL)) STORED,
  UNIQUE KEY uq_one_active_gpu (active_gpu_id),
  KEY ix_allocations_job (job_id, allocated_at),
  CHECK (released_at IS NULL OR released_at >= allocated_at),
  CONSTRAINT fk_allocations_job FOREIGN KEY (job_id) REFERENCES training_jobs(job_id) ON UPDATE CASCADE ON DELETE CASCADE,
  -- MySQL forbids ON UPDATE CASCADE on a base column referenced by a generated column.
  CONSTRAINT fk_allocations_gpu FOREIGN KEY (gpu_id) REFERENCES gpus(gpu_id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS resource_usage (
  usage_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  gpu_id INT NULL,
  recorded_at DATETIME(6) NOT NULL,
  gpu_util_pct DECIMAL(5,2) NULL CHECK (gpu_util_pct IS NULL OR gpu_util_pct BETWEEN 0 AND 100),
  gpu_mem_used_gb DECIMAL(8,2) NULL CHECK (gpu_mem_used_gb IS NULL OR gpu_mem_used_gb >= 0),
  cpu_util_pct DECIMAL(5,2) NULL CHECK (cpu_util_pct IS NULL OR cpu_util_pct BETWEEN 0 AND 100),
  ram_used_gb DECIMAL(8,2) NULL CHECK (ram_used_gb IS NULL OR ram_used_gb >= 0),
  storage_used_gb DECIMAL(8,2) NULL CHECK (storage_used_gb IS NULL OR storage_used_gb >= 0),
  interval_seconds INT NOT NULL CHECK (interval_seconds > 0),
  CONSTRAINT fk_usage_job FOREIGN KEY (job_id) REFERENCES training_jobs(job_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_usage_gpu FOREIGN KEY (gpu_id) REFERENCES gpus(gpu_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS experiment_results (
  result_id INT AUTO_INCREMENT PRIMARY KEY,
  experiment_id INT NOT NULL,
  job_id INT NOT NULL,
  metric_name VARCHAR(50) NOT NULL,
  metric_value DOUBLE NOT NULL,
  epoch INT NULL CHECK (epoch IS NULL OR epoch >= 0),
  recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_results_experiment FOREIGN KEY (experiment_id) REFERENCES experiments(experiment_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_results_job FOREIGN KEY (job_id) REFERENCES training_jobs(job_id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS job_status_history (
  history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  old_status ENUM('queued','scheduled','running','completed','failed','cancelled') NULL,
  new_status ENUM('queued','scheduled','running','completed','failed','cancelled') NOT NULL,
  changed_by INT NULL,
  changed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  note VARCHAR(255) NULL,
  CONSTRAINT fk_history_job FOREIGN KEY (job_id) REFERENCES training_jobs(job_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_history_user FOREIGN KEY (changed_by) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id INT NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id VARCHAR(40) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  payload JSON NOT NULL,
  prev_hash CHAR(64) NOT NULL,
  curr_hash CHAR(64) NOT NULL UNIQUE,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A dedicated sentinel row lets least-privilege writers serialize appends without UPDATE rights on audit_log.
CREATE TABLE IF NOT EXISTS audit_chain_lock (
  lock_id TINYINT NOT NULL PRIMARY KEY CHECK (lock_id=1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO audit_chain_lock(lock_id) VALUES(1);

CREATE TABLE IF NOT EXISTS billing_rates (
  rate_id INT AUTO_INCREMENT PRIMARY KEY,
  resource_type ENUM('gpu_hour','cpu_core_hour','ram_gb_hour','storage_gb_hour') NOT NULL,
  gpu_model_name VARCHAR(50) NULL,
  rate_inr DECIMAL(12,4) NOT NULL CHECK (rate_inr >= 0),
  effective_from DATETIME(6) NOT NULL,
  effective_to DATETIME(6) NULL,
  UNIQUE KEY uq_rates_effective (resource_type, gpu_model_name, effective_from),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK ((resource_type = 'gpu_hour' AND gpu_model_name IS NOT NULL) OR (resource_type <> 'gpu_hour' AND gpu_model_name IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
