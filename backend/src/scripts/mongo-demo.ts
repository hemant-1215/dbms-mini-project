import assert from 'node:assert/strict';
import { closeMongo, connectMongo, events, monitoringDb } from '../db/mongo.js';

try{
  await connectMongo();
  const ping=await monitoringDb.command({ping:1});
  const documentCount=await events.countDocuments({});
  const indexes=await events.indexes();
  const eventTypes=await events.aggregate<{_id:string;count:number}>([
    {$group:{_id:'$event_type',count:{$sum:1}}},{$sort:{count:-1,_id:1}}
  ]).toArray();
  assert.equal(ping.ok,1);
  assert.ok(indexes.some((index)=>index.key?.timestamp===-1));
  await assert.rejects(events.insertOne({event_id:'invalid-demo-document',message:'missing required fields'}));
  const searchIndexes=await events.listSearchIndexes().toArray() as Array<{name:string;type?:string;status?:string}>;
  const vectorIndex=searchIndexes.find((index)=>index.name==='monitoring_vector');
  assert.ok(vectorIndex,'monitoring_vector index exists');
  console.log(JSON.stringify({ping:ping.ok,collection:events.collectionName,documents:documentCount,indexes:indexes.map(({name,key})=>({name,key})),eventTypes,invalidDocumentRejected:true,vectorIndex},null,2));
}finally{
  await closeMongo();
}
