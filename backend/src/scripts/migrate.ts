import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import canonicalize from 'canonicalize';
import type { RowDataPacket } from 'mysql2/promise';
import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { splitSql } from './sqlSplitter.js';

const migrationDir=process.env.MIGRATION_DIR ?? path.resolve(process.cwd(),'../db/mysql');
interface MigrationRow extends RowDataPacket { version:string }
interface CountRow extends RowDataPacket { n:number }
const connection=await mysql.createConnection({host:env.MYSQL_HOST,port:env.MYSQL_PORT,database:env.MYSQL_DATABASE,user:env.MYSQL_MIGRATOR_USER,password:env.MYSQL_MIGRATOR_PASSWORD,multipleStatements:false,timezone:'Z',dateStrings:true});

await connection.execute(`CREATE TABLE IF NOT EXISTS schema_migrations(
  version VARCHAR(120) PRIMARY KEY,
  applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
const files=(await readdir(migrationDir)).filter(name=>/^\d{3}_.+\.sql$/.test(name)).sort();
for(const file of files){
  const [applied]=await connection.execute<MigrationRow[]>('SELECT version FROM schema_migrations WHERE version=?',[file]);
  if(applied.length)continue;
  console.log(`Applying ${file}`);
  const sql=await readFile(path.join(migrationDir,file),'utf8');
  for(const statement of splitSql(sql))await connection.query(statement);
  await connection.execute('INSERT INTO schema_migrations(version) VALUES(?)',[file]);
}

const [auditRows]=await connection.execute<CountRow[]>('SELECT COUNT(*) AS n FROM audit_log');
if(Number(auditRows[0]?.n??0)===0){
  const date=new Date().toISOString().slice(0,23);
  const createdAt=`${date}000Z`;
  const storedAt=`${date.replace('T',' ')}000`;
  const record={audit_id:1,actor_id:null,action:'GENESIS',entity_type:'audit_log',entity_id:'0',created_at:createdAt,payload:{message:'AI-CRMS audit chain initialized'}};
  const json=canonicalize(record);if(!json)throw new Error('Unable to canonicalize genesis record.');
  const currHash=createHash('sha256').update('0'.repeat(64)+json,'utf8').digest('hex');
  await connection.execute('INSERT INTO audit_log(audit_id,actor_id,action,entity_type,entity_id,created_at,payload,prev_hash,curr_hash) VALUES(?,NULL,?,?,?,?,?,?,?)',[1,'GENESIS','audit_log','0',storedAt,JSON.stringify(record.payload),'0'.repeat(64),currHash]);
  console.log(`Created audit genesis hash ${currHash}`);
}
await connection.end();
console.log(`Migrations complete (${files.length} checked).`);
