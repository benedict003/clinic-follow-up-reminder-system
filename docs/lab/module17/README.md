# Module 17 — Final integration, UAT and handover

Clinic Follow-Up Reminder System · `backend/` and `lib/`

This module consolidates the previous four: a UAT session against the finished build, a
final technical evaluation, an architecture recommendation, and a handover pack a
maintainer can work from.

## What is here

| Path | What it contains |
| --- | --- |
| `docs/openapi.yaml` | The HTTP contract: 28 operations across Modules 13–16, with the error model and role rules |
| `backend/tests/m17-uat.js` | The UAT harness: 8 scenarios executed as both roles, plus OpenAPI conformance |
| `UAT-PLAN.md` | Scope, roles, acceptance criteria and dispositions — written before the session |
| `UAT-RESULTS.md` | Both runs, the finding register, and the office's acceptance block |
| `EVALUATION.md` | The technical evaluation matrix and the architecture recommendation |
| `HANDOVER.md` | Setup, configuration, data model, API, tests, deployment, monitoring, limitations, support and change control |
| `evidence/01-uat/` | First run: 7/8, one defect kept on the record |
| `evidence/02-uat-retest/` | Retest after the fix: 8/8 |
| `screens/` | Nine captures, one per UAT scenario |
| `capture-screens.js` | Retakes them (Chrome over DevTools, exact widths) |
| `submission/` | The three documents, generated from the evidence |

## The short version

| | |
| --- | --- |
| UAT scenarios | 8 of 8 accepted after one fix |
| Spec conformance | 28 of 28 documented operations exist in the running service |
| Defects found by UAT | 1 (F-01, one error class answered with two different codes) |
| Conditions accepted | 4 (register completeness, doctor availability, no offline mode, receiver must be running) |
| Independent users | **none yet** — the learner acted each role; the office signature block is still blank |

## Running the UAT suite

```powershell
cd backend
node --env-file=.env tests/m17-uat.js --label 07-review
# expected: 8/8 accepted · spec conforms
```

It owns `clinic_followup_m17` and its own API on port 3417.

For the captures, the app must be served from the origin its build expects
(`localhost:3400`), so point that instance at the UAT database rather than the lab one:

```powershell
cd backend
$env:DB_NAME="clinic_followup_m17"; node --env-file=.env server.js   # after one UAT run has created it
node ..\docs\lab\module17\capture-screens.js
```

That detail is worth knowing: the Flutter build bakes `http://localhost:3400` as its API
base, so serving the app from a different port leaves it calling the old one and every
login fails at the origin check.

## What this module does not claim

The UAT was a controlled walkthrough by the learner, not a stakeholder session. The
office decision is an empty, signed block in `UAT-RESULTS.md`, and the handover statement
in `HANDOVER.md` is explicitly conditional. A portfolio that presented this as accepted
by the university would be false, and the module's own standard is that evidence must
not exceed what was done.
