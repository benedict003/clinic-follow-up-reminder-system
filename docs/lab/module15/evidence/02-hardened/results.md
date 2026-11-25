# Module 15 collection — 02-hardened

Ran 2026-11-25T13:41:08.284Z against clinic_followup_m15 on http://127.0.0.1:3411.

**37/37 passed, 0 failed.**

| ID | Topic | Case | Verdict | ms |
| --- | --- | --- | --- | --- |
| F1 | contract | Health endpoint answers before authentication | pass | 3 |
| F2 | authentication | Doctor signs in and receives a session cookie and CSRF token | pass | 51 |
| F3 | contract | Follow-up board returns the documented envelope | pass | 8 |
| F4 | contract | Follow-up detail returns record, patient, history and jobs | pass | 9 |
| F5 | functional | Contact attempt "reached" moves the record to reminded | pass | 7 |
| F6 | functional | Reschedule moves the date and increments the revision | pass | 7 |
| F7 | functional | Doctor closes a follow-up with an outcome | pass | 6 |
| V1 | invalid | Unknown contact outcome is rejected | pass | 3 |
| V2 | invalid | Malformed due date is rejected | pass | 3 |
| V3 | invalid | Rescheduling into the past is rejected | pass | 2 |
| V4 | invalid | Malformed JSON body returns a consistent error contract | pass | 2 |
| V5 | invalid | Oversized body is rejected with a bounded error | pass | 3 |
| V6 | invalid | Closing as lost-to-follow-up requires a note | pass | 5 |
| A1 | authentication | No session is refused on a protected route | pass | 2 |
| A2 | authentication | A forged session cookie is refused | pass | 2 |
| A3 | authentication | A write without a CSRF token is refused | pass | 2 |
| A4 | authentication | A write with the wrong CSRF token is refused | pass | 2 |
| A5 | authentication | A cross-site Origin is refused | pass | 1 |
| A6 | authentication | A session revoked server-side no longer authenticates | pass | 2 |
| Z1 | authorization | A nurse cannot close a follow-up | pass | 3 |
| Z2 | authorization | A nurse may still record a contact attempt | pass | 8 |
| N1 | not-found | An unknown follow-up id returns 404 | pass | 3 |
| N2 | not-found | An unknown API path returns 404 with the error contract | pass | 2 |
| D1 | duplicate | Queueing the same reminder twice is idempotent | pass | 12 |
| D2 | duplicate | Closing the same follow-up twice returns 409 | pass | 4 |
| D3 | duplicate | Registering an existing patient id returns 409 | pass | 3 |
| R1 | reliability | A 503 from the gateway is retried to the limit, then escalated | pass | 0 |
| R2 | reliability | A gateway that never answers times out and is bounded | pass | 0 |
| R3 | reliability | The same path succeeds once the gateway recovers | pass | 0 |
| Z3 | authorization | A nurse does not receive doctor-only automation alerts | pass | 4 |
| S1 | hardening | Security headers are present on API responses | pass | 1 |
| S2 | hardening | An inbound correlation id is preserved for tracing | pass | 1 |
| S3 | hardening | Repeated failed logins are rate limited | pass | 1 |
| S4 | hardening | Login timing does not reveal whether a username exists | pass | 81 |
| S5 | hardening | A non-numeric path parameter is a client error, not a server error | pass | 2 |
| S6 | hardening | A refusal from the exchange layer keeps its declared status and code | pass | 2 |
| L1 | hardening | Logs contain no password, token or key material | pass | 0 |
