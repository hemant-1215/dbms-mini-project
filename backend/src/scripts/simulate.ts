import { appPool, inTransaction } from '../db/pools.js';
import { appendAudit } from '../services/audit.js';
import { writeMonitoringEvent } from '../services/monitoring.js';
import { closeMongo, connectMongo } from '../db/mongo.js';
import type { RowDataPacket } from 'mysql2/promise';

const rounds=Math.max(1,Math.min(Number(process.argv[2])||10,100));
interface AdminRow extends RowDataPacket{user_id:number}
interface JobRow extends RowDataPacket{job_id:number;project_id:number}
interface StatusRow extends RowDataPacket{status:string;message:string}
interface GpuRow extends RowDataPacket{gpu_id:number}
interface EventOwnerRow extends RowDataPacket{owner_id:number;server_id:number|null}
const [admins]=await appPool.execute<AdminRow[]>("SELECT user_id FROM users WHERE role='admin' AND is_active=1 ORDER BY user_id LIMIT 1");
const actorId=admins[0]?.user_id??null;
if(actorId===null)throw new Error('Seed or create an admin account before running the simulator.');
await connectMongo();
let scheduled=0;let completed=0;let failed=0;let noCapacity=0;
for(let i=0;i<rounds;i++){
  const [jobs]=await appPool.execute<JobRow[]>(
    `SELECT j.job_id,e.project_id,NULL AS server_id,NULL AS gpu_id FROM training_jobs j JOIN experiments e ON e.experiment_id=j.experiment_id
     WHERE j.status='queued' ORDER BY j.priority DESC,j.submitted_at LIMIT 1`);
  const job=jobs[0];if(!job)break;
  const result=await inTransaction(appPool,async(connection)=>{
    await connection.query('CALL sp_schedule_job(?,@sim_status,@sim_message)',[job.job_id]);
    const [statuses]=await connection.query<StatusRow[]>('SELECT @sim_status AS status,@sim_message AS message');
    const status=String(statuses[0]?.status??'queued');
    if(status!=='scheduled')return {status,message:String(statuses[0]?.message??'No capacity')};
    await connection.execute("UPDATE training_jobs SET status='running' WHERE job_id=?",[job.job_id]);
    await appendAudit(connection,{actorId,action:'SIMULATOR_START',entityType:'training_job',entityId:String(job.job_id),payload:{message:'Telemetry simulator started this job.'}});
    const [allocation]=await connection.execute<GpuRow[]>('SELECT gpu_id FROM job_gpu_allocation WHERE job_id=? AND released_at IS NULL ORDER BY gpu_id LIMIT 1',[job.job_id]);
    await connection.execute('INSERT INTO resource_usage(job_id,gpu_id,recorded_at,gpu_util_pct,gpu_mem_used_gb,cpu_util_pct,ram_used_gb,storage_used_gb,interval_seconds) VALUES(?,?,UTC_TIMESTAMP(6),?,?,?,?,?,60)',[job.job_id,allocation[0]?.gpu_id??null,34+i%61,8+i%30,21+i%55,12+i%48,70+i%80]);
    const finalStatus=i%7===0?'failed':'completed';
    await connection.query('CALL sp_release_job(?,?,?)',[job.job_id,finalStatus,finalStatus==='failed'?'simulated worker timeout':'']);
    await appendAudit(connection,{actorId,action:`SIMULATOR_${finalStatus.toUpperCase()}`,entityType:'training_job',entityId:String(job.job_id),payload:{finalStatus}});
    return {status:'scheduled',message:finalStatus};
  });
  if(result.status==='scheduled'){
    scheduled++;if(result.message==='failed')failed++;else completed++;
    const [owners]=await appPool.execute<EventOwnerRow[]>('SELECT p.owner_id,(SELECT server_id FROM job_gpu_allocation a JOIN gpus g ON g.gpu_id=a.gpu_id WHERE a.job_id=? ORDER BY a.allocation_id DESC LIMIT 1) AS server_id FROM projects p JOIN experiments e ON e.project_id=p.project_id JOIN training_jobs j ON j.experiment_id=e.experiment_id WHERE j.job_id=?',[job.job_id,job.job_id]);
    await writeMonitoringEvent({user_id:owners[0]?.owner_id??null,project_id:job.project_id,server_id:owners[0]?.server_id??null,job_id:job.job_id,event_type:result.message==='failed'?'job_failed':'job_completed',severity:result.message==='failed'?'error':'info',message:result.message==='failed'?'Simulator recorded a training worker timeout.':'Simulator completed the training job and collected resource usage.',metadata:{source:'telemetry-simulator'}});
  }else noCapacity++;
}
await appPool.end();await closeMongo();
console.log(JSON.stringify({requested:rounds,scheduled,completed,failed,noCapacity},null,2));
