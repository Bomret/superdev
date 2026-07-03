# 01 — Validate gate in the test task

depends-on: []
test-applicability: behavior
status: todo

## spec

Add `claude plugin validate .` (the plugin root) to the `test` script in `package.json`, running after
the hook selftests, so `bun run test` — and therefore the pre-release gate — fails on an invalid plugin
or marketplace manifest (bad JSON, a missing required field, or a stray `hooks` reference like the one
that broke every install). The hook selftests must still run. Assume the maintainer's env has the
`claude` CLI on PATH (Bun is maintainer-only already); no consumer impact.

## acceptance

- `bun run test` invokes `claude plugin validate` and still runs all hook selftests.
- Breaking `.claude-plugin/plugin.json` (in a throwaway copy) makes `claude plugin validate` exit
  non-zero → `bun run test` fails.
- The current, valid manifest passes clean.
