import { describe, expect, it } from 'vitest';
import { auditHash } from '../src/services/audit.js';

describe('auditHash',()=>{
  it('uses canonical JSON so key order does not affect the hash',()=>{
    const left={audit_id:2,action:'CREATE',entity_id:'9'};
    const right={entity_id:'9',action:'CREATE',audit_id:2};
    const prev='0'.repeat(64);
    expect(auditHash(left,prev)).toBe(auditHash(right,prev));
  });
  it('changes when the previous hash or record changes',()=>{
    const record={audit_id:2,action:'CREATE'};
    expect(auditHash(record,'0'.repeat(64))).not.toBe(auditHash(record,'1'.repeat(64)));
    expect(auditHash(record,'0'.repeat(64))).not.toBe(auditHash({...record,action:'DELETE'},'0'.repeat(64)));
  });
});
