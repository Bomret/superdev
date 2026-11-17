# 0154: Shipped code carries no test seams; a test substitutes on its own side

**Status:** Accepted

**Amends:** [ADR 0059](0059-the-selftest-suite-lives-outside-the-shipped-tree.md), which moved the
assertions out of the shipped tree and kept the code paths they drive.

**Amends:** [ADR 0151](0151-plugin-modules-live-in-lib-and-entry-points-keep-their-paths.md), which
had an entry point keep its exports. An entry point keeps its path and only the exports a requirer uses.

**Context.** ADR 0059 moved every selftest body out of `plugin/`. Code that exists only so a suite can
drive it stayed. An inventory on 2026-10-14 found three environment variables that only a test sets
(`RUN_TRACE_GIT_BOUND_MS`, `TREE_GUARD_GIT_BOUND_MS`, `SUPERDEV_UPDATE_CHECK_REMOTE`), six parameters or
default values that no production caller passes or uses, about 14 exports that nothing requires, two
`dod-line` options that only a test uses, and about 15 comments that name a suite.
`SUPERDEV_PUSH_TIMEOUT_MS`, which the `push` verb added on 2026-10-22, is a fourth of the same kind. An adopter's install
carries all of it. An environment variable is the worst case: an adopter whose environment happens to set
one changes the plugin's behaviour, and no adopter document names it. `SUPERDEV_UPDATE_CHECK_REMOTE`
changes which remote the update check contacts.

**Decision.** The shipped tree carries no **test seam** (`CONTEXT.md`). A test reaches a branch that a
seam used to expose by substituting on its own side:

- a fake slow `git` on `PATH`, waiting out the production bound;
- a `node --require` preload that replaces a Node built-in in a spawned hook;
- an override of `process.platform` or of a `child_process` function before a fresh `require` of the
  module.

The exports a suite requires and the `require.main === module` guards stay. They are the module interface
ADR 0059 chose so that a suite can call a function in-process. An export that nothing
requires goes, an entry point's re-exports included. A drift-check scanner fails when shipped
JavaScript names one of superdev's own test files, by base name or by a `tests/` path that carries a glob, or reads an environment variable that no Markdown
document in the shipped tree names and whose name does not start with `CLAUDE_`. The documented settings
`SUPERDEV_FAIL_TO_PASS_FLOOR_MS` and `SUPERDEV_PUBLISH_KB_TIMEOUT_MS` stay, because they are adopter
settings.

**Considered options**

- **Retire the test-running verbs (`scope.js test`, `scope.js fail-to-pass`) and green-gate's suite run.**
  It came from reading the rule as "shipped code runs no tests". It loses because those verbs are features
  an adopter uses (ADR 0127, ADR 0134), not code that tests the plugin.
- **Strict scope: also remove the exports a suite requires and the `require.main` guards.** Every suite
  would drive a hook through stdin and a script through its command line. It loses for the reason ADR 0059
  rejected spawning: every fine-grained assertion is rewritten at process level, and the full test run
  gets slower for no verification gained.
- **Drop the tests of a branch a removed seam exposed.** It saves the substitution work and the waits. It
  loses because the Windows kill branch, the bound kills, and the update-check network path would go
  untested on a POSIX machine.
- **A written rule alone.** It saves a scanner. It loses because a new environment override or a comment
  naming a suite would then be caught only by a reader.

**Consequences.** A test that waits out a production bound costs that bound: the three git-bound cases
wait 1500 ms each instead of 200 ms. A test substitute can take effect silently wrong — a preload that
fails to load reaches the real network, a stub bound after the module loaded never runs — so each
substitute proves that it took effect. The scanner does not see an injected parameter or an unused
export; a reviewer catches those. superdev is below 1.0.0, so removing a test-only option or variable
breaks no adopter contract.
