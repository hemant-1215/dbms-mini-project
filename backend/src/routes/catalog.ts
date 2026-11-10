import { Router } from 'express';
import bcrypt from 'bcrypt';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { appPool, adminPool, inTransaction } from '../db/pools.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';
import { appendAudit } from '../services/audit.js';

export const catalogRouter=Router();
interface ProjectRow extends RowDataPacket { project_id:number }
interface OwnerRow extends RowDataPacket { owner_id:number }
catalogRouter.use(requireAuth);

type Resource={path:string;table:string;id:string;fields:Record<string,z.ZodTypeAny>;ownerCheck:string;createExtra?:(principalId:number,input:Record<string,unknown>)=>Record<string,unknown>};
const resources:Resource[]=[
  {path:'models',table:'models',id:'model_id',fields:{project_id:z.number().int().positive(),name:z.string().min(1).max(100),version:z.string().min(1).max(30),framework:z.string().max(50).nullable().optional(),parameter_count:z.number().int().positive().nullable().optional(),artifact_uri:z.string().max(255).nullable().optional()},ownerCheck:'project_id'},
  {path:'datasets',table:'datasets',id:'dataset_id',fields:{project_id:z.number().int().positive(),name:z.string().min(1).max(100),version:z.string().min(1).max(30),size_gb:z.number().min(0).nullable().optional(),format:z.string().max(30).nullable().optional(),row_count:z.number().int().min(0).nullable().optional(),storage_uri:z.string().max(255).nullable().optional()},ownerCheck:'project_id'},
  {path:'experiments',table:'experiments',id:'experiment_id',fields:{project_id:z.number().int().positive(),model_id:z.number().int().positive().nullable().optional(),dataset_id:z.number().int().positive().nullable().optional(),name:z.string().min(1).max(100),description:z.string().max(5000).nullable().optional(),hyperparameters:z.record(z.string(),z.unknown()).nullable().optional(),status:z.enum(['draft','active','finished']).optional()},ownerCheck:'project_id'}
];

for(const resource of resources){
  const base=`/${resource.path}`;
  const schema=z.object(resource.fields);
  catalogRouter.get(base,async(req,res,next)=>{
    try{
      const sql=`SELECT t.* FROM ${resource.table} t ${req.principal!.role==='admin'?'':'JOIN projects p ON p.project_id=t.project_id WHERE p.owner_id=?'} ORDER BY t.created_at DESC LIMIT 500`;
      const [rows]=req.principal!.role==='admin'?await appPool.execute(sql):await appPool.execute(sql,[req.principal!.userId]);
      res.json({data:rows});
    }catch(error){next(error);}
  });
  catalogRouter.post(base,async(req,res,next)=>{
    try{
      const input=schema.parse(req.body) as Record<string,unknown>;
      const fields=Object.keys(input);
      const id=await inTransaction(appPool,async(connection)=>{
        if(req.principal!.role!=='admin'){
          const [owned]=await connection.execute<ProjectRow[]>('SELECT project_id FROM projects WHERE project_id=? AND owner_id=? FOR UPDATE',[input.project_id,req.principal!.userId] as never[]);
          if(!owned[0])throw Object.assign(new Error('Project not found.'),{code:'ER_NO_REFERENCED_ROW_2'});
        }
        const values=fields.map(field=>input[field]??null);
        if(resource.table==='models'){fields.push('registered_by');values.push(req.principal!.userId);}
        if(resource.table==='datasets'){fields.push('registered_by');values.push(req.principal!.userId);}
        if(resource.table==='experiments'){fields.push('created_by');values.push(req.principal!.userId);}
        const [result]=await connection.execute(`INSERT INTO ${resource.table}(${fields.join(',')}) VALUES(${fields.map(()=>'?').join(',')})`,values as never[]);
        const newId=Number((result as {insertId:number}).insertId);
        await appendAudit(connection,{actorId:req.principal!.userId,action:'CREATE',entityType:resource.path,entityId:String(newId),payload:input});
        return newId;
      });
      res.status(201).json({[resource.id]:id,...input});
    }catch(error){next(error);}
  });
  catalogRouter.patch(`${base}/:id`,async(req,res,next)=>{
    try{
      const id=z.coerce.number().int().positive().parse(req.params.id);
      const partial=schema.omit({project_id:true}).partial();
      const input=partial.parse(req.body) as Record<string,unknown>;
      const fields=Object.keys(input);
      if(!fields.length){res.status(400).json({error:{code:'EMPTY_UPDATE',message:'Provide at least one editable field.'}});return;}
      const ok=await inTransaction(appPool,async(connection)=>{
        const [rows]=await connection.execute<OwnerRow[]>(`SELECT p.owner_id FROM ${resource.table} t JOIN projects p ON p.project_id=t.project_id WHERE t.${resource.id}=? FOR UPDATE`,[id]);
        if(!rows[0]||(req.principal!.role!=='admin'&&rows[0].owner_id!==req.principal!.userId))return false;
        await connection.execute(`UPDATE ${resource.table} SET ${fields.map(field=>`${field}=?`).join(',')} WHERE ${resource.id}=?`,[...fields.map(field=>input[field]??null),id] as never[]);
        await appendAudit(connection,{actorId:req.principal!.userId,action:'UPDATE',entityType:resource.path,entityId:String(id),payload:input});
        return true;
      });
      if(!ok){res.status(404).json({error:{code:'NOT_FOUND',message:`${resource.path} record not found.`}});return;}
      res.json({updated:true});
    }catch(error){next(error);}
  });
  catalogRouter.delete(`${base}/:id`,async(req,res,next)=>{
    try{
      const id=z.coerce.number().int().positive().parse(req.params.id);
      const ok=await inTransaction(appPool,async(connection)=>{
        const [rows]=await connection.execute<OwnerRow[]>(`SELECT p.owner_id FROM ${resource.table} t JOIN projects p ON p.project_id=t.project_id WHERE t.${resource.id}=? FOR UPDATE`,[id]);
        if(!rows[0]||(req.principal!.role!=='admin'&&rows[0].owner_id!==req.principal!.userId))return false;
        await appendAudit(connection,{actorId:req.principal!.userId,action:'DELETE',entityType:resource.path,entityId:String(id),payload:{}});
        await connection.execute(`DELETE FROM ${resource.table} WHERE ${resource.id}=?`,[id]);
        return true;
      });
      if(!ok){res.status(404).json({error:{code:'NOT_FOUND',message:`${resource.path} record not found.`}});return;}
      res.status(204).end();
    }catch(error){next(error);}
  });
}

catalogRouter.get('/servers',async(_req,res,next)=>{
  try{const [rows]=await appPool.execute('SELECT * FROM servers ORDER BY hostname');res.json({data:rows});}catch(error){next(error);}
});
catalogRouter.get('/gpus',async(_req,res,next)=>{
  try{const [rows]=await appPool.execute('SELECT * FROM v_gpu_availability ORDER BY hostname,gpu_index');res.json({data:rows});}catch(error){next(error);}
});

const serverSchema=z.object({hostname:z.string().min(1).max(100),ip_address:z.string().max(45).nullable().optional(),location:z.string().max(100).nullable().optional(),total_cpu_cores:z.number().int().positive(),total_ram_gb:z.number().int().positive(),total_storage_gb:z.number().int().positive(),status:z.enum(['online','offline','maintenance']).default('online')});
catalogRouter.post('/servers',allowRoles('admin'),async(req,res,next)=>{
  try{const input=serverSchema.parse(req.body);const id=await inTransaction(adminPool,async(connection)=>{const [result]=await connection.execute('INSERT INTO servers(hostname,ip_address,location,total_cpu_cores,total_ram_gb,total_storage_gb,status) VALUES(?,?,?,?,?,?,?)',[input.hostname,input.ip_address??null,input.location??null,input.total_cpu_cores,input.total_ram_gb,input.total_storage_gb,input.status]);const serverId=Number((result as {insertId:number}).insertId);await appendAudit(connection,{actorId:req.principal!.userId,action:'CREATE',entityType:'server',entityId:String(serverId),payload:input});return serverId;});res.status(201).json({server_id:id,...input});}catch(error){next(error);}
});
catalogRouter.patch('/servers/:id',allowRoles('admin'),async(req,res,next)=>{
  try{const id=z.coerce.number().int().positive().parse(req.params.id);const input=serverSchema.partial().parse(req.body);const fields=Object.keys(input);if(!fields.length){res.status(400).json({error:{code:'EMPTY_UPDATE',message:'Provide editable fields.'}});return;}await inTransaction(adminPool,async(connection)=>{await connection.execute(`UPDATE servers SET ${fields.map(field=>`${field}=?`).join(',')} WHERE server_id=?`,[...fields.map(field=>(input as Record<string,unknown>)[field]??null),id] as never[]);await appendAudit(connection,{actorId:req.principal!.userId,action:'UPDATE',entityType:'server',entityId:String(id),payload:input});});res.json({updated:true});}catch(error){next(error);}
});
catalogRouter.delete('/servers/:id',allowRoles('admin'),async(req,res,next)=>{
  try{const id=z.coerce.number().int().positive().parse(req.params.id);await inTransaction(adminPool,async(connection)=>{await appendAudit(connection,{actorId:req.principal!.userId,action:'DELETE',entityType:'server',entityId:String(id),payload:{}});await connection.execute('DELETE FROM servers WHERE server_id=?',[id]);});res.status(204).end();}catch(error){next(error);}
});

const gpuSchema=z.object({server_id:z.number().int().positive(),gpu_index:z.number().int().min(0).max(255),model_name:z.string().min(1).max(50),memory_gb:z.number().int().positive(),compute_capability:z.number().positive(),status:z.enum(['available','allocated','maintenance','offline']).default('available'),utilization_pct:z.number().min(0).max(100).default(0),memory_used_gb:z.number().min(0).default(0)});
catalogRouter.post('/gpus',allowRoles('admin'),async(req,res,next)=>{
  try{const i=gpuSchema.parse(req.body);const id=await inTransaction(adminPool,async(connection)=>{const [result]=await connection.execute('INSERT INTO gpus(server_id,gpu_index,model_name,memory_gb,compute_capability,status,utilization_pct,memory_used_gb) VALUES(?,?,?,?,?,?,?,?)',[i.server_id,i.gpu_index,i.model_name,i.memory_gb,i.compute_capability,i.status,i.utilization_pct,i.memory_used_gb]);const gpuId=Number((result as {insertId:number}).insertId);await appendAudit(connection,{actorId:req.principal!.userId,action:'CREATE',entityType:'gpu',entityId:String(gpuId),payload:i});return gpuId;});res.status(201).json({gpu_id:id,...i});}catch(error){next(error);}
});
catalogRouter.patch('/gpus/:id',allowRoles('admin'),async(req,res,next)=>{
  try{const id=z.coerce.number().int().positive().parse(req.params.id);const i=gpuSchema.partial().omit({server_id:true,gpu_index:true}).parse(req.body);const fields=Object.keys(i);if(!fields.length){res.status(400).json({error:{code:'EMPTY_UPDATE',message:'Provide editable fields.'}});return;}await inTransaction(adminPool,async(connection)=>{await connection.execute(`UPDATE gpus SET ${fields.map(field=>`${field}=?`).join(',')} WHERE gpu_id=?`,[...fields.map(field=>(i as Record<string,unknown>)[field]??null),id] as never[]);await appendAudit(connection,{actorId:req.principal!.userId,action:'UPDATE',entityType:'gpu',entityId:String(id),payload:i});});res.json({updated:true});}catch(error){next(error);}
});
catalogRouter.delete('/gpus/:id',allowRoles('admin'),async(req,res,next)=>{
  try{const id=z.coerce.number().int().positive().parse(req.params.id);await inTransaction(adminPool,async(connection)=>{await appendAudit(connection,{actorId:req.principal!.userId,action:'DELETE',entityType:'gpu',entityId:String(id),payload:{}});await connection.execute('DELETE FROM gpus WHERE gpu_id=?',[id]);});res.status(204).end();}catch(error){next(error);}
});

const userSchema=z.object({username:z.string().min(3).max(50),email:z.email().max(120),full_name:z.string().min(1).max(100),role:z.enum(['admin','researcher','student']),is_active:z.boolean().default(true)});
catalogRouter.get('/users',allowRoles('admin'),async(_req,res,next)=>{
  try{const [rows]=await adminPool.execute('SELECT user_id,username,email,full_name,role,is_active,created_at,updated_at FROM users ORDER BY created_at DESC');res.json({data:rows});}catch(error){next(error);}
});
catalogRouter.post('/users',allowRoles('admin'),async(req,res,next)=>{
  try{
    const input=userSchema.extend({password:z.string().min(10).max(72)}).parse(req.body);
    const hash=await bcrypt.hash(input.password,12);
    const id=await inTransaction(adminPool,async(connection)=>{
      const [result]=await connection.execute('INSERT INTO users(username,email,password_hash,full_name,role,is_active) VALUES(?,?,?,?,?,?)',[input.username,input.email.toLowerCase(),hash,input.full_name,input.role,input.is_active]);
      const userId=Number((result as {insertId:number}).insertId);
      await appendAudit(connection,{actorId:req.principal!.userId,action:'CREATE',entityType:'user',entityId:String(userId),payload:{username:input.username,email:input.email.toLowerCase(),role:input.role}});
      return userId;
    });
    res.status(201).json({user_id:id,username:input.username,email:input.email.toLowerCase(),full_name:input.full_name,role:input.role,is_active:input.is_active});
  }catch(error){next(error);}
});
catalogRouter.patch('/users/:id',allowRoles('admin'),async(req,res,next)=>{
  try{const id=z.coerce.number().int().positive().parse(req.params.id);const i=userSchema.partial().parse(req.body);const fields=Object.keys(i);if(!fields.length){res.status(400).json({error:{code:'EMPTY_UPDATE',message:'Provide editable fields.'}});return;}await inTransaction(adminPool,async(connection)=>{await connection.execute(`UPDATE users SET ${fields.map(field=>`${field}=?`).join(',')} WHERE user_id=?`,[...fields.map(field=>(i as Record<string,unknown>)[field]??null),id] as never[]);await appendAudit(connection,{actorId:req.principal!.userId,action:'UPDATE',entityType:'user',entityId:String(id),payload:i});});res.json({updated:true});}catch(error){next(error);}
});
catalogRouter.delete('/users/:id',allowRoles('admin'),async(req,res,next)=>{
  try{const id=z.coerce.number().int().positive().parse(req.params.id);await inTransaction(adminPool,async(connection)=>{await appendAudit(connection,{actorId:req.principal!.userId,action:'DELETE',entityType:'user',entityId:String(id),payload:{}});await connection.execute('DELETE FROM users WHERE user_id=?',[id]);});res.status(204).end();}catch(error){next(error);}
});
