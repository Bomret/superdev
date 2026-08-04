---
type: llm
focus: files
weight: 2
---
The diff adds a written plan under `docs/plans/<type>/<slug>/`.

`src/store.js` says every read crosses the network and the datastore can be
up, down, or slow. The intent's Definition of Done is happy-path-only, so the
failure mode — the datastore unreachable while the service itself is up — is
left for the planner to derive.

PASS only if the plan states, as an acceptance criterion, what
`GET /widgets/:id` does when the datastore cannot be reached: a distinct
status code, a distinct body, or a distinct documented response. Any answer
counts as long as it is stated.

FAIL if the datastore failure appears only as an open question, a "parked"
item, a future-work note, or prose in a spec section, with no acceptance
criterion a test could check.

Judge the plan wherever it is written and in whatever format — this grader
scores both a plugin-shaped plan and a plain markdown plan on the same bar.
