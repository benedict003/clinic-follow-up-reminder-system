# UAT results and finding dispositions

Two runs. The first recorded a defect, the second is the retest after the fix. Both
are kept, because a UAT record that only shows the good run is a marketing document.

| Run | When | Scenarios accepted | Defects | Evidence |
| --- | --- | --- | --- | --- |
| `01-uat` | first session | 7 / 8 | 1 | `evidence/01-uat/uat.json` |
| `02-uat-retest` | after the fix | **8 / 8** | 0 | `evidence/02-uat-retest/uat.json` |

Specification conformance in both runs: **28 of 28** operations documented in
`docs/openapi.yaml` exist in the running service, so the documentation and the code
agree.

## Scenario results

| # | Scenario | Role | Verdict | Observed |
| --- | --- | --- | --- | --- |
| UAT-1 | Today's work on arrival | doctor | Accepted | worklist returned counts and 2 overdue rows for the fixtures |
| UAT-2 | Nurse records a contact attempt | nurse | Accepted | status `scheduled` → `reminded`; audit row `contacted / reached` by Fictional Nurse (nurse) |
| UAT-3 | Unanswered call | nurse | Accepted | status stayed `scheduled`; `contactAttempts` = 1 |
| UAT-4 | Reschedule supersedes a queued reminder | doctor | Accepted | due date moved, revision 1 → 2, `supersededJobs` ≥ 1, job status `obsolete` |
| UAT-5 | Phone-width check | both | Accepted | all screens operable at 380 px (see `17-09` and Module 16's set) |
| UAT-6 | Only a doctor closes | nurse | Accepted | `403 FORBIDDEN_ROLE` with a request id; the interface offers no close action |
| UAT-7 | Disclosure preview | doctor | Accepted | `recordRef` sent; `patient_name`, `contact_number` withheld; byte count shown |
| UAT-8 | Something goes wrong | both | **Defect then accepted** | first run: `400 BAD_REQUEST` where the rest of the API used `INVALID_PARAMETER` |

## Finding register

### F-01 — One error class, two codes · **fixed and retested**

| | |
| --- | --- |
| Found by | UAT-8, first run |
| Severity | Low (a client that branches on `code` would need two cases for one mistake) |
| Expected | `400 INVALID_PARAMETER` for a malformed record id, as `/api/secure/*` already returned |
| Observed | `400 BAD_REQUEST` from `/api/clinical/follow-ups/abc`, because the clinical router raised a plain 400 and the error contract derived the code from the status |
| Cause | Two routers, written at different times, each deciding how to describe the same mistake |
| Fix | `clinical.js` names `INVALID_PARAMETER` explicitly, matching the exchange routes |
| Retest | `02-uat-retest`: UAT-8 passes; Module 15's collection still 37/37 |
| Disposition | Accepted |

This is the kind of finding UAT exists for. Module 15's suite never caught it because
each suite tested its own router against its own expectation; only a session walking
the product as a user compared the two.

### Findings raised as conditions rather than defects

| # | Finding | Disposition |
| --- | --- | --- |
| C-01 | No contact number on one patient, and the follow-up was closed as lost to follow-up because of it | Accepted with condition: the register must be filled in at intake for a pilot (see `HANDOVER.md`) |
| C-02 | A nurse cannot close a record, so a doctor must be reachable during clinic hours | Accepted with condition |
| C-03 | The app has no offline mode; a dropped link stops the board | Accepted with condition: a paper fallback is needed |
| C-04 | The disclosure needs the partner receiver running as a separate process | Accepted with condition: only a doctor runs a disclosure, and the screen explains the failure |

## What the sessions did not establish

- **No independent user.** The participant was the learner, acting in each role against
  a script. A real UAT needs a real nurse and a real doctor. This is recorded rather
  than implied, and the signature block below exists because that session is still owed.
- **No office observation of the adverse cases.** UAT-8 was executed technically; the
  office has not watched a failure recovery.
- **No accessibility audit.** Keyboard order and contrast were checked by the automated
  tests and by inspection, not by a person using a screen reader.
- **No timing perception test.** Module 16 measured latency; nobody has said whether
  4 ms feels instant to a clerk.

## Office decision

To be completed by the assigned university office, not by the learner.

| Field | Value |
| --- | --- |
| Session date | |
| Office representative | |
| Roles observed | ☐ nurse ☐ doctor ☐ maintainer |
| Decision | ☐ Accepted ☐ Accepted with conditions ☐ Rejected |
| Conditions recorded | |
| Signature | |

Until this block is filled, the system has **passed its technical acceptance criteria**
and has **not** been accepted by the office. Those are different statements and the
portfolio keeps them separate.
