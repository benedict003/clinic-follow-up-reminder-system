# Clinic Follow-Up Reminder System

A clinical follow-up register for a university clinic: schedule a follow-up, work a
daily board of who is late and who is due, record what happened, and disclose the
minimum a partner needs over an encrypted channel. Node.js + Express on the back,
Flutter Web on the front, everything on loopback with fictional data.

- **Backend:** Node.js, Express 5 (ESM), MySQL/MariaDB
- **Client:** Flutter Web (release build served same-origin at `/app/`)
- **Nothing real:** no provider, no live credential, fictional patients only

## Modules

| Module | What it adds | Folder | Tag |
| --- | --- | --- | --- |
| 13 | Durable reminder queue: enqueue, retry, escalate, audit every attempt | `docs/lab/module13/` | `module13` |
| 14 | Secure exchange: a minimised record sealed for one partner, with a receipt | `docs/lab/module14/` | `module14` |
| 15 | Integration testing and security hardening of everything above | `Module15/`, `docs/lab/module15/` | `module15` |
| 16 | Performance, reliability and deployment evaluation: a measured workload, readiness vs liveness, compression, rollback rehearsal | `Module16/`, `docs/lab/module16/` | `module16` |

Each module folder holds three documents: the report, the evidence portfolio and
an operational manual. The working evidence (runs, captures, logs) lives under
`docs/lab/moduleNN/evidence/`.

### Module 16 at a glance

| | Result |
| --- | --- |
| Workload | `backend/tests/m16-perf.js` — 5 read journeys, concurrency 1/8/32, 20 s soak |
| Read path | board p95 4.60 ms, record p95 2.38 ms, **0 errors** at every level |
| Saturation | throughput rises only 1.19x from 8 to 32 clients — the ceiling, reported as a failed criterion |
| First load | 8.7 MB on disk, **2.65 MB on the wire** (68% saved), app loads with no errors |
| Reliability | readiness 503 in 4 ms vs liveness 200 with the database gone; SIGTERM drains in 112 ms |
| Rollback | rehearsed: damage detected, data restored exactly, **179 ms** on 400 follow-ups |

```powershell
cd backend
node --env-file=.env tests/m16-perf.js --phase full --label 07-review
node --env-file=.env tests/m16-rollback.js
```

Verdict and conditions: `docs/lab/module16/ROLLBACK.md`. Monitoring map: `MONITORING.md`.

### Module 15 at a glance

| | Result |
| --- | --- |
| Collection | `backend/tests/m15-collection.js` — 37 cases, 9 topics |
| Baseline | 23/36 passed, failures kept unedited in `docs/lab/module15/evidence/01-baseline/` |
| Hardened | 37/37 passed, zero regressions |
| Defects | 11 recorded in `docs/lab/module15/DEFECTS.md`, two of them pre-existing from Module 14 |
| Flutter tests | 20 (`flutter test`) |

Run it, then read `Module15/Module 15-operational-manual.docx` if something does not
behave as described:

```powershell
cd backend
node --env-file=.env tests/m15-collection.js --label 04-review
# expected: 37/37 passed, 0 failed
# evidence is written to ../docs/lab/module15/evidence/04-review/
```

The collection creates and drops its own database (`clinic_followup_m15`) and its
own API process, so it never touches `clinic_followup_lab` and can run while the
app is serving a demonstration.

---

The sections below describe the Module 13 workflow that the later modules build on.

## 1. Bounds and roles
### Bounds

| Setting | Default | Environment key |
|---|---|---|
| Automatic attempts | 4 | `INTEGRATION_MAX_ATTEMPTS` |
| Base backoff | 500 ms, doubling with 50 to 100 percent jitter | `INTEGRATION_BACKOFF_MS` |
| Backoff ceiling | 4000 ms | `INTEGRATION_MAX_BACKOFF_MS` |
| Per-call timeout | 3000 ms | `INTEGRATION_TIMEOUT_MS` |
| Poll interval | 2000 ms | `INTEGRATION_POLL_MS` |
| Stuck-job threshold | 60000 ms | `INTEGRATION_STUCK_MS` |
| Human retry extension | +2 attempts, hard cap 10 | code constant |
| Give-up action | `needs_human` plus a doctor alert | - |

### Terminal states

| State | Meaning | Retried automatically |
|---|---|---|
| `succeeded` | the gateway accepted the notification | never |
| `needs_human` | a person must decide | never, only a doctor action |
| `obsolete` | the work is no longer wanted | never, no alert raised |

### Roles

| Role | Can do |
|---|---|
| `nurse` | create follow-ups, queue reminders, view jobs and follow-ups |
| `doctor` | everything a nurse can do, plus retry with a reason and acknowledge alerts |

The role gate is enforced server-side. The UI hides the controls as well, but hiding a button is not a control.

---

## 2. Repository layout

```text
backend/
  server.js                middleware order, static /app, guarded imports, worker start
  routes.js                login, session, follow-ups, reminder-jobs
  clinical.js              Module 15: board, record, contact, reschedule, close, worklist
  security.js              Module 15: correlation id, error contract, headers, rate limit
  service.js               enqueue, claim, re-validate, classify, commit, escalate, retry
  worker.js                polled single-attempt worker, gateway call, structured log
  auth.js                  scrypt hashing, sessions, CSRF, origin check, role gate, dummy hash
  db.js                    connection pool with dateStrings, transaction helper
  config.js                bounded settings, loopback endpoint assertion
  schema.sql               Module 13 tables
  schema-14.sql            Module 14 exchange metadata (no plaintext, no keys)
  schema-clinic.sql        Module 15 clinical columns and follow_up_events
  .env.example             nonsecret values only
  .env.receiver.example    nonsecret, for the Module 14 partner receiver
  crypto/                  envelope seal/open, key loading, recordRef
  secure/                  Module 14 routes and the sealing sender
  scripts/
    mock-gateway.js        mode-switchable gateway on 4699
    seed.js                fictional users and patients
    migrate-clinic.js      applies schema-clinic.sql (npm run migrate:clinic)
    partner-receiver.js    Module 14 receiver on 4443
    secure-keys.js         generates the Module 14 key material
    lab-sql.js             one-query evidence helper
  tests/
    m15-collection.js      Module 15: 37-case integration collection
  public/app/              Flutter release build, served same-origin (not tracked)
lib/
  main.dart                routes table, session resume, 401 unwind, error widget
  app_routes.dart          named routes so browser history matches the screens
  api/clinic_api.dart      login, resume, signOut, public request()
  api/clinical_api.dart    board, record, contact, reschedule, close, patients, meta
  api/reminder_api.dart    jobs, detail, enqueue, retry, acknowledge, follow-ups
  api/secure_api.dart      Module 14 preview, send, history
  models/clinical.dart     typed follow-up, patient, event, worklist models
  screens/                 login, overview, board, record, patients, reminders, settings
  widgets/clinical.dart    due badge, status pill, follow-up card, future guard
  theme/app_theme.dart     palette and Material 3 theme
Module13/ Module14/ Module15/   report, evidence portfolio, operational manual per module
docs/lab/module13|14|15/  lab log, design records, evidence, captures
test/                      screen layout, model contracts, sign-in form
```

### Tables

| Table | Purpose |
|---|---|
| `users` | seed users, scrypt password hashes |
| `sessions` | opaque session ids, expiry |
| `patients` | fictional patients only |
| `follow_ups` | the register; status, due_date, version |
| `reminder_jobs` | durable queue: state, attempts, correlation id, idempotency key |
| `reminder_attempts` | insert-only audit trail, one row per call and per human action |
| `reminder_alerts` | role-addressed, unread while `read_at IS NULL` |
| `secure_outbox` | Module 14: metadata and a payload hash, never plaintext |
| `secure_inbox` | Module 14: what the receiver accepted, one row per message id |
| `follow_up_events` | Module 15: append-only clinical audit trail, actor snapshot per row |

### Ports

| Service | URL |
|---|---|
| Backend API | `http://localhost:3400` |
| Mock gateway | `http://127.0.0.1:4699` |
| Same-origin release build | `http://localhost:3400/app/` |
| Flutter dev server (optional) | `http://localhost:8080` |
| HTTPS listener (Module 14) | `https://localhost:3443` |
| Partner receiver (Module 14) | `https://localhost:4443` |

---

## 3. Requirements

| Tool | Version | Check |
|---|---|---|
| Node.js | 20 or later | `node --version` |
| npm | 10 or later | `npm --version` |
| Flutter SDK | 3.24 or later, web enabled | `flutter --version` |
| Chrome | current | - |
| MySQL | 8.0 or later | `mysql --version` |
| Git | any | `git --version` |

Record your exact versions here once, then quote them in the report:

```text
MySQL      :
Node       :
Flutter    :
Chrome     :
```

Enable web support once:

```bash
flutter config --enable-web
flutter devices
```

---

## 4. Setup

### 4.1 Install dependencies

```bash
cd backend
npm install
```

```bash
cd ..
flutter pub get
```

### 4.2 Create the database and schema

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS clinic_followup_lab CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
mysql -u root -p clinic_followup_lab < backend/schema.sql
mysql -u root -p -e "SHOW TABLES;" clinic_followup_lab
```

Module 13 installs the seven base tables. The later modules add their own files, and
both are safe to run more than once:

```bash
mysql -u root -p clinic_followup_lab < backend/schema-14.sql       # exchange metadata
cd backend && npm run migrate:clinic                               # clinical columns + audit trail
```

After all three, `SHOW TABLES` lists ten: the seven base tables plus `secure_outbox`,
`secure_inbox` and `follow_up_events`. On MySQL 8.4 or later you may need `--default-auth=mysql_native_password` for an older client; if `CREATE USER` was never run, `root` over a local socket is usually fine.

Confirm the engine and mode, because the code depends on both:

```bash
mysql -u root -p -e "SELECT VERSION() AS v, @@sql_mode AS mode, @@character_set_database AS cs;"
```

`sql_mode` should include `STRICT_TRANS_TABLES`. That is desired: the write paths slice long text explicitly, so out-of-range values should raise an error rather than be silently truncated.

### 4.3 Create the environment file

```bash
cd backend
cp .env.example .env
```

PowerShell equivalent: `Copy-Item .env.example .env`

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set at minimum:

```ini
PORT=<your port ex. 3100>
DB_HOST=127.0.0.1
DB_PORT=<your db port ex. 3306>
DB_USER=<your database user>
DB_PASSWORD=<your database password>
DB_NAME=<your database name>
SESSION_SECRET=<64 random hex characters from the command above>
INTEGRATION_ENDPOINT=http://127.0.0.1:4699/notify
INTEGRATION_MAX_ATTEMPTS=4
INTEGRATION_BACKOFF_MS=500
INTEGRATION_MAX_BACKOFF_MS=4000
INTEGRATION_TIMEOUT_MS=3000
INTEGRATION_POLL_MS=2000
INTEGRATION_STUCK_MS=60000
DEV_CORS=true
```

`DEV_CORS=false` is correct for the same-origin build. Set it to `true` only while running the Flutter dev server on port 8080, and restart the backend after changing it.

Verify the file is ignored **before** committing anything:

```bash
git check-ignore -v backend/.env
```

It must print a match. If it prints nothing, add `backend/.env` to `.gitignore` first.

### 4.4 Seed fictional data

```bash
cd backend
npm run seed
```

Windows PowerShell:

```powershell
$env:LAB_PASSWORD = "lab-password-2026"
npm run seed
```

The password must be 12 or more characters. It is supplied at run time and never written to disk.

This creates two users and three patients:

| Username | Role |
|---|---|
| `nurse1` | queue and view |
| `doctor1` | queue, view, retry, acknowledge |

Patients: `2026-00001` Fictional Student A, `2026-00002` Fictional Student B, `E-0001` Fictional Employee C.

The seed script does **not** create follow-ups.

### 4.5 Create follow-ups (required)

> **Do not skip this step.** Without it, `POST /api/reminder-jobs` returns 404 and no case can run. This is the single most common first failure.

Bash:

```bash
node --env-file=.env scripts/lab-sql.js \
  "INSERT INTO follow_ups (patient_id,due_date,reason,created_by,created_at)
   VALUES ('2026-00001',CURDATE(),'demo due today',1,UTC_TIMESTAMP(3))"
```

PowerShell, creating the full set for all fourteen cases:

```powershell
cd "C:\Users\lliam\StudioProjects\clinic_follow_up_reminder_system\backend"
function SQL([string]$q) { node --env-file=.env scripts/lab-sql.js $q }
SQL "DELETE FROM follow_ups"
function New-FollowUp([string]$patientId, [string]$due, [string]$reason) {
  SQL "INSERT INTO follow_ups (patient_id,due_date,reason,created_by,created_at)
       VALUES ('$patientId','$due','$reason',1,'2026-01-01T00:00:00.000Z')" | Out-Null
  $r = SQL "SELECT MAX(id) AS id FROM follow_ups" | ConvertFrom-Json
  return [int](@($r))[0].id
}
$today  = Get-Date -Format 'yyyy-MM-dd'
$future = (Get-Date).AddDays(7).ToString('yyyy-MM-dd')
"server today: $today   future case: $future"
$m = @{}
$m.S4  = New-FollowUp '2026-00001' $today  'S4 S5 success path'
$m.S6  = New-FollowUp '2026-00002' $today  'S6 flaky recovery'
$m.S7  = New-FollowUp 'E-0001'     $today  'S7 permanent reject'
$m.S9  = New-FollowUp '2026-00001' $today  'S9 bounded outage'
$m.S11 = New-FollowUp '2026-00002' $today  'S11 timeout'
$m.S13 = New-FollowUp 'E-0001'     $today  'S13 obsolete race'
$m.S14 = New-FollowUp '2026-00001' $today  'S14 version key'
$m.S3  = New-FollowUp '2026-00002' $future 'S3 future dated'
New-Item -ItemType Directory -Force -Path ..\docs\lab\module13\evidence | Out-Null
$m | ConvertTo-Json | Set-Content ..\docs\lab\module13\evidence\follow-up-ids.json
$m
```

Verify:

```powershell
SQL "SELECT id,status,due_date,version,reason,(due_date <= CURDATE()) AS is_due FROM follow_ups ORDER BY id"
```

Expect eight rows: seven with `is_due = 1`, one with `is_due = 0`. `due_date` must print as `2026-10-29`, not `2026-10-28T16:00:00.000Z`. If you see the ISO form, `dateStrings` is not applied to the pool.

---

## 5. Run it

Three terminals. Start in this order.

### 5.1 Terminal A: mock gateway

```powershell
cd "C:\Users\lliam\StudioProjects\clinic_follow_up_reminder_system\backend"
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
New-Item -ItemType Directory -Force -Path ..\docs\lab\module13\evidence | Out-Null
node scripts\mock-gateway.js 2>&1 |
  Tee-Object -FilePath "..\docs\lab\module13\evidence\mock-gateway-$stamp.log"
```

Required line:

```text
mock gateway on http://127.0.0.1:4699/notify (mode=ok)
```

### 5.2 Terminal B: backend

```powershell
cd "C:\Users\lliam\StudioProjects\clinic_follow_up_reminder_system\backend"
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
npm start 2>&1 |
  Tee-Object -FilePath "..\docs\lab\module13\evidence\backend-$stamp.log"
```

Required, both lines:

```text
listening on 127.0.0.1:3400
{"src":"worker","event":"worker.started","pollMs":2000,"maxAttempts":4,"timeoutMs":3000,...}
```

If the second line is missing, the worker is not polling and no case will work. If `worker.error` starts repeating every two seconds, read the message before doing anything else.

### 5.3 Terminal C: client

Same-origin release build (recommended, and the only configuration used for submitted evidence):

```powershell
cd "C:\Users\lliam\StudioProjects\clinic_follow_up_reminder_system"
flutter analyze
flutter build web --release 2>&1 |
  Tee-Object -FilePath docs\lab\module13\evidence\flutter-build.txt
Copy-Item -Recurse -Force build\web\* backend\public\app\
```

Open <http://localhost:3400/app/>.

Dev server, for hot reload while developing. Requires `DEV_CORS=true` in `.env` and a backend restart:

```bash
flutter run -d chrome --web-port=8080
```

Open <http://localhost:8080>. Captures from this origin show a debug banner and rely on relaxed CORS, so redo any submitted screenshot from the same-origin build.

---

## 6. Tests

Two independent suites. Neither needs a running server, and neither writes outside
its own database or a temporary directory.

| Suite | Command | Cases |
| --- | --- | --- |
| Integration collection | `cd backend && node --env-file=.env tests/m15-collection.js --label 04-review` | 37 |
| Flutter widget tests | `flutter test` | 20 |
| Performance + reliability | `cd backend && node --env-file=.env tests/m16-perf.js --phase full` | 5 journeys, 3 levels |
| Rollback rehearsal | `cd backend && node --env-file=.env tests/m16-rollback.js` | backup / damage / restore / verify |

The collection owns `clinic_followup_m15` and ports 3411/4799. It drops the database at
the start of every run, so a run is always from the same starting state. Failure
injection is done with a stub gateway it starts itself, which is why "the dependency
is down" is a repeatable condition rather than an anecdote.

Static checks:

```powershell
flutter analyze          # expect only the project-wide material.dart deprecation notices
node docs/lab/module15/validate-docx.js Module15/Module15.docx   # generated documents open in Word
```

## 7. Repository hygiene

Nothing secret is tracked. `backend/.env`, `backend/.env.*`, `backend/keys/`, `backend/tls/`
and `backend/public/app/` are ignored; only the two `.example` files are committed.

```powershell
# must print 0
(git ls-files | Select-String ".pem$|.key$|backend/.env$|backend/keys/|backend/tls/").Count
```

Module 14 key material is generated locally, never committed:

```powershell
cd backend
node scripts/secure-keys.js     # writes backend/keys/ and backend/tls/, both ignored
```
