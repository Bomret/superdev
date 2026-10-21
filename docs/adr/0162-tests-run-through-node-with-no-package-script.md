# 0162: Tests run through `node` with no package script

**Status:** Accepted

**Amends:** [ADR 0059](0059-the-selftest-suite-lives-outside-the-shipped-tree.md), whose suites ran
under `bun run test`.

## Context

`package.json` carried a `test` script, `node scripts/run-tests.js`, so `bun run test` was the name every
document gave the full run. The full run takes about 6 minutes. `node scripts/run-tests.js --related
<path>...` runs only the suites a change set reaches, and `node tests/<suite>.test.js` runs one suite. An
agent reading `bun run test` as the repository's test command reaches for the full run where a narrower one
answers the question, and the alias hides which of the runs a command performs.

## Decision

`package.json` carries no test script. Every test run invokes `node` directly and names what it runs:

- `node scripts/run-tests.js` runs every suite and the tail, the first fence of
  `docs/agents/verification.md`.
- `node scripts/run-tests.js --related {paths}` runs the tail and the suites the paths reach, the second
  fence.
- `node tests/<suite>.test.js` runs one suite and no tail, the inner loop while working on that suite.

Bun stays the package manager and the release runner (`bun install`, `bun run release`).
`tests/invariant-check.test.js` asserts that `package.json` carries no `test` script.

## Considered options

- *Keep `bun run test` beside the direct invocations.* Rejected: the alias stays the shortest name for the
  most expensive run, and documents keep naming it.
- *Add `test:related` and `test:suite` scripts.* Rejected: a script passing paths through adds a layer that
  states nothing the `node` command line does not.

## Consequences

Every maintainer document names `node scripts/run-tests.js` where it named `bun run test`. Mentions of
`bun run test` in `plugin/lib/`, `tests/`, and the drift selftest stay: they are example commands of a
consumer repository, not this repository's test command.
