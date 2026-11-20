# Plan contract

The **logical schema** every superdev slice carries, and the generic contracts every store document specialises.
`/superdev:plan` writes it, and `/superdev:implement` reads it. `plan-authoring.md` holds the rules a plan is
written by, and `store-records.md` holds the triage record and the intent record.

## Fields

**The slice fields.** Applies to every slice a plan writes. Each slice carries the fields in this table. Each issue backend
maps the same fields onto its own issue bodies, links, and statuses.

| Field | Meaning | Consumed by |
|---|---|---|
| `id` | Stable slice identifier — the issue key the backend assigns. | DAG ordering, status tracking |
| `title` | Short descriptive name. | humans |
| `depends-on` | List of slice `id`s that must merge before this slice can start. Empty = root. | `/implement` DAG |
| `test-applicability` | `behavior` \| `mechanical` \| `docs`. Drives the warrant gates (``## `test-applicability` → warrant gates``). | `/implement`, `implementer` |
| `spec` | What this slice delivers end-to-end — the implementer's requirements: the behaviour, and the specific interface its tests exercise (a function signature, an API endpoint, a CLI command), never file paths. It names the **domain shapes** the slice needs by name, in the project glossary's vocabulary, never as field lists; the implementer declares them before its first failing test and owns their fields. A prototype-produced snippet that encodes a decision more precisely than prose can (a state machine, a reducer, a schema) may be inlined, trimmed to the decision-rich parts and marked as prototype-sourced (`prototype.md`). | `implementer` |
| `acceptance` | Checkable criteria for THIS slice. On a `behavior` slice they name the domain-level failure and boundary cases derivable from the interview, beside the happy path. Implementation-level edges stay with the implementer and the reviewers. `skills/plan/SKILL.md` holds the split with examples. | `slice-reviewer`, `implementer` |
| `status` | Canonical lifecycle `todo` → `in-progress` → `in-review` → `merged` (= done), plus `blocked`. Backends map these onto their real statuses; the ledger is authoritative during a run. | `/implement`, store |

**The global Definition of Done.** Applies to every plan. The plan carries one global Definition of Done block, the
acceptance criteria for the whole feature. `/implement`'s run init and the final review read it.

**The epic is optional.** Applies to a plan's slice count. A plan with a single slice carries no epic: that slice's
`acceptance` is the global Definition of Done, and the slice is its own scope anchor. A plan with two or more slices
carries a global Definition of Done (the epic) beside the per-slice `acceptance` fields.

### Criterion tags

**The tag.** Applies to every criterion of an epic's Definition of Done. Each criterion carries a **tag**: the slice
`id`s that deliver it, `scope` when no single slice does, or `docs` when its deliverable is `AGENTS.md`-hierarchy text
describing the scope's code. The tag decides which criteria a slice's report can tick, and it is no tick itself.

- **`scope`** marks a sweep, a preservation claim, or a scope-wide check `/implement`'s run handoff settles.
- **A single-slice feature** carries no tags: every criterion is its lone slice's.

**The `docs` tag.** Applies to a criterion tagged `docs`. The doc pass settles it: no slice's report ticks it, the
scope review never holds the stage on it, and `/superdev:document` judges it after its pass (`references/dod-ticks.md`).
`docs` stands alone, like `scope`, and is never combined with slice ids.

- **A criterion mixing `AGENTS.md` text with another deliverable** → split it into two criteria, one tagged `docs`.
- **A criterion a `docs` slice delivers as `AGENTS.md` text**, such as a restructuring of the hierarchy, keeps that
  slice's tag.

**The line format.** Applies to every Definition-of-Done line. Write it in this form:

```
- [ ] <criterion> — <ids|scope|docs>
```

**Store-notation tags.** Applies once every slice issue exists. `/superdev:plan` rewrites each slice id into the
store's own reference through `scope.js dod-tags`. A tag naming several slices joins bare references with `, ` and
carries no brackets:

```
- [ ] <criterion> — 01, 02          (as planned)
- [ ] <criterion> — #1388, #1396    (Forgejo, GitHub)
- [ ] <criterion> — PROJ-1, PROJ-2  (Jira)
```

**An untagged line.** Applies to a single-slice feature's own line and to one untagged line left inside an otherwise
tagged Definition of Done (`dod-ticks.md`'s **No tags at all**). The line carries no tag segment at all, never an
empty one: `- [ ] <criterion>`, judged as `- [x] <criterion> — met: <evidence>`.

**The note.** Applies to every line. An unjudged line carries only its tag, or nothing when it carries none. A
judged line carries one note, `— met: <evidence>`, `— not met: <reason>`, `— ceiling: <partial evidence>`, or
`— accepted: <reason>`, and never a bare tick. A later judgment replaces that note and adds no second one beside it:

```
- [x] Reachable: POST /orders (OrderApi) returns 201 and persists the order — 02 — met: implementer's report, evidence X
- [ ] every criterion states behaviour, not a proxy count — scope — not met: reason Y
```

**`accepted`.** Applies to a criterion an attended operator decides to accept as unmet. Its box stays unticked. The
line is still settled, because `references/dod-ticks.md`'s `## The note rule` reads a line's state from its note and
never from its box. The stage gate does not hold on it.

## `test-applicability` → warrant gates

**The warrant gates.** Applies to every slice by its `test-applicability` value.

- `behavior` — the implementer does full TDD, and **slice-reviewer runs**: correctness, independent verification, and
  on its first review the over-engineering lens, whose warranted cuts join that review's fix list.
- `mechanical` — pure move, rename, or format: no new test, and **the per-slice review is skipped**. The runs already
  in the loop and the scope's full-suite evidence `/superdev:ship` takes are the net, and the scope review
  catches correctness.
- `docs` — documentation only: no test, and **reviews are skipped**.

## Slice lifecycle & status

**The canonical lifecycle.** Applies to every slice `/implement` drives. Each slice moves through the states in this table.
Every backend maps them onto its own statuses, and an issue tracker records its statuses and transitions in
`issue-tracker.md`.

| Canonical | Entered when |
|---|---|
| `todo` | slice written to the store |
| `in-progress` | an implementer is dispatched for it |
| `in-review` | implementer returned; per-slice review running (**behavior** slices only) |
| `blocked` | implementer reports BLOCKED (only if the tracker has a blocked state) |
| `merged` (done) | merged into the scope branch |

**Skipping `in-review`.** Applies to a `mechanical` or `docs` slice. It goes from `in-progress` to `merged`.

**The anchor's status.** Applies to the scope anchor. It moves to `in-progress` when the run starts. `/superdev:wrap-up`
closes it to `done` after verification, and a failed close changes nothing.

- **A single-slice plan** → the lone issue is both slice and anchor. The anchor rule wins: it stays `in-progress`
  through the merge and closes once, at wrap-up.

**The execution tier.** Applies to every run. `/implement` derives the tier from the loaded `behavior` slices before a
ledger exists, and `scope.js tier --root <run-root>` derives the same tier from the ledger afterwards. The tier is
never a plan field and never persisted.

- **`lite`** → no per-slice review, whatever the `test-applicability`: every slice goes `todo` → `in-progress` →
  `merged`, and one whole-scope review stands in for the per-slice ones.
- **`full`** → the lifecycle table holds, `behavior`-only `in-review` step included.

## Scope anchor

**The scope anchor.** Applies to every feature. A feature's **scope anchor** is its root: a multi-slice plan's root has
slices beneath it, and a single-slice plan's root is its own lone slice. A consumer that needs a feature's scope-level
signal reads the active `docs/agents/issue-tracker.md`'s own `## Scope anchor` section. That section owns the backend
mechanism: recognising an anchor, listing the candidates, listing the slices beneath one, telling an anchor that is
itself a slice, and reading an anchor's own dependencies.

**The open candidate wins.** Applies to a candidate listing that spans every state. The open candidate is the anchor.
`Ambiguous` is two or more *open* candidates, never a closed one beside a single open one. A single closed candidate
is itself the anchor, the shape `plan-authoring.md`'s `## Append mode` reads as its shipped-feature done signal.

- Each store's own `## Scope anchor` section specialises *Recognise one* and *Ambiguous* to this rule.

**The anchor dependency.** Applies to an anchor naming another feature's anchor that must land first. It is the
feature-level counterpart of a slice's `depends-on`. Record one only when the second feature cannot be built until the
first's anchor is closed. It is never the same relation as a slice's `depends-on`, even on a store where the two could
land on the same record.

- Each store's `## Scope anchor` section names the distinct notation it uses.
- **Satisfied** only when the anchor it names is closed, or no such anchor exists. No ledger stage satisfies it, and a
  merged feature whose anchor is still open leaves its dependents waiting.
- `/superdev:plan` records one when its interview named a prerequisite feature. `/superdev:status` groups an anchor
  whose dependency is unsatisfied as `waiting`.

**The deploy line.** Applies to an anchor recording what its feature deploys to. It reads `**Deploy:** <target>[,
<target>]`, an ordered list of `docs/agents/deployment.md`'s `## Targets` names in deploy order, or `**Deploy:**
none`. It is optional and **anchor-only**, and an absent line reads as deploying nothing.

- **`manual` or `auto` posture** → `/superdev:plan` asks what the feature deploys to once the interview has settled
  the solution shape, offering the recorded targets plus `none`, and writes the answer as this line.
- **`none` posture, or no deploy target recorded** → it asks nothing and writes no line.
- `/superdev:ship` reads the line from the anchor after the merge.

**The Repairs line.** Applies to a repair's anchor. It reads `**Repairs:** #<original anchor>`, in the store's own key
notation, naming the scope anchor of the shipped feature this one repairs. It is optional and **anchor-only**, and an
absent line reads as no repair link.

- `/superdev:plan`'s repair choice writes it once, when it creates the repair, and nothing edits it afterwards.
- It blocks nothing: the original's `/superdev:wrap-up` gate never reads it, and nothing is ever written to the
  original anchor.
- Readers: `/superdev:plan`'s repair choice and `/superdev:status`, to mark a shipped scope a repair names; the
  shipped-run routing rule (`references/shipped-run.md`), off open and closed anchors; and `/superdev:wrap-up`, off a
  repair's own anchor once that repair closes.

**The Absorbs line.** Applies to an anchor whose scope absorbed open triage records. It reads `**Absorbs:** #<n>[,
#<n>]`, in the store's own reference notation, naming every absorbed record. It is optional and **anchor-only**, and
an absent line reads as no absorbed records, never as an error.

- `/superdev:plan` writes it when the operator absorbs records. An append that absorbs more revises the line in place.
- **Reading it** → a body holding several such lines reads the first. Each entry is trimmed and read on its own: a
  malformed entry is ignored while the rest are read, and a repeated entry counts once.
- `scope.js dod-check` holds the line against the Definition of Done's `(triage <reference>)` citations, at
  `/superdev:plan`'s store write and at the scope review's anchor sync.
- Append mode's single-slice promotion moves the line to the new epic (`plan-authoring.md`'s `## Append mode`).

**The Intent line.** Applies to an anchor whose plan was seeded from an intent record. It reads `**Intent:** #<n>[,
#<n>]`, in the store's own reference notation, naming every seeding intent record. It is optional and
**anchor-only**, and an absent line reads as no seeding intent record.

- `/superdev:plan` writes it whenever an intent record seeded it, fully planned or not, and writes none when seeded
  from a local intent file or from nothing.
- An append seeded from another intent record revises the line in place and keeps the records it already names.
- Append mode's single-slice promotion moves the line to the new epic (`plan-authoring.md`'s `## Append mode`).
- It blocks nothing, and no command reads it.

**Distinct notations.** Applies to every anchor line. Each store's own `## Scope anchor` section states the mechanism
it writes and reads each line with. No anchor line is ever confused with another anchor line or with a slice's
`depends-on`.

## Release

**The release.** Applies to every feature. A feature is **released** once a human has said its plan may be built. Only
the release authorises an agent to build, and writing a plan releases nothing.

**The release signal.** Applies to the scope anchor. The signal lives on the anchor and covers every slice beneath it.
It is a **durable** marker, distinct from the `todo`/`ready` lifecycle state: a status or label the dispatch moves off
never serves as the signal.

**Its consumers.** Applies to every command that acts on the signal. Each reads the active
`docs/agents/issue-tracker.md`'s own `## Release` section for the backend's signal and the calls that set and read it.

- **`/superdev:plan`** asks, once the plan is written, whether to release it now or leave that to a human later, and
  applies the signal on a release.
- **`/superdev:implement`** builds a released feature. An unreleased one stops the run and asks the user to confirm
  it anyway.
- **`/superdev:status`** groups an anchor carrying no release signal as `unreleased`.

## Run state

**The snapshot.** Applies to every run that writes its ledger. The run publishes a **snapshot** of its progress onto
the scope anchor, a `## Run state` section in the anchor's own body. `<run-root>/ledger.md` stays the run's single
source of truth, and the snapshot is a mirror, never a second authority.

- **When** → a command that wrote the ledger publishes once, at its end.
- **Best-effort** → a failed publish is reported once, and the run continues.
- A resumed run on a clean checkout reconciles against the snapshot.

**The backend mechanism.** Applies to every store. The active `docs/agents/issue-tracker.md`'s own `## Run state`
section owns where the section lives, the call that writes it, and the call that reads it back. It resolves the anchor
by citing that store's own `## Scope anchor` section. A store whose anchor cannot safely carry a mirrored write
declares itself snapshot-less there.

- The anchor's Definition of Done checklist is ticked apart from the snapshot (`## Definition of Done ticks`).

## Definition of Done ticks

**Ticks apart from the snapshot.** Applies to every controller tick of the anchor's Definition of Done checklist. A
store with no snapshot still ticks its anchor's own checklist. `<run-root>/dod.md` stays authoritative whether or not
an anchor tick lands, and the anchor edit is a best-effort mirror of it.

- Implement and run handoff write `dod.md` alone. Every other writer also writes the anchor.
- The scope review's anchor sync copies their ticks at entry and again before each stage write (`dod-ticks.md` →
  *Only a controller ticks*).

**The tick write.** Applies to recording a judgment on a criterion (`### Criterion tags`). Set the line's marker to the
**target state** the judgment reached, `- [x]` when met and `- [ ]` otherwise, and carry the line's note into the
store's own notation. The write **replaces** the line's previous note and never appends a second one.

- **A target state equal to the line's current state**, a `not met:` judgment on a line already unticked say → replace
  only the note, and leave the marker as it was.
- `scope.js dod-line` (`scripts/AGENTS.md` → *scope.js, the run-state CLI*) is the one line edit. Every store runs it
  on the checklist text its own read extracted, through its own gated body-edit rule.

**Tags into store notation.** Applies to `/superdev:plan` §6. It writes each criterion's tag in this file's notation,
a slice `id` or `scope`, because the epic exists before any slice. Once every slice is created, the controller
rewrites each tag into the store's own notation, in the **same parallel patch step** that records `depends-on`.

**Each store's section.** Applies to each store's own `## Definition of Done ticks` section. It cites this section and
states:

- the call the controller makes to tick a criterion, and to rewrite a tag into the store's own notation;
- how a criterion's tag renders in the store's own notation;
- that a failed tick write is **reported once per run and never stops the run** — `dod.md` stays authoritative.

## Feature label

**The feature label.** Applies to every feature. The **feature label** is the one identifier its scope anchor and
every slice beneath it carry. It holds the feature's **change type** and its slug. The type is the Conventional
Commits type of the work, which `scope-mode.md`'s `## The change type` lists and owns.

- `/plan` picks the type from what the feature does: a bug fix is `fix`, a documentation pass `docs`, and only new
  behaviour `feat`.

**The notation.** Applies to reading the label. The notation is the active `docs/agents/issue-tracker.md`'s, a
`<type>/<slug>` label. `/superdev:implement` reads the type as the scope branch's prefix and the slug as the scope.

## Issue-backend mapping (general)

**One issue per slice.** Applies to a slice store that is an issue tracker. Map the fields as this list states. The exact
commands and vocabulary live in the active `docs/agents/issue-tracker.md`, and the calls only `/superdev:plan` makes
(issue creation, the anchor-line writes, append mode) in `docs/agents/issue-tracker-plan.md`.

- `id` ↔ the issue key/number (record the mapping in the plan or ledger so `depends-on` can reference real keys).
- `title` ↔ issue title.
- `depends-on` ↔ the tracker's "is blocked by" link type.
- `spec` ↔ issue description body ("What to build").
- `acceptance` ↔ a checklist in the description (or sub-tasks).
- `test-applicability` ↔ a label.
- `status` ↔ the tracker's status/state; a "ready" label/status marks slices an agent may pick up.
- global DoD ↔ a parent/epic issue, or the first section of the feature epic. A single-slice feature skips the epic
  issue — the lone slice's `acceptance` checklist is the DoD.
- **Parked questions** (optional) ↔ a `## Parked questions` section in the epic issue body. Epic-only.
- **Non-goals** (optional) ↔ a `## Non-goals` section in the epic issue body. Epic-only and advisory: `/implement`
  never reads it.
- **Epic visuals** (optional) ↔ `## Slice graph` and `## Touch map` sections in the epic issue body. Epic-only,
  advisory, and written only when `plan-authoring.md`'s `### When to write them` says so.
