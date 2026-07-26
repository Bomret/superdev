---
type: llm
focus: files
weight: 2
---
The diff adds a `POST /widgets/:id/archive` endpoint to a repo whose existing
`GET /widgets/:id` already answers `404 {"error":"not_found"}` for an unknown
id.

The feature intent covers only an existing, unarchived widget. Archiving an id
that matches no widget is never mentioned.

PASS only if the shipped code answers that request deliberately — a `404`, or
another status the code returns on purpose — and does so without throwing on
the undefined the store returns.

FAIL if the missing-widget path would throw (reading a property off
`undefined`, spreading `undefined`, calling a method on it) or if it falls
through to a response that claims success.

Judge the code as shipped, not the plan or the commentary.
