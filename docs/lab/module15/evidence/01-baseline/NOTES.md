# Baseline run — what was executed, and what changed afterwards

This folder is the record of the collection as it ran **before** any Module 15
hardening. It is kept unedited, including the failures.

```
label      01-baseline
ran        2026-11-25T13:32Z (see summary.json ranAt)
database   clinic_followup_m15 (created and migrated by the harness)
api        http://127.0.0.1:3411
stub       http://127.0.0.1:4799/notify (controllable integration gateway)
result     23 of 36 passed, 13 failed
```

## Case revision notice

Two cases in the collection were changed after this run. Both are recorded here
rather than silently replaced.

**S5 — revised.** The baseline collection asked whether a 60-character patient id
would overflow the `VARCHAR(50)` column. It did not: the API validates length and
correctly answered `400`. While investigating that, a different defect was found by
direct probe:

```
$ curl -s -o /dev/null -w '%{http_code}' -b cj.txt -H 'X-CSRF-Token: ...' \
       http://127.0.0.1:3412/api/secure/preview/abc
500
$ ... | head -c 300
{"error":"The request could not be completed."}
```

The cause is not the driver: `secure/sender.js` throws `EnvelopeError`, which
stores its intended status in `httpStatus`, while the error handler read only
`status`. Every deliberate refusal from the exchange layer therefore became a
generic `500`, including `FOLLOW_UP_NOT_DISCLOSABLE` and `FOLLOW_UP_NOT_FOUND`.
S5 was rewritten to test the non-numeric path parameter (`400 INVALID_PARAMETER`),
and S6 was added to test the status-fidelity defect directly on the send path.

**S6 — added after the baseline.** Its before-state is the same mechanism observed
in the S5 probe (500 instead of the declared status), not a separate measurement.
This is stated in the report as well, so the two runs are not presented as
identical case sets.

Every other case is byte-identical in both runs.
