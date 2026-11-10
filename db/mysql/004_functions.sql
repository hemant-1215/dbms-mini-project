DELIMITER $$
CREATE FUNCTION fn_project_gpu_hours_used(p_project_id INT)
RETURNS DECIMAL(14,4)
READS SQL DATA
BEGIN
  DECLARE v_hours DECIMAL(14,4) DEFAULT 0;
  SELECT COALESCE(SUM(TIMESTAMPDIFF(SECOND, a.allocated_at, COALESCE(a.released_at, UTC_TIMESTAMP(6))) / 3600.0), 0)
    INTO v_hours
    FROM job_gpu_allocation a
    JOIN training_jobs j ON j.job_id = a.job_id
    JOIN experiments e ON e.experiment_id = j.experiment_id
   WHERE e.project_id = p_project_id;
  RETURN v_hours;
END$$

CREATE FUNCTION fn_job_cost(p_job_id INT)
RETURNS DECIMAL(14,4)
READS SQL DATA
BEGIN
  DECLARE v_start DATETIME(6);
  DECLARE v_end DATETIME(6);
  DECLARE v_cost DECIMAL(14,4) DEFAULT 0;
  DECLARE v_cpu INT DEFAULT 0;
  DECLARE v_ram INT DEFAULT 0;
  DECLARE v_storage INT DEFAULT 0;
  DECLARE v_hours DECIMAL(14,6) DEFAULT 0;
  SELECT started_at, COALESCE(finished_at, UTC_TIMESTAMP(6)) INTO v_start, v_end
    FROM training_jobs WHERE job_id = p_job_id;
  IF v_start IS NULL THEN RETURN 0; END IF;
  SET v_hours = GREATEST(TIMESTAMPDIFF(SECOND, v_start, v_end), 0) / 3600.0;
  SELECT cpu_cores, ram_gb, storage_gb INTO v_cpu, v_ram, v_storage FROM job_requirements WHERE job_id = p_job_id;
  SELECT COALESCE(SUM((TIMESTAMPDIFF(SECOND, a.allocated_at, COALESCE(a.released_at, UTC_TIMESTAMP(6))) / 3600.0) * r.rate_inr), 0)
    INTO v_cost
    FROM job_gpu_allocation a
    JOIN gpus g ON g.gpu_id = a.gpu_id
    JOIN billing_rates r ON r.resource_type = 'gpu_hour' AND r.gpu_model_name = g.model_name
      AND r.effective_from <= v_start AND (r.effective_to IS NULL OR r.effective_to > v_start)
   WHERE a.job_id = p_job_id;
  SELECT v_cost
       + v_cpu * v_hours * COALESCE((SELECT rate_inr FROM billing_rates WHERE resource_type='cpu_core_hour' AND effective_from<=v_start AND (effective_to IS NULL OR effective_to>v_start) ORDER BY effective_from DESC LIMIT 1),0)
       + v_ram * v_hours * COALESCE((SELECT rate_inr FROM billing_rates WHERE resource_type='ram_gb_hour' AND effective_from<=v_start AND (effective_to IS NULL OR effective_to>v_start) ORDER BY effective_from DESC LIMIT 1),0)
       + v_storage * v_hours * COALESCE((SELECT rate_inr FROM billing_rates WHERE resource_type='storage_gb_hour' AND effective_from<=v_start AND (effective_to IS NULL OR effective_to>v_start) ORDER BY effective_from DESC LIMIT 1),0)
    INTO v_cost;
  RETURN v_cost;
END$$
DELIMITER ;
