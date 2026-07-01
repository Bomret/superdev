# Plan-file contract

The **logical schema** every superdev slice carries. `/superdev:plan` writes it; `/superdev:implement`
reads it. It is backend-agnostic: the local-file rendering is shown below; issue backends
(`issue-tracker-jira.md`, etc.) map the same fields onto issue bodies, links, and statuses.

## Fields

| Field | Meaning | Consumed by |
|---|---|---|
| `id` | Stable slice identifier (e.g. `S1`). | DAG ordering, status tracking |
| `title` | Short descriptive name. | humans |
| `depends-on` | List of slice `id`s that must merge before this slice can start. Empty = root. | `/implement` DAG |
| `test-applicability` | `behavior` \| `mechanical` \| `docs`. Drives the warrant gates (see below). | `/implement` |
| `spec` | What this slice delivers end-to-end — the implementer's requirements. Describe behavior/interface, not file paths. | `implementer` |
| `acceptance` | Checkable criteria for THIS slice. | `slice-reviewer` |
| `status` | `todo` \| `in-progress` \| `in-review` \| `merged` (optional; the ledger is authoritative during a run). | `/implement`, store |

Plus one **global Definition of Done** block: the acceptance criteria for the whole feature. Anchors
`/implement` Phase 0 and the final review.

## `test-applicability` → warrant gates

- `behavior` — implementer does full TDD; **slice-reviewer runs** (correctness + independent
  verification); **ponytail-reviewer runs** (over-engineering).
- `mechanical` — pure move/rename/format: no new test (the existing suite is the net); **both
  per-slice reviews skipped**; correctness is caught by the suite + final review.
- `docs` — documentation only: no test, **reviews skipped**.

## Vertical-slice rules (how `/plan` must slice)

- Each slice is a **tracer bullet**: a narrow but COMPLETE path through every layer (schema → API → UI
  → tests), demoable/verifiable on its own.
- Each slice leaves the suite **green on its own**.
- A slice depends on another **only if it cannot be green without it** — keep the graph honest, or you
  serialize work that could run in parallel.

## Local-file rendering

Written to `docs/plans/<feature-slug>.md`:

```
# Plan: <feature>

## Definition of Done (global)
- [ ] <checkable acceptance criterion for the whole feature>
- [ ] ...

## Slices

### S1 — <title>
depends-on: []
test-applicability: behavior
status: todo
spec: |
  <behavior/interface this slice delivers — the implementer's requirements>
acceptance: |
  - <checkable criterion 1>
  - <checkable criterion 2>

### S2 — <title>
depends-on: [S1]
test-applicability: behavior
status: todo
spec: |
  ...
acceptance: |
  - ...
```

## Issue-backend mapping (general)

When the slice store is an issue tracker, each slice is one issue:

- `id` ↔ the issue key/number (record the mapping in the plan or ledger so `depends-on` can reference
  real keys).
- `title` ↔ issue title.
- `depends-on` ↔ the tracker's "is blocked by" link type.
- `spec` ↔ issue description body ("What to build").
- `acceptance` ↔ a checklist in the description (or sub-tasks).
- `test-applicability` ↔ a label.
- `status` ↔ the tracker's status/state; a "ready" label/status marks slices an agent may pick up.
- global DoD ↔ a parent/epic issue, or the first section of the feature epic.

The exact commands and vocabulary live in the active `docs/agents/issue-tracker.md`.
