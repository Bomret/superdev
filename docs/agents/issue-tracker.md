# Slice store: Local plan files

Slices live as a directory of markdown files per feature, in the format defined by the superdev
plan-contract.

## Layout

`docs/plans/<feature-slug>/` — one directory per feature:

```
docs/plans/<feature-slug>/
  00-epic-<summary>.md                    scope: global Definition of Done + feature description
  NN-<test-applicability>-<summary>.md    one file per slice; the zero-padded number is the slice id
```

- `00-epic-…` holds the global DoD + a short description; it is not a slice.
- Each `NN-…` (N ≥ 01) is one slice; the number **is** the `id`; `depends-on` references those numbers
  (e.g. `depends-on: [01, 03]`).
- `<test-applicability>` is `behavior` | `mechanical` | `docs`.

## CRUD

- **Write:** create `docs/plans/<feature-slug>/`, write `00-epic-…`, then one `NN-…` per slice with
  `depends-on`, `status: todo`, `spec`, `acceptance`.
- **Read:** read every `NN-…md`; take the global DoD from `00-epic-…`.
- **Update status:** edit the slice file's `status:` line (`todo` → `in-progress` → `in-review` →
  `merged`, or `blocked`). The run ledger is authoritative during execution; the file `status:` is the
  durable record.
