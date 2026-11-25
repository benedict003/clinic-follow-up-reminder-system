# Rollback plan, rehearsal result and readiness decision

## Rollback triggers

| Trigger | Threshold | Who decides |
| --- | --- | --- |
| Readiness 503 for more than 60 s after a deploy | 60 s | Whoever deployed |
| New `BUILD_ID` absent 2 minutes after a deploy | 2 min | Whoever deployed |
| p95 at concurrency 8 worse than 250 ms (A1) after the change | 250 ms | Whoever deployed |
| Any 5xx rate above 1% over five minutes | 1% | Whoever deployed |
| A migration that alters or drops a column the previous release reads | immediate | Doctor role / maintainer |

The last one matters most. A code rollback without a data rollback is how a
"reverted" deploy keeps failing.

## Procedure

```powershell
# 1. Stop accepting work, and prove it drained
#    (SIGTERM, not a kill: 112 ms measured, so there is no reason to be abrupt)
Stop-Process -Id <pid>          # sends SIGTERM-equivalent on Windows via node's handler

# 2. Restore the previous release directory
Copy-Item -Recurse -Force ..\releases\<previous>\web backend\public\app

# 3. Restore the database if the release changed the schema
& "C:\xampp\mysql\bin\mysql.exe" -u root -h 127.0.0.1 clinic_followup_lab < ..\backup\pre-deploy.sql

# 4. Start the previous build, identified
$env:BUILD_ID = "<previous sha>"; node --env-file=.env server.js

# 5. Prove which build is running
curl.exe -s http://127.0.0.1:3400/api/ready | Select-String build
```

Step 5 is not optional. Without it a rollback is a hope, not a fact.

## What the rehearsal proved

`backend/tests/m16-rollback.js` runs the cycle against the isolated Module 16
database and writes `evidence/05-rollback/`.

| Step | Recorded result |
| --- | --- |
| Backup | 83,480 bytes, `mysqldump --single-transaction --routines --databases` |
| Fingerprint before | 10 tables; `follow_ups` 400 rows, hash `3f7c8c79ff2a16e8` |
| Bad change applied | column `close_note` dropped, 25 rows corrupted, one planted audit row — **detected** |
| Restore | 165 ms |
| Restore + verify | 179 ms |
| Data matches before | yes, all 10 tables |
| Column restored | yes |
| Residue (planted rows, corrupted rows) | 0 and 0 |

**Recovery time, measured: 179 ms.** For this data volume. That is the honest
qualifier — the dump is 83 KB and 400 follow-ups; the same procedure on a year of
records will take longer in proportion to the dump size, and the *decision* time
(noticing, deciding, communicating) is not in that number at all.

## What the rehearsal did not prove

- Restoring onto a **different host**, which is what an actual disaster needs.
- Recovery with **partial corruption** — a byte-level damaged InnoDB file needs
  `innodb_force_recovery`, not a logical dump.
- Restoring while **clients are writing**. The procedure above stops the process
  first; a zero-downtime rollback is a different exercise.
- **Backup retention and off-host copies.** The rehearsal writes the dump next to
  the evidence, on the same disk as the database. That is not a backup strategy.
- The **application-rollback** half: step 2 was rehearsed by hand, not scripted.

## Readiness decision

> **Conditionally ready for a controlled pilot inside one clinic. Not ready for
> multi-clinic or unattended operation.**

The evidence behind that sentence:

**Supports readiness**

- Read-path latency is two orders of magnitude inside the criteria: board p95
  4.60 ms against a 250 ms threshold, at every concurrency level tested.
- Zero read errors at concurrency 8 and 32, over 2,400 requests.
- Liveness, readiness and metrics answer correctly, and readiness detects a missing
  dependency in 4 ms while liveness correctly refuses to lie about it.
- Rate limiting works per user and never refuses a probe: refused at request 10,
  20 probe calls all 200.
- Graceful shutdown drains in 112 ms; a claimed job is reclaimed if the process dies.
- A bad deploy was rehearsed: damage detected, data restored exactly, 179 ms.
- First load is 2.65 MB instead of 8.7 MB, with no runtime errors in a real browser.

**Does not support readiness**

- **A5 failed.** Throughput rises only 1.19× between concurrency 8 and 32 while p50
  triples. One process, one worker. The pilot is inside that ceiling; growth past
  it needs either clustering or an honest queue, and neither was tested.
- No alerting. The system can answer "how are you" but cannot raise a hand. An
  unattended clinic would learn about an outage when a clinician cannot open the
  board.
- Metrics are in-process and die with the process.
- Recovery assumes the database and the backup are on the same disk.
- The production-like column of `DEPLOYMENT.md` is a plan, not a deployment: no TLS,
  no supervision, no secret injection, no off-host backup.

**Conditions for the pilot**

1. Someone owns the readiness endpoint and will look at it after every deploy.
2. A nightly dump goes to a different disk, and one restore from it is tried before
   the pilot starts.
3. The clinic agrees that a second instance is not required at this size, in
   writing, so the A5 result is accepted rather than forgotten.
4. The keys are regenerated before any real patient data exists (they were public
   once — see `DEFECTS.md` D-12 in Module 15's folder).

**The single next improvement, in one sentence:** make the process cluster-aware
(two instances behind a proxy with a shared session store), because it is the only
item on this list that changes the measured ceiling rather than the ability to see
it.
