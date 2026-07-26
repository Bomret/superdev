---
type: llm
focus: files
weight: 2
---
The diff adds a `POST /widgets/:id/archive` endpoint to a repo using node's
built-in test runner (`node --test`, `node:assert/strict`).

PASS only if the diff adds tests that assert, with real assertions on a
status code or a response body:

- the happy path — archiving an existing unarchived widget, and the change
  being visible to a later `GET /widgets/:id`;
- archiving an id that matches no widget;
- archiving a widget that is already archived.

FAIL if any of the three is missing, or if a "test" for one of them asserts
nothing that could fail (no assertion, an assertion on a constant, or a
comment standing in for a check).

Test names and file layout are free — judge the assertions.
