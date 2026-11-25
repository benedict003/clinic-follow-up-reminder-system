# UAT plan and acceptance criteria

Prepared before the session, so the criteria are not written to fit the results.

## What is being accepted

The Clinic Follow-Up Reminder System as a bounded tool for **one** university clinic
office: schedule a follow-up, work a daily board, record what happened, disclose the
minimum a partner needs. Nothing beyond that is in scope, and the office is not being
asked to accept anything beyond it.

| | |
| --- | --- |
| System under test | This repository, tagged `module17` |
| Environment | Lab workstation, Windows 11, MariaDB 10.11, served at `http://localhost:3400/app/` |
| Data | Fictional only. `Fictional UAT Patient A/B/C`, contact numbers in the reserved `+63 900 100 00xx` range |
| Session | Controlled walkthrough, 2026-11-25, one participant per role |
| Decision authority | The assigned university office. The learner may prepare and record; the office accepts |

## Roles and responsibilities

| Role | Who | What they decide | What they must not do |
| --- | --- | --- | --- |
| Nurse | Front-desk staff | Whether recording a contact attempt is simple enough to use on every call | Close a follow-up; read the disclosure history |
| Doctor | Clinic physician | Whether the record is enough to make a follow-up decision, and whether disclosure is safe to approve | — |
| Maintainer | Whoever holds the repository | Whether a new maintainer could run, test and recover it from the documentation alone | Change clinical outcomes |
| Office (decision authority) | Assigned university office | Accept, accept with conditions, or reject | — |

A nurse and a doctor both used the system. The maintainer and office checks are
documented in `HANDOVER.md` and are **for the office to perform**, not performed here.

## Scenarios and acceptance criteria

Each criterion is measurable and tied to the operation that proves it. "Evidence" names
where the observed result is recorded.

| # | Scenario | Acceptance criterion | Evidence |
| --- | --- | --- | --- |
| UAT-1 | A clinician starts the day and needs to know who is late | The first screen names the number overdue and lists the records, without a search | `17-01-uat1-worklist.png`, UAT-1 JSON |
| UAT-2 | A nurse phones a patient and records what happened | Marking "patient reached" changes the status to Reminded and appends a row naming the nurse and the time | `17-02`–`17-04`, UAT-2 JSON |
| UAT-3 | The call is not answered | The record stays Scheduled, the attempt is counted, and the interface does not imply the patient was told | `17-05`, UAT-3 JSON |
| UAT-4 | A patient asks to be seen later | The date changes, the revision increments, and the reminder already queued is marked obsolete rather than delivered | UAT-4 JSON |
| UAT-5 | The office is worried about phone widths | Every screen a clinician uses is readable and operable at 380 px | `17-09`, Module 16 captures |
| UAT-6 | Someone without authority tries to close a record | The server refuses with `403 FORBIDDEN_ROLE` and a request id, and the interface does not offer the action at all | `17-06`, UAT-6 JSON |
| UAT-7 | A doctor is asked to send something to the partner office | Before sending, the screen shows the exact fields that would leave and the fields that stay behind | `17-07`, UAT-7 JSON |
| UAT-8 | Something goes wrong | A bad input and an unknown route both answer with a code and a request id, no internals leak, and a dead server produces a sentence a clinician can act on | `17-08`, UAT-8 JSON |

## Explicit non-goals

These were **not** tested and are not being accepted:

- More than one clinic, or more than one API process.
- Any real patient data, any real contact channel, any real partner integration.
- TLS termination, backup scheduling, or unattended alerting.
- Mobile packaging. The deliverable is the web client.

The office should be told these are outside the acceptance, not that they passed.

## How a finding is dispositioned

| Disposition | Meaning |
| --- | --- |
| Accepted | The criterion was met; no change |
| Accepted with condition | Met, but something must happen before real use (recorded in `HANDOVER.md`) |
| Defect raised | Not met. Recorded, fixed, and retested in a second run |
| Change request | Out of scope for this delivery; logged for maintenance |
| Rejected | The criterion is wrong or unmeasurable; reworded before the next session |

A defect is never closed by editing the criterion. `evidence/01-uat/` keeps the run
where UAT-8 failed, and `evidence/02-uat-retest/` keeps the retest that followed the
fix.
