set -e
mkdir -p docs/agents
cat > docs/agents/issue-tracker.md <<'DOC'
# Slice store: Local plan files

A feature's plan is a directory of markdown files: `docs/plans/<feature-slug>/`.

- `00-epic-<summary>.md` — the scope file: global Definition of Done + a
  short description of the feature. Not a slice.
- `NN-<test-applicability>-<summary>.md` (N >= 01) — one slice per file.
  `<test-applicability>` is `behavior` | `mechanical` | `docs`. The
  zero-padded number is the slice `id`; `depends-on` references those
  numbers directly (e.g. `depends-on: [01, 03]`).

Slice file body: `depends-on:`, `test-applicability:`, `status: todo`,
a `## spec` section, and an `## acceptance` section.
DOC
