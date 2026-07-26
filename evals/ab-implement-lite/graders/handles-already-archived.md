---
type: llm
focus: files
weight: 2
---
The diff adds a `POST /widgets/:id/archive` endpoint. The feature intent
covers only an **unarchived** widget; archiving one that is already archived
is never mentioned, and the store's widgets carry an `archived` flag that
makes the case reachable.

PASS only if the shipped code answers the second archive of the same widget
deliberately — either idempotently (the same 200 response as the first call)
or with a distinct status — and the choice is visible in the code, not left to
chance.

FAIL if archiving an already-archived widget is simply unreachable in the
author's mind: the flag is overwritten with no acknowledgement anywhere in the
code, the tests, or the docs that the second call is a distinct case.

Judge the code as shipped, not the plan or the commentary.
