# 03 — /superdev:status command

depends-on: []
test-applicability: docs
status: todo

## spec

New `commands/status.md` defining a `/superdev:status` slash command. For the current repo it finds run
roots under `.superdev/*/`, reads each `ledger.md`, and prints a compact per-scope summary: the scope,
slice counts by status (todo / in-progress / in-review / merged / blocked), and which slices are
blocked. Read-only — no mutation. Handle "no runs found" cleanly. Follow the existing command prose
style (frontmatter `description`, numbered steps).

## acceptance

- `commands/status.md` exists with a `description` frontmatter; `/superdev:status` reports per-scope DAG
  progress from the ledger(s).
- Strictly read-only (no writes/transitions/merges).
- Graceful when `.superdev/` is absent or holds no runs.
