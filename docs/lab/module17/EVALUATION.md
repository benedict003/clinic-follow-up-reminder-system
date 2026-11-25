# Final technical evaluation and architecture recommendation

## Evaluation matrix

Every row names the evidence that supports it and the limitation that qualifies it.
"Evidence" means a recorded run or capture in this repository, not an opinion.

| Attribute | Claim | Evidence | Limitation |
| --- | --- | --- | --- |
| Interoperability | The client and API agree on 28 documented operations | `docs/openapi.yaml` vs `evidence/02-uat-retest/uat.json` (28/28 exist) | One client, one API. No third-party consumer has been tested |
| Contract stability | Error shape is uniform: `error`, `code`, `requestId` | Module 15 cases V4, V5, N2, S5, S6; UAT-8 | Codes are additive, not versioned. A new code is a client change |
| Access control | Role is enforced server-side, not by hiding controls | UAT-6 (`403 FORBIDDEN_ROLE`), Module 15 Z1, Z3 | Two roles only; no per-object ownership |
| Secure exchange | A refusal keeps its declared status and code | UAT-5 (`409 FOLLOW_UP_NOT_DISCLOSABLE`), Module 15 S6 | The receiver was not run during UAT; replay and expiry rest on Module 14's suite |
| Data minimisation | Only four fields leave; five are withheld, listed on screen | UAT-7, `17-07` capture, Module 14 | The envelope format is fixed; adding a field is a design decision, not configuration |
| Reliability | Dependency failure is bounded and observable | Module 16: 503 from readiness in 4 ms with liveness 200; 112 ms graceful shutdown; pool self-heals in 271 ms | Single process; no queue for reads |
| Performance | Board p95 4.60 ms, zero read errors at concurrency 1/8/32 | Module 16 `evidence/03-capacity` | Loopback only; 32 clients is the tested ceiling and throughput stops scaling there (A5 failed) |
| Delivery | First load 2.65 MB on the wire, 68% saved, no runtime errors | Module 16 `evidence/06-deployment/browser-transfer.json` | Measured on a fast link; a slow clinic link would take longer than the bytes suggest |
| Usability | The board answers "who is late" on arrival; 380 px is operable | UAT-1, UAT-5, `17-01`, `17-09` | Judged by the learner. No independent user has rated it |
| Maintainability | A new maintainer can run, test and recover from the docs | `HANDOVER.md`, `RUNBOOK.md`, four suites, 20 widget tests | Assessed by the author, which is the weakest possible judge |
| Operability | Liveness, readiness, metrics, structured logs with correlation | Module 16 `evidence/03-capacity`, `MONITORING.md` | No alert delivery, no persistent metrics |
| Security hygiene | No secret tracked; keys generated locally | Module 15 D-12, README hygiene check (prints 0) | Keys were public earlier and remain in git history; regeneration is a condition of use |

### Absence of failure is not evidence of safety

Three things were **not** observed failing and that is not a claim they are safe:

- No penetration test of the TLS layer or the partner handshake.
- No attempt to exhaust the queue with concurrent writers.
- No attempt to forge a session by any means other than a random token (Module 15 A2).

Each is a gap in coverage, not a pass.

## Architecture alternatives

Three feasible shapes were considered for a production-like deployment, compared
against the constraints that actually exist: one clinic, one maintainer, a lab
workstation, no budget for managed services, and a course deadline.

| Criterion | A · Single process (as built) | B · Clustered, two instances | C · Managed platform |
| --- | --- | --- | --- |
| Complexity | One process, one database | Two processes, shared session store, proxy, deploy coordination | Managed DB, managed runtime, CI/CD |
| Reliability | No failover; a crash is an outage until restart | Survives one instance dying | Provider-managed, with its own failure modes |
| Security | Loopback, no TLS; session in MariaDB | TLS terminator, sessions in a shared store, more network surfaces | Provider IAM adds accounts and trust to reason about |
| Cost | £0 — it is a workstation | One more host, plus a proxy | Recurring spend the department does not have |
| Skills needed | Node, MySQL, Flutter — all present | Plus proxying and session sharing | Plus cloud IAM and vendor operations |
| Change impact | None | Worker must not double-deliver; needs a claim strategy | Migration of data and secrets |
| Data ownership | Clinic keeps the database on its own disk | Same, if the store is self-hosted | Data leaves the institution — a consent problem for patient records |
| Supportability | One thing to read | Three moving parts | Depends on a vendor's changes |
| Evidence we hold | The whole Module 16 evaluation | None | None |

**Recommendation: A, as built, for the agreed bounded scope — with the conditions in
`HANDOVER.md`.**

The reasoning is not that A is best in the abstract. It is that B and C were **not
tested**, and a recommendation among alternatives is only honest if it is grounded in
evidence. Module 16 measured A and found its ceiling: throughput rises 1.19× between 8
and 32 concurrent clients. For ten staff that ceiling is far away, so A fits the agreed
scope; for growth it does not, and B is the change to make first, because it is the only
alternative that moves the measured ceiling rather than the ability to see it.

Choosing C would put patient records on infrastructure the university does not
currently govern, which contradicts the data-classification decisions made in Module
14. That is a reason to reject it here, not a claim it is wrong elsewhere.

## Why the current architecture is defensible

| Decision | Why it is right for this scope | What it costs |
| --- | --- | --- |
| One Express process serving both API and Flutter bundle | Same origin, so the session cookie is first-party and no CORS relaxation is needed | The bundle and the API share a failure domain |
| Session rows in MariaDB, not JWT | Revocation is a `DELETE`, which Module 15 case A6 proves | One query per authenticated request |
| The clinical workflow in its own router, guarded import | A fault there cannot take the reminder queue or the exchange down | Two places to keep consistent — which is exactly how F-01 happened |
| Append-only `follow_up_events` with the actor snapshotted | History cannot be rewritten by renaming a user | No foreign key to `users`, so joins are manual |
| Reminder delivery as a polled worker with a version check | Reschedule and close make stale reminders obsolete without cancellation logic | One worker process; no fan-out |

## Residual risks, ranked

| Risk | Likelihood | Impact | Mitigation now | Next step |
| --- | --- | --- | --- | --- |
| Keys were public in git history | certain it happened | high if reused | Untracked; fingerprints unchanged so evidence still matches | Regenerate before any real data |
| Single process, no failover | medium | medium for one clinic | Graceful shutdown, fast restart, stuck-job reclaim | Cluster (alternative B) |
| No alerting | high | medium | Probes answer when asked | External check with notification |
| Backup on the same disk as the database | medium | high | Rehearsed restore in 179 ms | Nightly dump off-host, one restore tried |
| One maintainer, author-assessed docs | medium | medium | Handover pack and suite scripts | An independent run-through by another person |
