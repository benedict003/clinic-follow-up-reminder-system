// backend/scripts/lab-sql.js  — usage: node --env-file=.env scripts/lab-sql.js "SELECT ..."
import { pool } from '../db.js';
const sql = process.argv.slice(2).join(' ').trim();
if (!sql) { console.error('Pass a SQL statement.'); process.exit(1); }
try {
  const [rows] = await pool.query(sql);
  console.log(JSON.stringify(rows, null, 2));
} catch (e) {
  console.error('SQL error:', e.code || '', e.message); process.exitCode = 1;
} finally { await pool.end(); }