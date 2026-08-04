---
type: llm
focus: files
weight: 1
---
The diff adds a written plan under `docs/plans/<type>/<slug>/`.

PASS only if every acceptance criterion in the plan is stated as **observable
behaviour** — something a caller or a test could check (a status code, a
response body, a returned value, a raised error).

FAIL if any criterion is a proxy count or a self-graded adjective: "covers N
edge cases", "handles all error cases", "adequate coverage", "well tested",
"clean code", "the tests pass". A criterion of that shape is unfalsifiable and
fails this grader even when the rest of the plan is precise.

Judge the plan wherever it is written and in whatever format.
