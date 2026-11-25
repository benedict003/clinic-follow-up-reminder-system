# Handover

Everything an authorised maintainer needs, in the order they would need it. If a
section here disagrees with the repository, the repository is right and this file is a
bug.

## 1. What this is

A clinic follow-up register. Staff schedule a follow-up; the system queues a reminder,
delivers it to a local gateway, and records every attempt. A clinician works a board of
who is late and who is due, records what happened, and — when a record must go to an
outside office — discloses a minimised, encrypted, signed envelope and keeps the
receipt.

Four modules of work live in one repository:

| Module | Adds | Folder | Tag |
| --- | --- | --- | --- |
| 13 | Durable reminder queue with retry, escalation and audit | `docs/lab/module13/` | `module13` |
| 14 | Sealed disclosure to one partner, with pinned TLS and a receipt | `docs/lab/module14/` | `module14` |
| 15 | Integration testing and security hardening | `Module15/` | `module15` |
| 16 | Performance, reliability and deployment evaluation | `Module16/` | `module16` |
| 17 | UAT, final evaluation and this handover | `Module17/` | `module17` |

## 2. Roles and who can do what

| Action | Nurse | Doctor | Enforced where |
| --- | --- | --- | --- |
| Read the board, worklist, a record | yes | yes | — |
| Record a contact attempt | yes | yes | — |
| Reschedule | yes | yes | — |
| **Close a follow-up** | no | yes | Server: `403 FORBIDDEN_ROLE` (UAT-6) |
| **Read disclosure history** | no | yes | Server (Module 15 Z3 for alerts, same rule) |
| **Seal and send a disclosure** | no | yes | Server |

Hiding a control in the interface is not a control. Every rule above is refused by the
API, and the tests assert the refusal.

## 3. Running it

```powershell
cd "C:\Users\benedict\StudioProjects\clinic-follow-up-reminder-system\backend"
Copy-Item .env.example .env        # then fill in DB credentials and LAB_PASSWORD (12+ chars)
npm install
npm run migrate:clinic             # idempotent; adds the clinical columns and audit table
node scripts\secure-keys.js        # writes backend/keys and backend/tls (both ignored by git)
npm run seed                       # two fictional accounts, three fictional patients
npm start                          # listening on 127.0.0.1:3400
```

The client:

```powershell
cd <repository root>
flutter pub get
flutter build web --release --base-href=/app/ --no-web-resources-cdn
Remove-Item -Recurse -Force backend\public\app -ErrorAction SilentlyContinue
Copy-Item -Recurse build\web backend\public\app
```

Open <http://localhost:3400/app/>.

`--no-web-resources-cdn` is mandatory: the API sends `default-src 'self'`, and a bundle
that fetches CanvasKit from a CDN renders a blank page behind that policy. Found the
hard way in Module 15.

The partner receiver, only needed to run a disclosure:

```powershell
cd backend
Copy-Item .env.receiver.example .env.receiver
node --env-file=.env.receiver scripts\partner-receiver.js    # https://localhost:4443
```

## 4. Configuration

Every key is read through `config.js` with bounds, so a typo clamps at startup instead
of surprising someone in an incident. All have defaults; an existing `.env` keeps
working.

| Key | Default | Meaning |
| --- | --- | --- |
| `PORT` | 3400 | API port |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | — | Database |
| `INTEGRATION_ENDPOINT` | `http://127.0.0.1:4699/notify` | Reminder gateway. **Loopback only**; a non-local value is a startup failure |
| `INTEGRATION_MAX_ATTEMPTS` | 4 | Attempts before escalation |
| `INTEGRATION_TIMEOUT_MS` | 3000 | Per-call timeout |
| `SECURE_*` | — | Key paths, partner URL, TTL. Paths only; the keys are never in the repository |
| `BUILD_ID` | `dev` | Reported by `/api/ready`, so a deploy can be confirmed by asking the process |
| `RATE_LIMIT_USER_PER_MIN` | 300 | Per signed-in user |
| `RATE_LIMIT_ADDRESS_PER_MIN` | 3000 | Flood net; must stay far above the user limit |
| `RATE_LIMIT_LOGIN_PER_MIN` | 10 | Per username |
| `COMPRESSION` | on | `off` exists only to measure the cost |

**Secrets policy.** `backend/.env`, `backend/.env.*`, `backend/keys/`, `backend/tls/`
and `backend/public/app/` are ignored. Only `.env.example` and
`.env.receiver.example` are tracked. Verify:

```powershell
(git ls-files | Select-String "\.pem$|\.key$|backend/\.env$|backend/keys/|backend/tls/").Count   # must be 0
```

## 5. Data model

| Table | Purpose | Notes |
| --- | --- | --- |
| `users` | Staff accounts | scrypt with a per-user salt |
| `sessions` | Opaque session rows | Revocation is a `DELETE` |
| `patients` | The register | `contact_number` is for clinic use and never disclosed |
| `follow_ups` | The record | `version` increments on reschedule; overdue is derived, never stored |
| `follow_up_events` | Clinical audit trail | **Append-only.** Actor name and role snapshotted so history cannot be rewritten |
| `reminder_jobs` | Durable queue | Idempotent per `(follow_up_id, version)` |
| `reminder_attempts` | One row per call | Same correlation id as the log line |
| `reminder_alerts` | Role-addressed alerts | Returned only to the addressed role |
| `secure_outbox` | Disclosure metadata | Payload hash and sizes. No plaintext, no ciphertext |
| `secure_inbox` | What the receiver accepted | Unique on `message_id`, which is what stops a replay |

Migrations: `schema.sql` → `schema-14.sql` → `schema-clinic.sql` (via
`npm run migrate:clinic`). All are idempotent.

## 6. The API

`docs/openapi.yaml` documents 28 operations across the four modules. A conformance check
runs in the UAT suite: every documented path is confirmed to exist, so the specification
cannot silently drift.

Conventions worth knowing before changing anything:

- Errors are always `{ error, code, requestId }`. `error` is for a person; `code` is for
  a program. Never put an exception message in `error`.
- Paths are collapsed to their route shape in metrics (`/follow-ups/:id`) so the map
  cannot grow without bound.
- `/api/health`, `/api/ready` and `/api/metrics` are never rate limited.
- Liveness does no I/O. If you add a database check there, a blip will restart a healthy
  process.

## 7. Tests, and what each one is for

| Command | What it proves | Runtime |
| --- | --- | --- |
| `cd backend && npm run test:api` | 37 integration cases: contract, invalid input, auth, authz, duplicate, reliability, hardening | ~2 min |
| `cd backend && npm run test:perf` | The Module 16 workload: percentiles, saturation, delivery, readiness, shutdown | ~2 min |
| `cd backend && npm run test:rollback` | Backup, damage, restore, verify by content hash | ~30 s |
| `cd backend && npm run test:uat` | 8 stakeholder scenarios plus OpenAPI conformance | ~20 s |
| `flutter test` | 20 widget tests: every screen at 1280 and 380, model contracts, sign-in form | ~5 s |
| `flutter analyze` | No errors; only the project-wide `material.dart` deprecation notices | ~30 s |

Each backend suite creates and drops its own database and starts its own API process, so
none of them can disturb the lab database or a demonstration. That is deliberate: the
first draft of one harness wrote to the lab database and would have delivered real
reminder jobs during a demo.

## 8. Deployment and rollback

The full checklist is `docs/lab/module16/DEPLOYMENT.md`; the rehearsed rollback is
`docs/lab/module16/ROLLBACK.md`. The short form:

```powershell
# deploy
flutter build web --release --base-href=/app/ --no-web-resources-cdn
Copy-Item -Recurse -Force build\web backend\public\app
$env:BUILD_ID = (git rev-parse --short HEAD); node --env-file=.env server.js
curl.exe -s http://127.0.0.1:3400/api/ready      # confirm the BUILD_ID that answered

# rollback
Stop-Process -Id <pid>                            # SIGTERM: drains in ~112 ms
Copy-Item -Recurse -Force ..\releases\<previous>\web backend\public\app
& "C:\xampp\mysql\bin\mysql.exe" -u root clinic_followup_lab < ..\backup\pre-deploy.sql
$env:BUILD_ID = "<previous sha>"; node --env-file=.env server.js
```

A code rollback without a data rollback is how a "reverted" deploy keeps failing.

## 9. Monitoring and first response

| Endpoint | Question | If it fails |
| --- | --- | --- |
| `/api/health` | Is the process alive? | Restart it |
| `/api/ready` | Can it serve a request that needs dependencies? | Take it out of rotation; check the database. **Do not restart** |
| `/api/metrics` | What has it been doing? | — |

The full map, thresholds and an incident walkthrough are in
`docs/lab/module16/MONITORING.md`. Recovery steps for each failure mode are in
`docs/lab/module16/RUNBOOK.md`.

## 10. Known limitations

Carried forward honestly, not as a disclaimer:

1. **One process.** No clustering, no failover. Throughput rises only 1.19× from 8 to 32
   concurrent clients; that ceiling was measured and the criterion to double it failed.
2. **No alerting.** The system answers when asked and cannot raise a hand.
3. **Metrics are per-process** and reset on restart.
4. **Backups are on the same disk** as the database in the rehearsed procedure.
5. **No TLS in this environment**, so the `Secure` cookie branch and HSTS are untested.
6. **Loopback performance only.** Latency is a server floor, not a clinic link.
7. **Two roles, no per-object ownership.** Every clinician may read every record.
8. **UAT had no independent user.** The learner acted each role against a script; the
   office session is still owed (`UAT-RESULTS.md` has the signature block).
9. **The keys were committed once** and remain in git history. Regenerate before any
   real patient data exists.

## 11. Support and maintenance by role

| Role | Owns | Routine task | Cadence |
| --- | --- | --- | --- |
| Front desk | Patient register accuracy | Keep contact numbers current — a follow-up cannot be made without one | At intake |
| Nurse | Contact attempts | Record every attempt, including no-answer | Per call |
| Doctor | Closures and disclosures | Review `needs_human` jobs; close records with an outcome | Daily |
| Maintainer | Everything else | Run the four suites; check `/api/ready` after each deploy; watch RSS; re-audit dependencies (`npm audit`) | Weekly / per change |
| Office | Acceptance and policy | Decide whether real data may be used; approve the conditions in `UAT-RESULTS.md` | Before any pilot |

### Maintenance tasks with a cadence

| Task | How | Why |
| --- | --- | --- |
| Renew or regenerate keys | `node scripts/secure-keys.js`, then update `secure_inbox` expectations | Keys are local; rotation is a file swap |
| Verify a backup restores | `npm run test:rollback` against a copy | A backup nobody restored is a hope |
| Re-audit dependencies | `cd backend && npm audit` | Two direct dependencies, so this is quick |
| Review the failing criterion | `docs/lab/module16/RESULTS.md` (A5) | It is the boundary of what was demonstrated |
| Rotate the lab password | `npm run seed` with a new `LAB_PASSWORD` | The seed is the only place credentials are set |

## 12. Change control

- One branch per module: `feature/mNN-<slug>`. Merge with `--no-ff` so the module is a
  visible unit in history.
- Every change that alters behaviour updates the suite it affects, and the run is kept in
  the module's `evidence/` folder.
- A new error `code` is a client-visible change: document it in `openapi.yaml` in the same
  commit.
- Never edit a recorded run. If a case was wrong, add a note beside it — the pattern used
  in `docs/lab/module15/evidence/01-baseline/NOTES.md`.
- A defect that is found but not fixed gets a record in the module's `DEFECTS.md` with its
  disposition. Unfixed is acceptable; unrecorded is not.

## 13. Handover statement

> **Demonstrated:** the bounded workflow works end to end on this build — the board, the
> contact record, the reschedule that supersedes a reminder, the closure with an outcome,
> the sealed disclosure with a receipt, and a refusal that explains itself. It is
> measured (performance, delivery, reliability), tested (37 integration cases, 8 UAT
> scenarios, 20 widget tests), and documented to the level where another developer can
> run, extend and recover it.
>
> **Not demonstrated:** operation at more than one instance, unattended monitoring,
> off-host backup, TLS, independent user acceptance, or use with real patient data.
>
> **Conditional:** fit for a controlled pilot in one clinic office, provided the nine
> limitations above are accepted in writing, the keys are regenerated, a nightly off-host
> dump is taken and one restore is proven, and the office completes the acceptance block
> in `UAT-RESULTS.md`.

This is a handover, not a launch. The distinction is the point of the document.
