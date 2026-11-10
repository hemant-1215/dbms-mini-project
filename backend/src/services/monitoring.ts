import { randomUUID } from 'node:crypto';
import { events } from '../db/mongo.js';
import { embedText } from './embeddings.js';

export type EventInput = {
  user_id?: number | null; project_id?: number | null; server_id?: number | null; job_id?: number | null;
  event_type: string; severity: 'debug'|'info'|'warning'|'error'|'critical'; message: string; metadata?: Record<string, unknown>;
};

export async function writeMonitoringEvent(input: EventInput): Promise<void> {
  const embedding = await embedText(input.message);
  await events.insertOne({
    event_id: randomUUID(), timestamp: new Date(), user_id: input.user_id ?? null,
    project_id: input.project_id ?? null, server_id: input.server_id ?? null, job_id: input.job_id ?? null,
    event_type: input.event_type, severity: input.severity, message: input.message,
    metadata: input.metadata ?? {}, embedding, embedding_model: 'Xenova/all-MiniLM-L6-v2'
  });
}

export async function ensureMonitoringSchema(): Promise<void> {
  const names = await events.db!.listCollections({ name: 'monitoring_events' }).toArray();
  if (!names.length) {
    await events.db!.createCollection('monitoring_events', {
      validator: { $jsonSchema: {
        bsonType: 'object', required: ['event_id','timestamp','event_type','severity','message','metadata','embedding','embedding_model'],
        properties: {
          event_id: { bsonType: 'string' }, timestamp: { bsonType: 'date' },
          user_id: { bsonType: ['int','long','null'] }, project_id: { bsonType: ['int','long','null'] },
          server_id: { bsonType: ['int','long','null'] }, job_id: { bsonType: ['int','long','null'] },
          event_type: { bsonType: 'string' }, severity: { enum: ['debug','info','warning','error','critical'] },
          message: { bsonType: 'string' }, metadata: { bsonType: 'object' },
          embedding: { bsonType: 'array', minItems: 384, maxItems: 384, items: { bsonType: 'double' } },
          embedding_model: { enum: ['Xenova/all-MiniLM-L6-v2'] }
        }
      } }, validationLevel: 'strict', validationAction: 'error'
    });
  }
  await events.createIndex({ timestamp: -1 });
  await events.createIndex({ job_id: 1, timestamp: -1 });
  await events.createIndex({ project_id: 1, severity: 1, timestamp: -1 });
  const indexes=await events.listSearchIndexes().toArray();
  if(!indexes.some((index)=>index.name==='monitoring_vector')){
    await events.createSearchIndex({
      name:'monitoring_vector',type:'vectorSearch',definition:{fields:[
        {type:'vector',path:'embedding',numDimensions:384,similarity:'cosine'},
        {type:'filter',path:'project_id'},{type:'filter',path:'severity'},{type:'filter',path:'event_type'}
      ]}
    });
  }
}
