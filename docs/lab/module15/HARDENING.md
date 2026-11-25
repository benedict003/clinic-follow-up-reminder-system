# Hardening backlog and what was implemented

Ranked by likelihood × impact × exposure at the start of the week. "Measured" means
the number comes from a collection case in `evidence/`, not from inspection.

| # | Weakness | Likelihood | Impact | Exposure | Rank | Fixed |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | A server-side failure leaked the JSON parser's own message and had no code or request id | high | low | public | 5 | yes |
| H2 | No correlation id in any response or log line | certain | medium | public | 3 | yes |
| H3 | No anti-framing, anti-sniffing, referrer, CSP or permissions headers | certain | medium | public | 2 | yes |
| H4 | Unlimited password guessing on `/api/login` | medium | high | public | 1 | yes |
| H5 | Login latency revealed whether a username exists (37 ms gap) | medium | medium | public | 4 | yes |
| H6 | A nurse received alerts addressed to a doctor | low | medium | authenticated | 7 | yes |
| H7 | Timeout attempts stored a meaningless numeric code instead of `TIMEOUT` | medium | medium | operators | 6 | yes |
| H8 | A non-numeric path parameter produced a 500 instead of a 400 | medium | low | authenticated | 9 | yes |
| H9 | Every `EnvelopeError` from Module 14 became a generic 500 | certain | high | authenticated | 1 | yes |
| H10 | Session cookie has no `Secure` flag when served over TLS | low in lab | high in production | deployment | 8 | partly (code added, not observable on loopback) |
| H11 | No per-object ownership model | n/a single tenant | high multi-tenant | out of scope | — | no (declared limitation) |
| H12 | CSP for the Flutter bundle allows `'unsafe-eval'` | low | medium | public | — | no (declared limitation) |

Ranking rationale: H4, H9 and H3 are "certain or near-certain to be exercised,
publicly reachable, and cheap to exploit". H4 is first because a clinic account
holds patient records; H9 is tied because it silently converted every deliberate
refusal into an unexplained failure, which degrades both the client and the audit
trail.

## What each control now does

### H2 / H3 / H4 headers and correlation — `backend/security.js`

```js
app.use(requestContext);      // correlation id + access log, first
app.use(securityHeaders);     // headers on every response, including rejections
app.use('/api', rateLimit({ name: 'api-burst', windowMs: 60_000, max: 300 }));
```

Headers set on every response: `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a
`Content-Security-Policy` that is `default-src 'none'` for `/api` and a
CanvasKit-compatible policy for the app bundle, `Permissions-Policy`,
`Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
`X-Permitted-Cross-Domain-Policies`, and `Strict-Transport-Security` only when the
request arrived over TLS.

The correlation id is accepted from an inbound `X-Request-Id` when it matches
`^[A-Za-z0-9._-]{8,64}$`, otherwise generated; it is echoed on the response, put in
every error body, and written on every log line. The access log records method,
path, status, duration and actor — never the query string, because the board's
search box carries a patient name.

### H4 login rate limit — `backend/security.js`, `backend/server.js`

Fixed window of 10 attempts per username per 60 s, with `Retry-After` and a
`security.rate_limited` log line carrying a hash of the key (not the username).
Keyed by username rather than address so one noisy client cannot lock out a shared
clinic workstation.

### H5 constant-time login — `backend/auth.js`, `backend/routes.js`

```js
const ok = user
  ? verifyPassword(password, user.password_hash)
  : (verifyPassword(password, DUMMY_PASSWORD_HASH), false);
```

A missing account now costs the same scrypt work as a real one. Measured median:
39 ms vs 2 ms before, 39 ms vs 39 ms after (`02/S4.json`).

### H6 role-scoped alerts — `backend/service.js`, `backend/routes.js`

`findJobDetail(id, actor)` returns alert rows only to the role they were addressed
to, and an empty array to everyone else — not a filtered one, so the caller cannot
infer that a doctor-directed alert exists.

### H7 timeout code — `backend/worker.js`

`AbortSignal.timeout()` rejects with a `DOMException` whose numeric `code` is 23.
The mapper now checks `name` first, so the attempt row says `TIMEOUT` and an
operator can tell a slow gateway from an unreachable one.

### H8 path parameter validation — `backend/secure/api.js`

`followUpIdOf(req)` rejects anything that is not a positive integer with
`400 INVALID_PARAMETER`, once, for every route that takes the parameter.

### H9 error-status fidelity — `backend/security.js`

The handler now reads `err.httpStatus` as well as `err.status`, and accepts an
error's own uppercase code below 500 (never above, so `ER_DUP_ENTRY` cannot leak).
`clinical.js` gained an optional `apiCode` so its role gate returns
`FORBIDDEN_ROLE`, matching the shared guard.

## Regression evidence

Every case that passed in the baseline still passes in the hardened run — 23 cases
carried over unchanged, 13 fixed, 1 added, zero regressions. The comparison is in
`evidence/02-hardened/summary.json` and reproduced as a table in the report.

The functional half of the collection (F1–F7, D1–D3, R1–R3) is the regression set:
it exercises the workflow a clinician actually uses, so it fails loudly if a
hardening change breaks normal operation.
