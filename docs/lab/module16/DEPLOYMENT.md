# Deployment checklist and environment comparison

## Environments

| | Lab (this build) | Production-like (reviewed, not built) |
| --- | --- | --- |
| Host | One Windows 11 workstation | One application host, or a container |
| Database | MariaDB 10.11 on the same host, XAMPP | Separate host or managed instance |
| TLS | None; loopback only | TLS terminator in front; `Secure` cookie flag and HSTS then apply |
| Configuration | `backend/.env` (untracked) | Same file, injected by the deploy step from a secret store |
| Static build | `flutter build web --release --base-href=/app/ --no-web-resources-cdn` copied to `backend/public/app` | Same artifact, deployed as a versioned release directory |
| Process supervision | A console window | systemd unit, service wrapper, or container restart policy |
| Logs | stdout, one JSON object per line | Same, collected by a shipper |
| Monitoring | `/api/health`, `/api/ready`, `/api/metrics` polled by hand | The same endpoints polled by an orchestrator and a monitor |

Nothing in the production column was built or tested. It is here to make the gap
explicit: the code is ready for those things, the deployment is not done.

## Checklist

Run in order. Each step has a check that must pass before the next.

| # | Step | Command | Must show |
| --- | --- | --- | --- |
| 1 | Configuration present and complete | `node -e "import('./config.js').then(m=>console.log(Object.keys(m.cfg)))"` | `rateLimit` present with three numeric fields |
| 2 | No secrets in the tree | `(git ls-files \| Select-String "\.pem$\|\.key$\|backend/\.env$").Count` | `0` |
| 3 | Database reachable | `node --env-file=.env scripts/lab-sql.js "SELECT 1"` | `[{"1":1}]` |
| 4 | Schema current | `npm run migrate:clinic` | every line `ok`, `follow_up_events: present` |
| 5 | Client build | `flutter build web --release --base-href=/app/ --no-web-resources-cdn` | `√ Built build\web` |
| 6 | Deploy artifact | `Copy-Item -Recurse -Force build\web backend\public\app` | — |
| 7 | Start under a supervisor, with an id | `BUILD_ID=<sha> node --env-file=.env server.js` | `listening on 127.0.0.1:3400` |
| 8 | Liveness | `curl http://127.0.0.1:3400/api/health` | `200 {"ok":true,...}` |
| 9 | Readiness | `curl http://127.0.0.1:3400/api/ready` | `200`, `ready:true`, `build` = the id from step 7 |
| 10 | The build identifies itself | `curl -s http://127.0.0.1:3400/api/ready \| Select-String build` | the same id, which is how you know which release answered |
| 11 | Client loads | open `http://localhost:3400/app/` | sign-in screen, no console errors |
| 12 | Functional smoke | the Module 15 collection | `37/37 passed` |
| 13 | Performance within bounds | `node --env-file=.env tests/m16-perf.js --phase quick` | p95 within the `WORKLOAD.md` thresholds |
| 14 | Clean shutdown | `Ctrl+C` or SIGTERM | `shutdown.complete` within 1 s, exit code 0 |

Steps 8 to 10 are the ones that catch a half-deployed release: a process that is
alive but not ready, or an old build still answering after a deploy.

## Why `--no-web-resources-cdn` is mandatory here

The API sends `Content-Security-Policy: default-src 'self'` for the app bundle. A
default Flutter build fetches CanvasKit and Roboto from `gstatic.com`, which that
policy blocks — the result is a blank page that looks like a crash. Found while
capturing Module 15's screenshots; it is in the checklist so it is not found again.

## Artifact sizes

| Artifact | Built size | On the wire (br) |
| --- | --- | --- |
| `build/web` (whole directory) | 41 MB | — |
| `main.dart.js` | 2,952,392 B | 792,435 B |
| `canvaskit/chromium/canvaskit.wasm` | 5,463,539 B | 1,845,588 B |
| First load, all assets | 8,707,017 B | 2,779,277 B (68.1% saved) |

41 MB is the directory; a browser never fetches all of it. The number that matters
is the 2.78 MB first load, measured from the browser in
`evidence/06-deployment/browser-transfer.json`.

## Configuration added in this module

| Key | Default | Effect |
| --- | --- | --- |
| `BUILD_ID` | `dev` | Reported by `/api/ready`, so a deploy can be confirmed by asking the running process |
| `RATE_LIMIT_USER_PER_MIN` | 300 | Per signed-in user. The limit a clinician could notice |
| `RATE_LIMIT_ADDRESS_PER_MIN` | 3000 | Flood net per address; must stay far above the user limit because a clinic shares one |
| `RATE_LIMIT_LOGIN_PER_MIN` | 10 | Per username, per minute |
| `COMPRESSION` | on | `off` exists only to measure the cost |

All five are read through `config.js` with bounds, so a typo becomes a startup-time
clamp rather than a surprising runtime value. Every one has a default, so an
existing `.env` keeps working unchanged.

## Rollback trigger and first response

Deploy is only finished when step 9 shows the new `BUILD_ID`. If a deploy fails that
check, roll back with `ROLLBACK.md` rather than debugging forward — the procedure
takes under a minute on this data volume and removes the pressure that causes
mistakes.
