// backend/scripts/seed.js
import { pool } from '../db.js';
import { passwordHash } from '../auth.js';

const PASSWORD = process.env.LAB_PASSWORD;
if (!PASSWORD || PASSWORD.length < 12) {
  console.error('Set $env:LAB_PASSWORD (12+ characters) before seeding.');
  process.exit(1);
}

const users = [
  { username: 'nurse1',  name: 'Nurse One',  role: 'nurse'  },
  { username: 'doctor1', name: 'Doctor One', role: 'doctor' },
];
const patients = [
  { id: '2026-00001', name: 'Fictional Student A', category: 'student' },
  { id: '2026-00002', name: 'Fictional Student B', category: 'student' },
  { id: 'E-0001',     name: 'Fictional Employee C', category: 'employee' },
];

for (const u of users) {
  await pool.execute(
    `INSERT INTO users (username, name, role, password_hash)
     VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), role=VALUES(role)`,
    [u.username, u.name, u.role, passwordHash(PASSWORD)]
  );
  console.log(`user ${u.username} (${u.role}) ready`);
}
for (const p of patients) {
  await pool.execute(
    `INSERT INTO patients (id, name, category) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE name=VALUES(name)`,
    [p.id, p.name, p.category]
  );
  console.log(`patient ${p.id} ready`);
}
console.log('Seed complete. No real personal data was used.');
await pool.end();