# Verification

The repo's test command, the first fence, and the focused command, the second:

```sh
node scripts/run-tests.js
```

```sh
node scripts/run-tests.js --related {paths}
```

**The focused command runs the tail and only the suites the change set reaches.** The tail is the invariant
register check, the drift selftest, drift-check, and plugin validation, and it always runs. A suite runs when its
own text names a changed file, or when relative `require` edges, walked transitively through modules (`plugin/lib/`
files, `scripts/drift/` files, and non-suite files under `tests/`), lead from the file its name pins (a hook, a `plugin/lib/` module, or a
script) or from the suite file itself to one. A shared setup file a suite requires therefore reaches that suite. A path under
`scripts/drift/` reaches only the suites that require it, directly or through that walk, and the suites
whose text holds its full repository-relative path, never one that names only its basename or stem. One no suite
reaches selects no suite, because the drift selftest in the tail covers it. A `.md` path reaches the suites whose code names
it as a string outside a comment, in a path anchored at `__dirname` or written as a `./` or `../` path, and a suite whose text names a directory holding it from `__dirname` or as a `./` or `../` path. It reaches no suite when none
does either. A code path no rule places runs every suite, except `release.config.cjs`, `package.json`, and `bun.lock`,
which reach only the suites that name them. An empty path list runs the tail alone and exits 0. A path under
`mods/superdev-view/` runs the mod's own suites (`claude plugin test mods/superdev-view`) before the tail (`scripts/AGENTS.md`,
`references/test-selection.md`, ADR 0025, ADR 0074, ADR 0085).

**Both commands run their steps concurrently.** A step is one suite or one tail command. The runner starts as many
steps at once as `os.availableParallelism()` reports, and prints each step's output whole when that step ends. The
first failing step ends the steps still running, which print one `cancelled` line each, and starts no further step
(`scripts/AGENTS.md`).

**Measured cost, 2026-11-22.** The machine is the maintainer's 8-core Apple M1 (4 performance and 4 efficiency
cores). The Node build is the official Node.js v26.12.1 build from nodejs.org, installed through fnm. One full run at
commit `c24d2572` took 90 s wall clock, timed around `node scripts/run-tests.js` by the shell. Under concurrency, the
longest step was `scope-fail-to-pass-concurrency` (24 s, its `run-tests: <label>: <ms> ms` line). The figure holds for
that commit; a run of `node scripts/run-tests.js` at another commit measures that commit. The sequential figures below were measured on
2026-10-26 at commit `b382c879` and not measured again on 2026-11-22: the suites run alone one after another took
about 375 s of wall clock and about 330 s of CPU time together, and the linear-time pins (`tests/linear-time.js`)
about 70 s of that wall clock. A focused
run for a change set whose `.md` paths no suite names runs the tail alone, about 2 s.

## Prepare command

`none`

A new worktree of this repository runs every suite as it stands: the suites need Node alone, and the Bun dev
dependencies serve the release toolchain only (`docs/agents/toolchain.md`).

## One-suite run

While working on one suite, run it alone: `node tests/<suite>.test.js` from the repo root, for example
`node tests/merge-guard.test.js`. It runs that suite and no tail, prints one line per case and a summary, and its exit
code is the verdict. To run one case, pass a pattern that matches its name: `node --test-name-pattern="<pattern>"
tests/<suite>.test.js`. The other cases of the suite are skipped. To time
one suite alone, run it the same way under `time`, for example `time node tests/merge-guard.test.js`: no
other step shares the machine with it. A one-suite run does not replace the focused command before the merge. `package.json` carries no test script,
so every test run names exactly what it runs (ADR 0166).

## Complete selector

The focused command selects every test a changed path can affect (`references/test-selection.md`, ADR 0175).

- `scripts/run-tests.js` — the selector

## Timing command

`node scripts/run-tests.js`

Every step that finishes, suite and tail alike, prints one `run-tests: <label>: <ms> ms` line, so a test audit
of this repository ranks by measured wall clock (`references/test-selection.md`, ADR 0066). The line measures the
wall clock from the step's start to its end. The steps run concurrently, so that span includes the time the step
waited for a CPU that other steps held. A step's line in a full run is therefore longer than its time alone, and
the lines add up to more than the run's wall clock. A cancelled step prints no timing line. To rank suites by
their own cost, time each one alone (`## One-suite run`).

## Test paths

- `tests/`
- `scripts/drift/selftest/`
- `scripts/drift/contracts.js`
- `mods/superdev-view/hooks/*.test.*`
- `mods/superdev-view/hooks/*-fixtures.ts`
- `mods/superdev-view/hooks/testkit.ts`

## CI

- `full-suite`

The full-suite workflow under .github/workflows runs the full command on Linux for every pull request to main, and its
one job reports the check run named above. /superdev:ship merges when that check is green on the head it merges, and
runs no local suite (ADR 0255). The cross-platform workflow runs the knowledge-base template suite and the write-fence suite on three platforms and
counts for nothing here. This explanation carries no backtick span, because every span in this section reads as a check name.

## Verify skill

`none`

This repository ships a plugin of prose and hooks, and no app a builder can start and drive
(plugin/references/verify-skill.md).
