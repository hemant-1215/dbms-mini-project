import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

const GENESIS_PREV = '0'.repeat(64);
interface HeadRow extends RowDataPacket { audit_id:number;curr_hash:string }
interface NextRow extends RowDataPacket { next_id:number }
const mysqlTimestamp = (date = new Date()): { stored: string; canonical: string } => {
  const iso = date.toISOString();
  const base = iso.slice(0, 23);
  const stored = `${base.replace('T', ' ')}000`;
  return { stored, canonical: `${base}000Z` };
};

export async function appendAudit(connection: PoolConnection, input: {
  actorId: number | null; action: string; entityType: string; entityId: string; payload: unknown;
}): Promise<void> {
  await connection.query('SELECT lock_id FROM audit_chain_lock WHERE lock_id=1 FOR UPDATE');
  const [rows] = await connection.query<HeadRow[]>(
    'SELECT audit_id,curr_hash FROM audit_log ORDER BY audit_id DESC LIMIT 1'
  );
  const last = rows[0];
  const [nextRows] = await connection.query<NextRow[]>(
    "SELECT AUTO_INCREMENT AS next_id FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME='audit_log'",
    [connection.config.database]
  );
  const auditId = Number(nextRows[0]?.next_id ?? 1);
  const { stored, canonical } = mysqlTimestamp();
  const record = {
    audit_id: auditId,
    actor_id: input.actorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    created_at: canonical,
    payload: input.payload
  };
  const json = canonicalize(record);
  if (!json) throw new Error('AUDIT_CANONICALIZATION_FAILED');
  const prevHash = last?.curr_hash ?? GENESIS_PREV;
  const currHash = createHash('sha256').update(prevHash + json, 'utf8').digest('hex');
  const [result] = await connection.execute(
    'INSERT INTO audit_log(audit_id,actor_id,action,entity_type,entity_id,created_at,payload,prev_hash,curr_hash) VALUES (?,?,?,?,?,?,?,?,?)',
    [auditId, input.actorId, input.action, input.entityType, input.entityId, stored, JSON.stringify(input.payload), prevHash, currHash]
  );
  if ('insertId' in result && Number(result.insertId) !== auditId) throw new Error('AUDIT_SEQUENCE_RACE');
}

export function auditHash(record: Record<string, unknown>, previousHash: string): string {
  const json = canonicalize(record);
  if (!json) throw new Error('AUDIT_CANONICALIZATION_FAILED');
  return createHash('sha256').update(previousHash + json, 'utf8').digest('hex');
}
