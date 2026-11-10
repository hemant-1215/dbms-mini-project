import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { adminPool } from '../db/pools.js';

const cases=[
  {name:'jobs_by_status_priority',withIndex:'SELECT job_id FROM training_jobs FORCE INDEX(ix_jobs_status_priority) WHERE status=? ORDER BY priority DESC,submitted_at LIMIT 100',withoutIndex:'SELECT job_id FROM training_jobs IGNORE INDEX(ix_jobs_status_priority) WHERE status=? ORDER BY priority DESC,submitted_at LIMIT 100',params:['queued']},
  {name:'usage_by_job_time',withIndex:'SELECT usage_id FROM resource_usage FORCE INDEX(ix_usage_job_time) WHERE job_id=? AND recorded_at>=UTC_TIMESTAMP()-INTERVAL 30 DAY',withoutIndex:'SELECT usage_id FROM resource_usage IGNORE INDEX(ix_usage_job_time) WHERE job_id=? AND recorded_at>=UTC_TIMESTAMP()-INTERVAL 30 DAY',params:[1]},
  {name:'history_by_job_time',withIndex:'SELECT history_id FROM job_status_history FORCE INDEX(ix_history_job_time) WHERE job_id=? ORDER BY changed_at DESC LIMIT 10',withoutIndex:'SELECT history_id FROM job_status_history IGNORE INDEX(ix_history_job_time) WHERE job_id=? ORDER BY changed_at DESC LIMIT 10',params:[1]}
];
const iterations=Math.max(5,Math.min(100,Number(process.env.BENCHMARK_ITERATIONS??30)));
const med=(values:number[])=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)]!;
const rows:Array<{case:string;mode:string;iterations:number;median_ms:number;rows:number}> = [];
try{
  for(const item of cases){
    for(const [mode,sql] of [['with_index',item.withIndex],['without_index',item.withoutIndex]] as const){
      const times:number[]=[];let rowCount=0;
      await adminPool.execute(sql,item.params);
      for(let i=0;i<iterations;i++){
        const start=performance.now();
        const [result]=await adminPool.execute(sql,item.params);
        times.push(performance.now()-start);rowCount=(result as unknown[]).length;
      }
      rows.push({case:item.name,mode,iterations,median_ms:Number(med(times).toFixed(3)),rows:rowCount});
    }
  }
  const directory=resolve(process.cwd(),'..','benchmark','results');
  await mkdir(directory,{recursive:true});
  const stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
  const csv=['case,mode,iterations,median_ms,rows',...rows.map((row)=>`${row.case},${row.mode},${row.iterations},${row.median_ms},${row.rows}`)].join('\n')+'\n';
  const path=resolve(directory,`index-benchmark-${stamp}.csv`);
  await writeFile(path,csv,{flag:'wx'});
  console.log(JSON.stringify({iterations,output:path,results:rows},null,2));
}finally{await adminPool.end();}
