---
type: llm
focus: files
weight: 2
---
`docs/agents/documentation.md` states the repo's rule: `README.md` is the
single documentation file, its `## Endpoints` section documents every endpoint
the service serves — path, success response, and each observable failure
response — and it states current behaviour only.

PASS only if the README ends up documenting all five operations, each with its
success response and the failure responses a caller can reach, including the
rejection of an unauthenticated write. The `GET /widgets/:id` entry the repo
started with is still correct.

FAIL if any shipped operation is undocumented, if the README documents an
operation the diff did not ship, if a documented response contradicts the
code, or if the README gains a changelog, a history section, or a note about
what changed in this piece of work.

Heading style and the order of the entries do not matter.
