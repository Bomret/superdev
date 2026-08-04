---
type: llm
focus: files
weight: 2
---
The diff adds a written plan under `docs/plans/<type>/<slug>/`.

The feature intent states only the happy path: a widget that exists returns
200 with its JSON. The case of an id that matches no widget is never
mentioned — the planner has to derive it.

PASS only if the plan states, as an acceptance criterion, what the endpoint
does when the requested id matches no widget: a distinct status code, a
distinct body, or a distinct documented response. Any answer counts as long
as it is stated — deciding to return an empty 200 passes, because the rule
under test is that the case gets enumerated, not which response it gets.

FAIL if the case appears only in prose describing the work (a "spec" or
"description" section) without an acceptance criterion a test could check,
or if it is absent entirely.

Judge the plan wherever it is written and in whatever format — this grader
scores both a plugin-shaped plan and a plain markdown plan on the same bar.
