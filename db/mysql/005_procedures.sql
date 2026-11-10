DELIMITER $$
CREATE PROCEDURE sp_schedule_job(IN p_job_id INT, OUT p_status VARCHAR(20), OUT p_message TEXT)
proc: BEGIN
  DECLARE v_status VARCHAR(20);
  DECLARE v_project_id INT;
  DECLARE v_gpu_count INT;
  DECLARE v_memory INT;
  DECLARE v_compute DECIMAL(3,1);
  DECLARE v_server_id INT DEFAULT NULL;
  DECLARE v_used DECIMAL(14,4) DEFAULT 0;
  DECLARE v_quota DECIMAL(10,2) DEFAULT 0;
  DECLARE v_duration DECIMAL(8,2);
  DECLARE v_allocated INT DEFAULT 0;
  DECLARE v_gpu_id INT;
  DECLARE v_done BOOLEAN DEFAULT FALSE;
  DECLARE c_candidates CURSOR FOR
    SELECT g.gpu_id
      FROM gpus g JOIN servers s ON s.server_id=g.server_id
     WHERE g.server_id=v_server_id AND s.status='online' AND g.status='available'
       AND g.memory_gb>=v_memory AND g.compute_capability>=v_compute AND g.utilization_pct<90
       AND NOT EXISTS (SELECT 1 FROM job_gpu_allocation a WHERE a.gpu_id=g.gpu_id AND a.released_at IS NULL)
     ORDER BY g.memory_gb ASC, g.utilization_pct ASC, g.gpu_id ASC
     LIMIT v_gpu_count
     FOR UPDATE SKIP LOCKED;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done=TRUE;

  SET p_status='queued';
  SET p_message='Job was not scheduled.';
  SELECT j.status, e.project_id, r.gpu_count, r.min_gpu_memory_gb, r.min_compute_capability, r.est_duration_hours,
         p.gpu_hour_quota
    INTO v_status, v_project_id, v_gpu_count, v_memory, v_compute, v_duration, v_quota
    FROM training_jobs j
    JOIN experiments e ON e.experiment_id=j.experiment_id
    JOIN projects p ON p.project_id=e.project_id
    JOIN job_requirements r ON r.job_id=j.job_id
   WHERE j.job_id=p_job_id FOR UPDATE;
  IF v_status IS NULL THEN SET p_status='not_found'; SET p_message='Job or requirements were not found.'; LEAVE proc; END IF;
  IF v_status <> 'queued' THEN SET p_status=v_status; SET p_message='Only queued jobs can be scheduled.'; LEAVE proc; END IF;

  SET v_used=fn_project_gpu_hours_used(v_project_id);
  IF v_used + v_gpu_count * v_duration > v_quota THEN
    UPDATE training_jobs SET scheduler_note='QUOTA_EXCEEDED: requested GPU hours exceed project quota.' WHERE job_id=p_job_id;
    SET p_status='queued'; SET p_message='QUOTA_EXCEEDED'; LEAVE proc;
  END IF;

  SELECT s.server_id INTO v_server_id
    FROM servers s JOIN gpus g ON g.server_id=s.server_id
   WHERE s.status='online' AND g.status='available' AND g.memory_gb>=v_memory
     AND g.compute_capability>=v_compute AND g.utilization_pct<90
     AND NOT EXISTS (SELECT 1 FROM job_gpu_allocation a WHERE a.gpu_id=g.gpu_id AND a.released_at IS NULL)
   GROUP BY s.server_id
  HAVING COUNT(*)>=v_gpu_count
   ORDER BY AVG(g.utilization_pct) ASC, s.server_id ASC
   LIMIT 1;
  IF v_server_id IS NULL THEN
    UPDATE training_jobs SET scheduler_note='NO_CAPACITY: no online server has enough eligible GPUs.' WHERE job_id=p_job_id;
    SET p_status='queued'; SET p_message='NO_CAPACITY'; LEAVE proc;
  END IF;

  OPEN c_candidates;
  candidate_loop: LOOP
    FETCH c_candidates INTO v_gpu_id;
    IF v_done THEN LEAVE candidate_loop; END IF;
    INSERT INTO job_gpu_allocation(job_id,gpu_id) VALUES (p_job_id,v_gpu_id);
    UPDATE gpus SET status='allocated' WHERE gpu_id=v_gpu_id;
    SET v_allocated=v_allocated+1;
    IF v_allocated>=v_gpu_count THEN LEAVE candidate_loop; END IF;
  END LOOP;
  CLOSE c_candidates;

  IF v_allocated<>v_gpu_count THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SCHEDULER_CONCURRENCY_RETRY: not enough unlocked GPUs';
  END IF;
  UPDATE training_jobs
     SET status='scheduled', scheduler_note=CONCAT('Scheduled on server ',v_server_id,' using ',v_allocated,' GPU(s); lowest-utilization eligible server, best-fit memory.')
   WHERE job_id=p_job_id;
  SET p_status='scheduled'; SET p_message=CONCAT('Allocated ',v_allocated,' GPU(s) on server ',v_server_id,'.');
END$$

CREATE PROCEDURE sp_run_scheduler_cycle()
BEGIN
  DECLARE v_done BOOLEAN DEFAULT FALSE;
  DECLARE v_job_id INT;
  DECLARE v_job_cursor CURSOR FOR SELECT job_id FROM training_jobs WHERE status='queued' ORDER BY priority DESC, submitted_at ASC;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done=TRUE;
  OPEN v_job_cursor;
  scheduler_loop: LOOP
    FETCH v_job_cursor INTO v_job_id;
    IF v_done THEN LEAVE scheduler_loop; END IF;
    CALL sp_schedule_job(v_job_id,@scheduler_status,@scheduler_message);
  END LOOP;
  CLOSE v_job_cursor;
END$$

CREATE PROCEDURE sp_release_job(IN p_job_id INT, IN p_final_status VARCHAR(20), IN p_reason VARCHAR(255))
BEGIN
  IF p_final_status NOT IN ('completed','failed','cancelled') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='FINAL_STATUS_INVALID';
  END IF;
  UPDATE job_gpu_allocation SET released_at=UTC_TIMESTAMP(6) WHERE job_id=p_job_id AND released_at IS NULL;
  UPDATE gpus g JOIN job_gpu_allocation a ON a.gpu_id=g.gpu_id
     SET g.status='available'
   WHERE a.job_id=p_job_id AND a.released_at IS NOT NULL AND g.status='allocated'
     AND NOT EXISTS(SELECT 1 FROM job_gpu_allocation active
                     WHERE active.gpu_id=g.gpu_id AND active.released_at IS NULL);
  UPDATE training_jobs
     SET status=p_final_status, failure_reason=IF(p_final_status='failed',p_reason,NULL)
   WHERE job_id=p_job_id;
END$$

CREATE PROCEDURE sp_project_usage_report(IN p_project_id INT, IN p_from DATETIME(6), IN p_to DATETIME(6))
BEGIN
  SELECT u.user_id,u.username,
         COALESCE(SUM(TIMESTAMPDIFF(SECOND, a.allocated_at, COALESCE(a.released_at,p_to))/3600.0),0) AS gpu_hours,
         COALESCE(SUM(fn_job_cost(j.job_id)),0) AS estimated_cost_inr
    FROM projects p JOIN experiments e ON e.project_id=p.project_id
    JOIN training_jobs j ON j.experiment_id=e.experiment_id
    JOIN users u ON u.user_id=j.submitted_by
    LEFT JOIN job_gpu_allocation a ON a.job_id=j.job_id
   WHERE p.project_id=p_project_id AND j.submitted_at>=p_from AND j.submitted_at<p_to
   GROUP BY u.user_id,u.username ORDER BY estimated_cost_inr DESC;
END$$
DELIMITER ;
