---
type: llm
focus: files
weight: 2
---
The diff adds a written plan under `docs/plans/<slug>/` cutting widget CRUD
into units of work.

The intent names five operations. A caller can create a widget, read one by
id, list them page by page, update one, and delete one.

PASS only if each of the five operations has an acceptance criterion in some
unit. A plan that covers four operations and omits the fifth fails.

FAIL if an operation appears only in a unit's spec prose. Each operation needs
a criterion a test could check.

Judge coverage of the operation set only. Two other graders own the rest of
the Definition of Done. `names-auth-failure` scores the rejected write, and
`slices-are-vertical` scores whether each unit carries its own test. Do not
score either property here.

Judge the plan wherever it is written and in whatever format.
