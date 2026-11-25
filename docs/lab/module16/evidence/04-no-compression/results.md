# Module 16 performance run — 04-no-compression

Phase full, 2026-11-25T15:21:16.010Z.

Fixtures: {"followUps":400,"dueNow":217}

| Journey | reqs | p50 | p90 | p95 | p99 | max | req/s | errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| board | 120 | 3.1 | 5.29 | 5.72 | 19.45 | 19.51 | 264.3 | 0 |
| worklist | 120 | 2.61 | 3.95 | 4.43 | 8.01 | 8.04 | 334.1 | 0 |
| record | 120 | 0.97 | 1.55 | 2.26 | 3.37 | 3.38 | 845.3 | 0 |
| patients | 120 | 1.31 | 2.36 | 2.72 | 3.65 | 3.82 | 635.2 | 0 |
| health | 120 | 0.34 | 0.77 | 1.02 | 1.66 | 1.74 | 2233.6 | 0 |
| login | 20 | 40.39 | 41.5 | 41.52 | 42.99 | 42.99 | 24.7 | 0 |
| mixed-c8 | 800 | 5.79 | 9.48 | 10.66 | 14.24 | 22.92 | 1264 | 0 |
| mixed-c32 | 1600 | 23.87 | 44.31 | 47.92 | 53.39 | 56.93 | 1162.4 | 0 |
| soak-20s | 4772 | 9.71 | 12.37 | 13.13 | 17.8 | 33.79 | 238.5 | 0 |

Static asset transfer: {
  "/app/main.dart.js": {
    "uncompressedBytes": 2952392,
    "compressedBytes": 2952392,
    "encodedWith": "none",
    "cacheControl": "public, max-age=3600",
    "transferMs": 11.65
  },
  "/app/canvaskit/canvaskit.wasm": {
    "uncompressedBytes": 7315452,
    "compressedBytes": 7315452,
    "encodedWith": "none",
    "cacheControl": "public, max-age=31536000, immutable",
    "transferMs": 13.9
  },
  "/app/flutter_bootstrap.js": {
    "uncompressedBytes": 14152,
    "compressedBytes": 14152,
    "encodedWith": "none",
    "cacheControl": "no-cache",
    "transferMs": 0.6
  },
  "/app/assets/FontManifest.json": {
    "uncompressedBytes": 284,
    "compressedBytes": 284,
    "encodedWith": "none",
    "cacheControl": "public, max-age=31536000, immutable",
    "transferMs": 0.38
  }
}

Resources: {"rssStartMb":67,"rssEndMb":159,"growthMb":92}

Reliability: {
  "health": {
    "status": 200,
    "ms": 1.41
  },
  "ready": {
    "status": 200,
    "ms": 2.11
  },
  "metrics": {
    "status": 200,
    "ms": 0.73
  },
  "rssBeforeShutdownMb": 159,
  "dbConnectionsDuringLoad": 12,
  "limiter": {
    "configuredPerMinute": 10,
    "authenticatedRequests": [
      200,
      200,
      200,
      200,
      200,
      200,
      200,
      200,
      200,
      429,
      429,
      429,
      429,
      429
    ],
    "firstRefusalAt": 10,
    "probesDuringBurst": [
      200
    ],
    "works": true
  },
  "gracefulShutdown": {
    "exited": true,
    "msToExit": 102
  }
}
