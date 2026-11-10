import { describe, expect, it } from 'vitest';
import { splitSql } from '../src/scripts/sqlSplitter.js';

describe('splitSql',()=>{
  it('keeps stored program bodies together when the delimiter changes',()=>{
    const sql='-- migration comment\nDELIMITER $$\nCREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END$$\nDELIMITER ;\nCREATE TABLE t(id INT);';
    expect(splitSql(sql)).toEqual(['CREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END','CREATE TABLE t(id INT)']);
  });
});
