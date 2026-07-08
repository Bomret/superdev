# Plan-file contract

The **logical schema** every superdev slice carries. `/superdev:plan` writes it; `/superdev:implement`
reads it. It is backend-agnostic: the local-file rendering is shown below; issue backends
(`issue-tracker-jira.md`, etc.) map the same fields onto issue bodies, links, and statuses.

## Fields

| Field | Meaning | Consumed by |
|---|---|---|
| `id` | Stable slice identifier — the local backend uses the zero-padded file number (`01`, `02`, …); an issue backend uses the issue key. | DAG ordering, status tracking |
| `title` | Short descriptive name. | humans |
| `depends-on` | List of slice `id`s that must merge before this slice can start. Empty = root. | `/implement` DAG |
| `test-applicability` | `behavior` \| `mechanical` \| `docs`. Drives the warrant gates (see below). | `/implement` |
| `spec` | What this slice delivers end-to-end — the implementer's requirements. Describe behavior/interface, not file paths. | `implementer` |
| `acceptance` | Checkable criteria for THIS slice. | `slice-reviewer` |
| `status` | Canonical lifecycle `todo` → `in-progress` → `in-review` → `merged` (= done), plus `blocked`. Backends map these onto their real statuses; the ledger is authoritative during a run. | `/implement`, store |

Plus one **global Definition of Done** block: the acceptance criteria for the whole feature. Anchors
`/implement` Phase 0 and the final review.

Both `acceptance` and the DoD state **observable, user-facing behaviour** — not gameable proxy counts
(coverage %, line count, lint score). Behaviour can't be faked without doing the work; a count can. Where
a proxy count appears at all it's a signal a reviewer reads, never a gate an agent optimizes toward (ADR
0002).

**The epic is optional.** A plan with a single slice needs no epic: that slice IS the whole plan, so its
`acceptance` doubles as the global DoD, and the slice is its own scope anchor. A plan with ≥2 slices
always carries a global DoD (the epic) on top of the per-slice `acceptance` fields, as above.

**Parked questions** (optional, epic-only). A load-bearing decision the interview couldn't resolve,
written to the epic the moment it's parked (`grilling.md`'s termination rule permits ending an interview
this way). Purely advisory — `/implement` never reads it, nothing gates on it, no new lifecycle status.
Single-slice plans carry no equivalent: an unresolved load-bearing decision there signals the plan isn't
single-slice-simple yet, not something to park (ADR 0005).

## `test-applicability` → warrant gates

- `behavior` — implementer does full TDD; **slice-reviewer runs** (correctness + independent
  verification); **simplicity-reviewer runs** (over-engineering).
- `mechanical` — pure move/rename/format: no new test (the existing suite is the net); **both
  per-slice reviews skipped**; correctness is caught by the suite + final review.
- `docs` — documentation only: no test, **reviews skipped**.

## Slice lifecycle & status

`/implement` drives each slice through a canonical lifecycle. Every backend maps these onto its own
statuses — the local file uses them verbatim; an issue tracker maps them to real statuses/transitions
recorded in `issue-tracker.md`:

| Canonical | Entered when |
|---|---|
| `todo` | slice written to the store |
| `in-progress` | an implementer is dispatched for it |
| `in-review` | implementer returned; per-slice review running (**behavior** slices only) |
| `blocked` | implementer reports BLOCKED (only if the tracker has a blocked state) |
| `merged` (done) | merged into the scope branch |

`mechanical`/`docs` slices skip `in-review` (`in-progress` → `merged`). The scope/epic issue moves to
`in-progress` when the run starts and to `done` once every slice is merged.

`/implement` derives an **execution tier** from the loaded slice count (≤3 → `lite`, >3 → `full`) —
never a plan field, never persisted. The **lite** tier has no per-slice review at all, regardless of
`test-applicability`: every slice goes `todo` → `in-progress` → `merged` directly, and a single
whole-scope review substitutes for the per-slice ones. The table above (and the `behavior`-only
`in-review` step) describes the **full** tier.

## Vertical-slice rules (how `/plan` must slice)

- Each slice is a **tracer bullet**: a narrow but COMPLETE path through every layer (schema → API → UI
  → tests), demoable/verifiable on its own.
- Each slice leaves the suite **green on its own**.
- A slice depends on another **only if it cannot be green without it** — keep the graph honest, or you
  serialize work that could run in parallel.
- **Negotiable** — the `spec` states intent and the end-to-end behaviour and leaves the implementer room
  on the *how*; it is a contract of outcomes, not a line-by-line script.
- **Estimable** — a slice a fresh reviewer couldn't size in one pass is too big or too vague: decompose
  it further until each slice is a unit you could gate on its own.

## Local-file rendering

Written to a per-feature directory `docs/plans/<feature-slug>/`: the scope file `00-epic-<summary>.md`
holds the global DoD, and each slice is its own `NN-<test-applicability>-<summary>.md` whose zero-padded
number is its `id` (so `depends-on` reads `[01, 03]`). A single-slice feature skips `00-epic-…` entirely
— the lone slice file's `acceptance` is the DoD. See `issue-tracker-local.md` for the exact file layout
and per-file format.

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
- global DoD ↔ a parent/epic issue, or the first section of the feature epic. A single-slice feature
  skips the epic issue — the lone slice's `acceptance` checklist is the DoD.
- **Parked questions** (optional) ↔ a `## Parked questions` section in the epic issue body. Epic-only —
  absent on single-slice features, same as the epic itself.

The exact commands and vocabulary live in the active `docs/agents/issue-tracker.md`.
