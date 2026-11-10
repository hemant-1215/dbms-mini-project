DELIMITER $$
CREATE TRIGGER trg_projects_before_insert
BEFORE INSERT ON projects FOR EACH ROW
BEGIN
  IF NEW.parent_project_id IS NOT NULL AND NEW.parent_project_id=NEW.project_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PROJECT_CANNOT_PARENT_ITSELF';
  END IF;
END$$

CREATE TRIGGER trg_projects_before_update
BEFORE UPDATE ON projects FOR EACH ROW
BEGIN
  IF NEW.parent_project_id IS NOT NULL AND NEW.parent_project_id=NEW.project_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PROJECT_CANNOT_PARENT_ITSELF';
  END IF;
END$$

CREATE TRIGGER trg_training_jobs_before_update
BEFORE UPDATE ON training_jobs FOR EACH ROW
BEGIN
  IF OLD.status <> NEW.status AND NOT (
    (OLD.status='queued' AND NEW.status='scheduled') OR
    (OLD.status='scheduled' AND NEW.status IN ('running','failed','cancelled')) OR
    (OLD.status='running' AND NEW.status IN ('completed','failed','cancelled')) OR
    (OLD.status='failed' AND NEW.status='queued') OR
    (OLD.status='queued' AND NEW.status='cancelled')
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='JOB_STATUS_TRANSITION_INVALID';
  END IF;
  IF OLD.status <> 'running' AND NEW.status='running' AND NEW.started_at IS NULL THEN SET NEW.started_at=UTC_TIMESTAMP(6); END IF;
  IF NEW.status IN ('completed','failed','cancelled') AND NEW.finished_at IS NULL THEN SET NEW.finished_at=UTC_TIMESTAMP(6); END IF;
  IF NEW.status='queued' AND OLD.status='failed' THEN SET NEW.started_at=NULL, NEW.finished_at=NULL, NEW.failure_reason=NULL; END IF;
END$$

CREATE TRIGGER trg_training_jobs_after_update
AFTER UPDATE ON training_jobs FOR EACH ROW
BEGIN
  IF OLD.status <> NEW.status THEN
    INSERT INTO job_status_history(job_id,old_status,new_status,changed_by,note)
    VALUES(NEW.job_id,OLD.status,NEW.status,NULL,NEW.scheduler_note);
  END IF;
END$$

CREATE TRIGGER trg_training_jobs_after_insert
AFTER INSERT ON training_jobs FOR EACH ROW
BEGIN
  INSERT INTO job_status_history(job_id,old_status,new_status,changed_by,note)
  VALUES(NEW.job_id,NULL,NEW.status,NEW.submitted_by,'Job submitted');
END$$

CREATE TRIGGER trg_audit_log_before_update
BEFORE UPDATE ON audit_log FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUDIT_LOG_IMMUTABLE';
END$$

CREATE TRIGGER trg_audit_log_before_delete
BEFORE DELETE ON audit_log FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUDIT_LOG_IMMUTABLE';
END$$

CREATE TRIGGER trg_audit_chain_lock_before_update
BEFORE UPDATE ON audit_chain_lock FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUDIT_CHAIN_LOCK_IMMUTABLE';
END$$
DELIMITER ;
