import { z } from 'zod';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

for (const candidate of [resolve(process.cwd(),'.env'),resolve(process.cwd(),'..','.env')]) {
  if (existsSync(candidate)) { process.loadEnvFile(candidate); break; }
}
if(!process.env.MYSQL_PASSWORD&&process.env.MYSQL_APP_PASSWORD)process.env.MYSQL_PASSWORD=process.env.MYSQL_APP_PASSWORD;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  MYSQL_HOST: z.string().default('localhost'),
  MYSQL_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  MYSQL_DATABASE: z.string().default('ai_crms'),
  MYSQL_USER: z.string().default('crms_app'),
  MYSQL_PASSWORD: z.string().min(1),
  MYSQL_ADMIN_USER: z.string().default('crms_admin'),
  MYSQL_ADMIN_PASSWORD: z.string().min(1),
  MYSQL_MIGRATOR_USER: z.string().default('crms_migrator'),
  MYSQL_MIGRATOR_PASSWORD: z.string().min(1),
  MYSQL_READONLY_USER: z.string().default('crms_readonly'),
  MYSQL_READONLY_PASSWORD: z.string().min(1),
  MONGODB_URI: z.string().min(1),
  MONGODB_DATABASE: z.string().default('ai_crms_monitoring'),
  JWT_SECRET: z.string().min(32),
  INGEST_TOKEN: z.string().min(32),
  MODEL_ID: z.string().default('Xenova/all-MiniLM-L6-v2')
});

export const env = schema.parse(process.env);
