---
type: llm
focus: files
weight: 2
---
The diff adds a written plan under `docs/plans/<type>/<slug>/` cutting widget CRUD
into units of work.

PASS only if every unit is a **vertical** slice: it delivers one user-visible
behaviour end to end (request in, response out, its own test) and could ship
on its own. "Create a widget, authenticated, verified by a test" is vertical.

FAIL if any unit is a **horizontal layer** — work grouped by technical layer
rather than by behaviour, which cannot ship or be verified alone. Typical
shapes: "add the datastore methods for all five operations", "define all the
request/response types", "wire up routing", "write the tests", "add auth
middleware" as a unit with no behaviour of its own.

A slice that adds shared groundwork *and* the first behaviour that uses it is
vertical and passes. Judge the plan wherever it is written and in whatever
format.
