import { createHash } from 'node:crypto';
import { appPool, adminPool } from '../db/pools.js';
import { closeMongo, connectMongo, events } from '../db/mongo.js';
import { embedText } from '../services/embeddings.js';
import bcrypt from 'bcrypt';

let state=0x51a1c0de;
function random():number{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;}
function pick<T>(items:T[]):T{return items[Math.floor(random()*items.length)]!;}
function dateDaysAgo(days:number,minuteOffset=0):string{const d=new Date(Date.now()-days*86_400_000+minuteOffset*60_000);return d.toISOString().slice(0,19).replace('T',' ');}
function seededUuid(n:number):string{const h=createHash('sha256').update(`ai-crms-seed-${n}`).digest('hex').slice(0,32);return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}

async function insertBatch(connection:any,table:string,columns:string[],rows:unknown[][]):Promise<void>{
  const width=columns.length;const group=`(${columns.map(()=>'?').join(',')})`;
  for(let i=0;i<rows.length;i+=500){const batch=rows.slice(i,i+500);await connection.execute(`INSERT INTO ${table}(${columns.join(',')}) VALUES ${batch.map(()=>group).join(',')}`,batch.flat() as never[]);}
}

const [existing]=await adminPool.execute<Array<any>>("SELECT COUNT(*) AS n FROM users WHERE username LIKE 'demo_%'");
if(Number(existing[0]?.n??0)>0)throw new Error('Demo data already exists. Use the documented clean-reset procedure before reseeding.');

await connectMongo();
const eventTemplates=[
  ['gpu_failure','error','GPU memory controller reported an uncorrectable ECC error during model training.'],
  ['oom','critical','Training worker ran out of GPU memory while allocating attention tensors.'],
  ['high_utilization','warning','GPU utilization remained above 95 percent for fifteen minutes.'],
  ['job_started','info','Training job entered the running state on its scheduled GPU allocation.'],
  ['job_completed','info','Training job completed and uploaded experiment metrics.'],
  ['job_failed','error','Training job failed after a worker heartbeat timeout.'],
  ['scheduler_decision','info','Scheduler selected the lowest-utilization server with sufficient GPU memory.'],
  ['node_heartbeat','debug','Compute node heartbeat received and resources are healthy.']
] as const;
const vectors=await Promise.all(eventTemplates.map(row=>embedText(row[2])));

const roles=[...Array(3).fill('admin'),...Array(6).fill('researcher'),...Array(11).fill('student')] as Array<'admin'|'researcher'|'student'>;
const password='DemoPass!2026';
const hash=await bcrypt.hash(password,12);
const userRows=roles.map((role,index)=>{const roleIndex=roles.slice(0,index).filter(x=>x===role).length+1;const username=`demo_${role}${roleIndex}`;return[username,`${username}@ai-crms.local`,hash,`${role[0]!.toUpperCase()}${role.slice(1)} ${roleIndex}`,role,true] as unknown[];});
await insertBatch(adminPool,'users',['username','email','password_hash','full_name','role','is_active'],userRows);
const [users]=await adminPool.execute<Array<any>>('SELECT user_id,username,role FROM users WHERE username LIKE \'demo_%\' ORDER BY user_id');

const models=['A100','H100','V100','RTX 4090'];
const serverRows=Array.from({length:10},(_,i)=>[`gpu-node-${String(i+1).padStart(2,'0')}`,`10.1.0.${i+10}`,`Lab ${1+i%3}`,64,512,4096,'online']);
await insertBatch(adminPool,'servers',['hostname','ip_address','location','total_cpu_cores','total_ram_gb','total_storage_gb','status'],serverRows);
const [servers]=await adminPool.execute<Array<any>>('SELECT server_id,hostname FROM servers WHERE hostname LIKE \'gpu-node-%\' ORDER BY hostname');
const gpuRows=(servers as Array<any>).flatMap((s,index)=>Array.from({length:4},(_,gpuIndex)=>[s.server_id,gpuIndex,pick(models),gpuIndex%2===0?80:40,gpuIndex%2===0?8.0:7.0,'available',Math.round(random()*35),0]));
await insertBatch(adminPool,'gpus',['server_id','gpu_index','model_name','memory_gb','compute_capability','status','utilization_pct','memory_used_gb'],gpuRows);
const [gpus]=await adminPool.execute<Array<any>>('SELECT gpu_id,server_id,model_name,memory_gb FROM gpus ORDER BY gpu_id');

const researchers=(users as Array<any>).filter(u=>u.role==='researcher');
const students=(users as Array<any>).filter(u=>u.role==='student');
const projectOwners=Array.from({length:25},(_,i)=>i<15?researchers[i%researchers.length]!:students[i%students.length]!);
const projectRows=projectOwners.map((owner,i)=>[i>2?Math.floor(i/2)+1:null,owner.user_id,`Research project ${String(i+1).padStart(2,'0')}`,`Seeded workload profile ${i%5+1}`,owner.role==='student'?10:100,'active']);
// Build root projects first so hierarchy foreign keys always point to an inserted row.
const projectIds:number[]=[];
for(let i=0;i<projectRows.length;i++){
  const row=projectRows[i]!;const parent=i>2?projectIds[Math.floor(i/2)-1]??null:null;
  const [result]=await adminPool.execute('INSERT INTO projects(parent_project_id,owner_id,name,description,gpu_hour_quota,status) VALUES(?,?,?,?,?,?)',[parent,row[1],row[2],row[3],row[4],row[5]]);
  projectIds.push(Number((result as {insertId:number}).insertId));
}

const modelRows=projectIds.map((projectId,i)=>[projectId,projectOwners[i]!.user_id,`Baseline model ${i+1}`,'1.0','PyTorch',100_000_000+i*1_000_000,`s3://demo/models/${i+1}`]);
const datasetRows=projectIds.map((projectId,i)=>[projectId,projectOwners[i]!.user_id,`Training corpus ${i+1}`,'1.0',12+i%40,'parquet',1_000_000+i*25_000,`s3://demo/datasets/${i+1}`]);
await insertBatch(adminPool,'models',['project_id','registered_by','name','version','framework','parameter_count','artifact_uri'],modelRows);
await insertBatch(adminPool,'datasets',['project_id','registered_by','name','version','size_gb','format','row_count','storage_uri'],datasetRows);
const [modelIds]=await adminPool.execute<Array<any>>('SELECT model_id,project_id FROM models ORDER BY model_id DESC LIMIT 25');
const [datasetIds]=await adminPool.execute<Array<any>>('SELECT dataset_id,project_id FROM datasets ORDER BY dataset_id DESC LIMIT 25');
const experimentRows=Array.from({length:60},(_,i)=>{const projectIndex=i%25;return[projectIds[projectIndex],modelIds.find((x:any)=>x.project_id===projectIds[projectIndex])?.model_id??null,datasetIds.find((x:any)=>x.project_id===projectIds[projectIndex])?.dataset_id??null,projectOwners[projectIndex]!.user_id,`Experiment ${String(i+1).padStart(3,'0')}`,`Deterministic demo experiment ${i+1}`,JSON.stringify({learning_rate:0.0001+(i%10)*0.00005,batch_size:16*(i%4+1),seed:517})]});
await insertBatch(adminPool,'experiments',['project_id','model_id','dataset_id','created_by','name','description','hyperparameters'],experimentRows);
const [experimentIds]=await adminPool.execute<Array<any>>('SELECT experiment_id,project_id FROM experiments ORDER BY experiment_id DESC LIMIT 60');

const jobIds:number[]=[];const jobRows=Array.from({length:300},(_,i)=>[experimentIds[i%60]!.experiment_id,projectOwners[i%25]!.user_id,1+i%10,'queued',dateDaysAgo(i%30,(i%24)*60)]);
for(let i=0;i<jobRows.length;i+=100){
  const batch=jobRows.slice(i,i+100);await insertBatch(adminPool,'training_jobs',['experiment_id','submitted_by','priority','status','submitted_at'],batch);
  const [inserted]=await adminPool.execute<Array<any>>(`SELECT job_id FROM training_jobs WHERE submitted_by IN (${users.map(()=>'?').join(',')}) ORDER BY job_id DESC LIMIT ?`,[...(users as Array<any>).map(u=>u.user_id),batch.length]);
  jobIds.unshift(...(inserted as Array<any>).map(x=>Number(x.job_id)).reverse());
}
const requirementRows=jobIds.map((id,i)=>[id,1+i%3,i%4===0?80:40,i%4===0?8.0:7.0,4+(i%8),16+(i%4)*16,20,0.5+(i%8)*0.5]);
await insertBatch(adminPool,'job_requirements',['job_id','gpu_count','min_gpu_memory_gb','min_compute_capability','cpu_cores','ram_gb','storage_gb','est_duration_hours'],requirementRows);

const usageJobs=jobIds.slice(0,280);const targetStatus=(i:number)=>i%20===0?'cancelled':i<8?'running':i<20?'scheduled':i%7===0?'failed':i%5===0?'queued':'completed';
const usageGpuIds=(gpus as Array<any>).map(g=>Number(g.gpu_id));
for(let i=0;i<jobIds.length;i++){
  const id=jobIds[i]!;const target=targetStatus(i);
  if(target==='cancelled')await adminPool.execute("UPDATE training_jobs SET status='cancelled' WHERE job_id=?",[id]);
  else if(target!=='queued')await adminPool.execute("UPDATE training_jobs SET status='scheduled' WHERE job_id=?",[id]);
  if(['running','completed','failed'].includes(target))await adminPool.execute("UPDATE training_jobs SET status='running' WHERE job_id=?",[id]);
  if(['completed','failed'].includes(target))await adminPool.execute('UPDATE training_jobs SET status=? WHERE job_id=?',[target,id]);
  const start=dateDaysAgo(i%29,(i%24)*60);const duration=15+(i%220);
  if(!['cancelled','queued'].includes(target)){
    const selected=Array.from({length:(target==='running'||target==='scheduled')?1:1+i%3},(_,n)=>usageGpuIds[(i+n*7)%usageGpuIds.length]!);
    for(const gpuId of selected){const release=['running','scheduled'].includes(target)?null:new Date(Date.parse(`${start.replace(' ','T')}Z`)+duration*60_000).toISOString().slice(0,19).replace('T',' ');await adminPool.execute('INSERT INTO job_gpu_allocation(job_id,gpu_id,allocated_at,released_at) VALUES(?,?,?,?)',[id,gpuId,start,release]);}
    if(target==='running'||target==='scheduled')for(const gpuId of selected)await adminPool.execute("UPDATE gpus SET status='allocated' WHERE gpu_id=?",[gpuId]);
  }
  const started=['running','completed','failed'].includes(target)?start:null;
  const finished=['completed','failed','cancelled'].includes(target)?new Date(Date.parse(`${start.replace(' ','T')}Z`)+duration*60_000).toISOString().slice(0,19).replace('T',' '):null;
  await adminPool.execute('UPDATE training_jobs SET started_at=?,finished_at=?,failure_reason=? WHERE job_id=?',[started,finished,target==='failed'?pick(['GPU out of memory','worker timeout','node health check failed']):null,id]);
}

const resultRows=jobIds.flatMap((id,i)=>i%4===0?[['',id,'validation_accuracy',0.70+(i%25)/100,Math.floor(i/4),dateDaysAgo(i%29)]]:[]);
for(const row of resultRows){const [job]=await adminPool.execute<Array<any>>('SELECT experiment_id FROM training_jobs WHERE job_id=?',[row[1]] as never[]);row[0]=job[0]!.experiment_id;}
await insertBatch(adminPool,'experiment_results',['experiment_id','job_id','metric_name','metric_value','epoch','recorded_at'],resultRows);

const usageRows:Array<unknown[]>=[];
for(let i=0;i<100_000;i++){
  const jobIndex=Math.floor(random()*usageJobs.length);const jobId=usageJobs[jobIndex]!;const gpuId=usageGpuIds[Math.floor(random()*usageGpuIds.length)]!;
  const day=Math.floor(random()*30);const hour=(14+Math.floor(random()*7))%24;const minute=Math.floor(random()*60);
  const recorded=new Date(Date.now()-day*86_400_000+hour*3_600_000+minute*60_000).toISOString().slice(0,19).replace('T',' ');
  const gpuUtil=Math.round((25+random()*70)*100)/100;const cpuUtil=Math.round((20+random()*75)*100)/100;
  usageRows.push([jobId,gpuId,recorded,gpuUtil,Math.round((8+random()*30)*100)/100,cpuUtil,16+random()*48,40+random()*200,60]);
}
await insertBatch(adminPool,'resource_usage',['job_id','gpu_id','recorded_at','gpu_util_pct','gpu_mem_used_gb','cpu_util_pct','ram_used_gb','storage_used_gb','interval_seconds'],usageRows);

const docs=Array.from({length:2000},(_,i)=>{
  const template=i%eventTemplates.length;const event=eventTemplates[template]!;const projectIndex=i%projectIds.length;const jobId=jobIds[i%jobIds.length]!;const gpu=(gpus as Array<any>)[i%usageGpuIds.length]!;
  return {event_id:seededUuid(i+1),timestamp:new Date(Date.now()-(i%30)*86_400_000),user_id:projectOwners[projectIndex]!.user_id,project_id:projectIds[projectIndex]!,server_id:Number(gpu.server_id),job_id:jobId,event_type:event[0],severity:event[1],message:event[2],metadata:{seed_index:i,run_number:Math.floor(i/8)},embedding:vectors[template],embedding_model:'Xenova/all-MiniLM-L6-v2'};
});
await events.insertMany(docs,{ordered:false});
await appPool.end();await adminPool.end();await closeMongo();
console.log(JSON.stringify({users:roles.length,servers:serverRows.length,gpus:gpuRows.length,projects:projectIds.length,models:modelRows.length,datasets:datasetRows.length,experiments:experimentRows.length,jobs:jobIds.length,usage:usageRows.length,monitoringEvents:docs.length,demoPassword:password},null,2));
