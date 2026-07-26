---
type: llm
focus: files
weight: 2
---
The diff adds a written plan under `docs/plans/<slug>/` cutting widget CRUD
into units of work.

The intent says writes go through an `X-Api-Key` header and that an
unauthenticated write is rejected. It never says what "rejected" looks like,
and never distinguishes a missing key from a wrong one.

PASS only if the plan states, as an acceptance criterion, the observable
response to a write carrying **no** key and to a write carrying an
**invalid** key — a status code, a body, or a documented response. The two may
share one criterion if the plan says explicitly that both cases get the same
response.

FAIL if the plan says only "unauthenticated writes are rejected" without
naming what the caller observes, or if only one of the two cases is covered.

Judge the plan wherever it is written and in whatever format.
