import { Router } from 'express';
import { z } from 'zod';
import type { RowDataPacket } from 'mysql2/promise';
import { appPool, inTransaction } from '../db/pools.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';
import { appendAudit } from '../services/audit.js';

export const jobsRouter = Router();
interface ExperimentRow extends RowDataPacket { experiment_id:number }
interface JobOwnerRow extends RowDataPacket { job_id:number;status?:string }
interface ExplanationRow extends RowDataPacket { [key:string]:unknown }
interface SchedulerRow extends RowDataPacket { status:string|null;message:string|null }
jobsRouter.use(requireAuth);

const jobSchema = z.object({
  experiment_id:z.number().int().positive(),priority:z.number().int().min(1).max(10).default(5),
  requirements:z.object({gpu_count:z.number().int().min(1).max(16),min_gpu_memory_gb:z.number().int().positive(),min_compute_capability:z.number().min(0).default(0),cpu_cores:z.number().int().positive(),ram_gb:z.number().int().positive(),storage_gb:z.number().int().min(0),est_duration_hours:z.number().positive()})
});

jobsRouter.get('/', async(req,res,next)=>{
  try{
    const [rows]=req.principal!.role==='admin'
      ? await appPool.execute('SELECT * FROM v_job_overview ORDER BY submitted_at DESC LIMIT 500')
      : await appPool.execute('SELECT * FROM v_job_overview WHERE user_id=? ORDER BY submitted_at DESC LIMIT 500',[req.principal!.userId]);
    res.json({data:rows});
  }catch(error){next(error);}
});

jobsRouter.post('/',async(req,res,next)=>{
  try{
    const input=jobSchema.parse(req.body);
    const jobId=await inTransaction(appPool,async(connection)=>{
      const [owned]=await connection.execute<ExperimentRow[]>(
        `SELECT e.experiment_id FROM experiments e JOIN projects p ON p.project_id=e.project_id
         WHERE e.experiment_id=? AND (p.owner_id=? OR ?='admin') FOR UPDATE`,
        [input.experiment_id,req.principal!.userId,req.principal!.role]
      );
      if(!owned[0]) throw Object.assign(new Error('Experiment not found.'),{code:'ER_NO_REFERENCED_ROW_2'});
      const [result]=await connection.execute('INSERT INTO training_jobs(experiment_id,submitted_by,priority) VALUES(?,?,?)',[input.experiment_id,req.principal!.userId,input.priority]);
      const id=Number((result as {insertId:number}).insertId);
      const q=input.requirements;
      await connection.execute('INSERT INTO job_requirements(job_id,gpu_count,min_gpu_memory_gb,min_compute_capability,cpu_cores,ram_gb,storage_gb,est_duration_hours) VALUES(?,?,?,?,?,?,?,?)',[id,q.gpu_count,q.min_gpu_memory_gb,q.min_compute_capability,q.cpu_cores,q.ram_gb,q.storage_gb,q.est_duration_hours]);
      await appendAudit(connection,{actorId:req.principal!.userId,action:'CREATE',entityType:'training_job',entityId:String(id),payload:input});
      return id;
    });
    res.status(201).json({job_id:jobId,status:'queued'});
  }catch(error){next(error);}
});

jobsRouter.get('/:id/history',async(req,res,next)=>{
  try{
    const id=z.coerce.number().int().positive().parse(req.params.id);
    const [rows]=await appPool.execute(
      `SELECT h.* FROM job_status_history h JOIN training_jobs j ON j.job_id=h.job_id
       JOIN experiments e ON e.experiment_id=j.experiment_id JOIN projects p ON p.project_id=e.project_id
       WHERE j.job_id=? AND (p.owner_id=? OR ?='admin') ORDER BY h.changed_at`,[id,req.principal!.userId,req.principal!.role]);
    res.json({data:rows});
  }catch(error){next(error);}
});

jobsRouter.get('/:id/explanation',async(req,res,next)=>{
  try{
    const id=z.coerce.number().int().positive().parse(req.params.id);
    const [rows]=await appPool.execute<ExplanationRow[]>(
      `SELECT j.job_id,j.status,j.scheduler_note,r.*,p.gpu_hour_quota,
        (SELECT COUNT(*) FROM gpus g JOIN servers s ON s.server_id=g.server_id
          WHERE s.status='online' AND g.status='available' AND g.memory_gb>=r.min_gpu_memory_gb AND g.compute_capability>=r.min_compute_capability AND g.utilization_pct<90) AS candidate_gpu_count
       FROM training_jobs j JOIN job_requirements r ON r.job_id=j.job_id JOIN experiments e ON e.experiment_id=j.experiment_id
       JOIN projects p ON p.project_id=e.project_id WHERE j.job_id=? AND (p.owner_id=? OR ?='admin')`,[id,req.principal!.userId,req.principal!.role]);
    if(!rows[0]){res.status(404).json({error:{code:'NOT_FOUND',message:'Job not found.'}});return;}
    res.json({data:rows[0]});
  }catch(error){next(error);}
});

jobsRouter.post('/:id/schedule',async(req,res,next)=>{
  try{
    const id=z.coerce.number().int().positive().parse(req.params.id);
    const outcome=await inTransaction(appPool,async(connection)=>{
      const [owned]=await connection.execute<JobOwnerRow[]>(
        `SELECT j.job_id FROM training_jobs j JOIN experiments e ON e.experiment_id=j.experiment_id JOIN projects p ON p.project_id=e.project_id
         WHERE j.job_id=? AND (p.owner_id=? OR ?='admin') FOR UPDATE`,[id,req.principal!.userId,req.principal!.role]);
      if(!owned[0]) return null;
      await connection.query('CALL sp_schedule_job(?,@scheduler_status,@scheduler_message)',[id]);
      const [rows]=await connection.query<SchedulerRow[]>('SELECT @scheduler_status AS status,@scheduler_message AS message');
      const result=rows[0];
      const status=String(result?.status??'queued');
      const message=String(result?.message??'Scheduler returned no status.');
      if(status==='scheduled') await appendAudit(connection,{actorId:req.principal!.userId,action:'SCHEDULE',entityType:'training_job',entityId:String(id),payload:{status,message}});
      return {status,message};
    });
    if(!outcome){res.status(404).json({error:{code:'NOT_FOUND',message:'Job not found.'}});return;}
    res.json(outcome);
  }catch(error){next(error);}
});

jobsRouter.post('/:id/cancel',async(req,res,next)=>{
  try{
    const id=z.coerce.number().int().positive().parse(req.params.id);
    const result=await inTransaction(appPool,async(connection)=>{
      const [owned]=await connection.execute<JobOwnerRow[]>(
        `SELECT j.job_id,j.status FROM training_jobs j JOIN experiments e ON e.experiment_id=j.experiment_id JOIN projects p ON p.project_id=e.project_id
         WHERE j.job_id=? AND (p.owner_id=? OR ?='admin') FOR UPDATE`,[id,req.principal!.userId,req.principal!.role]);
      if(!owned[0])return null;
      await connection.execute('CALL sp_release_job(?,?,?)',[id,'cancelled','Cancelled by user']);
      await appendAudit(connection,{actorId:req.principal!.userId,action:'CANCEL',entityType:'training_job',entityId:String(id),payload:{}});
      return true;
    });
    if(!result){res.status(404).json({error:{code:'NOT_FOUND',message:'Job not found.'}});return;}
    res.json({status:'cancelled'});
  }catch(error){next(error);}
});

jobsRouter.post('/:id/retry',async(req,res,next)=>{
  try{
    const id=z.coerce.number().int().positive().parse(req.params.id);
    const result=await inTransaction(appPool,async(connection)=>{
      const [owned]=await connection.execute<JobOwnerRow[]>(
        `SELECT j.job_id,j.status FROM training_jobs j JOIN experiments e ON e.experiment_id=j.experiment_id JOIN projects p ON p.project_id=e.project_id
         WHERE j.job_id=? AND (p.owner_id=? OR ?='admin') FOR UPDATE`,[id,req.principal!.userId,req.principal!.role]);
      if(!owned[0])return null;
      if(owned[0].status!=='failed')return {conflict:true};
      await connection.execute("UPDATE training_jobs SET status='queued',scheduler_note='Retry requested' WHERE job_id=?",[id]);
      await appendAudit(connection,{actorId:req.principal!.userId,action:'RETRY',entityType:'training_job',entityId:String(id),payload:{}});
      return {conflict:false};
    });
    if(!result){res.status(404).json({error:{code:'NOT_FOUND',message:'Job not found.'}});return;}
    if(result.conflict){res.status(409).json({error:{code:'JOB_NOT_FAILED',message:'Only failed jobs can be retried.'}});return;}
    res.json({status:'queued'});
  }catch(error){next(error);}
});

jobsRouter.post('/scheduler/run',allowRoles('admin'),async(_req,res,next)=>{
  try{await appPool.execute('CALL sp_run_scheduler_cycle()');res.json({started:true});}catch(error){next(error);}
});
