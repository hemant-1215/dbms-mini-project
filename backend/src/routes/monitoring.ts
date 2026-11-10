import { Router } from 'express';
import { z } from 'zod';
import type { RowDataPacket } from 'mysql2/promise';
import { appPool } from '../db/pools.js';
import { events } from '../db/mongo.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { embedText } from '../services/embeddings.js';
import { writeMonitoringEvent } from '../services/monitoring.js';

export const monitoringRouter=Router();
interface ProjectRow extends RowDataPacket { project_id:number }
monitoringRouter.use(requireAuth);
const severities=['debug','info','warning','error','critical'] as const;
const eventSchema=z.object({user_id:z.number().int().positive().nullable().optional(),project_id:z.number().int().positive().nullable().optional(),server_id:z.number().int().positive().nullable().optional(),job_id:z.number().int().positive().nullable().optional(),event_type:z.string().min(1).max(50),severity:z.enum(severities),message:z.string().min(1).max(4000),metadata:z.record(z.string(),z.unknown()).default({})});

async function accessibleProjectIds(userId:number):Promise<number[]>{
  const [rows]=await appPool.execute<ProjectRow[]>('SELECT project_id FROM projects WHERE owner_id=?',[userId]);
  return rows.map(row=>row.project_id);
}

monitoringRouter.get('/events',async(req,res,next)=>{
  try{
    const limit=Math.min(Number(req.query.limit)||100,500);
    const query:Record<string,unknown>={};
    if(req.principal!.role!=='admin')query.project_id={$in:await accessibleProjectIds(req.principal!.userId)};
    if(typeof req.query.severity==='string'&&severities.includes(req.query.severity as typeof severities[number]))query.severity=req.query.severity;
    if(typeof req.query.event_type==='string')query.event_type=req.query.event_type;
    if(typeof req.query.job_id==='string')query.job_id=Number(req.query.job_id);
    const data=await events.find(query).sort({timestamp:-1}).limit(limit).toArray();
    res.json({data});
  }catch(error){next(error);}
});

monitoringRouter.get('/summary',async(req,res,next)=>{
  try{
    const match:Record<string,unknown>={};
    if(req.principal!.role!=='admin')match.project_id={$in:await accessibleProjectIds(req.principal!.userId)};
    const data=await events.aggregate([
      {$match:match},{$group:{_id:{severity:'$severity',event_type:'$event_type'},count:{$sum:1}}},
      {$sort:{count:-1}},{$project:{_id:0,severity:'$_id.severity',event_type:'$_id.event_type',count:1}}
    ]).toArray();
    res.json({data});
  }catch(error){next(error);}
});

monitoringRouter.post('/semantic',async(req,res,next)=>{
  try{
    const input=z.object({query:z.string().min(3).max(1000),limit:z.number().int().min(1).max(20).default(5),filters:z.object({severity:z.enum(severities).optional(),event_type:z.string().max(50).optional()}).default({})}).parse(req.body);
    const projectIds=req.principal!.role==='admin'?undefined:await accessibleProjectIds(req.principal!.userId);
    const filters:Record<string,unknown>[]=[];
    if(projectIds)filters.push({project_id:{$in:projectIds}});
    if(input.filters.severity)filters.push({severity:input.filters.severity});
    if(input.filters.event_type)filters.push({event_type:input.filters.event_type});
    const queryVector=await embedText(input.query);
    const data=await events.aggregate([
      {$vectorSearch:{index:'monitoring_vector',path:'embedding',queryVector,numCandidates:Math.max(input.limit*20,100),limit:input.limit,...(filters.length?{filter:{$and:filters}}:{})}},
      {$project:{event_id:1,timestamp:1,user_id:1,project_id:1,server_id:1,job_id:1,event_type:1,severity:1,message:1,metadata:1,score:{$meta:'vectorSearchScore'}}}
    ]).toArray();
    res.json({data});
  }catch(error){next(error);}
});

export const ingestRouter=Router();
ingestRouter.post('/telemetry',async(req,res,next)=>{
  try{
    if(req.header('x-ingest-token')!==env.INGEST_TOKEN){res.status(401).json({error:{code:'INGEST_TOKEN_INVALID',message:'Telemetry token is invalid.'}});return;}
    const event=eventSchema.parse(req.body);
    await writeMonitoringEvent(event);
    res.status(202).json({accepted:true});
  }catch(error){next(error);}
});

export const schedulerRouter=Router();
schedulerRouter.post('/run',requireAuth,allowRoles('admin'),async(_req,res,next)=>{
  try{const [rows]=await appPool.execute('CALL sp_run_scheduler_cycle()');res.json({started:true,result:rows});}catch(error){next(error);}
});
