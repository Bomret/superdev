# 0059: The selftest suite lives outside the shipped tree

**Status:** Accepted

**Amended by:** [ADR 0155](0155-a-slice-merge-runs-no-test-suite.md), which deletes `green-gate.js` and its
suite, so that hook's suite no longer runs under `bun run test`.

**Amended by:** [ADR 0166](0166-tests-run-through-node-with-no-package-script.md), which removes the
`test` script from `package.json`, so `node scripts/run-tests.js` runs the suites in place of `bun run test`.

**Context.** Every hook and script carries its assertions inline, behind a `--selftest` argument, and the
root working rule states it as a contract: *Every hook ships a `--selftest`*. The marketplace manifest's
`source` is `./plugin`, so an install copies that whole subtree. Measured across the eleven shipped
executables, 4,804 of 8,265 lines are selftest bodies — 58% of the shipped JavaScript. `scope.js` carries
1,424, `adapter.js` 1,021, `scope-prune.js` 825, `green-gate.js` 762. Every install of superdev copies all
of it, and nothing in the product reads a line.

**Decision.** The assertions move to a root `tests/` directory, outside `plugin/`, one suite per shipped
executable. `bun run test` runs those suites under `node` instead of invoking eleven `--selftest` flags.
The eight hooks gain a `require.main === module` guard so a suite can `require` them and call their
internal functions directly, which is the guard `adapter.js`, `kb-patch.js`, and `scope.js` already carry.
The root working rule changes with it: every shipped executable has a suite in `tests/`, named for it.

**Why.** `plugin/` is defined as *the SHIPPED tree: everything a user's install copies, nothing else*, and
test code fails that definition on its own terms. Placement inside `plugin/tests/` was rejected precisely
because it does not shrink the payload — the marketplace copies the subdirectory whole, and there is no
per-plugin ignore mechanism. Only a location outside `plugin/` changes what an install carries.

**Considered options.**
- *`plugin/tests/`, colocated with what it tests.* Rejected: still ships. It buys readability in the hook
  files and nothing else, while paying the same migration cost as moving the suites out entirely.
- *Spawn each hook as a child process from the suite, asserting on exit code and stderr.* Rejected: it
  needs no `require.main` guard and matches production invocation exactly, but it forces every existing
  fine-grained assertion to be rewritten at process level. `green-gate.js`'s option parser and
  `resolveMergeCwd` are tested against dozens of command strings today; routing each through a spawn loses
  that resolution and makes the suite slower for no verification gained.
- *Leave the selftests inline.* Rejected here, but it is the option with a real cost attached: see
  Consequences.

**Consequences.** A user can no longer verify an install in place by running
`node <plugin-root>/hooks/green-gate.js --selftest`. That capability was never documented for users —
`RELEASING.md` names `bun run test` as a maintainer step and nothing else mentions it — but it is
genuinely given up, not merely relocated. The eight hooks each gain one guard line, which is a change to
shipped guardrail code: each hook needs a test proving it still executes when spawned and stays silent when
required, because a wrong guard silently disables a guardrail in production while every suite stays green.
