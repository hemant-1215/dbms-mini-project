-- INNER JOIN, LEFT JOIN, aggregate with HAVING.
SELECT p.project_id,p.name,COUNT(DISTINCT j.job_id) AS job_count
  FROM projects p LEFT JOIN experiments e ON e.project_id=p.project_id
  LEFT JOIN training_jobs j ON j.experiment_id=e.experiment_id
 GROUP BY p.project_id,p.name HAVING COUNT(DISTINCT j.job_id)>0;

-- Non-correlated subquery.
SELECT username,email FROM users WHERE user_id IN (SELECT submitted_by FROM training_jobs WHERE status='failed');

-- View and query plan comparisons.
SELECT * FROM v_job_overview ORDER BY submitted_at DESC LIMIT 20;
EXPLAIN SELECT job_id FROM training_jobs WHERE status='queued' AND priority>=7 ORDER BY submitted_at;
EXPLAIN ANALYZE SELECT job_id FROM training_jobs WHERE status='queued' AND priority>=7 ORDER BY submitted_at;
