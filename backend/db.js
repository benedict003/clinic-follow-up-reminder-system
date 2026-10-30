// backend/db.js
import mysql from 'mysql2/promise';
import { cfg } from './config.js';

export const pool = mysql.createPool({
  ...cfg.db,
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true,
  dateStrings: true,
});

export async function withTx(work) {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const out = await work(c);
    await c.commit();
    return out;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}