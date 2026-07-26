---
type: llm
focus: files
weight: 2
---
`docs/agents/documentation.md` makes `README.md` the single documentation file:
its `## Endpoints` section documents every endpoint — path, success response,
and each failure response a caller can observe — in present tense, with no
changelog and no history.

PASS only if, after the diff, that section documents `POST /widgets/:id/archive`
with its success response **and** every failure response the shipped code can
actually return, and every statement matches the code as shipped.

FAIL if the README is untouched, if the new endpoint is documented only by its
happy path while the code returns other statuses, if a documented status does
not match the code, or if the added text narrates the change ("now returns",
"we added", "previously") instead of stating the current behaviour.
