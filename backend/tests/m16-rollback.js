// backend/tests/m16-rollback.js
//
// Module 16: rehearse rollback and recovery.
//
// The module asks for a rollback plan that has been practised, not imagined. This
// runs the whole cycle against the isolated Module 16 database:
//
//   1. take a backup                       (the artifact a restore needs)
//   2. fingerprint the data                (counts + a checksum per table)
//   3. deploy a deliberately bad change     (a destructive migration plus a write)
//   4. confirm the damage is detectable     (fingerprint differs)
//   5. restore from the backup
//   6. confirm the data matches step 2      (the only meaningful proof)
//
// It reports how long steps 5-6 took: that is the recovery time objective for this
// workload, measured rather than promised.
//
//   node --env-file=.env tests/m16-rollback.js
import mysql from 'mysql2/promise';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, scryptSync } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const backendDir = join(here, '..');
const repoDir = join(backendDir, '..');
const OUT = join(repoDir, 'docs', 'lab', 'module16', 'evidence', '05-rollback');
const DB = 'clinic_followup_m16';
const DUMP_DIR = 'C:\\xampp\\mysql\\bin';

const dbCfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

mkdirSync(OUT, { recursive: true });
const report = { ranAt: new Date().toISOString(), database: DB, steps: [] };
const step = (name, data) => {
  report.steps.push({ name, at: new Date().toISOString(), ...data });
  console.log(`  ${name}: ${JSON.stringify(data)}`);
};

/** Counts plus a content hash per table: a restore that loses one row must fail. */
async function fingerprint(conn) {
  const [tables] = await conn.query('SHOW TABLES');
  const names = tables.map((t) => Object.values(t)[0]).sort();
  const out = {};
  for (const t of names) {
    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    // ORDER BY the primary key so the hash does not depend on storage order.
    const [rows] = await conn.query(`SELECT * FROM \`${t}\` ORDER BY 1`);
    const hash = createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16);
    out[t] = { rows: Number(n), hash };
  }
  return out;
}

function dump(file) {
  // Capture stdout and write it ourselves. Routing through cmd.exe with ">" broke
  // on a quoted path, and a backup path that only works sometimes is not a backup.
  // --single-transaction keeps the dump consistent without locking the tables.
  const out = execFileSync(join(DUMP_DIR, 'mysqldump.exe'), [
    '-u', dbCfg.user,
    '-h', dbCfg.host, '-P', String(dbCfg.port),
    '--single-transaction', '--routines', '--databases', DB,
  ], { maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(file, out);
  return statSync(file).size;
}

async function restore(file) {
  execFileSync(join(DUMP_DIR, 'mysql.exe'), [
    '-u', dbCfg.user, '-h', dbCfg.host, '-P', String(dbCfg.port),
  ], { input: readFileSync(file), maxBuffer: 64 * 1024 * 1024 });
}

async function main() {
  console.log(`Module 16 rollback rehearsal · ${DB}`);
  let conn = await mysql.createConnection({ ...dbCfg, database: DB, multipleStatements: true });

  const backup = join(OUT, 'backup.sql');
  const bytes = dump(backup);
  step('1.backup', { file: 'backup.sql', bytes });

  const before = await fingerprint(conn);
  step('2.fingerprint_before', {
    tables: Object.keys(before).length,
    followUps: before.follow_ups?.rows ?? null,
    followUpsHash: before.follow_ups?.hash ?? null,
  });

  // A destructive change of the kind a bad migration makes: drop a column the
  // application needs, and write rows that cannot be trusted afterwards.
  await conn.query('ALTER TABLE follow_ups DROP COLUMN close_note');
  await conn.query("UPDATE follow_ups SET close_outcome = 'corrupted' LIMIT 25");
  await conn.query("INSERT INTO follow_up_events (follow_up_id, kind, outcome, note, actor_id, actor_name, actor_role, created_at) VALUES (1,'note','x','row written by the bad deploy',NULL,'bad-deploy','system',NOW())");
  const during = await fingerprint(conn);
  const detectable = JSON.stringify(before) !== JSON.stringify(during);
  step('3.bad_change_applied', {
    changed: { follow_ups: before.follow_ups.rows !== during.follow_ups?.rows || before.follow_ups.hash !== during.follow_ups?.hash,
      follow_up_events: before.follow_up_events.hash !== during.follow_up_events.hash },
    detectable,
  });
  if (!detectable) throw new Error('the damage was not detectable, so the rehearsal proves nothing');
  await conn.end();

  // ── rollback ────────────────────────────────────────────────────────────
  const t0 = Date.now();
  await restore(backup);
  const restoreMs = Date.now() - t0;

  conn = await mysql.createConnection({ ...dbCfg, database: DB });
  const after = await fingerprint(conn);
  const restoredMs = Date.now() - t0;
  const matches = JSON.stringify(before) === JSON.stringify(after);
  step('4.restored', {
    restoreCommandMs: restoreMs,
    restoreAndVerifyMs: restoredMs,
    matchesBefore: matches,
    tables: Object.keys(after).length,
    followUps: after.follow_ups?.rows ?? null,
  });
  if (!matches) {
    const diff = Object.keys(before).filter((t) => JSON.stringify(before[t]) !== JSON.stringify(after[t]));
    throw new Error(`restore did not reproduce the data; tables differing: ${diff.join(', ')}`);
  }

  // The column the bad migration dropped must be back, and the planted row gone.
  const [cols] = await conn.query("SHOW COLUMNS FROM follow_ups LIKE 'close_note'");
  const [planted] = await conn.query("SELECT COUNT(*) AS n FROM follow_up_events WHERE note = 'row written by the bad deploy'");
  const [corrupted] = await conn.query("SELECT COUNT(*) AS n FROM follow_ups WHERE close_outcome = 'corrupted'");
  step('5.schema_and_data_verified', {
    closeNoteColumnBack: cols.length === 1,
    plantedRowsRemaining: Number(planted[0].n),
    corruptedRowsRemaining: Number(corrupted[0].n),
  });
  if (cols.length !== 1 || Number(planted[0].n) !== 0 || Number(corrupted[0].n) !== 0) {
    throw new Error('restore left residue behind');
  }

  await conn.end();
  report.recoveryTimeMs = restoredMs;
  report.passed = true;
  console.log(`\nPASS  recovered in ${restoredMs} ms (restore alone ${restoreMs} ms)`);
}

main()
  .catch((e) => {
    report.passed = false;
    report.error = String(e?.message || e);
    console.error('FAILED:', report.error);
  })
  .finally(() => {
    writeFileSync(join(OUT, 'rollback.json'), JSON.stringify(report, null, 2));
    const rows = report.steps.map((s) => `| ${s.name} | \`${JSON.stringify(s).slice(0, 300)}\` |`).join('\n');
    writeFileSync(join(OUT, 'README.md'),
      `# Rollback rehearsal\n\nRan ${report.ranAt} against \`${DB}\`.\n\n`
      + `**${report.passed ? 'PASS' : 'FAIL'}** — recovery time ${report.recoveryTimeMs ?? 'n/a'} ms.\n\n`
      + '| Step | Record |\n| --- | --- |\n' + rows + '\n');
    console.log(`evidence: ${OUT}`);
    process.exit(report.passed ? 0 : 1);
  });
