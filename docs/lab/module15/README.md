# Module 15 — Integration Testing and Security Hardening

Clinic Follow-Up Reminder System · backend/ and lib/

This folder is the evidence for Module 15. Everything here is reproducible from a
clean checkout on the lab machine; nothing depends on a live service, a real
personal record, or a secret in source.

## What is here

| Path | What it contains |
| --- | --- |
| `backend/tests/m15-collection.js` | The test collection: 37 scripted cases across 9 topics |
| `evidence/01-baseline/` | The run before hardening — 23/36 passed, 13 failed, kept unedited |
| `evidence/02-hardened/` | The same collection after hardening — 37/37 passed |
| `evidence/03-after-ui-fixes/` | Confirmation run after D-08 to D-10 — 37/37 |
| `evidence/build/` | Flutter test and analyze output for the client |
| `TRACEABILITY.md` | Requirement → case → evidence → limitation |
| `HARDENING.md` | The backlog, and what each control changed, with measurements |
| `DEFECTS.md` | Defect records, including the two the tests found in earlier modules |
| `RUNBOOK.md` | Recovery instructions for the failure modes the collection exercises |
| `screens/README.md` | The interface captures to attach, with file names |
| `submission/Module15.docx` | The written report |
| `screens/15-01..15-08*.png` | The eight interface captures embedded in the report |
| `capture-screens.js` | Re-takes the captures (Chrome over DevTools, exact widths) |

## Running the collection

The collection creates its own database, so the lab database is never touched.

```powershell
# from the repository root
cd backend
npm install                    # once
node --env-file=.env tests/m15-collection.js --label 03-mine
```

Prerequisites on the lab machine: Node 20 or newer, MariaDB/MySQL reachable with
the credentials in `backend/.env`, and port 3411 (API) and 4799 (stub gateway)
free. The script starts and stops its own API process; do not start `npm start`
first, or the ports will be taken.

Expected output on the hardened build:

```
37/37 passed, 0 failed
evidence: docs/lab/module15/evidence/03-mine/
```

Each run writes `summary.json` (machine-readable), `results.md` (a table), one
JSON per case, and `server-log.txt` (the API's own structured log for that run).

## Running the client checks

```powershell
cd <repository root>
flutter test          # 20 tests: layout at two widths, model contracts, sign-in form
flutter analyze       # expect only the project-wide material.dart deprecation notices
```

## Scope and non-goals

In scope: the clinic API (`backend/`, all routes), the Module 13 reminder queue and
worker, the Module 14 exchange statuses, and the Flutter Web client states.

Out of scope and stated as limitations: load and performance testing beyond
single-request latency, penetration testing of the TLS layer, multi-tenant
isolation, and the production deployment configuration. The app is a lab build on
loopback, not a production service, and the report does not claim otherwise.

## Data

All fixtures are fictional: `Fictional Doctor`, `Fictional Nurse`,
`Fictional Test Patient A/B`, phone numbers in the reserved `+63 900 000 00xx`
range. The seed password comes from `.env` (`LAB_PASSWORD`) and is never written to
a log or a committed file; `L1` in the collection proves that.
