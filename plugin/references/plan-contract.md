# Plan contract

The **logical schema** every superdev slice carries. `/superdev:plan` writes it; `/superdev:implement`
reads it. It is backend-agnostic: each issue backend (`issue-tracker-jira.md`, etc.) maps the same fields
onto issue bodies, links, and statuses. `plan-authoring.md` holds the rules `/superdev:plan` writes a plan
by, and `store-records.md` holds the triage record and the intent record.

## Fields

| Field | Meaning | Consumed by |
|---|---|---|
| `id` | Stable slice identifier — the issue key the backend assigns. | DAG ordering, status tracking |
| `title` | Short descriptive name. | humans |
| `depends-on` | List of slice `id`s that must merge before this slice can start. Empty = root. | `/implement` DAG |
| `test-applicability` | `behavior` \| `mechanical` \| `docs`. Drives the warrant gates (see below). | `/implement`, `implementer` |
| `spec` | What this slice delivers end-to-end — the implementer's requirements. Describe behavior and name the specific interface (a function signature, an API endpoint, a CLI command) its tests exercise — not file paths. Name the **domain shapes** the slice needs too, by name and in the project glossary's vocabulary, never as field lists: the implementer declares them before its first failing test and owns their fields. One exception to interfaces-only: a prototype-produced snippet that encodes a decision more precisely than prose can (a state machine, a reducer, a schema) may be inlined, trimmed to the decision-rich parts and marked as prototype-sourced (`prototype.md`). | `implementer` |
| `acceptance` | Checkable criteria for THIS slice. On a `behavior` slice these name the domain-level failure and boundary cases too — those derivable from the interview without reading the implementation — not just the happy path. Implementation-level edges stay with the implementer and the reviewers, who read code the planner never sees. `skills/plan/SKILL.md` holds the split with examples. | `slice-reviewer`, `implementer` |
| `status` | Canonical lifecycle `todo` → `in-progress` → `in-review` → `merged` (= done), plus `blocked`. Backends map these onto their real statuses; the ledger is authoritative during a run. | `/implement`, store |

Plus one **global Definition of Done** block: the acceptance criteria for the whole feature. Anchors
`/implement`'s run init and the final review.

**The epic is optional.** A plan with a single slice needs no epic: that slice IS the whole plan, so its
`acceptance` doubles as the global DoD, and the slice is its own scope anchor. A plan with ≥2 slices
always carries a global DoD (the epic) on top of the per-slice `acceptance` fields, as above.

### Criterion tags

Every epic Definition-of-Done criterion carries a **tag**: the slice `id`s that deliver it, `scope`
when no single slice does (a sweep, a preservation claim, a scope-wide check `/implement`'s run handoff
settles), or `docs` when its deliverable is `AGENTS.md`-hierarchy text describing the scope's code. The
tag decides which criteria a slice's report *can* tick; it is not itself a tick. A single-slice feature
carries no tags — its lone slice's `acceptance` doubles as the DoD, so every criterion is already that
slice's.

**The `docs` tag** marks a criterion the doc pass settles: no slice's report ticks it, the
scope review never holds the stage on it, and `/superdev:document` judges it after its pass
(`references/dod-ticks.md`). `docs` stands alone, like `scope`: it is never combined with slice ids. A
criterion that mixes `AGENTS.md` text with another deliverable is split into two criteria, one tagged
`docs`. A criterion that a `docs` slice delivers as `AGENTS.md` text, such as a restructuring of the
hierarchy, keeps that slice's tag: the doc pass reconciles docs with code, and the restructuring is the
slice's own work.

The line format:

```
- [ ] <criterion> — <ids|scope|docs>
```

Once every slice issue exists, `/superdev:plan` rewrites each slice id into the store's own reference
through `scope.js dod-tags`. A tag naming several slices joins bare references with `, ` and
carries no brackets:

```
- [ ] <criterion> — 01, 02          (as planned)
- [ ] <criterion> — #1388, #1396    (Forgejo, GitHub)
- [ ] <criterion> — PROJ-1, PROJ-2  (Jira)
```

A single-slice feature's own line and one untagged line left inside an
otherwise-tagged DoD (`dod-ticks.md`'s own "No tags at all") all carry no tag segment at all: `- [ ]
<criterion>`, judged as `- [x] <criterion> — met: <evidence>` — the tag segment simply absent, never an
empty one.

A line nobody has judged yet carries only its tag, or nothing at all when it carries none. A judged line
carries one note — `— met: <evidence>`,
`— not met: <reason>`, `— ceiling: <partial evidence>`, or `— accepted: <reason>` — never a bare tick. `accepted` is an attended operator's own decision that an unmet criterion stands accepted as
unmet: the box stays unticked, since the criterion is honestly unmet, and the stage gate
treats the line as settled rather than holding on it. A later judgment replaces that note rather than
adding a second one beside it:

```
- [x] Reachable: POST /orders (OrderApi) returns 201 and persists the order — 02 — met: implementer's report, evidence X
- [ ] every criterion states behaviour, not a proxy count — scope — not met: reason Y
```

## `test-applicability` → warrant gates

- `behavior` — implementer does full TDD; **slice-reviewer runs** (correctness + independent
  verification, and on its first review the over-engineering lens), its warranted cuts joining that review's
  fix list.
- `mechanical` — pure move/rename/format: no new test — the runs already in the loop, plus the scope's
  full-suite run at `/superdev:review`'s exit, are the net; **the per-slice review skipped**; correctness is caught
  there, not by a dedicated per-slice review.
- `docs` — documentation only: no test, **reviews skipped**.

## Slice lifecycle & status

`/implement` drives each slice through a canonical lifecycle. Every backend maps these onto its own
statuses — an issue tracker maps them to real statuses/transitions recorded in `issue-tracker.md`:

| Canonical | Entered when |
|---|---|
| `todo` | slice written to the store |
| `in-progress` | an implementer is dispatched for it |
| `in-review` | implementer returned; per-slice review running (**behavior** slices only) |
| `blocked` | implementer reports BLOCKED (only if the tracker has a blocked state) |
| `merged` (done) | merged into the scope branch |

`mechanical`/`docs` slices skip `in-review` (`in-progress` → `merged`). The scope anchor moves to
`in-progress` when the run starts. `/superdev:wrap-up` closes it to `done` after verification (a failed
close changes nothing). On a
single-slice plan the lone issue is both the slice and the anchor. The anchor rule wins: it stays
`in-progress` through the merge, and closes once, at wrap-up.

`/implement` derives an **execution tier** from the loaded `behavior` slices (3 or fewer → `lite`, more than 3
→ `full`; `mechanical` and `docs` slices never count) —
never a plan field, never persisted. The **lite** tier has no per-slice review at all, regardless of
`test-applicability`: every slice goes `todo` → `in-progress` → `merged` directly, and a single
whole-scope review substitutes for the per-slice ones. The table above (and the `behavior`-only
`in-review` step) describes the **full** tier.

## Scope anchor

A feature's **scope anchor** is its root. A multi-slice plan's root has slices beneath it; a single-slice
plan's root is its own lone slice — one rule for both shapes. A consumer that needs a feature's
scope-level signal — `/superdev:status` grouping an anchor, the status map above writing the anchor's
own status — reads the active `docs/agents/issue-tracker.md`'s own `## Scope anchor` section rather than
assuming any one store's shape. How to recognise an anchor, list the candidates, list the slices beneath
one, tell that an anchor is itself a slice, and read an anchor's own dependencies are backend mechanism,
and belong there.

A backend whose candidate listing spans every state, so a shipped feature's closed epic can resolve at
all, can also return a retired label's closed root beside a reused label's open one. **The
open candidate is the anchor there. `Ambiguous` is two or more *open* candidates — never a closed one
sitting beside a single open one — and a single closed candidate is itself the anchor**, the shape the
shipped-feature refusal in `plan-authoring.md`'s `## Append mode` reads as its own done signal. Each store's own `## Scope anchor` section
specialises *Recognise one* and *Ambiguous* to this rule.

An anchor may carry an **anchor dependency**: a recorded relation naming another feature's anchor that must
land first. It is the feature-level counterpart of a slice's `depends-on`, and the same honesty
rule holds — record one only when the second feature cannot be built until the first's anchor is closed, because a
needless one serializes work for nothing. **It is never the same relation as a slice's `depends-on`, even on
a store where the two could land on the same record.** A single-slice feature's anchor is its own lone slice
(above), so a store that reused the slice-level relation for the anchor dependency would leave
`/superdev:implement` reading it as that lone slice's own blocker — naming an issue that is not a member of
the feature and can never reach `merged` — and would lose it outright the moment append mode promotes that
lone slice to an epic (`plan-authoring.md`'s `## Append mode`). Each store's `## Scope anchor` section names the distinct
notation it uses instead. A dependency is **satisfied** only when the anchor it names is closed, or when
no such anchor exists; no ledger stage satisfies it. A merged feature
whose anchor is still open has not been verified or wrapped up, so a dependent keeps waiting for the close. `/superdev:plan` records
one when its interview named a prerequisite feature, and `/superdev:status` is the reader: it groups an
anchor whose dependency is unsatisfied as `waiting`.

An anchor may also carry a **deploy line**: `**Deploy:** <target>[, <target>]` — a comma-separated,
ordered list of `docs/agents/deployment.md`'s `## Targets` names, in deploy order — or `**Deploy:**
none`. It is optional and **anchor-only**, never on a slice beneath a multi-slice feature, and an
absent line reads as deploying nothing. Under `manual` or `auto` posture, `/superdev:plan` asks what the
feature deploys to once the interview has settled the solution shape, offering only the recorded targets
plus `none`, and writes the answer as this line; under `none` posture, or with no deploy target recorded
yet, it asks nothing and writes no line. `/superdev:ship` reads the line from the anchor after the merge. Each store's own `## Scope anchor` section states the mechanism it writes and reads the line
with — the same one it already uses for `**Blocked by feature:**` — and never confuses it with that
anchor dependency, the Repairs line, the Absorbs line, or a slice's `depends-on`.

An anchor may also carry a **Repairs line**: `**Repairs:** #<original anchor>`, in each store's own key
notation, naming the scope anchor of the shipped feature this one repairs. It is optional and
**anchor-only**, never on a slice beneath a multi-slice feature, and an absent line reads as no repair
link. `/superdev:plan`'s repair choice writes it once, when it creates the repair, and nothing edits it
afterwards. It records which feature a repair repairs and blocks nothing: the original's own
`/superdev:wrap-up` gate never reads it. `/superdev:plan`'s repair choice and `/superdev:status` read it
to mark a shipped scope a repair names, the shipped-run routing rule (`references/shipped-run.md`) reads it
off open and closed anchors, sending that scope back to `/superdev:verify-ship` once only closed ones name
it and a `not met:` note's repair citation does not yet cite one of them, and `/superdev:wrap-up` reads it
off a repair's own anchor once that repair closes. Nothing is
ever written to the original anchor. Each store's own `## Scope anchor` section states the
mechanism it writes and reads the line with, and never confuses it with the anchor dependency, the deploy
line, the Absorbs line, or a slice's `depends-on`.

An anchor may also carry an **Absorbs line**: `**Absorbs:** #<n>[, #<n>]`, in each store's own reference
notation (a Jira anchor writes issue keys), naming every open triage record the scope absorbed. It is optional and **anchor-only**, never on a slice beneath a multi-slice feature, and an
absent line reads as no absorbed records, never as an error. `/superdev:plan` writes it when the operator
absorbs records, and an append that absorbs more records revises the line in place, as it revises the
deploy line. A body holding several such lines reads the first. Each entry is trimmed of surrounding whitespace and
read on its own: a malformed entry is ignored while the rest are still read, and a repeated entry counts
once. `scope.js dod-check` holds the line against the Definition of Done's `(triage <reference>)` citations at
`/superdev:plan`'s store write and at the scope review's anchor sync. Append mode's single-slice promotion moves the line to the new epic
(`plan-authoring.md`'s `## Append mode`). Each store's own `## Scope anchor` section states the mechanism it writes and
reads the line with, and never confuses it with the anchor dependency, the deploy line, the Repairs line,
or a slice's `depends-on`.

An anchor may also carry an **Intent line**: `**Intent:** #<n>[, #<n>]`, in each store's own reference
notation, naming every intent record a plan of this feature was seeded from. It is optional and
**anchor-only**, never on a slice beneath a multi-slice feature, and an absent line reads as no seeding
intent record. `/superdev:plan` writes it whenever it was seeded from an intent record, whether the intent
was fully planned or not, and writes none when seeded from a local intent file or from nothing. An append
seeded from another intent record revises the line in place, keeping the records it already names. Append
mode's single-slice promotion moves the line to the new epic (`plan-authoring.md`'s `## Append mode`). It records where the
feature came from and blocks nothing; no command reads it. Each store's own `## Scope anchor` section
states the mechanism it writes the line with, and never confuses it with the other anchor lines or a
slice's `depends-on`.

## Release

A feature is **released** once a human has said its plan may be built. Many trackers hold a backlog of
tickets written but not yet agreed, so writing a plan and releasing it are two separate acts, and only
the second one authorises an agent to build.

The **release signal lives on the scope anchor**, and covers every slice beneath it: one act of judgment
per feature, matching the one Definition of Done the anchor carries. It is a **durable** marker, distinct
from the `todo`/`ready` lifecycle state above — a signal the lifecycle consumes (a status the dispatch
moves off, a label the dispatch swaps) reads as unreleased the moment work starts, and a resumed run then
stops on a feature the human already released.

Its consumers act on it, and each reads the active `docs/agents/issue-tracker.md`'s own `## Release`
section for the backend's signal and the calls that set and read it:

- **`/superdev:plan`** asks, once the plan is written, whether to release it now or leave that to a human
  later, and applies the signal on a release.
- **`/superdev:implement`** builds a released feature. An unreleased one stops the run and asks the user
  to confirm it anyway, since the operator naming a label directly is a human judgment of the same kind.
- **`/superdev:status`** groups an anchor carrying no release signal as `unreleased`.

## Run state

A run publishes a **snapshot** of its progress onto the scope anchor: a `## Run state` section in the
anchor's own body. `<run-root>/ledger.md` stays the run's single source of truth; the snapshot is a
mirror, never a second authority — it is what lets the anchor still show where a run stood after the run
root is gone, and what a resumed run on a clean checkout reconciles against. A command that wrote
the ledger publishes once, at its end, rather than after each write, and the publish
is **best-effort**: a failed publish is reported once and the run continues, exactly as a failed status
label is, because the ledger drives control flow, not the anchor.

*Definition of Done ticks* below states how a controller ticks the anchor's own Definition of Done
checklist, independent of this snapshot.

Every backend mechanism — where the section lives, the call that writes it, and the call that reads it
back — belongs to the active `docs/agents/issue-tracker.md`'s own `## Run state` section, which resolves
the anchor for both feature shapes by citing that store's own `## Scope anchor` section rather than
restating it. A store whose anchor cannot safely carry a mirrored write declares itself snapshot-less
there instead.

## Definition of Done ticks

A controller ticks the anchor's own Definition of Done checklist **independent of `## Run state`
above**: a store with no snapshot still ticks its anchor's own checklist,
exactly as a store that mirrors one does. `<run-root>/dod.md` stays authoritative regardless of whether
an anchor tick lands — the anchor edit is a second, best-effort mirror of a judgment `dod.md` already
holds, never a second source of truth for it. Implement and run handoff write `dod.md` alone; every other
writer also writes the anchor, and the scope review runs the anchor sync that copies their ticks at entry and again before each stage write (`dod-ticks.md` → *Only a
controller ticks*).

Recording a judgment on a criterion (*Criterion tags* above) sets its line's marker to the **target
state** the judgment reached — `- [x]` when met, `- [ ]` otherwise — and carries the line's own note —
`— met: <evidence>`, `— not met: <reason>`, `— ceiling: <partial evidence>`, or `— accepted: <reason>`
— into the store's own
notation for the edit. The write **replaces** the line's previous note: a new judgment
overwrites what an earlier one wrote there, never appending a second note beside it. **A write whose
target state equals the line's current state — a `not met:` judgment landing on a line already
unticked, say — only replaces the note; the marker stays as it was.** `scope.js dod-line` (`scripts/
AGENTS.md` → *scope.js, the run-state CLI*) is the one line edit this shape describes: every store runs it on
the checklist text its own read extracted, through its own gated body-edit rule, rather than
performing the edit by hand.

`/superdev:plan` §6 writes a criterion's tag in `plan-contract.md`'s own notation (a slice `id`, or
`scope`) because the epic is created before any slice exists, so no store-native identifier is known
yet. Once every slice is created, the controller rewrites each tag into the store's own notation, in the
**same parallel patch step** each store document's own dependency-recording call already uses to write
`depends-on` — both edits need the same resolved identifiers and both wait on the same event, every
slice's `id`/number/key known.

Each store's own `## Definition of Done ticks` section states, citing this section:

- the call the controller makes to tick a criterion, and to rewrite a tag into the store's own notation;
- how a criterion's tag renders in this store's own notation;
- that a failed tick write is **reported once per run and never stops the run** — `dod.md` stays
  authoritative regardless.

## Feature label

A feature's **feature label** is the one identifier its scope anchor and every slice beneath it carry. It
holds two parts: the feature's **change type** and its slug. The type is the Conventional Commits type of
the work — `scope-mode.md`'s `## The change type` lists the set and owns the rule. `/plan` picks it from
what the feature actually does, so a bug fix is labelled `fix`, a documentation pass `docs`, and only new
behaviour `feat`.

The notation is the active `docs/agents/issue-tracker.md`'s: a `<type>/<slug>`
label. Whatever the notation, `/superdev:implement` reads the two parts back out — the type is the scope branch's prefix
and the slug is the scope.

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
- **Non-goals** (optional) ↔ a `## Non-goals` section in the epic issue body, same registration as
  **Parked questions** above. Epic-only, advisory — `/implement` never reads it.
- **Epic visuals** (optional) ↔ `## Slice graph` and `## Touch map` sections in the epic issue body,
  same body-text pattern. Epic-only, advisory, and written only when `plan-authoring.md`'s `### When to write them` says so.

The exact commands and vocabulary live in the active `docs/agents/issue-tracker.md`, and the calls only
`/superdev:plan` makes (issue creation, the anchor-line writes, append mode) in `docs/agents/issue-tracker-plan.md`.
