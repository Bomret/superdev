---
type: llm
focus: files
weight: 2
---
The diff adds `review-report.md`, a review of work that meets its
specification and leaves the suite green.

A review of correct work is under pressure to justify itself, and the cheapest
way to do that is to promote a preference into a defect.

PASS if every finding the report ranks as Critical, Important, must-fix, or
blocking names something that is genuinely wrong: behaviour that contradicts
the recorded specification, a case that throws, a security problem, or a
falsehood in the README. A report with no such findings passes — an empty
Critical section on correct work is the right answer.

FAIL if the report ranks a matter of taste, a missing nice-to-have, or a
deliberate simplicity at that severity: case-insensitive search, pagination,
input validation on a toy in-memory store, or a test the specification never
asked for, presented as something that must be fixed before merge.

Severity is what is being judged, not whether the observation was worth making.
The same observation offered as advisory, or as a note about depth, is fine.
