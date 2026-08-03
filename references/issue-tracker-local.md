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

Numbers are assigned in reading/authoring order — roughly topological, so a slice usually gets a higher
number than the slices it depends on — but the **authoritative dependency graph is `depends-on`**, not
the numbering. Two digits cover up to 99 slices; widen the padding if a feature needs more.

## File format

Epic file `00-epic-<summary>.md`:

```markdown
# <feature>

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

`## Parked questions` is optional — omit the section entirely when nothing's been parked. Advisory
only: `/implement` never reads it. Single-slice features have no epic file, so no equivalent section —
see `plan-contract.md`.

`## Non-goals` is optional too — omit the section entirely when nothing was deliberately dropped from
scope. Advisory only: `/implement` never reads it. Single-slice features have no epic file, so no
equivalent section — see `plan-contract.md`.

`## Slice graph` and `## Touch map` are optional too, and independent of each other — `plan-contract.md`'s
*Epic visuals* section owns their shape and the rule for when each is written. Advisory, same as parked
questions: `/implement` never reads them.

Each slice file `NN-<test-applicability>-<summary>.md`:

```markdown
# 01 — <title>

depends-on: []
test-applicability: behavior
status: todo

## spec
<behavior/interface this slice delivers — the implementer's requirements>

## acceptance
- <checkable criterion 1>
- <checkable criterion 2>
```

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
- **Ambiguous.** A directory with no `00-epic-*.md` and two or more `NN-*.md` files. `/superdev:plan`
  never writes that shape, and there is no global Definition of Done to build against, so a consumer
  reports it instead of choosing.

## When `/superdev:plan` says "write slices to the store"

Create `docs/plans/<type>/<feature-slug>/`. **≥2 slices** — write `00-epic-<summary>.md` (the global DoD +
description, plus whichever optional sections earn their place — `## Parked questions`, `## Non-goals`,
`## Slice graph`, `## Touch map`, per the rules above and `plan-contract.md`), then one
`NN-<test-applicability>-<summary>.md` per slice with `depends-on`, `status: todo`, `spec`, `acceptance`.
**Exactly one slice** — skip `00-epic-…`; write only `01-<test-applicability>-<summary>.md`, folding the
global DoD into its `acceptance` (no epic-only sections on a single-slice plan — see `plan-contract.md`).

## When `/superdev:implement` says "load slices from the store"

Read every `NN-…md` in `docs/plans/<type>/<feature-slug>/`. **`00-epic-…` present** — take the global DoD from
it. **No `00-epic-…`** (a single-slice feature) — the global DoD is the lone slice's own `acceptance`.
Parse each slice file into `id` (its file number), `depends-on`, `test-applicability`, `spec`,
`acceptance`.

## When `/superdev:implement` says "update slice status"

Edit that slice file's `status:` line in place along the canonical lifecycle
(`todo` → `in-progress` → `in-review` → `merged`, or `blocked`). The run's ledger file is authoritative
during execution; the slice files' `status:` is the durable record.

## Dependencies

`depends-on` references other slice numbers directly (e.g. `depends-on: [01, 03]`). No external link
types — the ids are local to the feature directory.
