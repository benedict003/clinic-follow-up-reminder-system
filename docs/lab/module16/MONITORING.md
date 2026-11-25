# Monitoring map and incident walkthrough

The module asks for a monitoring map in which every signal leads to an owned,
actionable response. Three endpoints, and the rule that keeps them honest: a signal
that nobody would act on is noise.

## Liveness vs readiness

| Endpoint | Question | Touches the database? | Correct response to a failure |
| --- | --- | --- | --- |
| `GET /api/health` | Is this process alive and answering? | **No** | Restart it |
| `GET /api/ready` | Can it serve a request that needs its dependencies? | **Yes**, plus route mounts and worker state | Take it out of rotation and look at the dependency. **Do not restart** |
| `GET /api/metrics` | What has it been doing? | No (reads in-process counters) | Feed a dashboard or an alert rule |

The distinction is the whole point. `evidence/03-capacity/performance.json` records
the experiment: with an unreachable database, readiness returned **503 in 4 ms**
with `checks.database.ok = false`, while liveness stayed **200**. If liveness had
also checked the database, an orchestrator would have restarted a healthy process
in a loop while the actual fault — the database — went untouched.

Probes are exempt from rate limiting. That was found the hard way: the first full
run ended with the readiness endpoint answering **429** because 4,800 requests had
exhausted the address budget, and a 429 to a probe reads as an outage.

## What readiness reports

```json
{
  "ready": true,
  "checks": {
    "database": { "ok": true, "ms": "0.98" },
    "routes":   { "secure": true, "clinical": true },
    "worker":   { "running": true, "pollMs": 2000 }
  },
  "pool": { "size": 1, "free": 1, "queueing": 0, "limit": 10 },
  "uptimeSeconds": 5,
  "build": "dev"
}
```

Three of those checks are deliberate:

- **routes** — Modules 14 and 15 are mounted with guarded imports so one cannot take
  the other down. Readiness says which survived. A process serving the board but
  with `secure: false` is half-deployed, not ready.
- **worker.running** — a process whose worker is stopped serves reads but will never
  deliver a reminder. That is exactly the state an operator cannot see from a health
  check that only asks "are you alive".
- **pool.queueing** — the first sign of saturation. Non-zero means requests are
  waiting for a database connection, which is a different problem from slow queries
  and needs a different response.

## Metrics

In-process counters, no dependency, printable in one request:

| Field | Use |
| --- | --- |
| `requests`, `byStatus`, `byPath` | Volume and error mix. Paths are collapsed to a route shape (`/follow-ups/:id`) so the map does not grow without bound |
| `latency.meanMs`, `latency.maxMs`, `cumulativePercentByBucket` | Read p50/p95 straight off the cumulative buckets |
| `worker.attempts`, `worker.failures` | Is delivery happening at all |
| `dbErrors`, `pool` | Dependency health between readiness polls |
| `memoryMb` | The resource signal this module measured |

Honest limit: these are per-process and reset on restart. They answer "is it
slower than an hour ago", not "what happened last Tuesday". A persistent store or a
scraper is the next improvement, not something this build has.

## Log signals an operator watches

All lines are one JSON object, and every one carries `requestId`. A client error
includes the same id in the response body, so "it said something went wrong" can be
turned into a specific request.

| Event | Threshold worth alerting on | First thing to check |
| --- | --- | --- |
| `request.failed` (status ≥ 500) | any occurrence | `http.server_error` lines carry name, message and a truncated stack |
| `http.server_error` | any occurrence | The message field; the response deliberately says nothing |
| `security.rate_limited` | sustained on one authenticated user | A misbehaving client, or a limit set below real usage |
| `auth.login.failed` with `no_such_user` | a burst | Password guessing; the per-username limiter should have fired first |
| `job.escalated` (`reason: attempts_exhausted`) | any | The gateway, then the follow-up's status |
| `worker.error`, `worker.reclaim_failed` | any | Database connectivity |
| `shutdown.forced` | any | A request did not drain within 15 s |

`request.slow` (> 2 s) exists for the case this module did not test: a single
request that is slow without the service being slow, which is usually one query.

## Incident walkthrough

A clinician reports "the board is spinning".

1. **Is it the process or the dependency?** `GET /api/ready`.
   - 503 with `database.ok: false` → the database. Liveness will still be 200; do
     not restart. Check MariaDB, then the pool: `pool.queueing > 0` with a healthy
     database means connections are exhausted, not slow.
   - 503 with `secure: false` or `clinical: false` → a partial boot. Restart once,
     then read `clinical.mount_state` in the log for the import error.
   - 200 → the process is fine. Go to step 2.
2. **Is it slow or is it stuck?** `GET /api/metrics`. Compare
   `cumulativePercentByBucket` against the numbers in `RESULTS.md` (p95 ≈ 10 ms at
   concurrency 8). A p95 in the hundreds with a small `requests` count is a slow
   dependency; a p95 in the hundreds with a large count is saturation.
3. **What is failing?** `byStatus` and the log's `request.failed` lines. Every one
   has a `requestId`; the client's message shows the same id, so the report and the
   log line can be matched without guesswork.
4. **Is delivery affected?** `worker.running` and `job.escalated` lines. Reminder
   delivery failing does not stop the board, but it is invisible unless someone
   looks at the worker field.
5. **Recovery.** Restarting is safe by design: SIGTERM drains in ~110 ms, and a job
   claimed and lost is reclaimed by `reclaimStuckJobs` after the stuck threshold.

## What is not monitored

No external uptime check, no alert delivery, no dashboard, no persistence of the
counters, and nothing watches disk or database size. The system can tell a person
what is wrong when that person asks it; it cannot yet tell someone unprompted. That
is the improvement to schedule, and it is named in `READINESS.md` rather than
implied to exist.
