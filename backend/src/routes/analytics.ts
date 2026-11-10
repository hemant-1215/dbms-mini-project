import { Router } from 'express';
import { z } from 'zod';
import { appPool } from '../db/pools.js';
import { requireAuth } from '../middleware/auth.js';

export const analyticsRouter=Router();
analyticsRouter.use(requireAuth);

analyticsRouter.get('/overview',async(req,res,next)=>{
  try{
    const where=req.principal!.role==='admin'?'':'WHERE owner_id=?';
    const params=req.principal!.role==='admin'?[]:[req.principal!.userId];
    const [projects]=await appPool.execute(`SELECT COUNT(*) AS project_count,COALESCE(SUM(gpu_hour_quota),0) AS quota_gpu_hours FROM projects ${where}`,params);
    const [jobs]=await appPool.execute(
      `SELECT j.status,COUNT(*) AS job_count FROM training_jobs j JOIN experiments e ON e.experiment_id=j.experiment_id JOIN projects p ON p.project_id=e.project_id ${req.principal!.role==='admin'?'':'WHERE p.owner_id=?'} GROUP BY j.status`,params);
    const [gpus]=await appPool.execute("SELECT COUNT(*) AS gpu_count,COALESCE(AVG(utilization_pct),0) AS average_utilization_pct,SUM(status='available') AS available_gpus FROM gpus");
    const [cost]=await appPool.execute(`SELECT COALESCE(SUM(fn_job_cost(j.job_id)),0) AS cost_inr FROM training_jobs j JOIN experiments e ON e.experiment_id=j.experiment_id JOIN projects p ON p.project_id=e.project_id ${req.principal!.role==='admin'?'':'WHERE p.owner_id=?'}`,params);
    res.json({projects:(projects as unknown[])[0],jobs,gpus:(gpus as unknown[])[0],cost:(cost as unknown[])[0]});
  }catch(error){next(error);}
});

analyticsRouter.get('/q1',async(req,res,next)=>{
  try{
    const [rows]=await appPool.execute(
      `WITH project_cost AS (
        SELECT p.project_id,p.name AS project_name,COALESCE(SUM(fn_job_cost(j.job_id)),0) AS total_cost_inr
          FROM projects p LEFT JOIN experiments e ON e.project_id=p.project_id LEFT JOIN training_jobs j ON j.experiment_id=e.experiment_id
         ${req.principal!.role==='admin'?'':'WHERE p.owner_id=?'} GROUP BY p.project_id,p.name
      ) SELECT project_id,project_name,total_cost_inr,
               RANK() OVER(ORDER BY total_cost_inr DESC) AS spend_rank,
               ROUND(100*total_cost_inr/NULLIF(SUM(total_cost_inr) OVER(),0),2) AS share_pct
          FROM project_cost HAVING total_cost_inr>0 ORDER BY spend_rank`,req.principal!.role==='admin'?[]:[req.principal!.userId]);
    res.json({data:rows});
  }catch(error){next(error);}
});

analyticsRouter.get('/q2/:jobId',async(req,res,next)=>{
  try{
    const jobId=z.coerce.number().int().positive().parse(req.params.jobId);
    const [rows]=await appPool.execute(
      `SELECT g.gpu_id,g.model_name,g.memory_gb,g.compute_capability,g.utilization_pct,s.hostname,
        (SELECT AVG(g2.utilization_pct) FROM gpus g2 WHERE g2.server_id=s.server_id) AS server_avg_utilization
       FROM job_requirements r JOIN training_jobs j ON j.job_id=r.job_id
       JOIN experiments e ON e.experiment_id=j.experiment_id JOIN projects p ON p.project_id=e.project_id
       JOIN gpus g JOIN servers s ON s.server_id=g.server_id
       WHERE r.job_id=? AND (p.owner_id=? OR ?='admin') AND s.status='online' AND g.status='available'
         AND g.memory_gb>=r.min_gpu_memory_gb AND g.compute_capability>=r.min_compute_capability AND g.utilization_pct<90
         AND NOT EXISTS(SELECT 1 FROM job_gpu_allocation a WHERE a.gpu_id=g.gpu_id AND a.released_at IS NULL)
       ORDER BY server_avg_utilization,g.memory_gb,g.utilization_pct`,[jobId,req.principal!.userId,req.principal!.role]);
    res.json({data:rows});
  }catch(error){next(error);}
});

analyticsRouter.get('/q3',async(req,res,next)=>{
  try{
    const [rows]=await appPool.execute(
      `WITH RECURSIVE days AS (
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
      ) SELECT server_id,hostname,day,jobs,failed,ROUND(rolling_failure_rate*100,2) AS rolling_failure_pct,
          rolling_failure_rate>(SELECT AVG(IF(jobs=0,0,failed/jobs)) FROM daily) AS above_fleet_average
        FROM rolling WHERE day>=UTC_DATE()-INTERVAL 6 DAY ORDER BY day DESC,rolling_failure_rate DESC`);
    res.json({data:rows});
  }catch(error){next(error);}
});

analyticsRouter.get('/utilization',async(req,res,next)=>{
  try{
    const [rows]=await appPool.execute(
      `SELECT DATE_FORMAT(ru.recorded_at,'%Y-%m-%d %H:00:00') AS hour_bucket,
              AVG(ru.gpu_util_pct) AS gpu_utilization_pct,AVG(ru.cpu_util_pct) AS cpu_utilization_pct,AVG(ru.ram_used_gb) AS ram_used_gb
         FROM resource_usage ru JOIN training_jobs j ON j.job_id=ru.job_id JOIN experiments e ON e.experiment_id=j.experiment_id JOIN projects p ON p.project_id=e.project_id
        WHERE ru.recorded_at>=UTC_TIMESTAMP()-INTERVAL 7 DAY ${req.principal!.role==='admin'?'':'AND p.owner_id=?'}
        GROUP BY hour_bucket ORDER BY hour_bucket`,req.principal!.role==='admin'?[]:[req.principal!.userId]);
    res.json({data:rows});
  }catch(error){next(error);}
});
