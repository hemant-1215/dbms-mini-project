SET @job_id = 1;
SELECT g.gpu_id,g.model_name,g.memory_gb,g.compute_capability,g.utilization_pct,s.hostname,
       (SELECT AVG(g2.utilization_pct) FROM gpus g2 WHERE g2.server_id=s.server_id) AS server_avg_utilization
  FROM job_requirements r JOIN training_jobs j ON j.job_id=r.job_id
  JOIN experiments e ON e.experiment_id=j.experiment_id JOIN projects p ON p.project_id=e.project_id
  JOIN gpus g JOIN servers s ON s.server_id=g.server_id
 WHERE r.job_id=@job_id AND s.status='online' AND g.status='available'
   AND g.memory_gb>=r.min_gpu_memory_gb AND g.compute_capability>=r.min_compute_capability
   AND g.utilization_pct<90
   AND NOT EXISTS(SELECT 1 FROM job_gpu_allocation a WHERE a.gpu_id=g.gpu_id AND a.released_at IS NULL)
 ORDER BY server_avg_utilization,g.memory_gb,g.utilization_pct;
