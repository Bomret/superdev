---
type: llm
focus: files
weight: 1
---
The diff adds a written plan under `docs/plans/<type>/<slug>/` cutting widget CRUD
into units of work.

PASS only if the plan states, per unit, which other units it depends on — an
explicit `depends-on` field, a named prerequisite, or an equivalent statement
that a reader could turn into an execution order without guessing. Units with
no prerequisite must say so (an empty dependency list, "none", or an explicit
statement that it can start immediately).

FAIL if the dependency relation is left implicit in the numbering — a bare
ordered list with no statement of what blocks what — or if some units declare
dependencies and others silently omit the field.

Judge the plan wherever it is written and in whatever format.
