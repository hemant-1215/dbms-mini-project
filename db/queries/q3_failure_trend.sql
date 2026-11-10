WITH RECURSIVE days AS (
  SELECT DATE(UTC_DATE()-INTERVAL 29 DAY) AS day
  UNION ALL SELECT day+INTERVAL 1 DAY FROM days WHERE day<UTC_DATE()
), daily AS (
  SELECT s.server_id,s.hostname,d.day,COUNT(DISTINCT j.job_id) AS jobs,
         COUNT(DISTINCT IF(j.status='failed',j.job_id,NULL)) AS failed
    FROM servers s CROSS JOIN days d LEFT JOIN gpus g ON g.server_id=s.server_id
    LEFT JOIN job_gpu_allocation a ON a.gpu_id=g.gpu_id AND DATE(a.allocated_at)=d.day
    LEFT JOIN training_jobs j ON j.job_id=a.job_id
   GROUP BY s.server_id,s.hostname,d.day
), rolling AS (
  SELECT *,AVG(IF(jobs=0,0,failed/jobs)) OVER(PARTITION BY server_id ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS rolling_failure_rate
    FROM daily
)
SELECT r.server_id,r.hostname,r.day,r.jobs,r.failed,ROUND(100*r.rolling_failure_rate,2) AS rolling_failure_pct,
       r.rolling_failure_rate>(SELECT AVG(IF(jobs=0,0,failed/jobs)) FROM daily) AS above_fleet_average
  FROM rolling r WHERE r.day>=UTC_DATE()-INTERVAL 6 DAY ORDER BY r.day DESC,r.rolling_failure_rate DESC;

WITH transitions AS (
  SELECT h.job_id,h.new_status,h.changed_at,
         LAG(h.changed_at) OVER(PARTITION BY h.job_id ORDER BY h.changed_at) AS previous_change
    FROM job_status_history h
)
SELECT t.job_id,TIMESTAMPDIFF(SECOND,t.previous_change,t.changed_at) AS seconds_from_prior_transition
  FROM transitions t WHERE t.new_status='failed' ORDER BY t.changed_at DESC;
