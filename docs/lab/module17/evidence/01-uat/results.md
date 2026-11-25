# Module 17 UAT — 01-uat

Ran 2026-11-25T15:51:11.744Z against clinic_followup_m17.

Spec conformance: 28/28 documented operations exist.

**7/8 scenarios accepted, 1 defects.**

| ID | Scenario | Role | Verdict | Time | Disposition |
| --- | --- | --- | --- | --- | --- |
| UAT-1 | A clinician can see today's work on arrival | doctor | Pass | 8 ms | Accepted |
| UAT-2 | A nurse records a contact attempt and the record shows who and what | nurse | Pass | 9 ms | Accepted |
| UAT-3 | An unanswered call leaves the record scheduled with the attempt counted | nurse | Pass | 3 ms | Accepted |
| UAT-4 | Rescheduling supersedes the queued reminder | doctor | Pass | 17 ms | Accepted |
| UAT-5 | A closed record cannot be disclosed, and the refusal is explained | doctor | Pass | 4 ms | Accepted |
| UAT-6 | Only a doctor can close a follow-up | nurse | Pass | 1 ms | Accepted |
| UAT-7 | The disclosure shows the exact bytes that would leave, and what stays | doctor | Pass | 2 ms | Accepted |
| UAT-8 | Bad input and unknown routes answer safely and traceably | both | FAIL | 2 ms | Defect raised |
