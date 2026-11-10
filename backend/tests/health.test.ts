import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV ??= 'test';
process.env.MYSQL_PASSWORD ??= 'test-app-password';
process.env.MYSQL_ADMIN_PASSWORD ??= 'test-admin-password';
process.env.MYSQL_MIGRATOR_PASSWORD ??= 'test-migrator-password';
process.env.MYSQL_READONLY_PASSWORD ??= 'test-readonly-password';
process.env.MONGODB_URI ??= 'mongodb://localhost:27017';
process.env.JWT_SECRET ??= 'test-jwt-secret-with-at-least-32-characters';
process.env.INGEST_TOKEN ??= 'test-ingest-token-with-at-least-32-characters';

const { app } = await import('../src/app.js');

describe('GET /api/health',()=>{
  it('returns a live service response without database mock values',async()=>{
    const response=await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({status:'ok'});
  });
});
