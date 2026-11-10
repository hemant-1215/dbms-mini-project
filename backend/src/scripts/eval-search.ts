import { closeMongo, events, connectMongo } from '../db/mongo.js';
import { embedText } from '../services/embeddings.js';

const cases=[
  ['gpu_failure','uncorrectable GPU memory or hardware ECC problem while training'],
  ['gpu_failure','accelerator hardware reported a fatal memory fault during a model run'],
  ['gpu_failure','GPU device reported an uncorrectable ECC error'],
  ['oom','out of video memory allocating attention tensors'],
  ['oom','training process exceeded available GPU memory'],
  ['oom','CUDA allocation failed because the accelerator ran out of memory'],
  ['high_utilization','GPU utilization stayed above 95 percent for fifteen minutes'],
  ['high_utilization','accelerator has been busy almost continuously'],
  ['high_utilization','sustained very high GPU load warning'],
  ['job_started','training job was scheduled and began running'],
  ['job_started','worker started the assigned training task'],
  ['job_started','the model training process entered running state'],
  ['job_completed','training finished successfully and metrics were uploaded'],
  ['job_completed','worker completed the experiment and saved the results'],
  ['job_completed','model run ended successfully'],
  ['job_failed','training stopped after a worker heartbeat timeout'],
  ['job_failed','job failed because the compute worker stopped responding'],
  ['job_failed','worker did not send its heartbeat and the run failed'],
  ['scheduler_decision','scheduler chose the least loaded server with enough GPU memory'],
  ['scheduler_decision','resource allocator picked a suitable accelerator node'],
  ['scheduler_decision','job placement decision selected an available GPU server'],
  ['node_heartbeat','compute node heartbeat received and resources are healthy'],
  ['node_heartbeat','worker host sent its periodic health signal'],
  ['node_heartbeat','node is alive and reported a healthy resource status'],
  ['gpu_failure','GPU memory controller found an uncorrectable hardware error'],
  ['oom','not enough GPU memory remained for the model tensors'],
  ['high_utilization','GPU stayed busy above the warning threshold'],
  ['job_started','scheduled workload has now started on its allocated GPU'],
  ['job_completed','the training run completed and uploaded experiment metrics'],
  ['job_failed','worker timed out and the training job was marked failed']
] as const;

await connectMongo();
const deadline=Date.now()+180_000;
let ready=false;
while(Date.now()<deadline){
  const indexes=await events.listSearchIndexes().toArray() as Array<{name:string;status?:string}>;
  const index=indexes.find((item)=>item.name==='monitoring_vector');
  if(index?.status==='READY'){ready=true;break;}
  if(index?.status==='FAILED')throw new Error(`Vector index failed: ${JSON.stringify(index)}`);
  await new Promise((resolve)=>setTimeout(resolve,2_000));
}
if(!ready)throw new Error('Vector index did not become READY within 180 seconds.');

let precision=0,recall=0,reciprocalRank=0;
for(const [expectedType,prompt] of cases){
  const vector=await embedText(prompt);
  const hits=await events.aggregate<{event_type:string}>([
    {$vectorSearch:{index:'monitoring_vector',path:'embedding',queryVector:vector,numCandidates:100,limit:5}},
    {$project:{event_type:1,_id:0,score:{$meta:'vectorSearchScore'}}}
  ]).toArray();
  const relevant=hits.map((hit)=>hit.event_type===expectedType);
  const totalRelevant=await events.countDocuments({event_type:expectedType});
  const found=relevant.filter(Boolean).length;
  precision+=found/5;
  recall+=found/Math.max(1,Math.min(5,totalRelevant));
  const first=relevant.indexOf(true);
  reciprocalRank+=first<0?0:1/(first+1);
}
console.log(JSON.stringify({
  queries:cases.length,
  precisionAt5:Number((precision/cases.length).toFixed(4)),
  recallAt5:Number((recall/cases.length).toFixed(4)),
  meanReciprocalRank:Number((reciprocalRank/cases.length).toFixed(4)),
  relevance:'Seeded synthetic labels use event_type as the positive class; recall@5 is normalized by min(5, positive documents in that class).'
},null,2));
await closeMongo();
