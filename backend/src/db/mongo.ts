import { MongoClient } from 'mongodb';
import { env } from '../config/env.js';

export const mongoClient = new MongoClient(env.MONGODB_URI);
export const monitoringDb = mongoClient.db(env.MONGODB_DATABASE);
export const events = monitoringDb.collection('monitoring_events');

export async function connectMongo(): Promise<void> {
  await mongoClient.connect();
}

export async function closeMongo(): Promise<void> {
  await mongoClient.close();
}
