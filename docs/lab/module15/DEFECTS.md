# Defect records

Each record has the reproduction, the cause, the fix and the retest. The two
defects marked **pre-existing** were introduced by earlier modules and only became
visible when this module's collection exercised the paths systematically.

---

## D-01 — Login latency disclosed which usernames exist · **fixed**

**Found by** S4. **Severity** medium (information disclosure).
**Reproduce** `POST /api/login` five times with `doctor1` and a wrong password, then
five times with a username that does not exist; compare medians.

**Observed (baseline)** real median 39 ms, unknown-user median 2 ms, gap 37 ms.

**Cause** `routes.js` evaluated `if (!user || !verifyPassword(...))`. With no user
row the `scrypt` call never ran, so the response returned in the time it takes to
answer from a map lookup.

**Fix** verify against a precomputed dummy hash when the row is missing, so both
paths perform the same `scrypt` work; single failure message and code for both
cases.

**Retest** S4 passes with 39 ms vs 39 ms (0 ms gap, threshold 15 ms).

---

## D-02 — Unlimited password guessing on `/api/login` · **fixed**

**Found by** S3. **Severity** high (credential stuffing).

**Observed (baseline)** twelve consecutive failed logins answered `401` with no
limit and no delay; sequence `401,401,…` twelve times.

**Cause** no rate limiting existed anywhere in the service.

**Fix** fixed-window limiter keyed by normalised username, 10 per 60 s, `429` with
`Retry-After`, plus a generous 300/min burst limit for the API as a whole. Keyed by
username rather than address so a clinic behind one address is not locked out by a
single bad client.

**Retest** S3 passes: the 11th attempt returns `429` with `Retry-After`.

---

## D-03 — A timeout was recorded as error code `23` · **fixed**

**Found by** R2. **Severity** medium (operability — the failure was correctly
handled but misreported).

**Observed (baseline)** job escalated to `needs_human` with three attempts of
~710 ms each, as predicted; the attempt rows carried `23` instead of `TIMEOUT`,
because the DOMException's numeric `code` won the `||` chain.

**Cause** `worker.js` `callGateway` mapped `e?.code` before checking `e?.name`.

**Fix** check `TimeoutError` / `AbortError` names first; only accept string codes
from `cause`, else fall back to `NETWORK_ERROR`.

**Retest** R2 passes; the attempt records `TIMEOUT` and the log line reads
`durationMs ≈ 700`.

---

## D-04 — Nothing in the response or the log could be traced · **fixed**

**Found by** S2, L1. **Severity** medium (monitoring and support).

**Observed (baseline)** no `X-Request-Id` header, no correlation id in any log
line (0 of 36 lines), errors carried only a human string.

**Cause** no request-context middleware; logging was ad hoc `console.log` in three
modules with three different shapes.

**Fix** `requestContext` sets and echoes the id, logs `request.complete` /
`request.failed` / `request.slow` in one JSON shape, and the error body carries
`requestId` and a stable `code` beside the existing `error` string.

**Retest** S2 passes (inbound id echoed verbatim); L1 counts 125 correlation ids in
161 log lines, with no password, token or key material present.

**Contract note** `error` stays a plain string because the Flutter client parses it
that way (`clinic_api.dart`). `code` and `requestId` are additive, so the change did
not require a client release. This is the one place where the module's "consistent
error contract" requirement collided with an existing consumer, and the resolution
is recorded rather than hidden.

---

## D-05 — A malformed request answered with a 500 and the parser's own text · **fixed**

**Found by** S5 (direct probe). **Severity** low (information leakage, misleading
status).

**Observed (baseline)** `GET /api/secure/preview/abc` → `500
{"error":"The request could not be completed."}`. A malformed JSON body returned
`400` with `"Unexpected token , in JSON at position 24"` and no code.

**Cause** two separate faults:
1. The secure routes passed `Number(req.params.followUpId)` straight to the data
   layer; `NaN` is not a client-visible failure there, so the route answered 500.
2. `express.json()` errors were surfaced verbatim, leaking parser internals.

**Fix** `followUpIdOf()` validates once for every parameterised route
(`400 INVALID_PARAMETER`), and the error handler translates body-parser failures to
fixed messages with codes (`MALFORMED_JSON`, `BODY_TOO_LARGE`,
`UNSUPPORTED_MEDIA_TYPE`).

**Retest** S5 passes with `400 INVALID_PARAMETER` and a request id.

---

## D-06 — Every Module 14 refusal became a generic 500 · **fixed** · **pre-existing**

**Found by** S5's investigation, confirmed by S6. **Severity** high (the caller was
told nothing, and the audit trail recorded a server fault where there was a
deliberate decision).

**Cause** `crypto/envelope.js` throws `EnvelopeError`, which stores its intended
HTTP status in `httpStatus`. The error handler read only `err.status`, so
`FOLLOW_UP_NOT_FOUND` (404), `FOLLOW_UP_NOT_DISCLOSABLE` (409) and every receiver
rejection (422) were reported as `500` with "The request could not be completed."

**Why it matters beyond the status code** the exchange screen shows the returned
code and message to the clinician. A 500 here means a refusal that cannot be
explained — the same class of problem Module 14 §12.2 already recorded once, in a
different place.

**Fix** the handler honours `httpStatus` and accepts an error's own uppercase code
below 500. Above 500 the generic code stands, so driver errors such as
`ER_DUP_ENTRY` can never be echoed to a caller.

**Retest** S6 passes: `409 FOLLOW_UP_NOT_DISCLOSABLE`.

---

## D-07 — A nurse received alerts addressed to a doctor · **fixed** · **pre-existing**

**Found by** Z3. **Severity** medium (authorization, cross-role exposure).

**Observed (baseline)** nurse view of the escalated job contained 1 alert; the
doctor's view contained the same alert.

**Cause** `findJobDetail(id)` had no actor, so the alert query was unscoped by
role even though the list endpoint scoped its own `unreadAlerts` count.

**Fix** `findJobDetail(id, actor)` returns alerts only to the addressed role, and an
empty array otherwise.

**Retest** Z3 passes: doctor ≥1, nurse 0.

---

## Not a defect, recorded because it was tested and refused

**Ten-minute envelope window and replay** (Module 14) were not re-tested here: the
partner receiver needs its TLS material and a running second process, which is
outside this module's scope. Module 14's own suite covers them and is unaffected by
these changes (`S6` confirms the send path still refuses correctly without the
receiver present).

---

## D-08 — Tabs drew two title bars · **fixed** · found while capturing

**Found by** taking the Module 15 interface captures. **Severity** low (cosmetic, but it reads as a broken build).

**Observed** the Follow-ups, Patients and Reminders tabs each rendered the
screen title twice: once from `HomeShell`'s `AppBar`, once from the screen's own
`Scaffold(appBar: ...)`. See the before/after history: the first capture of
`15-01-board.png` shows `Follow-ups` on two consecutive bars.

**Cause** `HomeShell` wraps tabs in an `IndexedStack` and owns the title bar, but
each tab also built a `Scaffold` with its own `appBar`. Both were correct in
isolation; the composition was not.

**Fix** tabs no longer draw an `AppBar`. Their reload and queue actions moved
beside the search field / filters, so nothing was lost. `FollowUpDetailScreen`
keeps its own bar because it is a pushed route, not a tab.

**Retest** `15-01`, `15-02` and `15-06` recaptured show one title bar;
`flutter test` still 20/20 and `flutter analyze` unchanged.

---

## D-09 — The failure banner showed a raw `ClientException` · **fixed** · found while capturing

**Found by** stopping the API and capturing the failure state (`15-07`).
**Severity** medium (usability and information disclosure).

**Observed**

```
Cannot reach http://localhost:3400
ClientException: Failed to fetch, uri=http://localhost:3400/api/clinical/follow-ups?scope=today
```

**Cause** `clinic_api.dart` interpolated the caught exception into the message
(`'Cannot reach $baseUrl\n$e'`), and `ErrorView` printed whatever it was given.
So the clinician got a Dart exception, and the text named the internal host and an
API path with its query string.

**Fix** two layers. The API client now logs the exception with `debugPrint` and
throws a message that says what to do ("Cannot reach the clinic server. Check that
the backend is running, then try again."). `ErrorView` and `showError` print an
`ApiException` message verbatim but replace any other error with a generic
sentence, so a future unhandled type cannot leak internals either.

**Retest** `15-07` recaptured shows the actionable message only. The same case is
covered mechanically by the layout test, which pumps every screen with the backend
absent.

---

## D-10 — The access log recorded router-trimmed paths · **fixed** · found while capturing

**Found by** reading the server log after a capture run. **Severity** low
(correlation quality).

**Observed** requests to `/api/clinical/follow-ups` were logged as
`"path":"/follow-ups"`, because Express rewrites `req.url` while a mounted router
handles the request and the access log read `req.path` at `finish` time. Two
different routers exposing the same sub-path would have been indistinguishable.

**Fix** the context middleware snapshots `req.originalUrl` (query string dropped,
because the board's search box carries patient names) before the routers run.

**Retest** run `03-after-ui-fixes`: 31 log lines now carry the full
`/api/clinical/...` path, and the `handlebars`-free `L1` case still passes.

**Note on the third run.** `03-after-ui-fixes` exists because D-08 to D-10 were
fixed after the baseline and hardened runs were recorded. The baseline and hardened
folders are left exactly as they were; the third run is the confirmation that the
UI and logging changes did not disturb any of the 37 cases (37/37).

---

## D-11 — The generated documents could not be opened by Word · **fixed**

**Found by** the learner opening `Module15.docx` for submission.
**Severity** high (the deliverable was unreadable in the application it is meant
for).

**Observed** Word reported "Word experienced an error trying to open the file" for
`Module15.docx` and `Module15-evidence.docx`. The earlier, image-free build of the
same report opened normally.

**Cause** the documents are generated. The image markup used the `wp:`
(drawingml wordprocessingDrawing) prefix, but the `<w:document>` root declared only
`w`, `w14`, `r` and `mc`. An undeclared prefix makes `document.xml` invalid XML, and
Word refuses the package outright. `a:` and `pic:` happened to be declared inline
where they were used; `wp:` was not declared anywhere.

**Why the earlier checks missed it** `unzip` succeeds on a structurally valid ZIP,
and the markdown converter used to proof-read the text parses leniently. Both were
answering a different question from the one that mattered: *will Word open this?*
The lesson is the same one this module makes elsewhere — a check that does not run
in the real environment is not evidence.

**Fix** both generators declare `wp`, `a` and `pic` on the root element.
`docs/lab/module15/validate-docx.js` was added and now runs as part of the build
check; it verifies, in the order these things actually break:

1. every element prefix is declared;
2. `document.xml` parses under a strict parser (PowerShell `[xml]`, not a
   lenient converter);
3. every `r:embed` resolves to a relationship and relationship IDs are unique;
4. `[Content_Types].xml` declares the png default exactly once and an Override for
   `document.xml`;
5. zip entry names use forward slashes.

**Retest** all three documents pass the validator, and were then opened in Word
through COM automation, which is the application a reviewer will use:

```
Module15.docx                    pages=20  images=8  tables=16
Module15-evidence.docx           pages=9   images=8  tables=7
Module 15-operational-manual.docx pages=5  images=0  tables=6
```

Image dimensions confirmed inside Word: 446x279 pt for desktop captures and
171x360 pt for the narrow ones, i.e. the intended sizes, not stacked or missing.

---

## D-12 — Private keys and environment files were tracked in the repository · **fixed**

**Found by** auditing the remote before submission, not by a test. **Severity** high
(the module's own checklist requires that no key material is tracked).

**Observed** `git ls-tree` at HEAD contained:

```
backend/keys/recipient-private.pem      the only key that can open an envelope
backend/keys/sender-private.pem         the key that signs as the clinic
backend/keys/ref.key                    HMAC key behind recordRef pseudonyms
backend/tls/*-key.pem                   TLS private keys
backend/.env.bak-*  (4 files)           DB_PASSWORD and LAB_PASSWORD in clear
backend/.env.receiver                   names the receiver's private key
```

**Cause** `.gitignore` listed `keys/`, `tls/` and `*.pem`, but those files were
committed before the rules existed, and git keeps tracking what it already tracks.
The ignore rules created the appearance of hygiene while the objects stayed in the
tree — the same mistake Module 14 §12 records, in a different place.

**Fix** the files were untracked with `git rm --cached` (they stay on disk, so local
runs are unaffected), `.gitignore` gained `backend/.env.*` with explicit exceptions
for the two example files, and `backend/.env.receiver.example` was added so the
receiver is reproducible without borrowing secrets.

**Retest** at HEAD: 531 files, zero matches for `.pem`, `.key`, `keys/`, `tls/`, or a
real `.env`. The precondition check in the Module 15 manual now prints 0.

**Residual risk, stated rather than hidden** the keys remain in history and have
been public. Removing them from history needs a rewrite and a force-push. The
learner's decision was to disclose this to the instructor and regenerate the keys
before any real patient data exists, rather than rewrite a submitted repository.
