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
files and non-suite files under `tests/`), lead from the file its name pins (a hook, a `plugin/lib/` module, or a
script) or from the suite file itself to one. A shared setup file a suite requires therefore reaches that suite. A path under
`scripts/drift/` is covered by the drift selftest in the tail. A `.md` path reaches the suites whose text names
it, and a suite whose text names a directory holding it. It reaches no suite when none does either. A code path no
rule places runs every suite, and an empty path list runs the tail alone and exits 0. A path under
`mods/superdev-view/` runs the mod's own suites (`claude plugin test mods/superdev-view`) before the tail (`scripts/AGENTS.md`,
`references/test-selection.md`, ADR 0025, ADR 0074, ADR 0085).

**Measured cost, 2026-10-16.** The full command takes about 6 minutes. `scope-fail-to-pass` (84 s),
`scope-test-verb` (63 s), and `publish-kb` (44 s) are the three costliest suites, and the tail takes about 2 s.
A focused run for a change set whose `.md` paths no suite names runs the tail alone, about 2 s. One for a change
to the `run-lock` hook takes about 45 s, because the `scope` suite names that hook.

## One-suite run

While working on one suite, run it alone: `node tests/<suite>.test.js` from the repo root, for example
`node tests/merge-guard.test.js`. It runs that suite and no tail, and its exit code is the verdict. A
one-suite run does not replace the focused command before the merge. `package.json` carries no test script,
so every test run names exactly what it runs (ADR 0166).

## Timing command

`node scripts/run-tests.js`

Every step, suite and tail alike, prints one `run-tests: <label>: <ms> ms` line, so a test audit of this
repository ranks by measured wall clock (`references/test-selection.md`, ADR 0066).

## Test paths

- `tests/`
- `scripts/drift/selftest/`
- `scripts/drift/contracts.js`
- `mods/superdev-view/hooks/*.test.*`
- `mods/superdev-view/hooks/*-fixtures.ts`
- `mods/superdev-view/hooks/testkit.ts`
