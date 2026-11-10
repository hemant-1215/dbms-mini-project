import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';
import { env } from '../config/env.js';

const common = {
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT,
  database: env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 12,
  timezone: 'Z',
  dateStrings: true,
  decimalNumbers: false,
  supportBigNumbers: true,
  bigNumberStrings: true
};

export const appPool: Pool = mysql.createPool({ ...common, user: env.MYSQL_USER, password: env.MYSQL_PASSWORD });
export const adminPool: Pool = mysql.createPool({ ...common, user: env.MYSQL_ADMIN_USER, password: env.MYSQL_ADMIN_PASSWORD });

export async function inTransaction<T>(pool: Pool, run: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await run(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
