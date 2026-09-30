# Slice store: Local plan files

A feature's plan lives as a **directory of markdown files** in this repo — one file for the feature
scope, one per slice — in the format defined by the superdev plan-contract.

## Layout

`docs/plans/<type>/<feature-slug>/` — one directory per feature, under the feature's change type:

```
docs/plans/<type>/<feature-slug>/
  00-epic-<summary>.md                    epic file: global Definition of Done + feature description
  01-<test-applicability>-<summary>.md    first slice   (id 01)
  02-<test-applicability>-<summary>.md    next slice    (id 02)
  ...
```

- **`<type>`** is the **change type** — the Conventional Commits type of the work, per
  `references/scope-mode.md`. The path under `docs/plans/` **is** this store's feature label
  (`<type>/<feature-slug>`), and that label doubles as the scope branch name.

- **`00-epic-…`** is the **epic file**: it holds the global Definition of Done plus a short description
  of the feature. It is not a slice. **A single-slice feature has no `00-epic-…` file** — the lone
  `01-…` slice carries the DoD in its own `acceptance` section.
- Each **`NN-…`** (N ≥ 01) is one slice. `<test-applicability>` is `behavior` | `mechanical` | `docs`;
  `<summary>` is a short kebab-case slug.
- The zero-padded number **is the slice `id`** (`01`, `02`, …). `depends-on` references those numbers
  directly (e.g. `depends-on: [01, 03]`).
- **Triage label:** none. This store has no labels at all, so a **triage record** is a file in its own
  directory instead, `docs/plans/triage/` (*Triage record* below). That directory is this store's
  configuration for it, and it is the one place under `docs/plans/` that holds no feature.

Numbers are assigned in reading/authoring order — roughly topological, so a slice usually gets a higher
number than the slices it depends on — but the **authoritative dependency graph is `depends-on`**, not
the numbering. Two digits cover up to 99 slices; widen the padding if a feature needs more.

## File format

Epic file `00-epic-<summary>.md`:

```markdown
# <feature>

status: todo
blocked-by: [<type>/<feature-slug>]
deploy: [<target>]

<short description of the feature and its intent>

## Definition of Done (global)
- [ ] <checkable acceptance criterion for the whole feature>
- [ ] ...

## Parked questions
- <question> — <why it's open / what would resolve it>

## Non-goals
- <thing deliberately not being built> — <why>

## Slice graph
<mermaid flowchart LR of the depends-on DAG>

## Touch map
<fenced file tree: which slices touch which files, collisions marked>
```

`blocked-by:` is optional too, but unlike the optional sections below it is a header line, and
`/superdev:backlog` does read it (`## Scope anchor` below, ADR 0040) — omit it unless the interview named a
prerequisite feature. `deploy:` is a header line too, optional and anchor-only: `deploy: [<target>,
<target>]`, in the operator's answer order, or `deploy: none`, written under `manual`/`auto` posture once
`/superdev:plan`'s deploy question is answered, and read by `/superdev:ship` after the merge (`## Scope
anchor` below, ADR 0101) — omit it under `none` posture or with no deploy target recorded yet. `##
Parked questions`, `## Non-goals`, `## Slice graph`, and `## Touch map` are all
optional, advisory-only sections that `/implement` never reads — omit `## Parked questions` when
nothing's been parked, omit `## Non-goals` when nothing was deliberately dropped from scope, and write
`## Slice graph`/`## Touch map` per `plan-contract.md`'s *Epic visuals* section, which owns their shape,
their independence from each other, and the rule for when each is written. A single-slice feature has no
epic file, so none of them exist there — see `plan-contract.md`.

Each slice file `NN-<test-applicability>-<summary>.md`:

```markdown
# 01 — <title>

depends-on: []
test-applicability: behavior
status: todo
blocked-by: [<type>/<feature-slug>]
deploy: [<target>]

## spec
<behavior/interface this slice delivers — the implementer's requirements>

## acceptance
- <checkable criterion 1>
- <checkable criterion 2>
```

`blocked-by:` is optional, and belongs here only on a single-slice feature: write it when this lone slice
is the feature's own anchor and the interview named a prerequisite feature, and omit it otherwise — a
slice beneath a multi-slice epic never carries it, because the epic is the anchor there (`## Scope
anchor` below, ADR 0040). `deploy:` is optional and anchor-only the same way: write it on this lone slice
only when the deploy question was asked and answered, and omit it otherwise — a slice beneath a
multi-slice epic never carries it either, because the epic carries the deploy line there (`## Scope
anchor` below, ADR 0101).

## Scope anchor

A feature's scope anchor is its root (`plan-contract.md` → *Scope anchor*), and this store expresses it in
the filename. On a multi-slice feature it is `00-epic-<summary>.md`; on a single-slice feature there is no
epic file, so the lone `NN-<test-applicability>-<summary>.md` is the anchor (ADR 0017).

- **Recognise one.** In `docs/plans/<type>/<feature-slug>/`, the anchor is `00-epic-*.md` when that file exists,
  and otherwise the single `NN-*.md` file.
- **List the candidates.** Each directory two levels under `docs/plans/` (`docs/plans/*/*/`) is one
  feature, so its anchor is one candidate. The first level is the change type, never a feature.
- **List the slices beneath it.** Every *other* `NN-*.md` file in the same `docs/plans/<type>/<feature-slug>/`
  directory as the anchor is a slice beneath it (multi-slice); a single-slice feature's anchor is the lone
  `NN-*.md` file, so it has none beneath it.
- **Tell an anchor that is itself a slice.** Its filename begins with a number from `01` up and carries a
  `<test-applicability>` segment. The epic file begins with `00-epic-`. That is what separates a
  single-slice feature, whose lone slice file is its own anchor and is real work, from a feature
  directory holding only an epic file, which was never decomposed.
- **Read an anchor's dependencies.** A `blocked-by:` line in the anchor file, listing other features by
  their `<type>/<feature-slug>` path under `docs/plans/` (for example
  `blocked-by: [feat/anchor-dependencies]`). Each entry names another feature's scope anchor
  (`plan-contract.md` → *Scope anchor*, ADR 0040). An absent line means no dependency. The key is
  `blocked-by` rather than `depends-on` because a single-slice feature's anchor is its lone slice file,
  where `depends-on` already carries slice numbers within the feature.
- **Read an anchor's deploy line.** A `deploy:` header line in the anchor file: `deploy: [<target>,
  <target>]`, in the operator's answer order, or `deploy: none` (for example `deploy: [proxmox-homelab]`).
  An absent line means the feature deploys nothing. Distinct from `blocked-by:` above, which names another
  feature rather than a deploy target (`plan-contract.md` → *Scope anchor*, ADR 0101). `/superdev:plan`
  writes it once the deploy question is asked and answered; `/superdev:ship` reads it after the merge.
- **Ambiguous.** A directory with no `00-epic-*.md` and two or more `NN-*.md` files. `/superdev:plan`
  never writes that shape, and there is no global Definition of Done to build against, so a consumer
  reports it instead of choosing.

## Release

`plan-contract.md` → *Release*. **A plan file is released when it is written.** There is no backlog column
and no refinement board here: the person who ran `/superdev:plan` is the person who agreed to the plan, and
the file landing in `docs/plans/<type>/<feature-slug>/` is that agreement. So `/superdev:plan` asks no
release question on this store, and `/superdev:implement` treats every feature as released.

**There is nothing to remove, either.** A store that releases its features at write carries no signal an
append could leave standing over new slices, so `/superdev:plan` says so on a declined release rather
than attempting a removal call (ADR 0083).

A team that wants a release gate on plan files configures a different store, or records the signal here
instead — a `released: yes` line in the epic file's header, read where the status line is read.

## Triage record

`plan-contract.md` → *Triage record*. `/superdev:review` creates one the moment it defers a finding; the
controller creates one the same way the moment it meets an observation, and `/superdev:plan` the moment its
interview places a found defect later (`references/scope-mode.md`'s `## Observations` section).
This store has no labels, so the record is a **file**: `docs/plans/triage/<slug>.md`, where `<slug>` is a
short kebab-case summary of the finding. A file already at that path takes a `-2`, `-3`, … suffix, so two
findings summarised the same way stay two records.

```markdown
# <the finding, one line>

status: triage
feature-label: <type>/<feature-slug>
anchor: docs/plans/<type>/<feature-slug>/00-epic-<summary>.md
date: <YYYY-MM-DD>

<the finding, and why it needed a record — for a deferred finding, why no Definition of Done criterion
covered it; for an observation, that no slice of the scope covers it and the scope did not cause it>

/superdev:plan "<the finding>"
```

- **List the records:** glob `docs/plans/triage/*.md` in the checkout. Each file is one record, and its
  first heading is the finding. **The listing is of the checked-out branch, never of the store as a
  whole**: a record `/superdev:review` committed on a scope branch that has not merged is absent from a
  base-branch checkout, and is neither missing nor lost (ADR 0048). Say which branch was read rather than
  claiming a complete backlog. An absent `docs/plans/triage/` directory is an empty list, not an error —
  no finding has been deferred yet.
- **`feature-label` doubles as the scope branch name** (`## Layout` above), so the record carries no
  separate `scope-branch` field.
- **`docs/plans/triage/<slug>.md` is invisible to `/superdev:implement`'s slice loading** by construction.
  A triage record is a **file**, not a directory two levels under `docs/plans/`, and it carries no `ready`
  status, which is what `/superdev:implement`'s slice loading selects on. The candidate listing that
  `/superdev:backlog` and `/superdev:plan` use (`## Scope anchor` above: `docs/plans/*/*/`, each
  **directory** two levels under `docs/plans/`, with no change-type allowlist) also skips it on shape, not
  on `triage` failing some change-type test.
- **The anchor line is a path, not an issue reference**, since that is what this store's scope anchor is.
- **No pull-request URL.** Every trigger — a deferred finding or an observation — runs before
  `/superdev:submit-pr` opens one, so none exists yet and the file names none.
- **The command creating it commits the file on the scope branch**, in the scope checkout, the moment it
  creates it — like every other plan file here — so an uncommitted record never blocks
  `hooks/slicetree-sweep.js`'s later `git worktree remove` on a dirty tree, and it rides the pull request
  the run opens. The file path is the record's reference: **the deferred trigger** is what
  `/superdev:review` puts in the ledger bullet; **an observation** instead reports that path to the
  operator and writes no ledger bullet of its own, since the record is its own identity
  (`references/scope-mode.md`'s `## Observations` section).

## Untriaged item

`CONTEXT.md`'s **Untriaged item** glossary entry. This store has **no inbox**: nothing under
`docs/plans/` exists unless a superdev command wrote it, and no human files a plan file directly.

- **Recognise one.** Nothing on this store fits: every file under `docs/plans/` is either a feature
  directory a superdev run created, or the `docs/plans/triage/` directory above.
- **List them.** The set is always **empty** — there is nothing to enumerate.
- **Read its age.** There is never one to read: the set holds nothing.

## Run state

`plan-contract.md` → *Run state*. This store carries **no snapshot**. Its anchor is a tracked plan file
riding the scope branch — `00-epic-<summary>.md` on a multi-slice feature, the lone `01-…md` slice file on
a single-slice one (`## Scope anchor` above) — and a snapshot written into it is the rejected "commit the
run root" option under another name: it conflicts on every slice merge and lands in the pull request.

A run on this store publishes nothing and adopts nothing. Ticking the anchor file's own checklist is
independent of this posture — see `## Definition of Done ticks` below.

## Definition of Done ticks

`plan-contract.md` → *Definition of Done ticks*. The checklist is the anchor file's own `## Definition of
Done (global)` section on a multi-slice feature, or the lone slice's `acceptance` on a single-slice one
(`## Scope anchor` above) — ticking is independent of `## Run state` above: this store carries no
snapshot, and ticks the checklist all the same.

- **Set a criterion to its judged state:** write the criterion text and the judgment's note each to
  their own file, through a quoted heredoc (`<<'SUPERDEV_TEXT_EOF'`) rather than as a shell-interpolated argument —
  either may carry a quote, a backtick, or a `$(` (`references/dod-ticks.md`, triage #680) — then pipe
  the anchor plan file's own text through
  `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js dod-line --match-file <path> --verdict
  met|not-met|ceiling|accepted --note-file <path>` on stdin, write its stdout back over the file
  (`scripts/AGENTS.md` → *scope.js, the run-state CLI*), then **commit the file on the scope branch, in the scope checkout**,
  the same way the store already commits every other plan-file edit (*Triage record* above).
  **Best-effort:** a failed commit is reported once per run and never stops the run; `dod.md` stays
  authoritative.
- **A criterion's tag needs no rewrite.** It already names a slice `id` (this store's own file number) or
  `scope`, in `plan-contract.md`'s own notation — the notation this store's `depends-on` already uses
  directly (*Layout* above), so the parallel step every other store spends rewriting tags into its own
  notation, once every slice file exists, is a no-op here.
- **A tick commit keeps a green suite record reusable.** Each tick is a commit on the scope branch
  (*Set a criterion to its judged state* above), so a tick landing after the recorded commit moves the scope branch's tip
  away from it. `scope.js suite reusable --branch <b> --plan-files` (INV-0017) still calls the record
  reusable when every path changed since it lies inside `docs/plans/<type>/<feature-slug>/` — the
  directory `scope.js` derives itself from the ledger's own `**Branch:**` value — because a tick commit
  never touches code, so it never costs a step the suite it rides on.

## Append mode

`/superdev:plan` can extend a feature that already has a plan directory (`plan-contract.md` → *Append
mode*, ADR 0004).

- **Create only new files; never edit, renumber, or delete a merged slice file.** Append writes a new
  `NN-<test-applicability>-<summary>.md` file per new slice. It never opens an existing `NN-…md` file for
  editing — except to remove a migrating `blocked-by:` or `deploy:` line when append promotes it to an
  epic (below) — never renumbers it, and never deletes it — a merged slice's file number is a satisfied
  `depends-on` root a new file's own `depends-on` may name.
- **Create the epic first when none exists.** A feature directory holding a single `01-…md` file with no
  `00-epic-…md` has not been decomposed yet (the single-slice shape, `## Scope anchor` above). Append
  writes `00-epic-<summary>.md` first — copying the lone slice's `acceptance` into its Definition of Done
  section — then writes the new `NN-…md` files. The lone `01-…md` file itself is never edited: no DoD
  copies onto it, and its own `acceptance` stays exactly as merged. **Two exceptions:** when the lone slice
  carries a `blocked-by:` line, it **migrates to the new `00-epic-…md`'s own header** and is removed from
  the lone slice — the epic file is the anchor now. The `deploy:` line migrates the same way, for the
  same reason, and is removed from the lone slice. Nothing else about the lone slice changes.
- **Continue file numbering from the highest number already present; never reuse one.** A new slice's
  `NN` picks up where the feature directory's highest existing `NN-…md` (epic file excluded) leaves off —
  `03` after a directory ending at `02`, not a number a merged file already carries.
- **Amend `00-epic-…md` in place — the one sanctioned edit.** Open the epic file itself and fold the
  interview's new criteria into its `## Definition of Done (global)` section, and, the same edit, delete a
  resolved parked question's line from its `## Parked questions` section. Both are edits to the epic file
  itself, never to a merged `NN-…md` slice file — the never-edit rule above still holds for every slice.

## When `/superdev:plan` says "write slices to the store"

Create `docs/plans/<type>/<feature-slug>/`. **≥2 slices** — write `00-epic-<summary>.md` (the global DoD +
description, plus whichever optional sections earn their place — `## Parked questions`, `## Non-goals`,
`## Slice graph`, `## Touch map`, per the rules above and `plan-contract.md`), then one
`NN-<test-applicability>-<summary>.md` per slice with `depends-on`, `status: todo`, `spec`, `acceptance`.
**Exactly one slice** — skip `00-epic-…`; write only `01-<test-applicability>-<summary>.md`, folding the
global DoD into its `acceptance` (no epic-only sections on a single-slice plan — see `plan-contract.md`).
When the interview named a prerequisite feature, add `blocked-by: [<type>/<feature-slug>]` to the anchor's
own header — the epic file on a multi-slice feature, the lone `01-…` slice file on a single-slice one —
naming that feature's directory path under `docs/plans/`; omit the line otherwise (`plan-contract.md` →
*Scope anchor*, ADR 0040).

## When `/superdev:implement` says "load slices from the store"

Read every `NN-…md` in `docs/plans/<type>/<feature-slug>/`. **`00-epic-…` present** — take the global DoD from
it. **No `00-epic-…`** (a single-slice feature) — the global DoD is the lone slice's own `acceptance`.
Parse each slice file into `id` (its file number), `depends-on`, `test-applicability`, `spec`,
`acceptance`.

## When `/superdev:implement` says "update slice status"

Edit that slice file's `status:` line in place along the canonical lifecycle
(`todo` → `in-progress` → `in-review` → `merged`, or `blocked`). The run's ledger file is authoritative
during execution; the slice files' `status:` is the durable record.

## When a skill says "update the anchor status"

Edit the anchor's own `status:` line — the same field and vocabulary as a slice's, since the anchor is
either the epic file or, on a single-slice plan, the lone slice file itself (see *Scope anchor* above).
**Run start** — set it `in-progress`. **`/superdev:submit-pr`** — commit it `done` on the scope branch
before it pushes, so it reaches base with the merge.
On a single-slice plan there is no second file: the anchor signal rides the lone slice's own `status:`
line, so this transition and the slice's own status update are the same edit.

## Dependencies

`depends-on` references other slice numbers directly (e.g. `depends-on: [01, 03]`) — local to the feature
directory, the ids it names are never external. `blocked-by` is the second relation (`## Scope anchor`
above): it names another feature's own directory path under `docs/plans/`, so unlike `depends-on` it does
reach outside the feature directory it is written in.
