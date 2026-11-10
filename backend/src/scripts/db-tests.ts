import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';
import { appPool, adminPool, inTransaction } from '../db/pools.js';
import { env } from '../config/env.js';
import { appendAudit } from '../services/audit.js';
import { auditHash } from '../services/audit.js';

let passed=0;
function pass(name:string):void{passed++;console.log(`PASS ${name}`);}
async function expectError(name:string,run:()=>Promise<unknown>,codes:string[]):Promise<void>{
  try{await run();throw new Error(`Expected ${name} to fail.`);}catch(error){const code=String((error as {code?:string}).code??'');assert(codes.includes(code),`${name} returned ${code}`);pass(name);}
}
const suffix=randomBytes(4).toString('hex');
const userName=`qa_${suffix}`;

try{
  const [userInsert]=await adminPool.execute('INSERT INTO users(username,email,password_hash,full_name,role) VALUES(?,?,?,?,?)',[userName,`${userName}@local.test`,'not-a-login-hash','QA Owner','researcher']);
  const userId=Number((userInsert as {insertId:number}).insertId);
  const [serverInsert]=await adminPool.execute('INSERT INTO servers(hostname,total_cpu_cores,total_ram_gb,total_storage_gb,status) VALUES(?,?,?,?,?)',[`qa-node-${suffix}`,32,128,2048,'online']);
  const serverId=Number((serverInsert as {insertId:number}).insertId);
  const [gpuInsert]=await adminPool.execute('INSERT INTO gpus(server_id,gpu_index,model_name,memory_gb,compute_capability) VALUES(?,?,?,?,?)',[serverId,0,'A100',80,8.0]);
  const gpuId=Number((gpuInsert as {insertId:number}).insertId);

  await expectError('NOT NULL rejects ownerless project',()=>adminPool.execute('INSERT INTO projects(owner_id,name) VALUES(NULL,?)',[`bad-${suffix}`]),['ER_BAD_NULL_ERROR']);
  await expectError('CHECK rejects negative project quota',()=>adminPool.execute('INSERT INTO projects(owner_id,name,gpu_hour_quota) VALUES(?,?,?)',[userId,`bad-quota-${suffix}`,-1]),['ER_CHECK_CONSTRAINT_VIOLATED']);
  await expectError('UNIQUE rejects a duplicate hostname',()=>adminPool.execute('INSERT INTO servers(hostname,total_cpu_cores,total_ram_gb,total_storage_gb) VALUES(?,?,?,?)',[`qa-node-${suffix}`,32,128,2048]),['ER_DUP_ENTRY']);
  await expectError('FOREIGN KEY rejects a missing project owner',()=>adminPool.execute('INSERT INTO projects(owner_id,name) VALUES(?,?)',[999999999,`bad-fk-${suffix}`]),['ER_NO_REFERENCED_ROW_2']);

  const [projectInsert]=await adminPool.execute('INSERT INTO projects(owner_id,name,gpu_hour_quota) VALUES(?,?,?)',[userId,`Cascade ${suffix}`,100]);
  const projectId=Number((projectInsert as {insertId:number}).insertId);
  const [modelInsert]=await adminPool.execute('INSERT INTO models(project_id,registered_by,name,version) VALUES(?,?,?,?)',[projectId,userId,`Model ${suffix}`,'1']);
  const modelId=Number((modelInsert as {insertId:number}).insertId);
  const [datasetInsert]=await adminPool.execute('INSERT INTO datasets(project_id,registered_by,name,version) VALUES(?,?,?,?)',[projectId,userId,`Dataset ${suffix}`,'1']);
  const datasetId=Number((datasetInsert as {insertId:number}).insertId);
  const [experimentInsert]=await adminPool.execute('INSERT INTO experiments(project_id,model_id,dataset_id,created_by,name) VALUES(?,?,?,?,?)',[projectId,modelId,datasetId,userId,`Experiment ${suffix}`]);
  const experimentId=Number((experimentInsert as {insertId:number}).insertId);
  const [jobInsert]=await adminPool.execute('INSERT INTO training_jobs(experiment_id,submitted_by,submitted_at) VALUES(?,?,UTC_TIMESTAMP(6)-INTERVAL 2 HOUR)',[experimentId,userId]);
  const jobId=Number((jobInsert as {insertId:number}).insertId);
  await adminPool.execute('INSERT INTO job_requirements(job_id,gpu_count,min_gpu_memory_gb,cpu_cores,ram_gb,storage_gb,est_duration_hours) VALUES(?,1,40,4,16,10,1)',[jobId]);
  await expectError('RESTRICT keeps user referenced by project',()=>adminPool.execute('DELETE FROM users WHERE user_id=?',[userId]),['ER_ROW_IS_REFERENCED_2']);

  const [projectRows]=await adminPool.execute<RowDataPacket[]>('SELECT project_id FROM projects WHERE project_id=?',[projectId]);
  assert.equal(projectRows.length,1);
  await adminPool.execute('UPDATE projects SET project_id=project_id+100000 WHERE project_id=?',[projectId]);
  const movedProjectId=projectId+100000;
  const [childRows]=await adminPool.execute<RowDataPacket[]>('SELECT project_id FROM models WHERE model_id=?',[modelId]);
  assert.equal(Number(childRows[0]?.project_id),movedProjectId);
  pass('ON UPDATE CASCADE follows project key changes');

  await adminPool.execute("UPDATE training_jobs SET status='scheduled' WHERE job_id=?",[jobId]);
  await adminPool.execute("UPDATE training_jobs SET status='running' WHERE job_id=?",[jobId]);
  await adminPool.execute("UPDATE training_jobs SET status='completed' WHERE job_id=?",[jobId]);
  await expectError('trigger rejects completed-to-running transition',()=>adminPool.execute("UPDATE training_jobs SET status='running' WHERE job_id=?",[jobId]),['ER_SIGNAL_EXCEPTION']);
  const [history]=await adminPool.execute<RowDataPacket[]>('SELECT history_id FROM job_status_history WHERE job_id=?',[jobId]);
  assert.equal(history.length,4);
  pass('status trigger writes the transition history');

  await adminPool.execute("INSERT INTO billing_rates(resource_type,gpu_model_name,rate_inr,effective_from) VALUES('gpu_hour','QA-A100',220,UTC_TIMESTAMP()-INTERVAL 1 DAY),('cpu_core_hour',NULL,0.75,UTC_TIMESTAMP()-INTERVAL 1 DAY),('ram_gb_hour',NULL,0.15,UTC_TIMESTAMP()-INTERVAL 1 DAY),('storage_gb_hour',NULL,0.01,UTC_TIMESTAMP()-INTERVAL 1 DAY)");
  // Use a dedicated GPU model with a hand-calculable one-hour allocation.
  await adminPool.execute("UPDATE gpus SET model_name='QA-A100' WHERE gpu_id=?",[gpuId]);
  await adminPool.execute('UPDATE training_jobs SET started_at=UTC_TIMESTAMP()-INTERVAL 1 HOUR,finished_at=UTC_TIMESTAMP() WHERE job_id=?',[jobId]);
  await adminPool.execute('INSERT INTO job_gpu_allocation(job_id,gpu_id,allocated_at,released_at) VALUES(?,?,UTC_TIMESTAMP()-INTERVAL 1 HOUR,UTC_TIMESTAMP())',[jobId,gpuId]);
  const [costRows]=await adminPool.execute<RowDataPacket[]>('SELECT fn_job_cost(?) AS cost',[jobId]);
  assert(Math.abs(Number(costRows[0]?.cost)-225.5)<0.02,`Expected ~225.5 INR, got ${String(costRows[0]?.cost)}`);
  pass('fn_job_cost matches the hand-calculated INR amount');

  const [jobA]=await adminPool.execute('INSERT INTO training_jobs(experiment_id,submitted_by) VALUES(?,?)',[experimentId,userId]);
  const [jobB]=await adminPool.execute('INSERT INTO training_jobs(experiment_id,submitted_by) VALUES(?,?)',[experimentId,userId]);
  for(const result of [jobA,jobB]){
    const id=Number((result as {insertId:number}).insertId);
    await adminPool.execute('INSERT INTO job_requirements(job_id,gpu_count,min_gpu_memory_gb,min_compute_capability,cpu_cores,ram_gb,storage_gb,est_duration_hours) VALUES(?,1,40,8,4,16,10,1)',[id]);
  }
  const schedule=(id:number)=>inTransaction(appPool,async(connection)=>{
    await connection.query('CALL sp_schedule_job(?,@qa_status,@qa_message)',[id]);
    const [out]=await connection.query<Array<RowDataPacket & {status:string|null;message:string|null}>>('SELECT @qa_status AS status,@qa_message AS message');
    return out[0]?.status;
  });
  const outcomes=await Promise.allSettled([schedule(Number((jobA as {insertId:number}).insertId)),schedule(Number((jobB as {insertId:number}).insertId))]);
  const [active]=await adminPool.execute<RowDataPacket[]>('SELECT COUNT(*) AS n FROM job_gpu_allocation WHERE gpu_id=? AND released_at IS NULL',[gpuId]);
  assert(Number((active[0] as {n:number}).n)<=1,'Concurrent calls double-booked a GPU.');
  assert(outcomes.some(x=>x.status==='fulfilled'),'No scheduler call completed.');
  pass('concurrent scheduler calls never create a duplicate active GPU allocation');

  await assert.rejects(inTransaction(appPool,async(connection)=>{await appendAudit(connection,{actorId:userId,action:'ROLLBACK_TEST',entityType:'test',entityId:suffix,payload:{suffix}});throw new Error('force transaction rollback');}));
  const [rolledBack]=await adminPool.execute<RowDataPacket[]>('SELECT audit_id FROM audit_log WHERE action=\'ROLLBACK_TEST\' AND entity_id=?',[suffix]);
  assert.equal(rolledBack.length,0);pass('business rollback leaves no audit row');
  await Promise.all(Array.from({length:50},(_,index)=>inTransaction(appPool,async(connection)=>appendAudit(connection,{actorId:userId,action:'QA',entityType:'test',entityId:`${suffix}-${index}`,payload:{index,suffix}}))));
  const [chain]=await adminPool.execute<Array<RowDataPacket & {audit_id:string;actor_id:number|null;action:string;entity_type:string;entity_id:string;created_at:string;payload:unknown;prev_hash:string;curr_hash:string}>>('SELECT audit_id,actor_id,action,entity_type,entity_id,created_at,payload,prev_hash,curr_hash FROM audit_log ORDER BY audit_id');
  let previous='0'.repeat(64);
  for(const row of chain){
    const record={audit_id:Number(row.audit_id),actor_id:row.actor_id,action:row.action,entity_type:row.entity_type,entity_id:row.entity_id,created_at:`${row.created_at.replace(' ','T')}Z`,payload:row.payload};
    assert.equal(row.prev_hash,previous);assert.equal(row.curr_hash,auditHash(record,previous));previous=row.curr_hash;
  }
  pass('50 concurrent appends produce one valid audit chain');
  const [appDenied]=await expectError('app role cannot update audit rows',()=>appPool.execute('UPDATE audit_log SET action=action WHERE audit_id=1'),['ER_TABLEACCESS_DENIED_ERROR']).then(()=>[true]);
  assert(appDenied);
  await expectError('admin role cannot update audit rows',()=>adminPool.execute('UPDATE audit_log SET action=action WHERE audit_id=1'),['ER_TABLEACCESS_DENIED_ERROR']);
  if(process.env.MYSQL_ROOT_PASSWORD){
    const root=await mysql.createConnection({host:env.MYSQL_HOST,port:env.MYSQL_PORT,database:env.MYSQL_DATABASE,user:'root',password:process.env.MYSQL_ROOT_PASSWORD});
    await expectError('audit trigger blocks privileged updates',()=>root.execute('UPDATE audit_log SET action=action WHERE audit_id=1'),['ER_SIGNAL_EXCEPTION']);
    await root.end();
  }

  const readonly=mysql.createPool({host:env.MYSQL_HOST,port:env.MYSQL_PORT,database:env.MYSQL_DATABASE,user:env.MYSQL_READONLY_USER,password:env.MYSQL_READONLY_PASSWORD,connectionLimit:1});
  await readonly.query('SELECT project_id FROM projects LIMIT 1');
  await expectError('read-only role rejects project inserts',()=>readonly.execute('INSERT INTO projects(owner_id,name) VALUES(?,?)',[userId,`readonly-${suffix}`]),['ER_TABLEACCESS_DENIED_ERROR']);
  await expectError('read-only role cannot select password hashes',()=>readonly.query('SELECT password_hash FROM users LIMIT 1'),['ER_TABLEACCESS_DENIED_ERROR']);
  await readonly.end();
  await expectError('app role cannot issue DDL',()=>appPool.query('CREATE TABLE forbidden_from_app(id INT)'),['ER_TABLEACCESS_DENIED_ERROR','ER_TABLEACCESS_DENIED_ERROR']);

  await adminPool.execute('DELETE FROM projects WHERE project_id=?',[movedProjectId]);
  const [deletedChildren]=await adminPool.execute<RowDataPacket[]>('SELECT COUNT(*) AS n FROM models WHERE project_id=?',[movedProjectId]);
  assert.equal(Number((deletedChildren[0] as {n:number}).n),0);
  pass('ON DELETE CASCADE removes project-owned assets and jobs');
  console.log(`Database checks completed: ${passed} passed.`);
}finally{
  await appPool.end();await adminPool.end();
}
