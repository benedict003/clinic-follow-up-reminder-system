# Results and interpretation

Every number here comes from `evidence/*/performance.json`. The run labelled
`01-baseline` is excluded from the comparison: the API's rate limiter refused 2,262
of its requests, so it measured the limiter. It is kept because it is what exposed
the defect.

## Latency, one user at a time (concurrency 1, no queueing)

| Journey | p50 | p90 | p95 | p99 | max |
| --- | --- | --- | --- | --- | --- |
| board | 2.82 ms | 4.53 | 4.60 | 8.82 | 18.7 |
| record | 0.97 ms | 1.68 | 2.38 | 3.20 | 3.46 |
| worklist | 2.50 ms | 4.23 | 4.61 | 6.63 | 7.69 |
| patients | 1.34 ms | 2.17 | 2.82 | 3.39 | 3.49 |
| health | 0.36 ms | 0.81 | 1.03 | 1.33 | 1.49 |
| login | 41.93 ms | 44.45 | 50.57 | 59.06 | 56.84 |

The board is the slowest read at ~2.8 ms: one `JOIN`, a `DATEDIFF` per row and a
`LIMIT`. Login is ~42 ms and that is scrypt doing its job — it is not a bottleneck,
it is the price of not storing recoverable passwords. Nothing here is close to a
person's threshold for "instant".

## Mixed workload at three concurrency levels

| Level | Requests | p50 | p90 | p95 | p99 | Throughput | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 8 (busy clinic) | 800 | 5.80 ms | 9.44 | 10.36 | 15.36 | 1,263 req/s | 0 |
| 32 (saturation) | 1,600 | 18.86 ms | 32.15 | 35.86 | 42.56 | 1,497 req/s | 0 |
| soak, 20 s, think time | 4,779 | 9.72 ms | 12.26 | 13.12 | 17.49 | 239 req/s | 0 |

**Saturation is visible and it is the honest headline.** Going from 8 to 32
concurrent clients multiplies throughput by only **1.19×** while p50 rises 3.3×.
The server stops scaling somewhere between those two points. For the modelled clinic
that is irrelevant — ten staff acting once a second is a rounding error against
1,263 req/s — but the ceiling exists, and it is one Node process doing JSON,
bcrypt-free but still scrypt-on-login, and synchronous database round trips.

## Acceptance criteria, scored

| # | Criterion | Threshold | Measured | Verdict |
| --- | --- | --- | --- | --- |
| A1 | board p95 at concurrency 8 | ≤ 250 ms | 4.60 ms | pass |
| A2 | record p95 at concurrency 8 | ≤ 200 ms | 2.38 ms | pass |
| A3 | read error rate | 0% | 0% at every level | pass |
| A4 | login p95 | ≤ 1500 ms | 50.57 ms | pass |
| A5 | throughput at 32 ≥ 2× the rate at 8 | ≥ 2.0× | **1.19×** | **fail** |
| A6 | first load transfer | ≤ 3 MB | 2.65 MB | pass |
| A7 | readiness reflects a missing dependency | 503, fast | 503 in 4 ms, liveness 200 | pass |
| A8 | graceful shutdown | exits < 1 s | 112 ms | pass |
| A9 | recovery from a bad deploy | ≤ 5 min | 179 ms | pass |

A5 is not a surprise to be explained away; it is the one criterion the evidence
does not support. See `READINESS.md` for what that means for the verdict.

## The compression A/B

`03-capacity` and `04-no-compression` are the same workload with one switch changed.

| Level | compression off | compression on | Effect |
| --- | --- | --- | --- |
| concurrency 8, p50 | 5.79 ms | 5.80 ms | unchanged |
| concurrency 8, p99 | 14.24 ms | 15.36 ms | +1.1 ms worse |
| concurrency 32, p50 | 23.87 ms | 18.86 ms | 21% better |
| concurrency 32, p99 | 53.39 ms | 42.56 ms | 20% better |
| concurrency 32, throughput | 1,162 req/s | 1,497 req/s | 29% better |

Compression costs a fraction of a millisecond at low concurrency and pays for
itself several times over once the loopback socket becomes the bottleneck. What it
does for the transfer is not subtle:

| Asset | On disk | On the wire | Saved |
| --- | --- | --- | --- |
| `main.dart.js` | 2,952,392 | 792,435 | 73% |
| `canvaskit/chromium/canvaskit.wasm` | 5,463,539 | 1,845,588 | 66% |
| `canvaskit/chromium/canvaskit.js` | 86,270 | 27,731 | 68% |
| `Roboto-Regular.ttf` | 171,676 | 85,903 | 50% |
| **whole first load** | **8,707,017** | **2,779,277** | **68.1%** |

Measured from the browser side (`evidence/06-deployment/browser-transfer.json`,
CDP `encodedDataLength`), with the app reaching the sign-in screen and **no runtime
errors**. Small files show slightly more on the wire than on disk because the wire
count includes HTTP headers — worth stating rather than smoothing over.

## Resource signals

| Signal | Observation |
| --- | --- |
| RSS before a full run | 66–67 MB |
| RSS after all phases | 157–166 MB |
| Growth during a run | ~90–100 MB |
| Database connections during load | 12 (pool limit 10, plus the harness's own) |
| Pool queueing | 0 at concurrency 8 and 32 |

RSS growth of ~95 MB over a run is retained buffers and the encoded-asset cache,
not evidence of a leak: the process did not grow across the soak, and a restart
returns to 66 MB. Anyone operating this should still watch RSS across days, which
is why it is recorded rather than dismissed.

## Controlled failure and recovery

| Check | Predicted | Observed |
| --- | --- | --- |
| Pool resilience: kill all 10 pooled connections | pool opens new ones, service continues | ready 200 within 3 ms, fully recovered in 271 ms |
| Readiness with an unreachable database | 503 while liveness stays 200 | 503 in 4 ms, `checks.database.ok = false`, liveness 200 |
| Graceful shutdown (SIGTERM) | drains and exits 0 | exited in 112 ms |
| Rate limiter after re-keying | refuses per user, never refuses probes | refused at request 10; 20 probe calls all 200 |
| Rollback rehearsal | restore reproduces the data exactly | 10/10 tables match, column restored, 0 residue rows, 179 ms |
