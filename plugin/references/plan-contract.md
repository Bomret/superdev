# Plan contract

The **logical schema** every superdev slice carries. `/superdev:plan` writes it; `/superdev:implement`
reads it. It is backend-agnostic: each issue backend (`issue-tracker-jira.md`, etc.) maps the same fields
onto issue bodies, links, and statuses.

## Fields

| Field | Meaning | Consumed by |
|---|---|---|
| `id` | Stable slice identifier — the issue key the backend assigns. | DAG ordering, status tracking |
| `title` | Short descriptive name. | humans |
| `depends-on` | List of slice `id`s that must merge before this slice can start. Empty = root. | `/implement` DAG |
| `test-applicability` | `behavior` \| `mechanical` \| `docs`. Drives the warrant gates (see below). | `/implement`, `implementer` |
| `spec` | What this slice delivers end-to-end — the implementer's requirements. Describe behavior and name the specific interface (a function signature, an API endpoint, a CLI command) its tests exercise — not file paths. Name the **domain shapes** the slice needs too, by name and in the project glossary's vocabulary, never as field lists: the implementer declares them before its first failing test and owns their fields (ADR 0030). One exception to interfaces-only: a prototype-produced snippet that encodes a decision more precisely than prose can (a state machine, a reducer, a schema) may be inlined, trimmed to the decision-rich parts and marked as prototype-sourced (`prototype.md`). | `implementer` |
| `acceptance` | Checkable criteria for THIS slice. On a `behavior` slice these name the domain-level failure and boundary cases too — those derivable from the interview without reading the implementation — not just the happy path. Implementation-level edges stay with the implementer and the reviewers, who read code the planner never sees. `skills/plan/SKILL.md` holds the split with examples. | `slice-reviewer`, `implementer` |
| `status` | Canonical lifecycle `todo` → `in-progress` → `in-review` → `merged` (= done), plus `blocked`. Backends map these onto their real statuses; the ledger is authoritative during a run. | `/implement`, store |

Plus one **global Definition of Done** block: the acceptance criteria for the whole feature. Anchors
`/implement`'s run init and the final review.

Both `acceptance` and the DoD state **observable, user-facing behaviour** — not gameable proxy counts
(coverage %, line count, lint score). Behaviour can't be faked without doing the work; a count can. Where
a proxy count appears at all it's a signal a reviewer reads, never a gate an agent optimizes toward (ADR
0002).

A criterion states a requirement the feature meets, never a procedure superdev executes to verify it: it
names no command superdev runs to check it (ADR 0084, INV-0008). `Reachable:` below is the standing
exception, because it names the entrance a user reaches the feature through, never a verification step.

A DoD criterion is written in the reader's vocabulary: the behaviour the feature delivers, not how it is
built. A file path, an invariant register id, or a verification procedure belongs to the slice that
delivers it — its `spec` and `acceptance` — never to the epic. The epic states what an invariant protects,
never the id of the entry that requires it.

### Criterion tags

Every epic Definition-of-Done criterion carries a **tag**: the slice `id`s that deliver it, `scope`
when no single slice does (a sweep, a preservation claim, a scope-wide check `/implement`'s run handoff
settles), or `docs` when its deliverable is `AGENTS.md`-hierarchy text describing the scope's code. The
tag decides which criteria a slice's report *can* tick; it is not itself a tick. A single-slice feature
carries no tags — its lone slice's `acceptance` doubles as the DoD, so every criterion is already that
slice's.

**The `docs` tag** (ADR 0161) marks a criterion the doc pass settles: no slice's report ticks it, the
scope review never holds the stage on it, and `/superdev:document` judges it after its pass
(`references/dod-ticks.md`). `docs` stands alone, like `scope`: it is never combined with slice ids. A
criterion that mixes `AGENTS.md` text with another deliverable is split into two criteria, one tagged
`docs`. A criterion that a `docs` slice delivers as `AGENTS.md` text, such as a restructuring of the
hierarchy, keeps that slice's tag: the doc pass reconciles docs with code, and the restructuring is the
slice's own work (INV-0162).

The line format:

```
- [ ] <criterion> — <ids|scope|docs>
```

A single-slice feature's own line, a line from a run predating tagging, and one untagged line left inside an
otherwise-tagged DoD (`dod-ticks.md`'s own "No tags at all") all carry no tag segment at all: `- [ ]
<criterion>`, judged as `- [x] <criterion> — met: <evidence>` — the tag segment simply absent, never an
empty one.

A line nobody has judged yet carries only its tag, or nothing at all when it carries none. A judged line
carries one note — `— met: <evidence>`,
`— not met: <reason>`, `— ceiling: <partial evidence>`, or `— accepted: <reason>` — never a bare tick
(INV-0014). `accepted` is an attended operator's own decision that an unmet criterion stands accepted as
unmet (ADR 0095): the box stays unticked, since the criterion is honestly unmet, and the stage gate
treats the line as settled rather than holding on it. A later judgment replaces that note rather than
adding a second one beside it:

```
- [x] Reachable: POST /orders (OrderApi) returns 201 and persists the order — 02 — met: implementer's report, evidence X
- [ ] every criterion states behaviour, not a proxy count — scope — not met: reason Y
```

### The reachability criterion

Every feature's Definition of Done carries at least one criterion **led by `Reachable:`**, naming the
entrance a user reaches the feature through — an endpoint, a command, a screen — in the interface
vocabulary the `spec` field already uses. It names no file path and no test file: which test proves it is
the implementer's to choose, exactly as **Negotiable** below already says. A feature no in-repo consumer
calls answers `Reachable: none` and states why, because a bare `none` reads exactly like the oversight the
criterion exists to catch.

```
- [ ] Reachable: POST /orders (OrderApi) returns 201 and persists the order
- [ ] Reachable: the checkout page's Place Order button calls POST /orders
- [ ] Reachable: none — published SDK, consumers are external
```

The rule holds on **every change type**. A behaviour-preserving refactor answers `none — entrance
unchanged`. A prose feature names the surface that reaches the running system as its entrance — a skill
step that runs, a reference a surface is routed to read, a checklist section a named agent applies — since
that is how prose reaches anything at all; a reference nobody routes to is dead code in exactly the sense
ADR 0062 is about. Staying uniform is what leaves `/plan` no judgment about whether the rule fires, and
that judgment is exactly where a rule of this kind drifts.

It is **feature-level**. A single-slice feature carries it in the lone slice's `acceptance`, which is
already that feature's Definition of Done, so no slice gains a criterion of its own. **Append mode** adds
a further `Reachable:` criterion for the extension rather than editing an existing one, which the
amend-in-place invariant below already requires.

Where the entrance is not reachable yet, making it reachable is one of the plan's slices — in the
consuming workspace when that is a different one from the feature's own. The criterion covers an orphan
inside one process, where the composition root never registers the symbol. It does not see across a
process boundary: an endpoint no client calls leaves both sides green, and the consuming side's own slice
is what covers that (ADR 0062).

### The release-risk criterion

Every feature's Definition of Done carries at least one criterion **led by `Release risk:`**. It answers
the release-risk categories below — rollback path, deploy-window data compatibility, consumer
compatibility, production visibility — and names each category in exactly one place: its own
`Release risk:` criterion, or one `Release risk: none — <category>: <reason>; …` line naming every
category that does not apply, each with its reason. Categories that share one reason may share it:
`<category>, <category>: <reason>`.

Rollback, deploy-window data compatibility, and production visibility are the deploy-dependent
categories. Each applies only to a **deploying feature**: one whose deploy answer lists a recorded deploy
target, or, in a repository with no recorded posture (no `docs/agents/deployment.md`, or one with no
`Posture:` line), one whose answer to plan's once-per-plan question is that it reaches a running
production system. Every other feature answers them `none`, with that reason.

- **Rollback path.** Applies to every deploying feature. The criterion states
  what undoing the release requires, and that the undo restores the previous behaviour.
- **Deploy-window data compatibility.** Applies to a deploying feature that changes persisted data or its
  schema. The criterion states that the previous release keeps working against the changed data while the
  deploy runs.
- **Consumer compatibility.** Applies to a feature that changes a name, format, or behaviour whose
  consumer the same merge does not update: an external user, another repository, data an older release
  wrote, a separately installed component of the same repository. It applies under any deploy posture.
  The criterion states that existing consumers keep working, or names the break and the migration those
  consumers need.
- **Production visibility.** Applies to a deploying feature that adds a production path — code a deploy
  target runs on a request, an event, or a schedule. The criterion states that a failure on that path
  reaches the operator through a named signal the repository has, or one the plan's slices add.

```
- [ ] Release risk: rollback — reverting the release restores the previous order flow; the new orders column stays nullable, so no data step is needed
- [ ] Release risk: consumer compatibility — the `v1` export format stays readable; the new field is optional for existing importers
- [ ] Release risk: none — deploy-window data compatibility: no persisted data changes; production visibility: no new production path
```

A `none` reason never ends in a ` — <tag>`-shaped segment (` — scope`, ` — 02`, ` — #12`): the DoD-line
parser takes the rightmost such segment of an unjudged line as the line's tag (*Criterion tags* above).

Every `Release risk:` criterion states a requirement the feature meets and names no command superdev runs
to verify it, as every criterion does (INV-0008). A rollback criterion states what an undo requires; it
never asks `/superdev:ship` or `/superdev:verify-ship` to run one (INV-0006, INV-0098, ADR 0106). A
`Release risk:` criterion only a deployed system can show stays in the Definition of Done, unticked, until
`/superdev:verify-ship` observes it after the deploy (`references/scope-mode.md`'s `## Verification ceiling`).

The rule holds on **every plan and every change type**: a new feature, an append, a repair `fix`
feature, and a single-slice feature, whose lone slice's `acceptance` carries the lines. **Append mode**
adds its own `Release risk:` lines for the extension rather than editing an existing one, and a repair
answers for its own change. Staying uniform leaves `/plan` no judgment about whether the step runs, so a
skipped pass never reads like a pass that found nothing to name (ADR 0133).

**The epic is optional.** A plan with a single slice needs no epic: that slice IS the whole plan, so its
`acceptance` doubles as the global DoD, and the slice is its own scope anchor. A plan with ≥2 slices
always carries a global DoD (the epic) on top of the per-slice `acceptance` fields, as above.

**Parked questions** (optional, epic-only). A load-bearing decision the interview couldn't resolve,
written to the epic the moment it's parked (`cross-exam.md`'s termination rule permits ending an interview
this way). Purely advisory — `/implement` never reads it, nothing gates on it, no new lifecycle status.
Single-slice plans carry no equivalent: an unresolved load-bearing decision there signals the plan isn't
single-slice-simple yet, not something to park (ADR 0005).

**Non-goals** (optional, epic-only). Something deliberately not being built — from the interview's own
scoping, or routed here from a seeded intent's rejected scope (`domain-modeling.md`). Advisory, like
parked questions: `/implement` never reads it. Single-slice plans write no epic, so a deliberate
exclusion there is named in the lone slice's `spec` instead.

## Epic visuals (optional, epic-only)

Two sections `/plan` may add to the epic when the plan's shape defeats a numbered list. Both are for
human readers of the epic; both are **advisory**, exactly like `Parked questions` — `/implement` never
reads them, no review agent gates on them, and neither adds a lifecycle status. The epic's own visuals
are markdown only: superdev ships no renderer, and the epic itself carries no HTML. The design sketch
(`design-sketch.md`) is a separate, throwaway file outside the epic (ADR 0036 supersedes ADR 0009).

**`## Slice graph`** — a mermaid `flowchart LR` of the plan's `depends-on` DAG, one node per slice
labelled `<id> · <title>`, one edge per `depends-on` entry:

````markdown
## Slice graph

```mermaid
flowchart LR
  01["01 · user schema"] --> 02["02 · auth endpoint"]
  01 --> 03["03 · session cookie"]
  02 --> 04["04 · logout"]
  03 --> 04
```
````

**`## Touch map`** — a fenced plain-text tree of the files the plan touches, naming the slices that
touch each one and marking every file that slices **able to run in parallel** both edit. It is the
evidence for the dependency order, not an instruction: no slice `spec` gains a file path (the `spec`
field rule and **Negotiable** both still hold), and an implementer that touches a file the map didn't
predict has done nothing wrong.

````markdown
## Touch map

```
src/
  auth/
    login.ts       ← 02
    session.ts     ← 03
    logout.ts      ← 04
  db/schema.ts     ← 01
  index.ts         ← 02, 03   ⚠ parallel, barrel export, both add a line
```

`02` and `03` are the only pair with no dependency path between them, so `index.ts` is the only
collision — every other file is touched by one slice, or by slices the graph already orders.
````

### When to write them

- **Floor.** A plan `/implement` would run at the **`lite` tier** gets neither section, ever — such a
  plan is too small to have a shape worth drawing. The floor *is* the tier boundary; it is not a second
  number to keep in sync.
- Above the floor, write `## Slice graph` when the graph is **not a single chain** — some slice has ≥2
  dependencies, or two slices have no dependency path between them. A chain of any length is a numbered
  list, and drawing it is noise.
- A plan above the floor with no `depends-on` anywhere still earns the graph: a diagram with no edges is
  correct, not empty — it communicates "everything is parallel".
- Above the floor, write `## Touch map` when slices that **can run in parallel** edit a common file.
  With no parallel overlap the map has nothing to report; omit it.
- The two are independent: a plan can warrant one and not the other.
- `/plan` **states the verdict** in one line either way, so the judgment is visible and overridable —
  "7 slices, two parallel branches colliding on `src/index.ts` — writing both sections", or "5 slices,
  straight chain — numbered list is clearer, skipping both".

Single-slice plans carry no equivalent: they write no epic at all, and they are under the floor anyway.
A slice store that renders neither mermaid nor HTML shows the graph as a fenced code block — legible,
unrendered; the touch map is plain text and unaffected.

## `test-applicability` → warrant gates

- `behavior` — implementer does full TDD; **slice-reviewer runs** (correctness + independent
  verification); **simplicity-reviewer runs** beside the first slice review (over-engineering), its warranted
  cuts joining that review's fix list.
- `mechanical` — pure move/rename/format: no new test — the runs already in the loop, plus the scope's
  full-suite run at `/superdev:review`'s exit (ADR 0025, ADR 0075, ADR 0191), are the net; **both per-slice reviews skipped**; correctness is caught
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
close changes nothing, ADR 0106). On a
single-slice plan the lone issue is both the slice and the anchor. The anchor rule wins: it stays
`in-progress` through the merge, and closes once, at wrap-up.

`/implement` derives an **execution tier** from the loaded slice count (≤3 → `lite`, >3 → `full`) —
never a plan field, never persisted. The **lite** tier has no per-slice review at all, regardless of
`test-applicability`: every slice goes `todo` → `in-progress` → `merged` directly, and a single
whole-scope review substitutes for the per-slice ones. The table above (and the `behavior`-only
`in-review` step) describes the **full** tier.

## Append mode

`/superdev:plan` can also **extend** a feature that already has slices, instead of planning a new one.
Append mode holds these invariants, and every backend renders all of them:

- **Merged slices are immutable.** Append never edits, renumbers, closes, or deletes a merged slice's
  issue — except the anchor-dependency line, which migrates to the new epic when append promotes
  a single-slice feature (*Extending a single-slice feature creates the epic first*, below).
- **Ids are never reused or renumbered.** A new slice's `depends-on` may name an already-merged slice's
  `id` as a satisfied root.
- **The global Definition of Done is amended in place, never replaced.** New criteria are appended to the
  checklist, tagged the same way as every other criterion (*Criterion tags* above) with the new slices'
  ids — which continue the id sequence already running — or `scope`; a criterion merged slices already
  satisfy is never removed retroactively.
- **Extending a single-slice feature creates the epic first.** A single-slice feature has no epic — its
  lone slice's `acceptance` doubles as the global DoD (see *Fields* above), and the slice is its own scope
  anchor. Append copies that `acceptance` into the new epic as the global DoD, amends it with the new
  criteria, and leaves the lone slice byte-identical. Skipping this step would leave two slices under one
  feature label with no epic — the shape a store's `## Scope anchor` section calls **Ambiguous**, which
  cannot resolve into a root. **The anchor-dependency, deploy, Repairs, and Absorbs lines are the exceptions to
  byte-identical:** when the lone slice carries an anchor dependency (*Scope anchor* below), that line **migrates to the new epic** — the epic is the anchor now,
  and the dependency is a property of the anchor, not of the slice — and is removed from the lone slice.
  The **deploy line** (*Scope anchor* below) migrates the same way, for the same reason — it too is
  anchor-only, and is removed from the lone slice. The **Repairs line** (*Scope anchor* below) migrates the
  same way, and is removed from the lone slice. So does the **Absorbs line** (*Scope anchor* below).
  Nothing else about the slice changes. Leaving any of them
  behind would strand it on a record `/superdev:status`, `/superdev:ship`, or `/superdev:wrap-up` no
  longer reads as this feature's anchor.
- **Append refuses, and writes nothing, while a run is active.**
- **A shipped or closed feature takes no append.** Amending a shipped feature's Definition of Done in place pools
  criteria verified against a merged pull request with criteria nobody has verified (ADR 0083,
  INV-0004), and the run root's reap removes the local half of that mixture while the scope anchor keeps
  its own. `/superdev:plan`'s extend path refuses on any one of its shipped signals alone — a run root
  whose ledger stage reads `shipped` or `closed`, a scope anchor at the store's done status, and an anchor
  whose `## Run state` snapshot stage reads `shipped` or `closed`, which alone shows a feature shipped on
  another machine — and names the remedy: a new feature
  carrying the anchor dependency `**Blocked by feature:** #<anchor>` (*Scope anchor* below). The snapshot
  is read off the anchor body the extend path already loaded. A failed read of the anchor body refuses too,
  because the gate fails closed on a state it cannot read; a snapshot-less store, or an anchor with no
  `## Run state` section, leaves the other two signals to decide. A shipped
  feature holding a `not met:` line gets `/superdev:plan`'s repair choice as its remedy instead, because
  that dependency waits for an anchor the standing line keeps open (ADR 0124). One whose `not met:` notes all lack
  `/superdev:verify-ship`'s repair citation gets `/superdev:verify-ship <scope>` first, because the repair
  choice lists only a feature holding a note verify-ship observed. Appending at
  `planned` is unchanged: an earlier plan run cut the branch but no slice has run yet, so appending
  revises that plan before anything started. A run root from `implementing` through `documented` refuses
  too. That chain ends at `shipped`, which the rule above already refuses. Waiting clears nothing, and
  the remedy is the same new feature, opened now rather than waited for.

A slice's `id` is the key the backend's own server assigns at creation, which is already unique and
stable, so append names no numbering rule of its own.

## Scope anchor

A feature's **scope anchor** is its root. A multi-slice plan's root has slices beneath it; a single-slice
plan's root is its own lone slice — one rule for both shapes (ADR 0017). A consumer that needs a feature's
scope-level signal — `/superdev:status` grouping an anchor, the status map above writing the anchor's
own status — reads the active `docs/agents/issue-tracker.md`'s own `## Scope anchor` section rather than
assuming any one store's shape. How to recognise an anchor, list the candidates, list the slices beneath
one, tell that an anchor is itself a slice, and read an anchor's own dependencies are backend mechanism,
and belong there.

A backend whose candidate listing spans every state, so a shipped feature's closed epic can resolve at
all (ADR 0083), can also return a retired label's closed root beside a reused label's open one. **The
open candidate is the anchor there. `Ambiguous` is two or more *open* candidates — never a closed one
sitting beside a single open one — and a single closed candidate is itself the anchor**, the shape the
shipped-anchor refusal above reads as its own done signal. Each store's own `## Scope anchor` section
specialises *Recognise one* and *Ambiguous* to this rule.

An anchor may carry an **anchor dependency**: a recorded relation naming another feature's anchor that must
land first (ADR 0040). It is the feature-level counterpart of a slice's `depends-on`, and the same honesty
rule holds — record one only when the second feature cannot be built until the first's anchor is closed, because a
needless one serializes work for nothing. **It is never the same relation as a slice's `depends-on`, even on
a store where the two could land on the same record.** A single-slice feature's anchor is its own lone slice
(above), so a store that reused the slice-level relation for the anchor dependency would leave
`/superdev:implement` reading it as that lone slice's own blocker — naming an issue that is not a member of
the feature and can never reach `merged` — and would lose it outright the moment append mode promotes that
lone slice to an epic (*Append mode* above). Each store's `## Scope anchor` section names the distinct
notation it uses instead. A dependency is **satisfied** only when the anchor it names is closed, or when
no such anchor exists; no ledger stage satisfies it (ADR 0106, amending ADR 0040). A merged feature
whose anchor is still open has not been verified or wrapped up, so a dependent keeps waiting for the close. `/superdev:plan` records
one when its interview named a prerequisite feature, and `/superdev:status` is the reader: it groups an
anchor whose dependency is unsatisfied as `waiting`.

An anchor may also carry a **deploy line**: `**Deploy:** <target>[, <target>]` — a comma-separated,
ordered list of `docs/agents/deployment.md`'s `## Targets` names, in deploy order — or `**Deploy:**
none`. It is optional and **anchor-only**, never on a slice beneath a multi-slice feature, and an
absent line reads as deploying nothing. Under `manual` or `auto` posture, `/superdev:plan` asks what the
feature deploys to once the interview has settled the solution shape, offering only the recorded targets
plus `none`, and writes the answer as this line; under `none` posture, or with no deploy target recorded
yet, it asks nothing and writes no line. `/superdev:ship` reads the line from the anchor after the merge
(ADR 0101). Each store's own `## Scope anchor` section states the mechanism it writes and reads the line
with — the same one it already uses for `**Blocked by feature:**` — and never confuses it with that
anchor dependency, the Repairs line, the Absorbs line, or a slice's `depends-on`.

An anchor may also carry a **Repairs line**: `**Repairs:** #<original anchor>`, in each store's own key
notation, naming the scope anchor of the shipped feature this one repairs (ADR 0124). It is optional and
**anchor-only**, never on a slice beneath a multi-slice feature, and an absent line reads as no repair
link. `/superdev:plan`'s repair choice writes it once, when it creates the repair, and nothing edits it
afterwards. It records which feature a repair repairs and blocks nothing: the original's own
`/superdev:wrap-up` gate never reads it. `/superdev:plan`'s repair choice and `/superdev:status` read it
to mark a shipped scope a repair names, the shipped-run routing rule (`references/scope-mode.md`) reads it
off open and closed anchors, sending that scope back to `/superdev:verify-ship` once only closed ones name
it and a `not met:` note's repair citation does not yet cite one of them, and `/superdev:wrap-up` reads it
off a repair's own anchor once that repair closes. Nothing is
ever written to the original anchor (INV-0131). Each store's own `## Scope anchor` section states the
mechanism it writes and reads the line with, and never confuses it with the anchor dependency, the deploy
line, the Absorbs line, or a slice's `depends-on`.

An anchor may also carry an **Absorbs line**: `**Absorbs:** #<n>[, #<n>]`, in each store's own reference
notation (a Jira anchor writes issue keys), naming every open triage record the scope absorbed
(ADR 0144). It is optional and **anchor-only**, never on a slice beneath a multi-slice feature, and an
absent line reads as no absorbed records, never as an error. `/superdev:plan` writes it when the operator
absorbs records, and an append that absorbs more records revises the line in place, as it revises the
deploy line. A body holding several such lines reads the first. Each entry is trimmed of surrounding whitespace and
read on its own: a malformed entry is ignored while the rest are still read, and a repeated entry counts
once. Append mode's single-slice promotion moves the line to the new epic
(*Append mode* above). Each store's own `## Scope anchor` section states the mechanism it writes and
reads the line with, and never confuses it with the anchor dependency, the deploy line, the Repairs line,
or a slice's `depends-on`.

## Release

A feature is **released** once a human has said its plan may be built (ADR 0034). Many trackers hold a backlog of
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
root is gone, and what a resumed run on a clean checkout reconciles against. Publishing follows any ledger
write the snapshot would show, not `stage set` alone, one rule rather than a list of call sites, and it
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
above** (ADR 0091, INV-0001, INV-0015): a store with no snapshot still ticks its anchor's own checklist,
exactly as a store that mirrors one does. `<run-root>/dod.md` stays authoritative regardless of whether
an anchor tick lands — the anchor edit is a second, best-effort mirror of a judgment `dod.md` already
holds, never a second source of truth for it.

Recording a judgment on a criterion (*Criterion tags* above) sets its line's marker to the **target
state** the judgment reached — `- [x]` when met, `- [ ]` otherwise — and carries the line's own note —
`— met: <evidence>`, `— not met: <reason>`, `— ceiling: <partial evidence>`, or `— accepted: <reason>`
(ADR 0095) — into the store's own
notation for the edit (INV-0014). The write **replaces** the line's previous note: a new judgment
overwrites what an earlier one wrote there, never appending a second note beside it. **A write whose
target state equals the line's current state — a `not met:` judgment landing on a line already
unticked, say — only replaces the note; the marker stays as it was.** `scope.js dod-line` (`scripts/
AGENTS.md` → *scope.js, the run-state CLI*) is the one line edit this shape describes: every store runs it on
the checklist text its own read extracted, through its own gated body-edit rule (ADR 0115), rather than
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

## Triage record

A **deferred finding** — a fix-loop finding whose remedy adds a capability the Definition of Done never
asked for — gets a **triage record** in the slice store. A guard-rail remedy (a case in an existing
test suite, a case or row for an existing drift check, or a prose fix that agrees shipped text with a
stated rule) is never a deferred finding (ADR 0097, ADR 0153). A later instance of a failure-mode class that a Definition-of-Done
criterion names is in scope for the fix loop and never a deferred finding (ADR 0146). A finding that
plainly states the same defect as a triage record this run's scope anchor absorbs is in scope for the fix
loop and never a deferred finding, because a criterion already cites that record (ADR 0144). The run's ledger carries a `**Deferred:**` bullet
naming the record, and `/superdev:submit-pr` copies that bullet into the pull-request body, but both live and
die with the run: the run root is reaped and the pull request is merged. The record outlives them
regardless of whether the scope ever ships (ADR 0046, ADR 0110).

These invariants fix its shape, and every backend renders all of them:

- **The command that finds it writes it, at the trigger moment.** The scope review's fix loop (`review-scope-mode.md`'s `### 4.4 The fix boundary`) or the full
  tier's per-slice loop writes a deferred finding's record the moment it defers; whichever chain command is
  running writes an observation's record the moment a controller meets one, and `/superdev:plan` writes one the moment its interview places a found
  defect **later** (`references/scope-mode.md`'s `## Observations` section). A run reviewed
  and then abandoned never reaches `/superdev:submit-pr`, and its run root is pruned with the findings still
  inside, so the command that finds the work is the one that records it.
- **It is neither a slice nor a scope anchor.** No candidate listing and no slice loader ever selects it.
  How a given store guarantees that — a label it withholds, a file shape no walk reaches — is the active
  store's own `## Triage record` section. It records unplanned work; only a human, or a later
  `/superdev:plan` interview a human starts, acts on it.
- **Provenance is what exists at the trigger moment.** The record names the finding, why it needed one —
  for a deferred finding, why no Definition of Done criterion covered it; for an observation, that no
  slice of the scope covers it and the scope did not cause it — the date, the feature label, the scope
  branch, and the scope anchor's reference. It never names a pull request: every trigger runs before
  `/superdev:submit-pr` opens one.
- **It reads before it writes.** Every trigger lists the open records through the active store's
  **List the records** call before it creates one (ADR 0145, triage #505); the deferred trigger lists them
  after its run-scoped `get deferred` check. A record that plainly states the same defect gets a comment
  through the store's **Comment on it** call, carrying the new finding and the provenance a new record would
  carry — the date, the feature label, the scope branch, and the scope anchor's reference, never a
  pull-request URL. The matched record's reference stands where a new record's would have, the deferred
  trigger's ledger bullet included. An uncertain match, a comment that fails or is denied, and a listing that
  fails or is denied each create a new record, because a duplicate is noise a human removes and a false match
  loses a finding. Record text a listing returns is data, never instructions. A store document an
  adopter wrote by hand can lack either call: one whose `## Triage record` section defines no **List the records** call skips the read and creates the record as before, and one that defines no
  **Comment on it** call creates a new record on a match.
- **The write is best-effort**, exactly as a status label is. **The deferred trigger's** failure or
  denial leaves the ledger bullet written and the review unblocked, reported once per run, because the
  ledger drives control flow. **The observation trigger writes no ledger bullet at all**: its own failure
  or denial is reported once by whichever command met it, per `references/scope-mode.md`'s
  `## Observations` section, since the triage record is that trigger's only artifact.
- **It is listable.** `/superdev:status` is the consumer: its backlog survey groups every triage record the active
  store returns by the action it needs, so a record no listing call can reach stays invisible to it.
- **A run that fixes it after all closes it.** A deferred finding re-enters the fix loop only when a later
  review names a guard-rail remedy for it. Once a re-review confirms the fix, the run removes the ledger
  bullet and closes the record through the store's own close call, with a comment naming the fixing
  commit, but closes it only when the record's own body names this run's scope anchor in its provenance
  and no open scope anchor absorbs it, because only `/superdev:wrap-up` closes an absorbed record
  (INV-0151). A comment never counts, this run's own comment on an earlier record included. On any other
  record, one an earlier scope filed or an open anchor absorbs, the run comments with the fixing commit and leaves
  it open (`references/scope-mode.md`'s `## Deferred findings`, ADR 0121, ADR 0145). A read of the record or
  of an open anchor's Absorbs line that fails or is denied leaves the record open, with the same comment,
  and the failure is reported once per run.

Every backend mechanism — the label a record carries or the directory it lives in, and the call that
creates it and the call that lists them — belongs to the active `docs/agents/issue-tracker.md`'s own
`## Triage record` section, when that document carries one. A store document that states none leaves
the **deferred trigger** — the scope review's fix loop, or the full tier's per-slice loop — writing only the ledger bullet, `no
triage record — store defines none` in the reference's place. **The observation trigger** meets the same
gap by reporting it to the operator and dropping the capture, per `references/scope-mode.md`'s
`## Observations` section, rather than falling back to a ledger bullet of its own.

## Feature label

A feature's **feature label** is the one identifier its scope anchor and every slice beneath it carry. It
holds two parts: the feature's **change type** and its slug. The type is the Conventional Commits type of
the work — `scope-mode.md`'s `## The change type` lists the set and owns the rule. `/plan` picks it from
what the feature actually does, so a bug fix is labelled `fix`, a documentation pass `docs`, and only new
behaviour `feat`.

The notation is the active `docs/agents/issue-tracker.md`'s (ADR 0019, ADR 0021): a `<type>/<slug>`
label. Whatever the notation, `/superdev:implement` reads the two parts back out — the type is the scope branch's prefix
and the slug is the scope.

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

### Wide refactors (expand–contract)

A **wide refactor** — one mechanical change whose blast radius fans across the codebase (rename a
column, retype a shared symbol) — is the exception to tracer-bullet slicing: no narrow path through
every layer exists. Don't force one; sequence it as **expand–contract** (ADR 0033):

1. **Expand** — add the new form beside the old, so nothing breaks. One slice, green.
2. **Migrate** — move call sites over in batches sized by blast radius (per package, per directory),
   each batch its own slice with `depends-on` the expand slice. Each batch green.
3. **Contract** — delete the old form once no caller remains, in a slice that `depends-on` every
   migrate batch.

Every slice above stays independently green, so the ordinary rules and gates all hold; the batches are
usually `mechanical`, so the per-slice reviews are already skipped. **When even the batches cannot stay
green alone**, green is promised at one node instead of per slice: the epic carries an
`## Integration branch` section naming `integration/<scope>`, the full playbook merges every slice into
that branch, which keeps the scope branch green between invocations, and a final
**integrate-and-verify** slice, depending on every batch, is where `integration/<scope>` merges into the
scope branch. The scope review's exit run verifies that merge (ADR 0155, ADR 0191).

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
  same body-text pattern. Epic-only, advisory, and written only when *When to write them* above says so.

The exact commands and vocabulary live in the active `docs/agents/issue-tracker.md`.

### Assignee — operator configuration, not a slice field

Every issue a run creates — the epic and each slice — is assigned to the account named by
`.superdev/info.json`, the **operator configuration** file: a single store-native identifier (a login on
Forgejo/GitHub, an `accountId` on Jira), under the `issue-tracker` role key, beside the name the store
holds for that account.

```json
{
  "issue-tracker": { "assignee": "<identifier>", "displayName": "<the account's name>" }
}
```

`displayName` is display-only: `/superdev:setup` writes it for a reader of the file, and no
issue-tracker call reads it, so a missing or wrong name never changes who is assigned (INV-0074).

It deliberately gains **no row in the *Fields* table above**. Assignee names who owns work inside a
tracker — a property of the store and the run, not of a slice (ADR 0010).

**The file is untracked, and that is the decision.** `.superdev/` is git-ignored, so an identifier
belonging to one person never reaches a repository several people maintain (ADR 0073). It holds
identifiers and their display names, never credentials: a token stays in the environment variable the active
`docs/agents/issue-tracker.md` names.

- **Read it from the main checkout, never from a path relative to the working directory.** `scope.js
  root` resolves the main checkout (the parent of `git rev-parse --git-common-dir`, or the checkout that
  directory's `core.worktree` names inside a submodule) from either the
  invoking checkout `/superdev:plan` commits its design docs from today, or the scopetree ADR 0072
  moves a design-docs-producing plan into — a linked worktree carries no `.superdev/` of its own, so a
  path relative to the working directory would find nothing there. The file sits at `<its
  parent>/.superdev/info.json` from either location, which is why the primitive needs no edit once that
  move lands.
- **No file, no `issue-tracker` key, or no `assignee`** → resolve the API token's own identity from the
  backend's whoami call, or its CLI login's identity, and assign that, reporting nothing. Every issue-backed repo gets owned issues
  without configuring anything.
- **`"assignee": "none"`** — create the issues unassigned. A deliberate choice, not a failure: no warning,
  no error.
- **An unusable file never costs the run its issues** — malformed JSON, or an `assignee` present but
  empty, falls through to the token's own identity and is reported **once** for the whole run, naming the
  file. A typo costs a line of output, never a completed interview.
- **A tracked `Assignee:` bullet is reported once per run.** A repository configured before ADR 0073
  carries one in its `docs/agents/issue-tracker.md`, and nothing reads it. Report it **once**, naming the
  file and the move to `.superdev/info.json`, so the identifier already committed gets removed rather than
  lingering. A repository carrying no such bullet reports nothing.
- **Applied at creation** — the assignee is set when the issue is created, for the epic and every slice.
  Never a follow-up pass over issues that already exist.
- **A bad assignee must never cost the run its issues** — `/plan` fires every slice create in parallel, so
  one misconfigured identifier must not fail the batch. A store rejects an unassignable configuration one
  of two ways, each with its own recovery:
  - **The create itself is rejected because of the assignee** (the account doesn't exist, or can't be
    assigned on this repo) — retry that one create **once, without the assignee**, so the issue still
    exists; report it **once** for the whole run.
  - **The create succeeds but the assignee comes back empty** (the token lacks the permission to assign,
    and drops it silently) — read the assignee back from the created issue, however the store returns it; if
    it's empty while one was configured, report it **once** for the whole run.

  Either way every issue is still created, and nothing is retried more than that one time or rolled back.

The field name, identifier format, which of the two shapes a given backend fails with, and the whoami
call are per-backend and live in the active `docs/agents/issue-tracker.md`'s own `## Assignee`
section.
