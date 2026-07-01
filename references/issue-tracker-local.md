# Slice store: Local plan file

Slices for a feature live in a single markdown plan file in this repo, in the format defined by the
superdev plan-contract.

## Location

`docs/plans/<feature-slug>.md` — one file per feature. The file holds the global Definition of Done
plus every slice (see the plan-contract for the exact layout).

## When `/superdev:plan` says "write slices to the store"

Create or update `docs/plans/<feature-slug>.md`. Write the global DoD block, then one `### <id> — <title>`
block per slice with `depends-on`, `test-applicability`, `status: todo`, `spec`, `acceptance`.

## When `/superdev:implement` says "load slices from the store"

Read `docs/plans/<feature-slug>.md`. Parse each slice block into `id`, `depends-on`,
`test-applicability`, `spec`, `acceptance`.

## When `/superdev:implement` says "update slice status"

Edit the slice's `status:` line in place (`todo` → `in-progress` → `in-review` → `merged`). The run's
ledger file is authoritative during execution; the plan file's `status:` is the durable record.

## Dependencies

`depends-on` references other slice `id`s directly (e.g. `depends-on: [S1, S3]`). No external link
types — the ids are local to the file.
