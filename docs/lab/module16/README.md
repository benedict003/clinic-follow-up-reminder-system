# Module 16 — Performance, Reliability and Deployment Evaluation

Clinic Follow-Up Reminder System · `backend/` and `lib/`

This module asks whether the integration is ready to operate beyond a classroom
demonstration. The answer is a set of measurements, a readiness verdict with
conditions, and an honest list of what was not tested.

## What is here

| Path | What it contains |
| --- | --- |
| `backend/tests/m16-perf.js` | The workload harness: journeys, concurrency levels, percentiles, resource and reliability checks |
| `backend/tests/m16-rollback.js` | The rollback rehearsal: backup, damage, restore, verify |
| `evidence/01-baseline/` | The first run — invalid, and kept because it found a defect |
| `evidence/03-capacity/` | The capacity run: compression on, no limit interference |
| `evidence/04-no-compression/` | The same workload with compression off, for a real A/B |
| `evidence/05-rollback/` | Backup, damage, restore, verification, recovery time |
| `evidence/06-deployment/` | What a browser actually downloaded, and that the app still loads |
| `screens/` | Eight interface captures at 1280 and 380, plus `captures.json` recording how each was reached |
| `capture-screens.js` | Retakes them (Chrome over DevTools, exact widths) |
| `WORKLOAD.md` | The workload model and acceptance criteria, written before measuring |
| `MONITORING.md` | Liveness vs readiness, metrics, what an operator does with them |
| `DEPLOYMENT.md` | Checklist, environment comparison, build artifact sizes |
| `ROLLBACK.md` | Triggers, procedure, what the rehearsal proved and did not |
| `READINESS.md` | The conditional readiness decision |
| `submission/` | The three documents, generated from the evidence |

## Running it

The harness owns its database (`clinic_followup_m16`, created and dropped each run)
and its own API process on port 3413, so it cannot disturb the lab database or a
demonstration in progress.

```powershell
cd backend
node --env-file=.env tests/m16-perf.js --label 07-review --phase full
node --env-file=.env tests/m16-rollback.js
```

`--phase quick` skips saturation, the soak, static transfer and the shutdown check.

> **Note on 01-baseline.** That run is not usable as a performance baseline: the
> API's own rate limiter refused 2,262 of its requests, so the numbers describe the
> limiter and not the server. It is kept because that is what exposed the defect.
> The comparison used in the report is `03-capacity` against `04-no-compression`,
> which differ only in one switch.

## Workload in one line

Five read journeys weighted 45/25/20/7/3 (board, record, worklist, patients,
health), executed at concurrency 1, 8 and 32, plus a 20-second soak with 20 ms
think time, against 60 patients and 400 follow-ups (217 due now).
