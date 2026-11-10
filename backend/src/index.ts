import { app } from './app.js';
import { env } from './config/env.js';
import { appPool } from './db/pools.js';
import { connectMongo } from './db/mongo.js';
import { ensureMonitoringSchema } from './services/monitoring.js';

async function main():Promise<void>{
  await appPool.query('SELECT 1');
  await connectMongo();
  await ensureMonitoringSchema();
  app.listen(env.API_PORT,'0.0.0.0',()=>console.log(`AI-CRMS API listening on ${env.API_PORT}`));
}

main().catch((error)=>{console.error('API startup failed.',error);process.exitCode=1;});
