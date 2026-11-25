# Module 16 performance run — 01-baseline

Phase quick, 2026-11-25T15:14:49.098Z.

Fixtures: {"followUps":400,"dueNow":217}

| Journey | reqs | p50 | p90 | p95 | p99 | max | req/s | errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| board | 120 | 2.97 | 4.83 | 5.89 | 8.71 | 22.72 | 272.7 | 0 |
| worklist | 120 | 3.03 | 4.55 | 4.81 | 7.64 | 9.36 | 292.4 | 0 |
| record | 120 | 0.63 | 1.56 | 1.74 | 2.54 | 2.56 | 1266.6 | 65 |
| patients | 120 | 0.24 | 0.41 | 0.51 | 0.84 | 1 | 3414.6 | 120 |
| health | 120 | 0.29 | 0.66 | 0.86 | 1.18 | 1.59 | 2615.7 | 120 |
| login | 20 | 0.48 | 0.6 | 0.6 | 0.83 | 0.83 | 1805 | 20 |
| mixed-c8 | 800 | 0.71 | 1.57 | 1.92 | 4 | 4.5 | 8726.8 | 800 |

Static asset transfer: {}

Resources: {"rssStartMb":67,"rssEndMb":91,"growthMb":24}

Reliability: {
  "health": {
    "status": 429,
    "ms": 0.75
  },
  "ready": {
    "status": 429,
    "ms": 0.31
  },
  "metrics": {
    "status": 429,
    "ms": 0.27
  },
  "rssBeforeShutdownMb": 91,
  "dbConnectionsDuringLoad": 4
}
