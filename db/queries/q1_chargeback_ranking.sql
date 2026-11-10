WITH project_cost AS (
  SELECT p.project_id,p.name AS project_name,
         SUM(fn_job_cost(j.job_id)) AS total_cost_inr
    FROM projects p JOIN experiments e ON e.project_id=p.project_id
    JOIN training_jobs j ON j.experiment_id=e.experiment_id
   GROUP BY p.project_id,p.name
  HAVING SUM(fn_job_cost(j.job_id))>0
)
SELECT project_id,project_name,total_cost_inr,
       RANK() OVER(ORDER BY total_cost_inr DESC) AS spend_rank,
       ROUND(100*total_cost_inr/NULLIF(SUM(total_cost_inr) OVER(),0),2) AS fleet_share_pct
  FROM project_cost ORDER BY spend_rank;
