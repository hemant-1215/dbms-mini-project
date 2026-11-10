import { Router } from 'express';
import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { adminPool } from '../db/pools.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';

export const auditRouter=Router();
interface HeadRow extends RowDataPacket { audit_id:string;curr_hash:string;created_at:string }
interface AuditRow extends RowDataPacket { audit_id:string;actor_id:number|null;action:string;entity_type:string;entity_id:string;created_at:string;payload:unknown;prev_hash:string;curr_hash:string }
auditRouter.use(requireAuth,allowRoles('admin'));

function hash(previous:string,record:Record<string,unknown>):string{
  const json=canonicalize(record);if(!json)throw new Error('AUDIT_CANONICALIZATION_FAILED');
  return createHash('sha256').update(previous+json,'utf8').digest('hex');
}
function canonicalTimestamp(value:string):string{return `${value.replace(' ','T')}Z`;}

auditRouter.get('/',async(req,res,next)=>{
  try{
    const limit=Math.min(Number(req.query.limit)||100,500);
    const [rows]=await adminPool.execute('SELECT audit_id,actor_id,action,entity_type,entity_id,created_at,payload,prev_hash,curr_hash FROM audit_log ORDER BY audit_id DESC LIMIT ?',[limit]);
    res.json({data:rows});
  }catch(error){next(error);}
});

auditRouter.get('/head',async(_req,res,next)=>{
  try{const [rows]=await adminPool.execute<HeadRow[]>('SELECT audit_id,curr_hash,created_at FROM audit_log ORDER BY audit_id DESC LIMIT 1');res.json({head:rows[0]??null});}catch(error){next(error);}
});

auditRouter.get('/verify',async(_req,res,next)=>{
  try{
    const [rows]=await adminPool.execute<AuditRow[]>(
      'SELECT audit_id,actor_id,action,entity_type,entity_id,created_at,payload,prev_hash,curr_hash FROM audit_log ORDER BY audit_id');
    let previous='0'.repeat(64);let firstBrokenAuditId:number|null=null;let checked=0;
    for(const row of rows){
      const record={audit_id:Number(row.audit_id),actor_id:row.actor_id,action:row.action,entity_type:row.entity_type,entity_id:row.entity_id,created_at:canonicalTimestamp(row.created_at),payload:row.payload};
      const current=hash(previous,record);
      if(row.prev_hash!==previous||row.curr_hash!==current){firstBrokenAuditId=Number(row.audit_id);break;}
      previous=row.curr_hash;checked++;
    }
    res.json({valid:firstBrokenAuditId===null,checked,firstBrokenAuditId});
  }catch(error){next(error);}
});
