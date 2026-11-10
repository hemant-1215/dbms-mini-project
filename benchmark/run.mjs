import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const envFile=resolve(root,'.env');
if(existsSync(envFile))process.loadEnvFile(envFile);
if(!process.env.MYSQL_HOST||process.env.MYSQL_HOST==='mysql')process.env.MYSQL_HOST='127.0.0.1';
const runner=resolve(root,'backend','node_modules','tsx','dist','cli.mjs');
const script=resolve(root,'backend','src','scripts','benchmark.ts');
const result=spawnSync(process.execPath,[runner,script],{cwd:resolve(root,'backend'),stdio:'inherit',env:process.env});
if(result.error)throw result.error;
process.exit(result.status??1);
