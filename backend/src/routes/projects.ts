import { Router } from 'express';
import { z } from 'zod';
import type { RowDataPacket } from 'mysql2/promise';
import { appPool, inTransaction } from '../db/pools.js';
import { requireAuth } from '../middleware/auth.js';
import { appendAudit } from '../services/audit.js';

export const projectsRouter = Router();
interface OwnerRow extends RowDataPacket { owner_id:number }
projectsRouter.use(requireAuth);

const projectInput = z.object({ name: z.string().min(1).max(100), description: z.string().max(5000).optional(), parent_project_id: z.number().int().positive().nullable().optional(), gpu_hour_quota: z.number().min(0).max(1_000_000).optional() });

projectsRouter.get('/', async (req, res, next) => {
  try {
    const [rows] = req.principal!.role === 'admin'
      ? await appPool.execute('SELECT p.*,u.username AS owner_name FROM projects p JOIN users u ON u.user_id=p.owner_id ORDER BY p.created_at DESC')
      : await appPool.execute('SELECT p.*,u.username AS owner_name FROM projects p JOIN users u ON u.user_id=p.owner_id WHERE p.owner_id=? ORDER BY p.created_at DESC', [req.principal!.userId]);
    res.json({ data: rows });
  } catch (error) { next(error); }
});

projectsRouter.get('/:id/tree', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [rows] = await appPool.execute(
      `WITH RECURSIVE tree AS (
         SELECT project_id,parent_project_id,owner_id,name,status,0 AS depth FROM projects WHERE project_id=?
         UNION ALL
         SELECT p.project_id,p.parent_project_id,p.owner_id,p.name,p.status,t.depth+1 FROM projects p JOIN tree t ON p.parent_project_id=t.project_id
       ) SELECT * FROM tree ${req.principal!.role === 'admin' ? '' : 'WHERE owner_id=?'} ORDER BY depth,project_id`,
      req.principal!.role === 'admin' ? [id] : [id,req.principal!.userId]
    );
    res.json({ data: rows });
  } catch (error) { next(error); }
});

projectsRouter.post('/', async (req, res, next) => {
  try {
    const input = projectInput.parse(req.body);
    const quota = input.gpu_hour_quota ?? (req.principal!.role === 'student' ? 10 : 100);
    if(req.principal!.role==='student'&&quota>10){res.status(400).json({error:{code:'STUDENT_QUOTA_LIMIT',message:'Student projects are limited to 10 GPU-hours.'}});return;}
    const id = await inTransaction(appPool, async (connection) => {
      const [result] = await connection.execute('INSERT INTO projects(parent_project_id,owner_id,name,description,gpu_hour_quota) VALUES(?,?,?,?,?)', [input.parent_project_id ?? null,req.principal!.userId,input.name,input.description ?? null,quota]);
      const projectId = Number((result as { insertId: number }).insertId);
      await appendAudit(connection,{actorId:req.principal!.userId,action:'CREATE',entityType:'project',entityId:String(projectId),payload:{name:input.name,gpu_hour_quota:quota}});
      return projectId;
    });
    res.status(201).json({ project_id:id,owner_id:req.principal!.userId,name:input.name,description:input.description ?? null,gpu_hour_quota:quota,status:'active' });
  } catch (error) { next(error); }
});

projectsRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const input = projectInput.partial().parse(req.body);
    if(req.principal!.role==='student'&&(input.gpu_hour_quota??0)>10){res.status(400).json({error:{code:'STUDENT_QUOTA_LIMIT',message:'Student projects are limited to 10 GPU-hours.'}});return;}
    const result = await inTransaction(appPool, async (connection) => {
      const [rows] = await connection.execute<OwnerRow[]>('SELECT owner_id FROM projects WHERE project_id=? FOR UPDATE',[id]);
      if (!rows[0] || (req.principal!.role !== 'admin' && rows[0].owner_id !== req.principal!.userId)) return false;
      await connection.execute('UPDATE projects SET name=COALESCE(?,name),description=COALESCE(?,description),gpu_hour_quota=COALESCE(?,gpu_hour_quota),parent_project_id=COALESCE(?,parent_project_id) WHERE project_id=?', [input.name ?? null,input.description ?? null,input.gpu_hour_quota ?? null,input.parent_project_id ?? null,id]);
      await appendAudit(connection,{actorId:req.principal!.userId,action:'UPDATE',entityType:'project',entityId:String(id),payload:input});
      return true;
    });
    if (!result) { res.status(404).json({error:{code:'NOT_FOUND',message:'Project not found.'}}); return; }
    res.json({ updated:true });
  } catch (error) { next(error); }
});

projectsRouter.delete('/:id', async (req, res, next) => {
  try {
    const id=z.coerce.number().int().positive().parse(req.params.id);
    const result=await inTransaction(appPool,async(connection)=>{
      const [rows]=await connection.execute<OwnerRow[]>('SELECT owner_id FROM projects WHERE project_id=? FOR UPDATE',[id]);
      if(!rows[0]||(req.principal!.role!=='admin'&&rows[0].owner_id!==req.principal!.userId)) return false;
      await appendAudit(connection,{actorId:req.principal!.userId,action:'DELETE',entityType:'project',entityId:String(id),payload:{}});
      await connection.execute('DELETE FROM projects WHERE project_id=?',[id]);
      return true;
    });
    if(!result){res.status(404).json({error:{code:'NOT_FOUND',message:'Project not found.'}});return;}
    res.status(204).end();
  }catch(error){next(error);}
});
