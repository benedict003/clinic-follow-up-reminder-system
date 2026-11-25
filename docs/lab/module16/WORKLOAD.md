# Workload model and acceptance criteria

Written **before** measuring, so the measurement answers a question rather than
creating one.

## Decision question

Can one clinic of ten staff use this system on ordinary hardware and a normal
office link, and what is the first thing that would break if usage doubled?

## The workload

A clinic hour is mostly reading. Someone opens the board, opens one patient's
record, checks the worklist at the start of a session, occasionally looks a patient
up. Writes are rarer than reads but heavier: each one opens a transaction and
appends an audit row.

| Journey | Method and path | Weight | Why that weight |
| --- | --- | --- | --- |
| `board` | `GET /api/clinical/follow-ups?scope=open` | 45% | The screen a clinic lives on; refreshed constantly |
| `record` | `GET /api/clinical/follow-ups/:id` | 25% | Opening a patient after finding them |
| `worklist` | `GET /api/clinical/worklist` | 20% | Loaded on arrival and after every action |
| `patients` | `GET /api/clinical/patients` | 7% | Occasional lookup |
| `health` | `GET /api/health` | 3% | Monitoring, not a person |
| `login` | `POST /api/login` | measured separately | Carries scrypt by design; averaging it into the mix would hide that cost |

Writes (`POST .../contact`, `.../reschedule`, `.../close`) are exercised by the
Module 15 collection, which asserts their correctness. This module measures the
read path and the delivery path, because those are what a clinic waits on.

## Data volume

60 patients, 400 follow-ups spread ±30 days around today (217 due now), 10 tables.
Small on purpose: it is the size a single clinic generates in a term, and a
measurement at this size is something the department can actually reproduce.

## Concurrency and duration

| Level | Meaning |
| --- | --- |
| 1 | One clinician, sequential requests — latency without queueing |
| 8 | A busy clinic: eight staff acting at once |
| 32 | Saturation: deliberately beyond the modelled clinic, to find the ceiling |
| Soak, 20 s at 8 with 20 ms think time | Sustained load with realistic pauses |

Warm-up: one request per journey before each measurement, so the first query plan
and the first connection are not counted as steady-state cost.

## Acceptance criteria

Stated before the run, and applied as written.

| # | Criterion | Threshold | Rationale |
| --- | --- | --- | --- |
| A1 | Board p95 at concurrency 8 | ≤ 250 ms | The board is the screen a clinician stares at |
| A2 | Record p95 at concurrency 8 | ≤ 200 ms | A click should feel immediate |
| A3 | Error rate at concurrency 8 and 32 | 0% for reads | A read should not fail because someone else is reading |
| A4 | Login p95 | ≤ 1500 ms | scrypt is intentionally slow; a second is tolerable |
| A5 | Throughput at concurrency 32 | ≥ 2× the concurrency-8 rate | Otherwise queueing has already started and the ceiling is lower than reported |
| A6 | First load transfer | ≤ 3 MB on the wire | A clinic on a modest link should reach the sign-in screen quickly |
| A7 | Readiness reflects the dependency | 503 within 1 s of the database going away | An orchestrator must not send traffic to a process that cannot read |
| A8 | Graceful shutdown | exits within 1 s, no dropped in-flight request | Restarting during a write must not corrupt or lose it |
| A9 | Recovery from a bad deploy | ≤ 5 min end to end | An office-hours incident |

## Anti-goals

No claim is made about: many-clinic tenancy, mobile networks, a second API
instance, or behaviour with more than one worker. None of those were tested, and
the readiness decision in `READINESS.md` repeats that.
