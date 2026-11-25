# Module 16 performance run — 03-capacity

Phase full, 2026-11-25T15:24:48.098Z.

Fixtures: {"followUps":400,"dueNow":217}

| Journey | reqs | p50 | p90 | p95 | p99 | max | req/s | errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| board | 120 | 2.82 | 4.19 | 4.6 | 8.82 | 22.78 | 304.6 | 0 |
| worklist | 120 | 2.62 | 4.13 | 4.48 | 5.85 | 7.01 | 333.1 | 0 |
| record | 120 | 0.97 | 1.92 | 2.38 | 3.21 | 3.79 | 796 | 0 |
| patients | 120 | 1.12 | 1.6 | 2.32 | 2.43 | 2.68 | 767.6 | 0 |
| health | 120 | 0.37 | 0.8 | 1.05 | 1.76 | 1.88 | 1928.6 | 0 |
| login | 20 | 42.76 | 47.2 | 50.57 | 56.84 | 56.84 | 22.5 | 0 |
| mixed-c8 | 800 | 5.8 | 9.29 | 10.36 | 15.36 | 21.15 | 1263.1 | 0 |
| mixed-c32 | 1600 | 18.86 | 32.92 | 35.86 | 42.56 | 46.94 | 1497 | 0 |
| soak-20s | 4779 | 9.72 | 12.26 | 13.12 | 17.49 | 22.29 | 238.9 | 0 |

Static asset transfer: {
  "/app/main.dart.js": {
    "uncompressedBytes": 2952392,
    "compressedBytes": 791500,
    "encodedWith": "br",
    "cacheControl": "public, max-age=3600",
    "transferMs": 1.88
  },
  "/app/canvaskit/canvaskit.wasm": {
    "uncompressedBytes": 7315452,
    "compressedBytes": 2685797,
    "encodedWith": "br",
    "cacheControl": "public, max-age=31536000, immutable",
    "transferMs": 3.86
  },
  "/app/flutter_bootstrap.js": {
    "uncompressedBytes": 14152,
    "compressedBytes": 5298,
    "encodedWith": "br",
    "cacheControl": "no-cache",
    "transferMs": 0.72
  },
  "/app/assets/FontManifest.json": {
    "uncompressedBytes": 284,
    "compressedBytes": 284,
    "encodedWith": "none",
    "cacheControl": "public, max-age=31536000, immutable",
    "transferMs": 0.66
  }
}

Resources: {"rssStartMb":66,"rssEndMb":161,"growthMb":95}

Reliability: {
  "health": {
    "status": 200,
    "ms": 1.43
  },
  "ready": {
    "status": 200,
    "ms": 1.23
  },
  "metrics": {
    "status": 200,
    "ms": 1
  },
  "rssBeforeShutdownMb": 161,
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
  "poolResilience": {
    "connectionsKilled": 10,
    "readyStatusAfterLoss": 200,
    "readyDetectedInMs": 3,
    "livenessDuringLoss": 200,
    "recoveredAfterMs": 271,
    "interpretation": "pool reconnected automatically; readiness stayed true because the service could still serve"
  },
  "readinessOnMissingDependency": {
    "instanceStarted": true,
    "readinessStatus": 503,
    "readinessDetectedInMs": 4,
    "livenessStatus": 200,
    "readinessReportedDatabaseError": true,
    "works": true
  },
  "gracefulShutdown": {
    "exited": true,
    "msToExit": 112
  }
}
