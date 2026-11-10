import { Router } from 'express';
import { z } from 'zod';
import { appPool, adminPool, inTransaction } from '../db/pools.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';
import { appendAudit } from '../services/audit.js';

export const billingRouter=Router();
billingRouter.use(requireAuth);

billingRouter.get('/billing/rates',async(_req,res,next)=>{
  try{const [rows]=await appPool.execute('SELECT rate_id,resource_type,gpu_model_name,rate_inr,effective_from,effective_to FROM billing_rates WHERE effective_to IS NULL OR effective_to>UTC_TIMESTAMP(6) ORDER BY resource_type,gpu_model_name');res.json({data:rows});}catch(error){next(error);}
});

const rateSchema=z.object({resource_type:z.enum(['gpu_hour','cpu_core_hour','ram_gb_hour','storage_gb_hour']),gpu_model_name:z.string().max(50).nullable().optional(),rate_inr:z.number().min(0).max(1_000_000),effective_from:z.iso.datetime().optional()});
billingRouter.put('/billing/rates',allowRoles('admin'),async(req,res,next)=>{
  try{
    const input=rateSchema.parse(req.body);
    if((input.resource_type==='gpu_hour')!==Boolean(input.gpu_model_name)){res.status(400).json({error:{code:'RATE_MODEL_MISMATCH',message:'GPU rates require a GPU model; other rates must omit it.'}});return;}
    const effectiveFrom=input.effective_from?.replace('T',' ').replace('Z','')??new Date().toISOString().slice(0,19).replace('T',' ');
    const id=await inTransaction(adminPool,async(connection)=>{
      const [result]=await connection.execute('INSERT INTO billing_rates(resource_type,gpu_model_name,rate_inr,effective_from) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE rate_inr=VALUES(rate_inr)',[input.resource_type,input.gpu_model_name??null,input.rate_inr,effectiveFrom]);
      const rateId=Number((result as {insertId:number}).insertId);
      await appendAudit(connection,{actorId:req.principal!.userId,action:'UPSERT',entityType:'billing_rate',entityId:String(rateId),payload:input});
      return rateId;
    });
    res.json({rate_id:id,...input,effective_from:effectiveFrom});
  }catch(error){next(error);}
});

billingRouter.get('/billing/invoice/:projectId',async(req,res,next)=>{
  try{
    const projectId=z.coerce.number().int().positive().parse(req.params.projectId);
    const [rows]=await appPool.execute(
      `SELECT j.job_id,j.status,j.submitted_at,j.started_at,j.finished_at,fn_job_cost(j.job_id) AS cost_inr,
              u.username,e.name AS experiment_name
         FROM training_jobs j JOIN experiments e ON e.experiment_id=j.experiment_id JOIN projects p ON p.project_id=e.project_id
         JOIN users u ON u.user_id=j.submitted_by
        WHERE p.project_id=? AND (p.owner_id=? OR ?='admin') ORDER BY j.submitted_at DESC`,[projectId,req.principal!.userId,req.principal!.role]);
    res.json({project_id:projectId,data:rows});
  }catch(error){next(error);}
});

billingRouter.get('/usage/projects/:projectId',async(req,res,next)=>{
  try{
    const id=z.coerce.number().int().positive().parse(req.params.projectId);
    const [rows]=await appPool.execute(
      `SELECT DATE(ru.recorded_at) AS day,AVG(ru.gpu_util_pct) AS avg_gpu_utilization_pct,
              AVG(ru.cpu_util_pct) AS avg_cpu_utilization_pct,SUM(ru.interval_seconds)/3600.0 AS sampled_hours,
              SUM(fn_job_cost(j.job_id)) AS allocated_cost_inr
         FROM resource_usage ru JOIN training_jobs j ON j.job_id=ru.job_id JOIN experiments e ON e.experiment_id=j.experiment_id
         JOIN projects p ON p.project_id=e.project_id WHERE p.project_id=? AND (p.owner_id=? OR ?='admin')
        GROUP BY DATE(ru.recorded_at) ORDER BY day DESC`,[id,req.principal!.userId,req.principal!.role]);
    res.json({data:rows});
  }catch(error){next(error);}
});

billingRouter.get('/usage/users/:userId',async(req,res,next)=>{
  try{
    const id=z.coerce.number().int().positive().parse(req.params.userId);
    if(req.principal!.role!=='admin'&&id!==req.principal!.userId){res.status(404).json({error:{code:'NOT_FOUND',message:'User usage not found.'}});return;}
    const [rows]=await appPool.execute('SELECT * FROM v_user_usage WHERE user_id=?',[id]);res.json({data:rows});
  }catch(error){next(error);}
});

export const resultsRouter=Router();
resultsRouter.use(requireAuth);
const resultSchema=z.object({metric_name:z.string().min(1).max(50),metric_value:z.number().finite(),epoch:z.number().int().min(0).nullable().optional()});
resultsRouter.get('/experiments/:id/results',async(req,res,next)=>{
  try{
    const id=z.coerce.number().int().positive().parse(req.params.id);
    const [rows]=await appPool.execute(
      `SELECT r.* FROM experiment_results r JOIN experiments e ON e.experiment_id=r.experiment_id JOIN projects p ON p.project_id=e.project_id
       WHERE e.experiment_id=? AND (p.owner_id=? OR ?='admin') ORDER BY r.recorded_at DESC`,[id,req.principal!.userId,req.principal!.role]);
    res.json({data:rows});
  }catch(error){next(error);}
});
resultsRouter.post('/experiments/:id/results',async(req,res,next)=>{
  try{
    const experimentId=z.coerce.number().int().positive().parse(req.params.id);const input=resultSchema.parse(req.body);const jobId=z.number().int().positive().parse(req.body.job_id);
    const resultId=await inTransaction(appPool,async(connection)=>{
      const [rows]=await connection.execute<Array<any>>('SELECT e.project_id FROM experiments e JOIN projects p ON p.project_id=e.project_id WHERE e.experiment_id=? AND (p.owner_id=? OR ?=\'admin\') FOR UPDATE',[experimentId,req.principal!.userId,req.principal!.role]);
      if(!rows[0])throw Object.assign(new Error('Experiment not found.'),{code:'ER_NO_REFERENCED_ROW_2'});
      const [insert]=await connection.execute('INSERT INTO experiment_results(experiment_id,job_id,metric_name,metric_value,epoch) VALUES(?,?,?,?,?)',[experimentId,jobId,input.metric_name,input.metric_value,input.epoch??null]);
      const id=Number((insert as {insertId:number}).insertId);await appendAudit(connection,{actorId:req.principal!.userId,action:'CREATE',entityType:'experiment_result',entityId:String(id),payload:{...input,job_id:jobId}});return id;
    });
    res.status(201).json({result_id:resultId,...input,job_id:jobId});
  }catch(error){next(error);}
});
