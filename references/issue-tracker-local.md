# Slice store: Local plan files

A feature's plan lives as a **directory of markdown files** in this repo — one file for the feature
scope, one per slice — in the format defined by the superdev plan-contract.

## Layout

`docs/plans/<feature-slug>/` — one directory per feature:

```
docs/plans/<feature-slug>/
  00-epic-<summary>.md                    scope: global Definition of Done + feature description
  01-<test-applicability>-<summary>.md    first slice   (id 01)
  02-<test-applicability>-<summary>.md    next slice    (id 02)
  ...
```

- **`00-epic-…`** is the **scope** file: it holds the global Definition of Done plus a short description
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

Scope file `00-epic-<summary>.md`:

```markdown
# <feature>

<short description of the feature and its intent>

## Definition of Done (global)
- [ ] <checkable acceptance criterion for the whole feature>
- [ ] ...
```

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

## When `/superdev:plan` says "write slices to the store"

Create `docs/plans/<feature-slug>/`. **≥2 slices** — write `00-epic-<summary>.md` (the global DoD +
description), then one `NN-<test-applicability>-<summary>.md` per slice with `depends-on`,
`status: todo`, `spec`, `acceptance`. **Exactly one slice** — skip `00-epic-…`; write only
`01-<test-applicability>-<summary>.md`, folding the global DoD into its `acceptance`.

## When `/superdev:implement` says "load slices from the store"

Read every `NN-…md` in `docs/plans/<feature-slug>/`. **`00-epic-…` present** — take the global DoD from
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
