# Module 15 collection — 01-baseline

Ran 2026-11-25T13:32:24.908Z against clinic_followup_m15 on http://127.0.0.1:3411.

**23/36 passed, 13 failed.**

| ID | Topic | Case | Verdict | ms |
| --- | --- | --- | --- | --- |
| F1 | contract | Health endpoint answers before authentication | pass | 3 |
| F2 | authentication | Doctor signs in and receives a session cookie and CSRF token | pass | 53 |
| F3 | contract | Follow-up board returns the documented envelope | pass | 8 |
| F4 | contract | Follow-up detail returns record, patient, history and jobs | pass | 7 |
| F5 | functional | Contact attempt "reached" moves the record to reminded | pass | 7 |
| F6 | functional | Reschedule moves the date and increments the revision | pass | 5 |
| F7 | functional | Doctor closes a follow-up with an outcome | pass | 7 |
| V1 | invalid | Unknown contact outcome is rejected | pass | 3 |
| V2 | invalid | Malformed due date is rejected | pass | 2 |
| V3 | invalid | Rescheduling into the past is rejected | pass | 2 |
| V4 | invalid | Malformed JSON body returns a consistent error contract | FAIL | 4 |
| V5 | invalid | Oversized body is rejected with a bounded error | FAIL | 4 |
| V6 | invalid | Closing as lost-to-follow-up requires a note | pass | 2 |
| A1 | authentication | No session is refused on a protected route | FAIL | 1 |
| A2 | authentication | A forged session cookie is refused | pass | 1 |
| A3 | authentication | A write without a CSRF token is refused | pass | 2 |
| A4 | authentication | A write with the wrong CSRF token is refused | pass | 2 |
| A5 | authentication | A cross-site Origin is refused | pass | 1 |
| A6 | authentication | A session revoked server-side no longer authenticates | pass | 2 |
| Z1 | authorization | A nurse cannot close a follow-up | FAIL | 2 |
| Z2 | authorization | A nurse may still record a contact attempt | pass | 3 |
| N1 | not-found | An unknown follow-up id returns 404 | pass | 2 |
| N2 | not-found | An unknown API path returns 404 with the error contract | FAIL | 1 |
| D1 | duplicate | Queueing the same reminder twice is idempotent | pass | 7 |
| D2 | duplicate | Closing the same follow-up twice returns 409 | pass | 2 |
| D3 | duplicate | Registering an existing patient id returns 409 | pass | 2 |
| R1 | reliability | A 503 from the gateway is retried to the limit, then escalated | pass | 0 |
| R2 | reliability | A gateway that never answers times out and is bounded | FAIL | 0 |
| R3 | reliability | The same path succeeds once the gateway recovers | pass | 0 |
| Z3 | authorization | A nurse does not receive doctor-only automation alerts | FAIL | 5 |
| S1 | hardening | Security headers are present on API responses | FAIL | 1 |
| S2 | hardening | An inbound correlation id is preserved for tracing | FAIL | 1 |
| S3 | hardening | Repeated failed logins are rate limited | FAIL | 1 |
| S4 | hardening | Login timing does not reveal whether a username exists | FAIL | 41 |
| S5 | hardening | A server-side failure returns a safe error without internals | FAIL | 3 |
| L1 | hardening | Logs contain no password, token or key material | FAIL | 0 |
