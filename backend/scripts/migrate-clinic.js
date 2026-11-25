// backend/scripts/migrate-clinic.js
//
// Applies schema-clinic.sql. Every statement in it is idempotent, so running
// this twice is harmless and no Module 13/14 data is touched.
//   usage: node --env-file=.env scripts/migrate-clinic.js
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, '..', 'schema-clinic.sql'), 'utf8');

// mysql2 can run several statements only with multipleStatements on the pool,
// which the app pool deliberately does not set. Split on the semicolons that end
// a statement, keeping comments out of the way.
const statements = sql
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map(s => s.trim())
  .filter(Boolean);

try {
  for (const statement of statements) {
    try {
      await pool.query(statement);
      console.log('ok   ', statement.split('\n')[0].slice(0, 72));
    } catch (e) {
      console.error('fail ', e.code || '', e.message);
      console.error(statement.slice(0, 200));
      process.exitCode = 1;
    }
  }
  const [cols] = await pool.query('SHOW COLUMNS FROM follow_ups');
  console.log('follow_ups columns:', cols.map(c => c.Field).join(', '));
  const [ev] = await pool.query('SHOW TABLES LIKE "follow_up_events"');
  console.log('follow_up_events:', ev.length ? 'present' : 'MISSING');
} finally {
  await pool.end();
}
