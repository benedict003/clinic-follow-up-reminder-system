# Traceability matrix

Requirement → test case → evidence → limitation. "Before" is
`evidence/01-baseline/`, "after" is `evidence/02-hardened/`. Every case records
prediction, expected result, actual result, verdict and duration in its own JSON
file.

## Functional and contract (Topic 2)

| Req | Requirement | Case | Expected | Before | After | Evidence file |
| --- | --- | --- | --- | --- | --- | --- |
| R-FN-1 | The API answers a liveness probe before authentication | F1 | 200 `{ok:true}` | pass | pass | `01/F1.json`, `02/F1.json` |
| R-FN-2 | A clinician can sign in and receives a session cookie and CSRF token | F2 | 200 + cookie + token | pass | pass | `02/F2.json` |
| R-FN-3 | The follow-up board returns the documented envelope | F3 | `scope`, `counts{5 keys}`, rows with 6 named fields | pass | pass | `02/F3.json` |
| R-FN-4 | A record detail returns record, patient, history and jobs | F4 | four keys present | pass | pass | `02/F4.json` |
| R-FN-5 | A contact attempt marked "reached" moves the record to reminded | F5 | 200, status `reminded`, attempts 1 | pass | pass | `02/F5.json` |
| R-FN-6 | Rescheduling moves the date and increments the revision | F6 | 200, version + 1, new date | pass | pass | `02/F6.json` |
| R-FN-7 | A doctor can close a follow-up with an outcome | F7 | 200, status `closed`, outcome `attended` | pass | pass | `02/F7.json` |

Limitation: F3 asserts the presence and names of fields, not their full value
range. A field renamed on both sides would pass; the Flutter contract test
(`test/clinical_models_test.dart`) closes that gap from the client side.

## Invalid input (Topic 2)

| Req | Requirement | Case | Expected | Before | After | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| R-VAL-1 | An unknown contact outcome is rejected | V1 | 400 | pass | pass | `02/V1.json` |
| R-VAL-2 | A malformed due date is rejected | V2 | 400 | pass | pass | `02/V2.json` |
| R-VAL-3 | A due date in the past is rejected | V3 | 400 | pass | pass | `02/V3.json` |
| R-VAL-4 | A malformed JSON body returns the documented error contract | V4 | 400, `MALFORMED_JSON`, request id, no parser text | **fail** | pass | `01/V4.json`, `02/V4.json` |
| R-VAL-5 | An oversized body is rejected within a bound | V5 | 413, `BODY_TOO_LARGE`, request id | **fail** | pass | `01/V5.json`, `02/V5.json` |
| R-VAL-6 | Closing as lost-to-follow-up requires a note | V6 | 400 | pass | pass | `02/V6.json` |

## Authentication and authorization (Topic 4)

| Req | Requirement | Case | Expected | Before | After | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| R-AUTHN-1 | A protected route refuses an anonymous caller | A1 | 401 `UNAUTHENTICATED` | **fail** (401, no code) | pass | `01/A1.json`, `02/A1.json` |
| R-AUTHN-2 | A forged session cookie is refused | A2 | 401 | pass | pass | `02/A2.json` |
| R-AUTHN-3 | A write without a CSRF token is refused | A3 | 403 | pass | pass | `02/A3.json` |
| R-AUTHN-4 | A write with the wrong CSRF token is refused | A4 | 403 | pass | pass | `02/A4.json` |
| R-AUTHN-5 | A cross-site Origin is refused | A5 | 403 | pass | pass | `02/A5.json` |
| R-AUTHN-6 | A session revoked server-side stops working | A6 | 401 | pass | pass | `02/A6.json` |
| R-AUTHZ-1 | A nurse cannot close a follow-up | Z1 | 403 `FORBIDDEN_ROLE` | **fail** (403, no code) | pass | `01/Z1.json`, `02/Z1.json` |
| R-AUTHZ-2 | A nurse can still record a contact attempt | Z2 | 200 | pass | pass | `02/Z2.json` |
| R-AUTHZ-3 | A nurse is not shown doctor-directed alerts | Z3 | doctor sees ≥1, nurse sees 0 | **fail** (nurse 1) | pass | `01/Z3.json`, `02/Z3.json` |

Limitation: authorization is tested for the two roles the schema defines. There is
no per-object ownership model (every clinician may read every patient's record),
which is correct for a single clinic and wrong for a multi-tenant deployment. Stated
in the report as a limitation, not a control.

## Not found and duplicate submissions (Topic 2)

| Req | Requirement | Case | Expected | Before | After | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| R-NF-1 | An unknown follow-up id returns 404 | N1 | 404 | pass | pass | `02/N1.json` |
| R-NF-2 | An unknown API path returns 404 in the same error contract | N2 | 404 + error + request id | **fail** (no request id) | pass | `01/N2.json`, `02/N2.json` |
| R-DUP-1 | Queueing the same reminder twice creates one job | D1 | 201 then 200, `deduplicated:true`, same id | pass | pass | `02/D1.json` |
| R-DUP-2 | Closing an already-closed follow-up returns 409 | D2 | 409 | pass | pass | `02/D2.json` |
| R-DUP-3 | Registering an existing patient id returns 409 | D3 | 409 | pass | pass | `02/D3.json` |

## Reliability and failure conditions (Topic 3)

| Req | Requirement | Case | Expected | Before | After | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| R-REL-1 | A 503 is retried to the attempt limit, then escalated | R1 | `needs_human`, 3 attempts | pass | pass | `02/R1.json` |
| R-REL-2 | A gateway that never answers times out within a bound | R2 | `needs_human`, a TIMEOUT attempt recorded, attempts ≤ max | **fail** (recorded code `23`) | pass | `01/R2.json`, `02/R2.json` |
| R-REL-3 | The same path succeeds once the dependency recovers | R3 | `succeeded` | pass | pass | `02/R3.json` |

Observation for R2: the job was escalated correctly in both runs — the retry
budget held and nothing spun. What failed before was the *signal*: the attempt row
carried the DOMException's numeric code instead of `TIMEOUT`, so an operator could
not tell a slow gateway from an unreachable one. The module's "actionable signal"
criterion is what the fix addresses.

## Security hardening (Topic 4)

| Req | Requirement | Case | Expected | Before | After | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| R-SEC-1 | Responses carry anti-sniffing, anti-framing, referrer, CSP and permissions headers | S1 | 6 headers | **fail** (0 of 6) | pass | `01/S1.json`, `02/S1.json` |
| R-SEC-2 | An inbound correlation id is preserved end to end | S2 | echoed verbatim | **fail** (none) | pass | `01/S2.json`, `02/S2.json` |
| R-SEC-3 | Repeated failed logins are limited | S3 | 429 + `Retry-After` | **fail** (401 × 12) | pass | `01/S3.json`, `02/S3.json` |
| R-SEC-4 | Login latency does not reveal whether a username exists | S4 | median delta ≤ 15 ms | **fail** (37 ms) | pass (0 ms) | `01/S4.json`, `02/S4.json` |
| R-SEC-5 | A non-numeric path parameter is a client error | S5 | 400 `INVALID_PARAMETER` | **fail** (500) | pass | `01/S5.json`, `02/S5.json` |
| R-SEC-6 | An exchange-layer refusal keeps its declared status and code | S6 | 409 `FOLLOW_UP_NOT_DISCLOSABLE` | n/a (added) | pass | `02/S6.json` |
| R-SEC-7 | Logs contain no password, token or key material, and do carry correlation ids | L1 | 0 secrets, ≥1 correlation id | **fail** (0 ids) | pass (125 ids) | `01/L1.json`, `02/L1.json` |

## Interface states (Flutter Web)

Verified by automated widget tests rather than screenshots alone, so the result is
reproducible: `test/screen_layout_test.dart` builds every screen at 1280×800 and
380×800 and taps three points, failing on any framework error; `test/widget_test.dart`
covers the sign-in form and its validation; `test/clinical_models_test.dart` parses
the real API payloads the screens render.

| Req | State | How it is verified |
| --- | --- | --- |
| R-UI-1 | Loading | `FutureBuilder` shows `LoadingView`; asserted by pumping frames before completion in the layout test |
| R-UI-2 | Success | Model contract test parses captured API payloads; screens render from them |
| R-UI-3 | Validation | `widget_test.dart` submits empty credentials and expects both field messages |
| R-UI-4 | Authentication | Session expiry unwinds to the sign-in screen (`main.dart` `onSessionExpired`) |
| R-UI-5 | Authorization | Nurse path renders an explanation instead of the close action; nurse close is refused server-side (Z1) |
| R-UI-6 | Empty | `EmptyNote` on an empty board, register and history |
| R-UI-7 | Failure | `ErrorView` with retry; a failed request cannot leave the page inert |
| R-UI-8 | Responsive | Same screens at 1280×800 and 380×800, zero framework errors, zero overflows |
