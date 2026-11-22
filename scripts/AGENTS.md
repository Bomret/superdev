# scripts/

## Purpose

Standalone deterministic code that `package.json` runs, alongside `plugin/hooks/`.
The shipped CLIs live in `plugin/scripts/`: `scope.js` (the run-state CLI, ADR 0022), `kb-patch.js`
(the knowledge-base section merge, ADR 0027), `publish-kb.js` (the backend-independent half of publishing a scope's staged
knowledge-base pages, ADR 0069), and `plugin/lib/md-to-storage.js` (the markdown to Confluence `storage` conversion
`lib/kb-apply.js` requires, ADR 0109). Every other module behind them lives in `plugin/lib/` (ADR 0151). The maintainer-only ones live here in `scripts/`: `drift-check.js`
(the checks of mechanical facts and forbidden forms, ADR 0153), `invariant-check.js` (the invariant register validator,
ADR 0093), and `run-tests.js` (the suite runner). This doc owns them all regardless of which dir each lives in.

## Ownership

This doc owns what each script guards and the contracts between them. Repo-wide rules stay in the root
[`AGENTS.md`](../AGENTS.md): the stack and the working rules. [`RELEASING.md`](../RELEASING.md) owns the release flow.

## Local Contracts

### The operator configuration (ADR 0207)

The operator configuration is `.superdev/info.json` of the main working tree. A setting lives there and in no environment variable, because a file shows what is set, belongs to one repository, and is documented by the plugin, where a process environment is invisible and can change behavior from outside (ADR 0207). `plugin/lib/operator-config.js` reads it
(`operatorSection(cwd, section)` and `operatorBoundMs(cwd, section, key, fallback)`), and a missing file, section, or key gives the
fallback silently. The time-bound keys are `code-host.pushTimeoutMs` (`lib/push.js`, 60000 ms), `verification.failToPassFloorMs`
(`lib/fail-to-pass.js`, 10000 ms), `verification.failToPassControlMs` (`lib/fail-to-pass.js`, 300000 ms), and `knowledge-base.timeoutMs` (`lib/kb-backend.js`, 30000 ms). `knowledge-base.teaLogin` and the
other `knowledge-base` keys reach a backend template under `operator` in its values file. No superdev-owned environment variable
carries a setting or a value (ADR 0207). `lib/push.js` exports `boundEnded(cwd, signal)`, the phrase every bound-ended git call
reports, which names the bound and `code-host.pushTimeoutMs`; `lib/run-state-ref.js` reports through it too.

### scope.js, the run-state CLI (ADR 0022)

`scope.js` owns the CLI and the verbs, and requires only modules from `plugin/lib/` (ADR 0151). Each verb's code lives in
a module of its own: the ledger verbs in `ledger-lifecycle.js` and `ledger-records.js`, `suite` and `base` and `get` in
`suite-base-get.js`, `test` in `test-verb.js`, `publish` with `adopt` in `run-state.js`, `open` in `plan-open.js`, `dod-merge` in `dod-merge.js` (with `mergeDod`, the per-line merge `fetchRunState` also uses, ADR 0206), and `dod-line`, `dod-tags`, `dod-check`, `ci`, `fail-to-pass`, `fail-to-pass-check`, `prepare`,
`citations`, `collisions`, `source-set`, `untraced`, `push`, `discard`, `status`, `section`, `tier`, `dod-open`, `contained`, `red-evidence`, `candidates`, `denial`, `consent`, and `route` each in the module of its name. `branch` is `scope-branch.js`'s `resolveScopeBranch`, `checkout` is `scope-checkout.js`'s `scopeCheckout`, and `lock` is `run-lock.js`'s `verbLock`; `run-lock.js` also holds the run lock's reader and one-hour bound that `plan-open.js` shares. `run-roots.js` holds the one scan of `.superdev/scopes/*/` that `status` and `candidates` share. `trace` and `windows` live in `scope.js` over `trace-window.js` (`readRunTrace`, `sliceOf`, `editPath`, `windowsOf`, `windowIndexes`, `traceFlags`), the one window derivation `trace --window`, `untraced --window`, and `fail-to-pass-check --window` share, and `traceFlags` is the flag parser `trace`, `windows`, `untraced`, and `fail-to-pass-check` share. The run-state ref (`refs/superdev/<scope>`, ADR 0202) is `run-state-ref.js`: `pushRunState` at a step end (`step clear`, `step block`, or a `stage set` that closes the standing step, except `stage set closed`), `fetchRunState` inside `adopt`, and `deleteRunState` behind `run-state delete`. It takes `gitCall` from `push.js` and `parseRemote` from `kb-containment.js`. The vocabulary beneath them is `ledger.js` (the stage rank and the readers and writers of
a ledger's header lines, bullets, and table rows), `refusal.js` (the refusal error `fail`), `verification.js` (`verificationCommands`,
`verificationCommandsOf`, `prepareCommandOf`, `namedChecksOf`, `isTestPath`), `git-spawn.js` (`gitSpawn`, `gitThrow`, `parseBranchList`, `resolveCommit`, `refResolves`, `literalEnv`, `existsAt`, `fileAt`, `listWorktrees`),
`containment.js` (`testContainment`, `judgeContainment`, `refetchMark`, `baseHistoryHasPatch`, `baseCommitHoldsBranch`, `patchInBaseHistory`, `commitInBaseHistory`), `main-work-tree.js` (`mainWorkTree`, `scopesDirFor`, `mainTreePath`), and
`trace-log.js` (`appendTrace`, `readTrace`, `traceField`, `untraceField`). Each `plugin/lib/` module opens with its file name and a colon naming its one
responsibility, so the directory is the list of modules. `git-spawn.js`'s `existsAt` is the shared existence check at a commit: `true` for a path the commit holds, an empty
file included. It returns `false` for a path the commit does not hold. It returns `null` where git cannot say. It reads no blob, so a file of any size answers, and a
directory or submodule entry answers `true`. `fileAt` reads a file's text at a commit, `''` for an empty or absent file, and takes
`existsAt` where `show` fails. `fileAt`'s `show <commit>:<path>` read is literal by its syntax. `existsAt` reads the path with the flag
`--literal-pathspecs`. It runs under `literalEnv`, the environment without `GIT_GLOB_PATHSPECS`, `GIT_NOGLOB_PATHSPECS`, and `GIT_ICASE_PATHSPECS`, because git refuses those beside the flag.
A path `:foo` is that file, never pathspec magic. A path `a*` is that file, never a glob. At startup `scope.js` loads only `refusal.js`, `ledger.js`, and `trace-log.js`. Every other module
loads when a verb that uses it runs, through an accessor that names the module in a literal `require`, so the
`--related` require scan still reaches it. `scope.js` exports only the names a requirer uses. A name it re-exports from a
lazily loaded module is a getter that returns that module's own value. No module requires an entry point. `scope.js` owns the ledger's schema through `ledger.js` and is the only `ledger.md` read and write path in the chain:
`open <type>/<slug> --base <base-ref> [--remote <remote>] [--lock <nonce>]`, `init`, `stage set`, `slice`, `degraded add|add-denial|reset-denials`, `unresolved add|clear`,
`deferred add|resolve`, `minors add <slice-id>|clear`,
`docs set <value>|clear`, `pr set <n>|clear`,
`reviewed set --branch <b> [--tip <sha>]|clear` (`reviewed-tip.js`), `reviewed check --branch <b> --base <ref>` (read-only: no trace line, no digest seal),
`deploy set <target> pending|deployed|failed [--exit <n>]`, `deploy get`,
`suite set <green|red|denied|none> <sha> [--whole]`,
`suite reusable --branch <b> [--whole] [--base <base-branch>]`, `suite rerun <test-file> <triage-ref>`, `suite failed <test-file>...`,
`base set <sha>`, `base resolve --branch <b> --base <ref>`,
`get stage|branch|anchor|slices|unresolved|degraded|deferred|minors|denials|docs|pr|reviewed|suite|failed`,
`state [--json] --root <run-root>` (every field `get` names in one read-only call, from the ledger alone: no git, no trace line, no digest seal; `--json` prints one object with list fields as arrays and `failed` as the failed test files, its `@ <sha>` staying in `get failed` and the text output; `suite-base-get.js`'s `verbState`),
`status` (which renders the whole `/superdev:status` report), `trace [--slice <id|scope>] [--kind <kind>[,<kind>]] [--window <dispatch id>] [--last <n>]` (prints the run trace's lines, filtered, read-only), `windows --slice <id|scope>` (read-only), `untraced <base>..<tip> --slice <id|scope> [--window <dispatch id>] --root <run-root>` (read-only), `fail-to-pass-check <base>..<tip> --slice <id|scope> [--window <dispatch id>] --root <run-root>` (read-only), `section <file>` (read-only, the heading line on stdin), `tier --root <run-root>` (read-only), `dod-open --root <run-root> [--tag docs]` (read-only), `contained <base> <branch> [--remote <remote>]` (read-only), `branch --root <run-root>`, `checkout --root <run-root>`, `lock --root <run-root>`, `denial <pass> [--unattended] --root <run-root>`, and `route --root <run-root> …` (each read-only), `candidates --stage <stage>[,<stage>]` (read-only, no run root), `red-evidence --root <run-root> --branch <branch> --base <base-ref> [--ci-head <sha> --ci-file <path>]` (read-only), `publish`, `adopt`, `root <slug>`,
`staging <scope> [--count|--line]`, `collisions --base <ref> --branch <ref> --range-base <ref> [--also <ref> …]`, `citations --range-base <ref> --branch <ref> <id>…`, `source-set [<path>]`, `source-set --tests`, `push --root <run-root> --remote <remote> --base <base-ref>`, `dod-merge --root <run-root>`, `dod-line`, `dod-tags [--map-file <path>] [--line]`, `dod-check`, `ci --sha <sha> [--root <path>]`, `fail-to-pass <base>..<tip> -- <command>`, `prepare <tree>`, and `test`.
`--help` or `-h`, alone or after any verb, prints the usage and exits 0, except that a flag's value, or the text after `add`, `add-denial`, `reset-denials`, or `resolve`, is data and never a help request. It is checked before any verb
reads stdin or touches a ledger, so a stdin verb such as `dod-line` never waits on input for it.
`suite set` writes the **suite record** (CONTEXT.md) — the last full-suite run's result and the commit
it ran on, as `**Suite:** <result> @ <sha>` — refusing a sha that does not resolve to a commit in the
repository; `get suite` prints `<result> <sha>` back, or nothing on a ledger with no record (INV-0017).
`suite reusable` is the reuse half of that same rule. It exits 0 and prints `reusable`, or it refuses with exit 1.
An unrecognized argument is a refusal. No slice store commits its own records on the scope branch (ADR 0110), so a
commit since the record counts. Four routes reach exit 0.

The first route is the exact tip. The record is `green`, the run trace backs the recorded commit, and `<branch>`'s tip is
that commit. The second route is a green record at an ancestor of the tip, carried over the range by the Markdown-only carry or the complete-selector carry.
A refusal on a moved tip names the failed condition after `predates tip`. The third route is a `red` record at the tip
under the recorded rerun. A `red` record at an ancestor of the tip also qualifies, where every path changed since passes the Markdown-only rules (ADR 0189). The fourth route is a run at the tip with no record at the tip, or a green one (ADR 0182,
ADR 0186): the latest full or whole run the run trace records at the tip passed on a clean tree, whoever wrote it, a
fail-to-pass control run included. `--whole` takes only a whole run there. A record at the tip that is not green decides
by the third route alone. The fourth route writes the run it accepts as the record, `green @ <tip>`, with ` whole` where
the latest whole run at the tip passed, and leaves a record that already reads so untouched. No other route writes. A write is a ledger write: `writtenRoot` checks the run digest first, and the `Suite` header change traces one `ledger suite reusable <branch>` line (`--whole` appended where the record is whole). A reuse that leaves the record untouched traces nothing.

The **Markdown-only carry** (ADR 0128) holds when every path changed since the record ends in `.md`. No such path is a
test path. A changed `docs/agents/verification.md` carries only where its **Run configuration** (CONTEXT.md) is the same
at both commits the carry judges: the full and focused commands as written, the whole-repo command, the prepare command,
the test-path entries, and the complete-selector declaration (ADR 0230). `runConfiguration` and `configRefusal` of
`lib/suite-base-get.js` compare them through the readers of `lib/verification.js`. A refusal names the part that changed,
and a `verification.md` git cannot read at either commit refuses. The carry needs no test run at the tip (ADR 0189, INV-0175). It
refuses when the run trace records a failed full, whole, path, or focused run there. It also refuses when the latest run
there reads `unknown`. The test paths come from the tip commit's `verification.md`.
`isTestPath` of `lib/verification.js` reads them. The run trace's `lib/run-tree.js` wraps that classifier.

The **complete-selector carry** (ADR 0175) judges any range that changes a path not ending in `.md`. The range must
have the record's commit as an ancestor of the tip. The tip's `docs/agents/verification.md` declares the selector in a
`## Complete selector` section. Each list item of that section names one selector file in backticks, and a listed
directory covers every path under it. `completeSelector` of `lib/verification.js` reads the section. Without the
declaration, the non-Markdown path is the refusal. With it, the carry holds under these conditions:

- No changed path is a selector file, and a changed `verification.md` keeps its run configuration.
- The focused command carries `{paths}`.
- No full, whole, or path run at the tip failed.
- The latest focused run at the tip passed on a clean tree.
- One passing clean focused run, after the last failed focused run, recorded a path set that names every changed path itself.

A directory in that path set covers no file under it. A focused run records its path set as the fifth field of its `run`
line. A range of Markdown paths only keeps the Markdown-only rules, with or without the declaration. Under the
declaration the two carries chain. A commit on the ancestry path from the record must pass the complete-selector carry
from the record. Markdown-only commits from that commit up to the tip then carry the record. Each leg compares the run
configuration at its own two commits. The walk takes children before parents.

`suite rerun <test-file> <triage-ref>` writes the ledger's one `**Rerun:**` header, `<file> @ <tip> <ref>`. The tip is the
checkout's HEAD, and the file is a root-relative blob at it, its path read literally as `existsAt` reads one. The verb refuses `--whole`. A tip that already carries a
record refuses a second one. A record for another tip is replaced.

`suite failed <test-file>...` writes the ledger's one `**Failed:**` header, `<file>... @ <tip>`: the test files a full
run at the tip failed in. The tip is the checkout's HEAD, and each file is a root-relative blob at it, its path read literally. The verb refuses
`--whole`, no file, and a token holding whitespace. A record for another tip is replaced.
Its trace line names the root-relative paths the record holds, not the arguments as typed. `get failed` prints the record back, `<file>... @ <sha>`, or nothing on a ledger with no record.

The **repaired-failure carry** (ADR 0237) is a fourth route, which `suite reusable` tries where the recorded rerun
refuses a `red` record at R. The `**Failed:**` record must name R, the record must carry no `whole` kind, and the
gate must not ask for `--whole`. R is an ancestor of the tip and differs from it. The trace records exactly one failed full run at R,
the complete-selector carry from R to the tip holds, and each named file passed on a clean tree at the tip in a `path`
run from the tree root. Where both routes refuse, the refusal names each route's reason.

The **recorded rerun** (ADR 0172) is the third route. `suite reusable` takes a `red` record only with `--base`. Without
`--base` the record stays red. The record must be at the tip, or at an ancestor of it where every path changed since
passes the Markdown-only rules (ADR 0189). The rerun record must name the record's commit, and that commit's
`verification.md` must carry the declaration. Exactly one full run at the record's commit failed, or one whole run under
`--whole`. No path run of another test file failed there.
After that failed run, a run of the recorded file alone passed on a clean tree. A focused run also passed on a clean
tree after it. That focused run's path set covers every path changed in the range that `base resolve` prints. The
controller reads whether one test file caused the failure and quotes that reading in the triage record. The verb
checks the trace and the ledger.
`base set` writes the `**Base:**` header, the remote base tip the base step merged into the scope branch,
as a full commit, refusing a sha that does not resolve. `base resolve` prints the scope's range base: the
newer of `merge-base(<ref>, <b>)` and the recorded tip, the tip counting only when it resolves and is an
ancestor of `<b>`, and the merge-base alone when no usable record exists or neither candidate holds the
other (ADR 0120). Both flags are required: no verb defaults the base. `publish` carries the header and
`adopt` rebuilds it, as they do `**Suite:**`.
`degraded
add-denial` prefixes its bullet `denied: `, which is what separates a denied verification dispatch from
the other degraded shape sharing that line, and `get denials` counts those prefixed bullets — the number
an unattended run caps at two (ADR 0041). `degraded reset-denials` appends a bullet prefixed
`denials reset: `, and the count runs from the last such marker, so a human who addressed the cause
returns the whole budget while every recorded denial stays on the line (ADR 0044). Both prefixes are
structural, so plain `degraded add` refuses a text beginning with either and names the subcommand that
owns it. `get degraded` prints every bullet whatever its prefix, prefixes intact.
`unresolved add -`, `deferred add -`, `deferred resolve -`, `degraded add -`, `degraded add-denial -`, and `degraded
reset-denials -` — the sole word `-` past the subcommand — read the
bullet text from stdin, one trailing newline stripped, instead of a shell-interpolated argument
(`references/dod-ticks.md`, triage #680); a classifier's own refusal (`add-denial`) or an operator's own
reason (`reset-denials`) can carry a quote just as easily as any other bullet text. Any other shape of
these subcommands' own arguments keeps joining its
positional words with spaces as it always has.
Every verb that writes the ledger appends one `ledger` line to the run trace after its write succeeds, through
`appendTrace(runRoot, event)`, the single writer of `trace.log` (ADR 0117); no verb takes a caller-chosen event.
Each line `appendTrace` writes also sets the run root's `run.lock` mtime to now when the lock is a regular file, so a
working run stays live (ADR 0220, INV-0186). It creates no lock, changes no content, follows no symlink, and a failed
refresh leaves the append's result as it was.
`scope.js` exports only the names a requirer uses, among them
`readLedgerHeader`, and no hook and no sibling script requires `scope.js`: each requires the module that
holds what it uses. `readLedgerHeader`, the per-header ledger-line reader, lives in `plugin/lib/ledger.js`,
and `hooks/scope-prune.js` and `hooks/slicetree-sweep.js` both require it there instead of carrying their own
regex. `hooks/scope-prune.js` requires `patchInBaseHistory` — the containment probe (ADR 0082) — and
`commitInBaseHistory` — the third tier (ADR 0248) — from `plugin/lib/containment.js` through a `require` of
its own. Each answers `true`, `false`, or `null` for a failed git call, so the hook records only a decisive not-contained
answer (INV-0199). `baseHistoryHasPatch` and `baseCommitHoldsBranch` are their boolean forms, which read `null` as `false`. The tiers fall back differently from the reader. The reader missing stops that hook's sweep outright. A tier missing narrows the containment test to the tiers the hook keeps, silently. A tier is missing when its module cannot load or lacks it. A module requires no entry point, so a `require` of a module runs no CLI code, and `scope.js`
guards its own CLI entry with `require.main === module`. `hooks/run-trace.js` takes
the trace writer `appendTrace` from `trace-log.js`,
the tree locator `locate` and the test-path classifier `isTestPath` (ADR 0128) from `run-tree.js`,
and the dispatch readers from `dispatch.js`. The hook reads no Bash command (ADR 0227). One `try` guards the three `require`s, and a module that fails to load
leaves the hook recording nothing (ADR 0117, INV-0159). Its model guard, which denies a modelless dispatch to a superdev
agent on PreToolUse(Agent), requires no module, so a failed load leaves the deny in force (ADR 0245). `hooks/tree-guard.js` takes `mainWorkTree` from `main-work-tree.js` (ADR 0148). `publish-kb.js` reaches
the containment verdict `judgeContainment` from `containment.js`, which refetches the base from the `Remote:` value of
`docs/agents/code-management.md` before it answers not contained, and judges against the local base with no refetch where
that document names no remote (ADR 0053, ADR 0065, INV-0203). It takes `gitSpawn` and `refResolves` from `git-spawn.js`
and `drivePath` from `drive-path.js`. It takes `readLedgerHeader`, `SLUG_RE`, and `CHANGE_TYPES` from `ledger.js`. It takes `pushTimeoutMs` from `push.js` and `readPresent` from `refusal.js`. All of these arrive through its `lib/kb-*.js` modules. The containment refetch is bounded by `code-host.pushTimeoutMs` (default 60000 ms through `push.js`'s reader). `base set` appends a `ledger`
trace event like every other ledger-writing verb. Normalisation is per
header: `Stage` and `Branch` are single tokens,
cut to the first whitespace-delimited token and stripped of markup and trailing punctuation.
`Anchor` is a prose title that reaches a pull request, trimmed and otherwise left alone. An empty
header line reads as absent, not as an empty string. Both `readLines` and `readLedgerHeader` split
on `\r?\n`. A `ledger.md` an editor or `core.autocrlf` wrote with CRLF line endings reads exactly as
an LF one does. A lone `\r`, the classic-Mac line ending, reads as absent, and that is deliberate.
Any verb that writes the file normalises it back to LF. `status` prints markdown: a table with one row per
scope (stage, slice count, tally per slice status), then a second table, `| Run | Note | Detail |`, with one
row per note. A `|` in a note's detail is escaped. A scope name or slice title is escaped for
markdown, and a file name prints as code. A scope whose
ledger stage reads `shipped` prints a row with no slice count and no tally, and no blocked note. A scope whose
ledger stage reads `closed` prints no row. When every run root is closed and carries no note, `status` prints
`No open superdev runs in this repo.`
`hooks/scope-prune.js` (ADR 0007) is about to reap that run root, so per-slice detail is no longer
work in flight. Its `**Degraded:**` line, its `**Unresolved:**` line, its `**Deferred:**` line, its `**Minors:**` line, and its
staged-page notes still print, because each is otherwise recorded nowhere else. `deferred add`
carries no `clear` counterpart: a defect stops being true once a run re-verifies the scope green, while
unplanned work stays unplanned until somebody plans it (ADR 0035). `deferred resolve` removes one finding
the same run fixed after all (ADR 0121). It matches the exact bullet text, removes every identical bullet,
drops the line once none remain, and refuses text that matches no bullet, leaving the ledger unchanged.

`minors add <slice-id>` and `minors clear` write the Minor queue (ADR 0174, INV-0171). They write the `**Minors:**`
line, which holds one bullet per full-tier slice that merged with open Minor findings. Each bullet names the slice by
id alone. `add` refuses an
id the slice table lacks and leaves one bullet for an id queued twice. `clear` removes the line and succeeds with no
change when it is absent. Either verb refuses an extra argument, and `adopt` refuses a `**Minors:**` bullet that
the payload's slice table lacks. `get minors` prints the bullets. `references/implement-full-minor-sweep.md`'s `## Minor sweep`
reads and clears the queue.

`root <slug>` is a verb that touches no ledger (ADR 0080). It resolves and prints a run root's
absolute path — `<main-worktree>/.superdev/scopes/<slug>`, where `<main-worktree>` is the parent of
`git rev-parse --git-common-dir`, or the checkout that directory's `core.worktree` names inside a submodule
(never the superproject's `.git/modules`) — so it takes no `--root` of its own. `mainWorkTree` in `plugin/lib/main-work-tree.js` is the one
resolver; `lib/kb-staging.js`, `lib/status.js`, `lib/fail-to-pass.js`, and `hooks/tree-guard.js` call it. The result is identical whichever
checkout it runs from: the invoking checkout, a scopetree, or a slicetree of the same repository, which is
what lets every prose caller resolve `<run-root>` the same way regardless of its own cwd. It refuses
outside a git repository, and refuses a slug carrying a path separator or a leading `.`, since either
would path a ledger read or write outside `.superdev/scopes/`.

`collisions --base <ref> --branch <ref> --range-base <ref> [--also <ref> …]` reads git and touches no
ledger and no run root (ADR 0126, INV-0134). It prints one line per numbering collision: an ADR number,
in one directory named `docs/adr`, or an invariant id in `docs/invariants.md`, that the branch added since
the range base and the base already holds under another path. A file renamed into a number counts as
added. A base ADR at the same number is no collision only when the range base held that path and the
branch no longer does, because the scope renamed or replaced it; a file the base renamed or added is a
different ADR, so one ADR renamed to two paths, one on each side, collides. An invariant entry whose text
is identical on both sides is no collision. Paths are read NUL-separated, so a non-ASCII slug survives.
Each line carries the next free number, above every number that home carries on the base, the branch,
and every `--also` ref, so two collisions never receive one number. Callers pass `--also` only for each
other live run whose scope branch resolves. The verb renames and rewrites nothing, because a citation of
the base's ADR and one of the scope's read the same. The verb exits 0 when nothing collides and 1 when something does.
It exits 2 when a ref resolves to no commit, a flag is missing, given twice, or lacks a value (or its value starts with `--`), or git fails.
A caller never reads a failed check as no collision. The base step and `/superdev:ship` §4 call it before they merge the base. `findCollisions` is
exported for `tests/scope-citations-collisions.test.js` alone.

`citations --range-base <ref> --branch <ref> <id>…` reads committed history and touches no ledger and no
run root (ADR 0156, INV-0134). Each `<id>` is an old number as `collisions` prints it: a bare four-digit ADR
number or `INV-NNNN`. It prints one `<path>:<line> <id>` line for every line the range `<range-base>..<branch>`
adds that cites an old id as `ADR NNNN`, `INV-NNNN`, or a link to `NNNN-<slug>.md`, matched on whole numbers, so
`INV-0013` never matches `INV-00134`. A bare number in plural prose is no citation. A line the range left
unchanged, a line only the base holds, and a deleted line are not reported, and a renamed file reports only the
lines the rename changed. The diff is requested with flags that override `diff.relative`, `diff.noprefix`,
`diff.mnemonicPrefix`, `diff.external`, `diff.interHunkContext`, `diff.submodule`, textconv, and `color.diff`, and
treat every file as text, so a `-diff` or `binary` attribute hides no citation and the output is the same from any
subdirectory, and a C-quoted path is decoded. A submodule is one pointer line, so a citation added inside a
submodule is no report. A citation inside a binary file is reported, since the verb reads every file as text. The verb exits 0 when nothing is cited and 1 when something is. It
exits 2 when a ref resolves to no commit, a flag or an id is missing or malformed, or git fails. It writes
nothing. The base step runs it after the renumber commit and before the merge.

`staging <scope> [--count|--line]` is another verb that touches no ledger and needs no run root (ADR 0119). It
prints a scope's staging directory, `<main-worktree>/.superdev/kb-pending/<scope>`, resolved the same way
`root` resolves a run root, so a page staged from a scopetree or a slicetree lands in the main working
tree and survives that checkout's removal. It accepts `_adhoc`, and refuses what `root` refuses, outside a
git repository included. `--count` prints the number of `.md` pages in that directory instead, `0` when
it is missing. `--line` prints the close steps' staged-pages line: nothing for no page, a could-not-read line where the read fails. The staged-page scan behind `status` resolves its staging root through the same main
working tree.

`test full|whole`, `test focused [<path>…]`, `test focused --since <ref>`, `test path <file>… -- <command>`, and
`test path --since <ref> -- <command>` run a test command through `sh -c`, `sh` resolved from PATH (ADR 0150), and append one
`run` line carrying the command's own exit status, an **Observed run** (CONTEXT.md, ADR 0127, INV-0117). The line ends with
the run's duration in whole milliseconds (ADR 0182), the raw command (`traceField` of `lib/trace-log.js`), and the **directory field**: the directory the command ran in, relative to the run tree's root, `/`-separated, `.` at the root, and `..` or an absolute path outside the tree (ADR 0232). `scope.js` records the command verbatim, and the run-state ref publishes the trace. Pass a secret through the environment, never through an argument. The verb
streams the command's output and exits with its status. `full`, `focused`, and `whole` run the command
`docs/agents/verification.md` configures, as written; `focused` substitutes its shell-quoted paths for `{paths}`
and, given none, runs the full command and records `full`. It refuses an empty path argument, and an argument that holds
whitespace and names no file relative to the tree root, a path list joined into one word (ADR 0217). `--since <ref>` takes
the set from git at the tree root instead (ADR 0259): `git diff --name-only --no-renames -z <ref>` against the working tree under
`diff.relative=false` and `core.quotePath=false`, plus `git ls-files --others --exclude-standard -z`, each path relative to the
tree root. `focused --since` substitutes that set and records it. `path --since` keeps the paths the test-path rule matches that
exist, each spelled as the current directory reaches it, appends them to the command, and records them. Either form refuses paths
beside the ref, a missing ref, a ref starting with `-`, a ref that resolves to no commit, and an empty set, and runs and records
nothing. An empty set never runs the full command. `path <file>… -- <command>` runs the
command as given, from the current directory, against the test files its caller names, and classifies nothing (ADR 0227). It
records the kind `path`, the files, and the command as typed. A status the command shape hides from the test, such as a pipe without
`pipefail`, records `unknown`. `test --` without files, a missing file, a missing command, and a kind with no configured command
are refused and nothing runs. The verb reads the run root,
slice, commit, and tree state when the command starts, and appends the line when it finishes. A run during which
HEAD moved, the tree was dirty at either end, or the trace recorded an edit, revert, or restore for the slice
during the run records `dirty`, so it never backs `suite reusable`. A change no hook records shows only at the two ends. A command ended by a
signal, or a verb killed first, writes no line, and the command's run ends with the verb: a Node watcher process supervises it and ends it
through `endRun` (a process-group kill, `taskkill /pid <pid> /t /f` on Windows), which covers `SIGKILL`. `test` ends the group with `SIGTERM`. A failed trace write prints a note on stderr and leaves the exit status unchanged.
Outside every run tree the command runs and nothing is written. The verb takes no option that sets an outcome,
kind, slice, or tree state. `lib/test-verb.js` requires `lib/run-tree.js` (`locate`, `treeState`, and `relDir`, which writes the run line's directory field) at call time, the locator it shares with the
run-trace hook, and `lib/run-check.js`, whose digest check runs before the run line is written. `lib/run-tree.js` also holds the path helpers
`rootRelative` and `lazyToplevel`, which reduce a recorded path to the tree root: `lib/fail-to-pass.js` takes them with `treeState` and `gitOut`,
and `lib/suite-base-get.js` takes them for the rerun and the carry. `hooks/run-trace.js` reads no Bash command,
so a test run enters the trace through `scope.js test` and `scope.js fail-to-pass` alone, each writing its own run line.

`fail-to-pass <base>..<tip> -- <command>` runs the caller's command twice and reports whether the range's tests
discriminate (CONTEXT.md **Fail-to-pass run**, ADR 0134, ADR 0182, INV-0139). The command runs at the tree root. The caller
writes it to run every test file the range adds or modifies, and the verb reads none of its words: which files it runs is
the reviewer's judgment, so the outcome line records it (ADR 0188). The verb refuses a missing or empty command. The test paths come from `<tip>`'s own
`docs/agents/verification.md`. It creates a throwaway worktree detached at `<tip>`. In a run root the worktree sits beside
`slicetrees/`, outside every tree the run trace attributes a run to. Outside a run root it sits under `.superdev/`, which
the verb git-ignores first through the repository's `info/exclude`. The verb's git calls inside the worktree read every path
literally, `--literal-pathspecs` under `literalEnv` of `git-spawn.js`.
So an operator environment that sets a global pathspec mode changes no outcome.

Where the tip's `## Prepare command` section states a command, the verb runs it at the worktree's root before each run, the
second time after the put-back, through `runPrepare` of `lib/prepare.js` (ADR 0218). It reads the section once, from the tip,
because the put-back can restore the base's `verification.md`. A preparation's time counts in neither run's duration nor
the bound. A preparation that fails, is ended by a signal, cannot start, or changes a tracked file gives no verdict:
the outcome is `unknown` with `prepare=<exit|signal|start-failed:<code>|dirty>`, or `control=0,prepare=…` before the second
run, and one before the first run writes no control run line.

The first run is against the changed code and must pass. Inside a run root, where the tip states a prepare command or
`none`, the trace can supply it (ADR 0215, ADR 0218): the last
`path` run line at `<tip>` on a clean tree that names every test file the range adds or modifies and ends with a duration
is the first run when it passed and no failing `path` run line at `<tip>` follows it. The verb then runs the command once,
bounds that run with the line's duration, writes no control run line, and names the reused line on stderr. A first run the verb
runs itself is bounded at 300 000 ms, or `verification.failToPassControlMs` of the operator configuration, read the same way as the
floor; the prepare command's time falls outside it. A first run that outlasts its bound is killed with its process group, records
`unknown` with the reason `control=<exit or signal>,bound=<ms>ms` whatever exit status it reports, writes no run line, and the second
run never starts. The verb then resets and cleans the worktree. The clean keeps every path the first preparation wrote,
which `git clean -ndx` lists after it, so the second preparation finds it in place (ADR 0234). The verb puts
every changed file outside the test paths back as that file stood at `<base>`, and commits the put-back on the detached
HEAD. The verb runs the command again and bounds that second run at 10 times the first run's duration, measured in the
same invocation, or at a floor of 10 000 ms, whichever is larger (INV-0009, ADR 0142). `verification.failToPassFloorMs` of the
operator configuration (`### The operator configuration`) overrides the floor in milliseconds; a value that is not a
whole number from 1 to 2147483647 (the longest delay Node's timer holds) reads as absent, and the verb names that key once per process in one line on stderr. The suite's cases that hang
the second run write the key, so none waits the floor. `lib/fail-to-pass.js` exports the bound as the pure function
`failToPassBoundMs(controlMs, floorMs)`, the floor reader `failToPassFloorMs(cwd)`, and the control bound reader `failToPassControlMs(cwd)`, and the verb calls the first with the floor the second reads once. The suite pins the factor and
the floor on the bound function with no clock, and the override on the floor reader, because the first run's measured duration includes its own start-up, and load
stretches that start-up by seconds. The verb refuses a range that changes no file and a range that changes only test files,
because nothing is put back, and a range that changes no test file, because no test of its own can fail.

The outcome is `fail-to-pass` when the second run fails, and `pass-to-pass` when it passes. It is `unknown` when the first
run fails, when the second run is killed at its bound or ended by a signal, and when either run's command cannot start
(no shell on the PATH among the causes), its reason then reading `start-failed:<code>` in place of the exit
status, and when a preparation gives no verdict. No reviewer reads `unknown` as a verdict,
and no gate reads it as green.

Before any run, inside a run root, the verb settles the outcome from the run trace when the trace proves the tests discriminate (ADR 0251, `settledFromTrace`). A test that failed before the code changed and passes after it discriminates, and that is what the second run would show. The trace already holds both runs, so the verb reads them and runs nothing. The slice window starts at the range's latest `dispatch`, `dispatch-resume`, or `in-progress` ledger line. For every test file of the range, the window holds three records in order. First, after that file's last `edit`, a failing `path` or `focused` run naming that file alone. Then an `edit` outside the test paths. Then a passing run naming the file, after the window's last such edit, at `<tip>` on a clean tree. Only runs made at the tree root count. The verb then appends the outcome line `fail-to-pass settled-from-trace`, prints it, and runs and preps nothing. A trace that cannot be read or lacks that sequence runs the two runs as below.

Inside a run root the verb appends one `fail-to-pass` trace line, `<base>..<tip> <outcome> <reason> <command>`. Its slice is the
ledger row that records exactly that range, else the slice the run's directory attributes to, else `scope`. The control run also writes a `path` run line naming the range's test files, the files the command was handed to cover. The line
has the same slice as the outcome line and the form `test path` writes, its directory field `.`. It backs no suite record. It names the tip. The verb reads the worktree's HEAD
and tree at both ends. A HEAD that left the tip, or a dirty tree at either end, records `dirty`. An unreadable tree state
records `unknown`. Otherwise the tree is `clean`. A run ended by a signal, or one that could not start, writes no line
(ADR 0175). The outcome line itself is no
`run` line, so it moves no suite record. The trace's first `unknown` of any kind draws a
stderr note that tells the caller to report it, so the controller captures an observation. The observation goes to the scope run's first non-exempt
`unknown` (`references/scope-findings.md`, `## Observations`). An inherited `unknown` earns none. A slice cut after a break
between two slices inherits that failing test, and its control failure also shows at the slice's base. The note can
therefore name an exempt one.

The verb exits 0 when it read an outcome and 1 on a refusal or an error. It exits 2 when no test command is configured, so
nothing ran, and 128 plus the signal number when interrupted. An interrupt ends the command's run through `endRun` with `SIGKILL`, and the Node
watcher process covers a killed verb, so no worktree outlives the verb. The caller runs the verb in the foreground with the Bash tool's `timeout`
at its ceiling (600000 ms, or the higher `BASH_MAX_TIMEOUT_MS`), and in the background where two runs of the range's test files can
outlast that ceiling (`references/test-selection.md`, ADR 0232).

`prepare <tree>` runs the **Prepare command** (CONTEXT.md, ADR 0218) at the root of `<tree>`, which must be the root of a
working tree that `listWorktrees` of `lib/git-spawn.js` lists for the invoking repository. A path holding a newline counts on a git of 2.36 or later. Any
other path is refused with exit 1. So is every path where git cannot list the working trees. It reads
`docs/agents/verification.md` from `<tree>` itself, through `prepareCommandOf` of `lib/verification.js`. With no
`## Prepare command` section it prints one note on stderr naming the section and `/superdev:setup`, runs nothing, and exits 0.
With `none` it exits 0 silently. A command runs through `runPrepare` of `lib/prepare.js` in a process group of its own, its
output on stderr and nothing on stdout. A command that exits nonzero, is ended by a signal, or cannot start exits 3, naming the
command and its exit, signal, or start error. A command that succeeds but changes a tracked file exits 3 too, naming the
command and each changed path. The verb compares each tracked path's difference from `HEAD`, staged and unstaged, before and
after the command, read with `--no-ext-diff --no-textconv` so no diff program of the user's runs, and a tracked edit the
tree already held is no such change. An untracked file it writes is no such change either, the
rule `fail-to-pass` applies. An interrupt ends the command's group with `SIGKILL` and exits 128 plus the signal
number. A `scope.js prepare` call is no test run: it writes no run line.
A command that succeeds on a tree with no tracked change from `HEAD` leaves a stamp, `superdev-prepare.json` in the tree's own
git directory (`git rev-parse --absolute-git-dir`), recording the command, `HEAD`, and the tree's untracked paths
(`git ls-files --others --directory`). A later call skips the command, prints one `prepare: skipped` note on stderr, and exits
0 while the stamp holds: the command is the same, every recorded untracked path is still there, and every path
`git diff --name-only <stamped HEAD>` names, committed or not, is a `.md` file, and so is every untracked file
`git ls-files --others --exclude-standard` lists that the stamp does not record. The stamp records that list too, file by
file, so a new file inside an untracked directory it recorded as one entry counts as new. Any other change runs the command again, because the verb cannot know which files the command reads: a lockfile for an
install, every source file for a build (ADR 0238). A call that runs the command removes the stamp first, so a failed run
leaves none.

`scope.js` has one suite per topic, so a test-first step on one verb runs only that verb's cases (ADR 0139, ADR 0151). `tests/scope-setup.js`
holds the setup they share and is no suite. The `test` verb's cases split over `scope-test-verb-<topic>` (dirty, first-moment-kill,
first-moment-term, install, kill, late-fork, record, refusals, tree) and the `fail-to-pass` verb's over `scope-fail-to-pass-<topic>` (bound,
concurrency, environment, interrupt, prepare, reuse, signals, trace, verdict, watcher), and the `prepare` verb's is `scope-prepare`. The rest: `scope-ledger` (init, stage, step, slice, the bullet and header records, get, status, and the ledger-fixtures pin),
`scope-ledger-header` (`readLedgerHeader`), `scope-suite` (the suite and base records), `scope-dod-line` (the `dod-line` verb and the dod-fixtures pin), `scope-dod-tags` (the `dod-tags` verb), `scope-dod-check` (the `dod-check` verb), `scope-dod-merge` (the `dod-merge` verb), `scope-publish-adopt` (`publish`, `adopt`, and the
`maskFencedLines` pin), `scope-trace` (the run trace, `appendTrace`, its `run.lock` refresh, and the `trace` filters), `scope-windows` (the `windows` verb and `trace --window`), `scope-digest` (the digest check), `scope-untraced` (the `untraced` verb), `scope-fail-to-pass-check` (the `fail-to-pass-check` verb), `scope-section`, `scope-tier`, `scope-dod-open`, `scope-contained`, `scope-red-evidence`, `scope-branch`, `scope-checkout`, `scope-lock`, `scope-denial`, `scope-consent`, `scope-route`, and `scope-candidates` (the verb of each name), `scope-staging` (`staging` and its `--count` and `--line` forms), `scope-dod-gate` (the Definition-of-Done check on entering `implementing`), `scope-root-base` (`root`, `staging`, `base` from a linked worktree),
`scope-containment`, `scope-citations-collisions`, `scope-source-set`, `scope-ci`, `scope-push`, `scope-open`, `scope-help`, and `scope-stdin` (every verb that reads piped input receives it through the CLI). A focused run for `scope.js`, or for a module it requires, selects
every suite that reaches it (`run-tests.js`, below).

`source-set [<path>]` prints the gap audit's source set and touches no ledger and no run root (ADR 0162). It prints one
repository-relative path per line: every file `git ls-files` lists, under `<path>` when given, that is no test path, no
doc, configuration file (a dot-prefixed one included), or lockfile, no binary asset (image, font, archive, media, native binary,
bytecode), and under no `vendor/` or `node_modules/` directory at any depth, nor under `dist/` or `build/` at the repository
root. The test-path rule is `verification.js`'s `testPathPatterns`, the classifier the run trace shares, so the configured
`## Test paths` of `docs/agents/verification.md` decide, or their defaults where it has none. An untracked file is outside the
set, and so is an index entry that is no regular file on disk (a submodule gitlink, a file deleted from the working tree). An extensionless name counts as a doc in any case when it is `readme`, `history`, `changes`, `notice`, `changelog`, `authors`, `codeowners`, `contributors`, `license`, `licence`, or `copying` (`DOC_NAME_RE`). A `LICENSE` or `COPYING` stem also counts with a `-` suffix and no extension in any case, or with any `-` or `.` suffix in uppercase (`LICENSE-MIT`, `license-apache`, `COPYING.LESSER`). A lowercase or mixed-case stem with an extension is code (`license.js`, `license-check.js`). A `<path>` that does not exist refuses, naming it. A directory that is no git repository refuses too, and a set with no file prints nothing and exits 0.
`source-set --tests` prints the gap audit's test-file list instead: every file `git ls-files` lists that the same test-path rule
classes as a test, with no doc, configuration, dot-file, or vendored filter, so fixtures, snapshots, and dot-files under a test path
stay listed and no path appears in both listings. An index entry that is no regular file on disk is left out. A path beside `--tests`
refuses, because the list is never narrowed (triage #47), and a repeated `--tests` is refused as given twice.
`/superdev:review-tests` §1 calls both. The classification lives in `plugin/lib/source-set.js`.

`push --root <run-root> --remote <remote> --base <base-ref>` puts the scope branch on the remote and writes nothing to the
ledger (ADR 0167, INV-0169). `/superdev:plan` §6 calls it, and `plugin/references/scope-branch.md`'s
`## Pushing the scope branch` states the rule plan follows. The verb reads the branch from the ledger's `**Branch:**` line,
fetches the remote branch, and decides the push mode from the fetched tip's full commit id, never from the branch name,
which resolves to the local branch first. It makes a plain push with `-u` when the remote holds no such branch or its tip is
an ancestor of the local tip, prints `pushed`, and exits 0. It makes a push with `--force-with-lease=<ref>:<tip>` when
`judgeContainment` proves `<base-ref>` holds that tip, prints `overwritten`, and exits 0. It pushes nothing on any other tip,
prints `refused` and the tip's commits that the base the containment test judged against does not hold (the refetched base,
never a stale local one), and exits 3. A failed fetch of the branch or of `<base-ref>` prints `unreachable` or
`credential-rejected`, a git call its own bound ended prints `timed-out` (INV-0009), and a push the remote rejected prints
`push-failed`. The `timed-out` line names the bound and its key, `code-host.pushTimeoutMs`. Each of these exits 3 and names the `git push -u <remote> <branch>` line to run by hand. A usage refusal,
a missing ledger, a ledger with no `**Branch:**` line, or a `**Branch:**` line that names `<base-ref>` exits 1.
`hooks/merge-guard.js` denies a subagent's run of this verb, as it denies a subagent's plain push. Every git call runs with `GIT_TERMINAL_PROMPT=0` and
`--end-of-options` ahead of a remote or revision argument, and every network call carries a time bound of 60000 ms, or whatever `code-host.pushTimeoutMs` of the operator configuration (`### The operator configuration`) names, and a
kill signal, the refetch of `<base-ref>` inside the containment test included. The code lives in `plugin/lib/push.js`, and
`tests/scope-push.test.js` holds its cases.

`open <type>/<slug> --base <base-ref> [--remote <remote>] [--lock <nonce>]` sets up or rejoins a `/superdev:plan` run
(ADR 0185). `/superdev:plan` §2 calls it at the first capture that crystallises, and §6 calls it again. With no ledger, or
a `closed` one, it cuts the branch from `<base-ref>` into `<run-root>/scopetree` by `plugin/references/scope-branch.md`'s
`## Cutting the scope branch` and prints `cut`. Where the name exists, `judgeContainment` decides: a contained branch is
attached to the scopetree, checked clean, reset to the base it was judged against, and prints `reused`. A `planned`
ledger naming the same branch prints `existing` and cuts nothing, attaching the branch where the scopetree is absent. On
success it writes `run.lock` as `plan <nonce>`, writes an empty `planned` ledger with the anchor `pending` through
`init` where no live ledger stood, records `step set plan` unless the same nonce's call already did, traces the `init`
and the step as their own verbs would, prints `root <run-root>` and `lock <nonce>`, and exits 0. It writes nothing and
exits 3 on `locked` (a lock under an hour old that names another nonce, on a `planned` ledger only while its step
stands), `not-contained`, `dirty` (the scopetree's `status --porcelain`), and `held` (another worktree holds the branch).
A `not-contained` refusal prints the commits base lacks and a `git branch -m` remedy. Where the refetch of the base ended
without one, it prints a last line `refetch timed-out` or `refetch failed`. The refetch names `--remote` where given, else
the `Remote:` value of `docs/agents/code-management.md` at the repository top level, through `kb-containment.js`'s
`resolveRemote`, the resolution `contained` shares; with neither it refetches nothing and judges against the local base
(INV-0203). `code-host.pushTimeoutMs` bounds the refetch. A ledger at a later stage, a `planned` ledger
naming another branch, a missing `--base`, and a failed git call exit 1. A run lock that is no regular file (a
directory, a symlink, or another kind) or that cannot be read, and a ledger that cannot be read, exit 1 before the cut
and write nothing. A lock write that fails after the cut exits 1 and names the branch and scopetree already set up, and
a second `open` reuses them. Each refusal is one `open:` line on stderr. The code lives in `plugin/lib/plan-open.js`,
and `tests/scope-open.test.js` holds its cases.

`discard --root <run-root>` is the one sanctioned removal of a run's ledger and run trace (ADR 0208, INV-0181). It removes
`ledger.md`, `trace.log`, and `run.lock`, then removes the run root when that leaves it empty. It refuses, removing nothing, a
missing `--root`, a root that does not resolve (after `..`, symlinks, and a drive path) to `<main working tree>/.superdev/scopes/<scope>`,
and a run whose stage is later than `planned`. An absent file or an absent root exits 0. `/superdev:plan`'s label revision calls
it. The code lives in `plugin/lib/discard.js`, and `tests/scope-discard.test.js` holds its cases. `plugin/lib/drive-path.js`, the
MSYS drive-path translator, is the only path helper `discard.js` and `prepare.js` share (ADR 0150).

### Run digest (ADR 0227)

`run-digest.js` keeps `<run-root>/digest.json`, the size and sha256 of `ledger.md` and `trace.log` as `scope.js` and the hooks last
wrote them, under `digest.lock`, a lock created exclusively whose holder removes it. A waiter breaks `digest.lock` when the process its
token names is dead. A waiter also breaks `digest.lock` when the lock is older than `LOCK_STALE_MS` (30 s). A waiter waits for a live holder without a budget. A process that
holds a root's lock and takes it again runs inside its own hold. Neither file is pushed with the run state. `run-check.js`'s
`checkRun(root)` compares both files with the digest before a verb writes to the run: `scope.js` calls it once from
`writtenRoot` for every verb that names `--root` and writes
(`stage`, `step`, `slice`, `degraded`, `unresolved`, `deferred`, `minors`, `docs`, `pr`, `adopt`, `dod-merge`, `deploy set`,
`base set`, every `suite` subcommand), and `init`, `open`, `test`, and `fail-to-pass` call it in their own verbs. A file that
differs, or that was deleted while its digest was present, prints one stderr warning naming the file and appends a `tamper <file>`
trace line. The digest then seals what is on disk and the verb goes on. A file with no digest is sealed and reported on no stream.
No hook refuses an edit of either file. The code lives in `plugin/lib/run-digest.js` and `plugin/lib/run-check.js`, and
`tests/scope-digest.test.js` holds its cases.

`trace`, `windows`, `untraced`, and `fail-to-pass-check` only read (ADR 0227, ADR 0261): none writes a trace line, a ledger change, or a
digest, and none runs a test. Each grading verb prints a verdict or the trace lines its caller named (INV-0196).

- **`windows --slice <id|scope>`** prints one line per run of an implementer dispatch of the slice, `<dispatch id> <slice> <from>
  <until|open>`, the times of the run's first line and of the boundary line that ends it. A slice with no implementer dispatch,
  such as a `lite` slice, prints `no window: slice <id> has no implementer dispatch`. `trace-window.js`'s `windowsOf` derives each
  **Window** by position in the file, never by timestamp: a run starts at an implementer `dispatch` line or a `dispatch-resume` of one.
  It ends at the first boundary line after its `dispatch-end` (any outcome), or after its start when no end of its own follows.
  With no such boundary line, it runs to the trace's end. A boundary line is a `dispatch` line of the run's own slice, except one of
  `slice-readiness-reviewer` or `intent-challenger`, or a `dispatch-resume` of a reviewer's dispatch of that slice. A root with no `ledger.md` is refused.
  The agent type matches on the name part of a plugin-scoped type.
- **`trace`** prints every recorded line that passes the filters given, byte-identical and in file order. `--slice`, `--kind` (a comma
  list of `edit`, `run`, `dispatch`, `dispatch-bind`, `dispatch-end`, `dispatch-resume`, `ledger`, `fail-to-pass`, `tamper`, or the
  older releases' `verdict`, `final-verdict`, `revert`, `restore`), and `--window` combine as AND, and `--last <n>` keeps the last n
  they pass. An empty trace prints `no trace: this run has recorded no events`, and a filter that matches nothing on a non-empty trace
  prints `no match: the filter matched no line of this run's trace`.
- **`untraced <base>..<tip> --slice <id|scope> [--window <dispatch id>] --root <run-root>`** lists, one line per path, the net changes
  of the range's first-parent, non-merge commits that no `edit` line of the slice names, in every run of the `--window` dispatch or,
  without it, in the whole trace: `<added|modified|deleted>\t<path>`, or `renamed\t<new>\t<old>`, sorted by path. Edit paths
  compare root-relative, MSYS paths included (ADR 0150). It refuses a window given by time rather than by dispatch, naming `--window`, a missing `--root` or
  `--slice`, a range that is not `<base>..<tip>` (a three-dot range included), and a root with no `ledger.md`. It parses its flags with
  `traceFlags`, so a flag given twice and an unrecognized argument are refused. It writes one stderr note naming a `--slice` with no
  trace line, and stdout stays the listing. The code lives in
  `plugin/lib/untraced.js`, which also exports `netChanges`.
- **`fail-to-pass-check <base>..<tip> --slice <id|scope> [--window <dispatch id>] --root <run-root>`** prints exactly one verdict line:
  `fail-to-pass`, `pass-to-pass`, or `closed` with the deciding outcome line's range and command, `unknown <reason>` (only `unknown`
  lines, or the gaps `no-trace` and `no-change`), `missing`, `test-only`, or `no-test-change`. It resolves both sides to full commits
  and refuses a `...` range, an unresolvable side, and a base that is no ancestor of the tip. Only `fail-to-pass` and `pass-to-pass`
  lines decide, the latest in file order winning, and a line covers the range when its tip is the range's tip and its base is the
  range's base or an ancestor of it. It reads the range's changes through `netChanges` and classes test paths by
  `docs/agents/verification.md` at the tip. `references/fail-to-pass.md` states what each verdict means. The code lives in
  `plugin/lib/fail-to-pass-check.js`, over `outcomeOf` from `plugin/lib/fail-to-pass.js`.
- **A window id** that names no implementer dispatch, or a dispatch of another slice than `--slice`, is refused by name. Every flag needs
  a value, and a value starting with `--` is refused. A flag given twice and an unrecognized argument are refused, naming the verb and
  the flag.

`tests/scope-windows.test.js`, `tests/scope-trace.test.js`, `tests/scope-untraced.test.js`, and `tests/scope-fail-to-pass-check.test.js`
hold their cases.

`section`, `tier`, `dod-open`, `contained`, `red-evidence`, `branch`, `checkout`, `lock`, `route`, `denial`, `consent`, and `candidates` are read-only decision verbs (ADR 0262, ADR 0263, INV-0195, INV-0196). A verb reads the ledger, `dod.md`, the run trace, git, and the files of the main working tree's `.superdev/`. A verb takes a slice-store or code-host result its caller fetched, handed over as a flag or on stdin. A verb makes no backend call itself (ADR 0263). A
table or procedure whose every branch the ledger, `dod.md`, the run trace, a reference, or git decides lives in the verb, and a
reference names the verb and the judgment the agent keeps. Each prints a verdict or the lines or section its caller named. None
writes a ledger line, a trace line, or a digest, and none runs a test. A usage refusal exits 1 and prints nothing on stdout.

- **`section <file>`**, the heading line on stdin, prints that heading line through the line before the next heading of the same
  or a higher level outside fences, or through the end of the file, with trailing blank lines dropped. A heading matches by level
  and whole text through `md-sections.js`'s `headingKeyOf`, the key the `heading-citation` drift check uses. `<file>` is a
  `${CLAUDE_PLUGIN_ROOT}` path or an absolute path as given, a bare `<name>.md` under the plugin's `references/` then `agents/`,
  or any other relative path under the plugin root then the current directory. A bare `AGENTS.md` names the repository's own
  hierarchy root and reads the current directory only. It refuses and prints nothing in these cases:
  - a missing `<file>`;
  - stdin with no markdown heading line;
  - a file that is not readable;
  - an unterminated fence in the file;
  - a heading that is absent;
  - a heading found only inside a fenced code block;
  - a heading found more than once outside fences;
  - a setext heading inside the span, because where the section ends is then unknown.

  The code lives in `plugin/lib/section.js`.
- **`tier --root <run-root>`** prints `tier: full|lite|unknown` and `simplicity: skip|dispatch` from the ledger's slice rows. The
  tier is never stored (INV-0056). More than 3 `behavior` rows is `full`, and 3 or fewer is `lite`. `mechanical` and `docs` rows never
  count, and a row of any status does. `simplicity` is `skip` only for a `full` run whose every row is `behavior` (INV-0055). A run
  with no slice rows, a row that does not carry 7 columns, or a type outside `behavior`, `mechanical`, `docs` (matched
  case-sensitively) is `unknown`, prints `simplicity: dispatch`, and adds a `reason:` line naming the row. It refuses an argument.
  The code lives in `plugin/lib/tier.js`.
- **`dod-open --root <run-root> [--tag docs]`** lists the criteria of `<run-root>/dod.md` by the note rule
  (`references/dod-ticks.md`'s `## The note rule`, INV-0190), read through `dod-line.js`'s line parser: one
  `<open|settled><TAB><label><TAB><tag|-><TAB><repair-citation|-><TAB><criterion>` line per criterion, then `stage-hold: yes|no`. The
  label is `met`, `not-met`, `ceiling`, `accepted`, or `none`; `met` and `accepted` are settled. `repair-citation` marks a `not-met`
  note that ends in verify-ship's `(observed)` citation. `stage-hold` is `yes` where an open line is neither `ceiling` nor tagged
  `docs`. `--tag docs` prints the open `docs` lines alone and no `stage-hold` line. It takes only the value `docs`. It refuses in
  these cases:
  - a missing `--root`;
  - an unrecognized argument;
  - a `dod.md` that cannot be read;
  - an unterminated fence;
  - a `dod.md` with no criterion line (`no criteria`).

  The code lives in `plugin/lib/dod-open.js`.
- **`contained <base> <branch> [--remote <remote>]`** prints the containment verdict of `<branch>` against `<base>` through
  `judgeContainment` (ADR 0053, ADR 0065): `contained`, `not-contained`, or `could-not-resolve`, then `base <full sha>` (the base
  judged against, the refetched one when the refetch ran, `unresolved` where none resolves), `remote <name>`, and
  `judged local|refetched`. It adds `fallback ancestor` where the git lacks `merge-tree --write-tree`. It adds `refetch timed-out` or
  `refetch failed` (`refetchMark` of `containment.js`) where the refetch ended without a base. A `not-contained` answer there is
  no verdict on the work (INV-0003, INV-0009). Only `--remote` is an option, so an option-shaped operand stays an operand. The remote
  defaults to the `Remote:` value of `docs/agents/code-management.md` read at the repository top level. With neither, it judges
  against the local base alone, runs no fetch, and prints `remote none` and `judged local`. The refetch is bounded by
  `code-host.pushTimeoutMs` of the operator configuration and writes no remote-tracking ref (`--refmap=`). Exit 0 is `contained`, 3
  `not-contained`, 4 `could-not-resolve`, and 1 a usage refusal. It writes tree objects,
  fetched commit objects, and `FETCH_HEAD`. It writes no ledger, trace, ref, index, or working tree. The code lives in
  `plugin/lib/contained.js`.
- **`red-evidence --root <run-root> --branch <branch> --base <base-ref> [--ci-head <sha> --ci-file <path>]`** reads what
  `references/review-scope-mode.md`'s `### 4.2 Red evidence` judges, from the ledger's suite record and the trace's run lines, in
  the scope checkout (ADR 0255, INV-0191). A red record at the tip or an ancestor of it prints `red <sha> files=<failed files>`,
  the files coming from a `Failed` record that carries the record's own full SHA. It prints `covered <sha> by <commit>` instead
  where a later commit on the tip's ancestry holds passing runs that close it. There is no failed run there. Each failed file passed
  alone on a clean tree or inside a focused run's path set. A record with no failed file is covered by a focused run over every path
  of the scope's range. Where the focused fence repeats the full fence, a record with no failed file is covered by two kinds of run
  instead. One is a passing full-class run on a clean tree. The other is a passing `path` run of each test file changed since that
  is still present. `existsAt` of `git-spawn.js` decides that. A record with no failed file also takes the tip as its closer, printed `covered <sha> by <tip> clean-tip`. That
  needs three conditions. The focused fence repeats the full fence. No test file changed from the red commit to the tip. No run at
  the tip failed or reads `unknown` in result or commit. The review judges that line (ADR 0255). The CI pair adds `ci: <verdict> <sha>`
  through `ciJudgment` of `ci.js`. For a failed head at or behind the tip, it adds `ci-failed <check> <link> <sha>` per failed named
  check, or `covered` where a later commit's runs close it. A head that is no ancestor of the tip says so on its `ci:` line and
  raises nothing. A malformed `## CI` section prints `ci-malformed`. `none` prints where the verb read and found no finding. It
  never prints beside `red`, `ci-failed`, a `clean-tip` line, or `ci-malformed`. `nothing-to-read` prints alone where the ledger
  holds no suite record and no CI input is given. A run whose result or commit reads `unknown` covers nothing (INV-0009). It
  refuses in these cases, naming the failed git read where one fails:
  - a missing `--root`, `--branch`, or `--base`;
  - one of `--ci-head` and `--ci-file` without the other;
  - a branch that resolves to no commit;
  - an unreadable suite record or `--ci-file`;
  - any git read that fails, an existence check git cannot answer naming the path and the commit.

  The code lives in `plugin/lib/red-evidence.js`, over the readers `suite-base-get.js` exports.

- **`branch --root <run-root>`** prints one scope-branch verdict: `ledger <b>` (the ledger's `**Branch:**` line names a local
  branch), else a shape scan over local and remote-tracking names (leading segment a change type, last segment the run root's
  slug): `guess <b>`, `guess-remote <b>` (a remote-tracking ref only), `ambiguous <b> <b>…`, `none`, or `git-failed <reason>`.
  Every verdict exits 0. The code lives in `plugin/lib/scope-branch.js`.
- **`checkout --root <run-root>`** prints one scope-checkout verdict for the branch `branch` resolves: `present <path>` (git
  registers `<run-root>/scopetree` on it), `absent` (no scopetree before `shipped`), `absent-terminal <stage>` (`shipped` or
  `closed`), `held-elsewhere <path>`, `unregistered <reason>`, or a branch verdict (`none`, `ambiguous`, `git-failed`). A path
  holding a line break is never printed. Exit 0. The code lives in `plugin/lib/scope-checkout.js`, over `listWorktrees` of
  `git-spawn.js`.
- **`lock --root <run-root>`** prints implement's entry liveness verdict: `proceed planned`, `proceed absent`,
  `proceed stale <age>` (a lock an hour old or older), or `live <age> <stage> <lock content>`. It refuses a lock that is no regular
  file, and writes no trace line, so it never refreshes the lock it measures (INV-0186). The code lives in `plugin/lib/run-lock.js`.
- **`denial <pass> [--unattended] --root <run-root>`** prints one verdict for a denied dispatch the caller already recorded:
  `inline`, or `block implementer | unknown-tier | authored | second-denial`. `<pass>` is `implementer`, `fix`, `final-reviewer`,
  `slice-reviewer`, or `doc-reader`. It refuses an unknown pass and a verification pass with no denial recorded since the last
  reset. The code lives in `plugin/lib/denial.js`, over `tierOf` and `denialCount`.
- **`consent --root <run-root>`** prints the operator's carried merge consent: `carried` or `none` (ADR 0268). It reads the
  `ledger step set|clear|block` lines of `trace.log` after the last `step set submit`. `carried` means the latest `step set ship`
  there ended in a `step block` naming `ship`. A ship step that ended in a `step clear`, a `step set`, or a block naming no ship
  withdraws it, and a `step clear` that ends another step leaves it. An absent, empty, or unreadable trace, a trace with no
  submit step, a trace that differs from the digest sidecar, and a trace with a `tamper trace.log` line after the last
  `step set submit` print `none`. Read-only verbs skip `checkRun`, so the verb compares the trace with its digest itself and
  records nothing. A writing verb's `checkRun` seals a trace edited outside `scope.js` again and records that tamper line, so
  the line withdraws the consent where the digest no longer shows the edit. `/superdev:review` and `/superdev:document` ask it before
  they start `/superdev:ship` on a scope at `submitted`. The code lives in `plugin/lib/consent.js`, over `readTrace` and
  `run-digest.js`'s `readSide` and `stateOf`.
- **`route --root <run-root> [--merge <sha>] [--target <name>]… [--repair open|closed <key>]… [--repairs-failed|--repairs-none]`**
  reads the anchor's Definition of Done on stdin and prints a shipped run's route: `repair`, `re-verify`, `verify-ship`, `wrap-up`,
  or `needs-repairs`, with `repair <key> is open` lines and a `hand-sync` line where a `dod.md` line has no matching anchor line.
  The caller hands the store facts as flags (ADR 0263), and the verb parses no `**Repairs:**` line. A missing, unreadable, or empty
  `dod.md`, and a run root with no ledger, never route to `wrap-up`. The code lives in `plugin/lib/route.js`.
- **`candidates --stage <stage>[,<stage>]`** takes no run root. It prints the empty-argument verdict over the run roots, read through
  the main working tree: `one <slug> <stage>`, `several` and a `<slug> <stage>` line each, or `none` and every run root with its
  stage. A run root with no stage reads `absent`, and one whose ledger cannot be read or names a stage outside the ledger's stages
  reads `unreadable`; neither qualifies. The code lives in `plugin/lib/candidates.js`, over `scanRunRoots` of `run-roots.js`.

`dod-line` is another verb that touches no ledger, and makes no store call of its own
(`references/dod-ticks.md`, INV-0014, triage #664): `--match-file <path>
--verdict met|not-met|ceiling|accepted --note-file <path> [--line]`. It is the one
Definition-of-Done checklist-line edit every store's own `## Definition of Done ticks` section cites
instead of restating by hand — a store seed fetches the checklist text through its own call, runs
`dod-line` on it as the producer in its gated **Edit an issue's body** rule, and writes back what comes
out on stdout only when `dod-line` exited 0 with non-empty output (ADR 0115), the same shape `kb-patch.js`
already gives a staged knowledge-base patch (ADR 0027). `--match-file` and `--note-file` are the only forms: each
reads its text from a file instead of a shell-interpolated argument, one trailing newline stripped verbatim otherwise — the text a controller pipes in this way is
typically report-derived, and may carry a quote, a backtick, a `$(`, or worse (`references/dod-ticks.md`,
triage #680); an inline `--match` or `--note` refuses and names the file option. The verb writes the verdict's own label, so a note that
already opens with that label (`met: …` under `--verdict met`) loses that one prefix and carries the label
once. A note opening with any other verdict's label is note text and stays as given. The default mode takes a whole markdown
body on stdin and prints the transformed body; `--line` takes and prints exactly one checklist line
instead, for the Jira seed's ADF text node, which is JSON, not markdown lines. A checklist line is `- [ ]
<criterion>[ — <tag>][ — <verdict>: <note>]` (`plan-contract.md`'s line format) — the tag absent on a
single-slice feature's own DoD or one untagged line inside an
otherwise-tagged DoD; `--line` mode accepts the same line with no leading `- `, the shape a Jira text
node's own string carries. The tag — slice ids (`01`, `01, 02`), store refs (`#667`, `#672, #673`), or the
literal `scope` or `docs`, each standing alone (ADR 0161) — and any verdict note past it are parsed off the line's *right* end, greedily handing
everything before that to the criterion, which is what keeps a criterion carrying its own " — "
(`plan-authoring.md`'s own worked example, "Reachable: none — entrance unchanged; … — scope") intact
instead of splitting at its first dash. An untagged criterion that merely ends in something shaped like a
tag (`- [ ] Retries capped — 3`) offers a second reading alongside the rightmost-tag one — the whole line,
untagged — and a line matches when either reading's criterion equals the `--match-file` text (triage #679); a genuinely
tagged line still parses its tag as before. The same offer reaches a line that already carries a note
(`- [x] Retries capped — 3 — met: e`), so a re-judge against the same untagged criterion still finds it —
a line offering two readings still counts once toward the match limit below. Matching runs after both the line's own criterion text and
the `--match-file` text collapse internal whitespace to one space and trim, so a criterion an editor reflowed onto two
lines is still found, and after `lib/md-sections.js`'s `maskFencedLines` blanks every fenced line, so a line
shown inside a fenced illustrative example is never a candidate. Body mode further scopes matching to the
body's own `## Definition of Done` section — the heading whose text starts "Definition of Done," up to
the next heading of the same or a higher level — when one exists, so an identical checkbox elsewhere in
the same document is never a candidate; a body with no such heading matches over the whole body, as a
single-slice feature's own acceptance-only checklist does (triage #679). `met` renders `- [x] <criterion>
— <tag> — met: <note>`; `not-met`, `ceiling`, and `accepted` each render `- [ ]` with
`not met:`/`ceiling:`/`accepted:` — the marker is derived from the verdict alone, so a same-verdict
re-write always leaves it unchanged, and the new note always replaces whatever note the line carried
(INV-0014's own note rule, never appended beside it). `accepted` is an operator's own decision that an
unmet criterion stands accepted as unmet (ADR 0095) — the box stays unticked, since the criterion is
honestly unmet. Refuses, printing nothing, on zero matching lines, on two or more (which one to edit
cannot be resolved — a line offering two readings counts once), on a `--verdict` outside the four named
values, on a missing `--match-file` or `--note-file`, on an inline `--match` or `--note`, on an unknown
argument, on a flag with no value or a value that starts with `--`, or on a note holding a U+2028 or U+2029
separator.

`dod-tags [--map-file <path>] [--line]` is the criterion-tag rewrite (ADR 0209, INV-0182), in
`plugin/lib/dod-tags.js`. It touches no ledger and makes no store call. It reads an anchor body on stdin and
prints it with every slice-id tag in the `## Definition of Done` section rewritten into the store reference
the map file gives it, one `<id> <reference>` pair per line. Several references join with `, ` and carry no
brackets. A tag already in store notation, `scope`, `docs`, a judged line, a fenced line, and every byte
outside the section print unchanged, so a second run over its own output changes nothing. It reads lines
through `dod-line.js`'s own line, tag, and section rules. Without `--map-file` it only checks. `--line` takes
and prints one checklist line, for a Jira ADF text node. It refuses, printing nothing and naming every
offending line, when an unjudged checklist line carries no tag `dod-line` reads, a tag names a slice id the
map lacks, or a tag joins `scope` or `docs` with other entries. It also refuses a map with a duplicate id or a
reference not in store notation, empty input, a body with no `## Definition of Done` section, an unknown
argument, and a flag with no value or a value that starts with `--`.
`/superdev:plan` runs it on the drafted Definition of Done before it creates the epic, and as the producer
of each store's tag-rewrite body edit. `tests/scope-dod-tags.test.js` holds its cases.

`dod-check` is the anchor's Definition-of-Done check (ADR 0233, INV-0189, INV-0137), in
`plugin/lib/dod-check.js`. It takes no `--root`, touches no ledger and no trace, and makes no store call. It
reads an anchor body on stdin: an epic, or a lone slice whose acceptance is the Definition of Done. It reads
the checklist lines of the `## Definition of Done` section when the body has one, and of the whole body
otherwise, through `dod-line.js`'s line and section rules, never inside a code fence. It counts only a
line's criterion text, with the tag, the verdict note, and every inline code span dropped. The Absorbs line
is the first unfenced line that begins with `**Absorbs:**`. Its comma-separated entries count when they are
store references (`#n` or `KEY-n`), each once. A citation is `(triage <reference>)` in criterion text, and a
criterion citing one reference twice counts once. It exits 0 and prints nothing on a well-formed body. It
refuses, under a `dod-check refused:` header with one line per problem, when an Absorbs entry has no citing
criterion, when a citation names no Absorbs entry or the body has no Absorbs line, when two or more criteria
cite one reference, when no criterion begins with `Reachable:`, and for each of rollback, deploy-window data
compatibility, consumer compatibility, and production visibility that no criterion beginning with `Release
risk:` names. A problem line quotes only references and category names. It also refuses empty input, and
input with an unterminated fenced code block, checking nothing.
`/superdev:plan` runs it on the drafted anchor body before any store write, and the scope review runs it in
its anchor sync on input built from the store's Definition-of-Done lines and Absorbs line, again before each
stage write. `tests/scope-dod-check.test.js` holds its cases.

`ci` judges a commit's check status against its **Named check**s (ADR 0255, INV-0191), in `plugin/lib/ci.js`.
It reads `name<TAB>state` lines on stdin. Each line is one check run or commit status, as the code-host document's
check-status read emits it, with an optional third field, the report's link.

It reads the `## CI` section of `docs/agents/verification.md` at `--sha` through git, never a working tree. The
repository is the one `--root` names (an MSYS path is translated), or the working directory.
`verification.js`'s `namedChecksOf` reads the section. A name is a backtick span outside a fence, trimmed, each name
once. The section may read `none` instead, and a bare `none` line counts as `none` too. An absent file or section,
`none`, and a section with neither names no check. A section with both is malformed. The section is cut out before
the positional fence read, so a fence under `## CI` is never a test command.

A named check takes one state from the lines that carry its name:

- green: every line reads `success`.
- failed: one line reads `failure`, `error`, `timed_out`, `cancelled`, `action_required`, or `startup_failure`.
- pending: one line reads any other state, or no line exists.
- finished-not-green: the lines read only `success`, `skipped`, `neutral`, `stale`, or `warning`.

Lines for names not listed are ignored. A trailing `\r` is stripped. A line without a TAB, or with an empty name or
state, matches nothing.

It prints `ci: <green|not-green|failed|cannot-judge> <sha>`, then one
`<pending|finished|failed><TAB><name><TAB><state>[<TAB><link>]` line per check not green. Empty or unparseable stdin,
with no line that holds a name and a state, judges every named check missing. The verdict is not-green, never green,
and its `ci:` line ends in `(no check report read)`.

It exits 0 (green), 3 (not yet green), 4 (failed), or 2 (cannot judge: an unresolvable SHA, no named checks at that
commit, or a malformed section), and 1 on a usage refusal. It writes no ledger line, no trace line, and no suite
record. `tests/scope-ci.test.js` holds its cases.

`init` writes a fresh ledger at stage `planned` (ADR 0079) — the one stage that precedes the four-command
chain rather than naming a step within it, ranked below `implementing` so `stage set implementing` (or any
higher stage) moves forward out of it and no later write moves back. `init` over an existing ledger at
stage `planned` overwrites it, since a plan that cut the branch and scopetree but ran no slice yet has
nothing to lose; any other stage still refuses. `stage set` refuses a ledger that carries no `**Stage:**` line, as it
refuses one carrying an unknown stage, and writes nothing. Entering `implementing` needs the written Definition of Done. Three
entries refuse and write nothing while `<run-root>/dod.md` is unwritten:
- `init ... implementing`;
- `stage set implementing` from `planned`;
- `adopt` of a snapshot whose stage is past `planned`.

`adopt --shipped` is excepted, because it writes `dod.md` after the adopt. A `dod.md` is unwritten when it is missing, empty, not a
regular file, holds an unterminated fence, or holds no criterion line, read as `dod-line` reads a body (`plugin/lib/dod-gate.js`,
`tests/scope-dod-gate.test.js`). A header-writing verb (`step`, `docs`, `pr`, `deploy`,
`suite`, `base`) that finds its header absent inserts it after the last present header line, the same rule for every
verb; a header already present keeps its line and position.

The ledger's `**Step:**` line names the chain step a command has started and not yet completed: the open step
(ADR 0140, ADR 0147). `step set <name>` writes it, `step clear` removes it, and `step block` records a stop. `<name>` is
one of `plan`, `implement`, `review`, `document`, `submit`, `ship`, `verify-ship`, or `wrap-up`. A
stage write to a new value completes the open step, and a same-value stage write leaves it. `step set` traces every
call, so a repeated step is a new start. `step block` takes no argument and leaves the ledger as it is. It traces
`step block <step>` when a step is open and traces nothing otherwise. A `planned` re-init keeps the open step.
The review-step window reads the trace's step lines alone. It opens at a `step set review`. It ends at a `step clear`,
a `step block`, or a `step set` of another step. Each chain skill writes and clears its own step. Final-reviewer and
the checklist count only a `completed` dispatch end as a finished dispatch (ADR 0140, INV-0119).

`publish` and `adopt` (ADR 0042) mirror the ledger to the scope anchor's **published snapshot**, and
neither performs store I/O: slice-store I/O stays in-agent (ADR 0022). `publish --root <run-root>`
prints the ledger on stdout as a single `## Run state` section: that heading, then the ledger — its
`# Ledger — <slug>` title line dropped, every other byte untouched — wrapped between a
`<!-- superdev:run-state -->` line and a `<!-- /superdev:run-state -->` line. `adopt --root <run-root>`
reads a whole anchor body on stdin, takes the payload between those two markers, reconstructs the title
from the payload's own `**Branch:**` line, validates the result against the same schema (`Stage` against
the known set, every table row's 7 columns), and writes `<run-root>/ledger.md`.

The payload's boundary is marked, never inferred. `adopt` disregards every heading in the body — the
markers alone bound the payload, so a bare or fenced `#`-led line inside it, an unrelated markdown table
in a later section, or prose reusing `**Degraded:**`/`**Unresolved:**`/`**Deferred:**` elsewhere on the
anchor plays no part in the extraction and triggers no refusal. `lib/md-sections.js`'s `merge()` still finds and
replaces the `## Run state` section by that heading, unchanged: the markers sit inside the section that
heading bounds, so the section merge and the payload boundary answer different questions. Two fix cycles
on the previous, heading-inferred boundary moved the failure between a stray heading silently truncating
the payload and a false refusal on ordinary anchor content reusing ledger vocabulary — a truncated ledger
is itself a well-formed ledger, so no heuristic over the payload's shape, or over what follows it,
separated the two cases (ADR 0042).

The marker scan itself `require`s `lib/md-sections.js`'s `maskFencedLines` — the same function
`extractSection()` uses — rather than growing a second copy (ADR 0022's second-reader lesson). An HTML
comment renders invisibly, so a fence is the only way to *show* the marker syntax to a human at all
(documentation, an issue comment quoting a snapshot), and a shown marker is neither mistaken for the real
payload boundary nor counted toward the duplicate-opening-marker refusal. A body whose only marker pair
sits inside a fence therefore reads as carrying no real marker at all and refuses, rather than adopting
the fenced example as live state. An unterminated fence in the body refuses outright, the same posture
`extractSection()`/`merge()` already take, rather than guess where it would have closed and risk masking
a real marker past it. `adopt` refuses, writing nothing, when the opening marker is absent, when it
appears more than once (which payload to adopt cannot be resolved), when the closing marker is absent,
or when the closing marker precedes the opening one. It also refuses when the payload carries no
`**Branch:**` line (the heading cannot be reconstructed without it), when it carries no `**Stage:**` line (the
adopted ledger could never move its stage), when the run root's directory name
does not match the Branch line's slug, or when a ledger already exists at that root.

`status` also reports every scope's **staged knowledge-base pages** under `.superdev/kb-pending/`
(ADR 0023): a `pending publish:` note per scope, a scope with no run root as a row whose stage reads `no ledger`, a
non-`.md` file staged and ignored, and a `.md` file staged directly under `.superdev/kb-pending`
outside any scope directory. Each is a page `/superdev:publish-kb` would otherwise silently miss.

The stage machine's transition rules are enforced in its code, not in prose, and
`scope.js` detects any other write path after the fact (`### Run digest` below). `tests/scope-ledger.test.js` carries the retired
drift assertions along with scope.js's own behavior: the stage machine, the ledger schema and header
lines, a pre-CLI ledger parsing unchanged, and the scope-slug charset staying equal across `scope.js`
and `references/scope-mode.md`. A further pin, a shared function instead of a shared module, asserts, in `tests/scope-publish-adopt.test.js`, that `lib/run-state.js` and `lib/dod-line.js` still require
`maskFencedLines` from `md-sections.js` and declare no private function of that name, so a reintroduced
private copy of the masking rule fails this instead of only being caught by chance, on whichever
fixture happens to exercise the drift.

### kb-patch.js, the knowledge-base section merge (ADR 0027)

`kb-patch.js` is the deterministic half of a staged page's `action: patch`. It reads a live
knowledge-base page and a staged page carrying **one section**, prints the merged markdown on
stdout, and writes nothing. `/superdev:publish-kb` holds the backend credential and calls it.
`agents/doc-writer.md` stages the section and reaches no backend at all (ADR 0023). The merge lives
in code rather than in the command's prose so that a reader-facing page is not edited by a model
reading it. Its rules (`maskFencedLines`, `merge`, `headingKeyOf`) live in `plugin/lib/md-sections.js`, and `kb-patch.js` is their CLI.

The staged section names itself by the **first ATX heading in its body**, spanning to the next
heading of the same or higher level, so a sub-heading belongs to the section and a sibling ends it.
A heading may carry up to 3 leading spaces. That is CommonMark's own limit, because a fourth space, or
a leading tab, makes the line an indented code block instead. An indented live section is therefore
still recognised as a boundary and is never swallowed into the section ahead of it. The comparison that
finds the live section to replace requires a line to clear that same up-to-3-space gate before it counts
as a candidate at all. It then compares the line by a key that folds three surface spellings of one
heading into a single form: trailing whitespace, a closed-ATX form (`## A ##`), and the gap between the
`#` marker and its text (one space, several, or a tab). The key reads a staged heading as always
column-0, so a live target indented up to 3 spaces still matches instead of missing and appending a
duplicate. A 4-space or tab-indented line that merely *shows* the heading text in a code block never
matches, no matter how it reads once trimmed. Setext headings are unsupported as a section marker: one
notation is what makes "does the
live page carry this heading" a string comparison instead of a parse, and a staged body using one has
no ATX heading and refuses. A *live* page is never validated that way, so the merge separately refuses
when a setext underline falls inside the live region about to be dropped, rather than silently
swallowing that section into the replaced one. `extractSection()` applies the identical `hasSetextHeading()`
check to the **staged** body's own section, refusing there too, rather than accept a shape it merges
cleanly today and then refuses to ever patch again. That failure belongs on the staged file, which
a doc pass re-runs, not on the live page it would otherwise strand. Heading detection runs on fence-masked lines, by
`md-sections.js`'s `fenceOpener` and `fenceCloses`. `scripts/drift/lib.js`'s `maskFences` reads through the same rule, so a
`#` or `~~~` shown *inside* a fenced code example is never read as a heading, in the staged body, in the
live section being replaced, or by the duplicate-heading scan. An unterminated fence in either input
refuses instead of guessing where it would have closed, because it would otherwise mask every line
after it and hide real headings. The live page carrying that exact heading line has its section
replaced. A page without it gains the section at the end. Sorting is deliberately absent, because where
a new section belongs is editorial, and appending is correct for the ascending-number case
(`ADR summaries`) that motivated the ADR. Appending onto a live page whose trailing blank lines vary
collapses them to exactly one before the new section. That is harmless, since a blank-line run carries
no content.

The merge is **idempotent**: applying the same patch to its own output changes nothing, which is
what makes it safe under `/superdev:publish-kb`'s retry of a staged page whose call failed. It
refuses, nonzero and with a one-line stderr reason, in five cases. A staged body with no heading. A
staged body carrying content before its first heading, or more than one section, where a patch stages
exactly one. A live page carrying the heading more than once, because which section to replace cannot
be resolved, which is the same reason `/superdev:publish-kb` refuses two staged files sharing one
title. An unterminated fenced code block in either input. A setext underline inside the live region a
replace would drop, or inside the section the staged body itself stages. A CRLF live or staged page
merges exactly as an LF one does, the way `scope.js` reads a CRLF ledger.

Removing a single section is out of scope: `patch` replaces or appends, and `delete` still removes a
whole page (ADR 0027, Consequences).

`kb-patch.js` re-exports `merge` from `md-sections.js`. `lib/kb-apply.js`
requires `maskFencedLines` and `headingKeyOf` from `md-sections.js`, and detects two sibling staged
files naming the identical section heading before either one applies, rather than growing a second
copy of the key logic.

### md-to-storage.js, the Confluence storage conversion (ADR 0109)

`plugin/lib/md-to-storage.js` exports `toStorage(markdown)`, and has no CLI and no dependency. It is line-based, not
CommonMark. It covers ATX headings, paragraphs, hard breaks, nested lists, GFM tables, fenced code, block
quotes, rules, links, autolinks, images, and inline formatting, where emphasis wraps a whole link. A link or image
destination is `http:`, `https:`, `mailto:`, or scheme-less, and any other scheme renders the link text
alone. It escapes raw HTML and self-closes void
elements, so its output is well-formed XML for any input. Setext headings, indented code, reference links
and HTML blocks render as plain paragraphs. `tests/md-to-storage.test.js` checks each construct and runs a
tag-balance check on every output.

### publish-kb.js, the backend-independent knowledge-base publish (ADR 0069)

`publish-kb.js` is the fourth shipped CLI. `skills/publish-kb/SKILL.md` invokes it and relays its
report, and keeps no publishing mechanics of its own. It resolves the main checkout from any current
directory, a scopetree or a submodule included, through `mainWorkTree` from `plugin/lib/main-work-tree.js`
(`lib/kb-staging.js`). `publish-kb.js` is the CLI: it reads the arguments, wires the `lib/kb-*.js` modules together, and prints the report.
`kb-staging.js` holds the staging root and scope selection, `kb-backend-config.js` the backend classification and command templates (`parseBullet` reads the `Body format` and `Hierarchy` bullets),
`kb-frontmatter.js` the one frontmatter splitter, `kb-staged-page.js` the staged-page parse, the `created-by-publish` marker, and the `live-hash` rewrite (`restageLiveHash`), `kb-backend.js` the template runner and the
`upsert`, `delete`, and `patch` of one page, `kb-apply.js` the per-file application by title group, `kb-parent-link.js` the parent-link
edit under `- **Hierarchy:** links`, `kb-containment.js` the merge check,
`kb-read.js` the `--read` entry, and `kb-report.js` the report. They take `SLUG_RE` and `CHANGE_TYPES` from `plugin/lib/ledger.js`,
`refResolves` from `plugin/lib/git-spawn.js`, and `fail` from `plugin/lib/refusal.js`, and carry no copy of any of them.
This is what makes `.superdev/kb-pending/` resolve against the repository root, not one level too
deep, from inside `.superdev/scopes/<scope>/scopetree`. `--scope <slug>` selects which pending scope to
publish. Left out, the script publishes the one pending scope there is. It refuses when there is more
than one pending scope or none, and names every pending scope with its staged-page count on refusal.

It classifies `docs/agents/knowledge-base.md`'s `- **Backend:**` bullet. A `local` or `none` value
publishes nothing, since a local backend keeps its pages as repository files (ADR 0023). A remote
backend with no `## Commands` section refuses and names `/superdev:setup`. A remote backend that
carries one parses its five `### <verb>` subsections, `find`, `read`, `create`, `update`, and
`delete`, by heading name, never by position. A fenced block inserted or removed elsewhere therefore
never shifts which template a later verb reads. A subsection whose fence opens and never closes refuses with `unterminated fenced code block in ### <verb>`, and a tilde fence or a longer opener reads through `md-sections.js`'s fence rule like every other Markdown reader. Each template runs under `sh -c`, `sh` resolved from PATH (ADR 0150). Every value
passes to it as one JSON file named by `$1`, never interpolated into the command string. The file holds the call's values, the
`find` result's fields under `found`, and the `knowledge-base` section of the operator configuration under `operator`. A title carrying
a quote, a `$`, a backtick, or a newline therefore reaches the backend unchanged and starts no shell of
its own.

Every template runs under a **30-second bound** (ADR 0130), applied at `runTemplate`'s own `spawnSync`
with `killSignal: 'SIGKILL'` — the same shape `judgeContainment` in `plugin/lib/containment.js` (the function `testContainment` delegates to) bounds its `git fetch`
with. The bound sits in the script rather than in the templates, so it covers an operator-written
template carrying no `curl --max-time` of its own. `knowledge-base.timeoutMs` of the operator configuration overrides it. `liveTemplates` in
`lib/kb-backend-config.js` reads the section and the bound once per publish and carries them on the `templates` object, so a
backend returning `timeout_ms` cannot rewrite the bound from the wire. A value that is not a whole number from 1 to 2147483647
reads as absent, never as "no bound" or "kill at once".

**A timeout stops the batch, and nothing else does.** `processStagedFiles` walks the title groups and
breaks on the first result carrying `timedOut`, reporting every remaining file as `untried` and leaving
all of them staged. A host that black-holes one call black-holes the next, so continuing would spend the
bound once per staged page and reproduce the hang the bound removes. `spawnFailure` is the single site
that tells a timeout from any other `res.error`: a `maxBuffer` overflow and a shell that will not start
say nothing about the host, so each still fails only its own page.

`find`'s exit code is the contract the other four verbs rest on (ADR 0069's table). Exit `0` with a
JSON object on stdout means `found`, and each key in that object reaches the later verbs under `found` in their values file. Exit `3` means `absent`, the only verdict that may create a page. Any
other exit means `unknown`, which leaves the page staged instead of guessing. `action: upsert` finds,
then creates or updates. `action: delete` finds, then deletes, or reports `already-absent` when `find`
already answers `absent`. `action: patch` requires a `read` template, since a backend declaring none
leaves every `patch` page staged. It also refuses, leaving the page staged with the reason reported per
page, when `classifyBackend` resolves a `- **Body format:**` configuration bullet that names anything
other than markdown (absent means markdown): `kb-patch.js` merges by matching markdown ATX headings, and
a page stored as something else (Confluence's `storage` XHTML) would otherwise take an unrendered
markdown section appended to it on every publish (ADR 0027). Otherwise, `patch` reads the live body,
merges the staged section into it through `kb-patch.js`'s exported `merge()`, and creates or updates with
the merged result. A `read` call that returns no body for a title `find` did list counts as a read
failure, never as an empty live page. It therefore never wipes an aggregate page's other sections (ADR
0027, 0069).

**A `storage` body format converts the whole page before `create` and `update`** (ADR 0109).
`processFile` hands the upsert's temp body file `lib/md-to-storage.js`'s `toStorage()` output when
`templates.bodyFormat` is `storage`. Every other body format receives the staged body byte-identical
(INV-0109). A staged page's optional `parent:` names the title of the page it belongs under. A backend nests
or links, by the `- **Hierarchy:**` bullet of `docs/agents/knowledge-base.md` (ADR 0168). `classifyBackend`
reads the bullet through `parseHierarchy`, a wrapper over `parseBullet`, and an absent bullet means nesting.

**Nesting (the default).** `resolveParent` looks the parent title up through `find` on the create path
only, and passes the id as `parentId`. An `absent` or `unknown` parent leaves the page
staged, with the parent named in the reason. A `create` template that never mentions
`parentId` leaves a parented page staged with a reason naming the fix, and resolves and
creates nothing. `parentsFirst` orders the title groups by their depth in the batch's own parent chain,
so a parent staged in the same batch is created before its children.

**Links (`- **Hierarchy:** links`).** The wiki nests no pages, so a child is reachable only when a list
item in its parent's body links it. `nestingParent` withholds `parent:` from `resolveParent`, and
`parentId` is never set. A staged page that names a `parent` also carries `parent-section`
(the text of one ATX heading in the parent) and `parent-link` (one list-item line whose link text is the
page's title). `parentLinkRefusal` refuses a page that names itself, lacks either key, carries a
multi-line or non-list-item `parent-link`, or whose link text does not equal the title. The link text, an
inline link's target, and a wiki link's alias are each read up to a 1000-character cap, so a line of
unclosed brackets scans in linear time and a longer title or target never matches. A `parent-link` whose
target holds `{sub_url}` takes the value `find` returns for the page in its optional `sub_url` key. A `find` result whose optional `type` key reads
`folder` marks a container: `kb-backend.js` refuses an upsert or delete for it, naming the folder (ADR 0069). The
value must stay in the URL-safe character set (`fillLinkTarget(parsed, templates, fields)`, an export of
`kb-parent-link.js`), and the fill runs only once the live
parent lacks the link. A page that landed with no `find` fields on hand gets a fresh bounded `find`.

`editParent` reads the live parent through `find` and `read`, applies a one-line edit, and writes the
result through `update` under the parent's own title (INV-0164). Every other byte of the parent stays as
read, line endings included. `preflight` in `kb-apply.js` refuses a parented page under `links` whose body format is not
markdown (`markdownRefusal`) before any backend call, a delete included. A markdown link line
cannot be written into or removed from `storage` XHTML. The page is never sent, and the report reads
`not linked` or `not unlinked`.

- **Add.** `addParentLink` inserts the `parent-link` line after the last top-level list item of the named
  ATX section's own content, ahead of any subsection heading. A top-level item is the section's first list
  item, or an item indented less than the content column of the top-level item above it. The line follows
  every line that item carries: a nested item, a continuation line, a lazy continuation line directly below
  the item's text, and fenced code to its closing fence, blank lines between them included. A tab expands to
  the next tab stop when `carriedEnd` reads an indent. It changes nothing when a list item outside fenced code anywhere
  in the parent already links the title, matched by link text and not by target spelling. That check reads an
  item's indent by column too (`listItemFlags`): an item at column 4 or deeper counts only inside a list run, where
  the nearest earlier non-blank line is an item or a continuation at column 2 or deeper, and after a paragraph it is
  indented code. A section whose own
  content holds no list item takes the link as its first list item, one blank line below the heading. One blank line
  follows the link when the next line is not blank. A missing or repeated heading, or an unclosed fence,
  refuses the edit.
- **Delete.** `removeParentLink` removes the first list item in the named section whose single link has
  the title as its text. An item that carries a nested item, a continuation line, a lazy continuation
  line, or fenced code is kept and reported. Every other reference to the title, whether an inline link
  elsewhere, a reference link, or a wiki link, stays and is reported kept. When it removes the only list
  item of the section's own content, nested items counted, one blank line below the heading, it also
  removes that blank line, and leaves the blank line the add wrote below the link above a following paragraph. It
  removes the line end an add appended to a heading that was the unterminated last line too. A delete whose parent `find`
  answers `absent`, or whose parent body is empty, writes nothing.

A page is reported published only once its link holds (INV-0170). A page that landed and whose link did
not is reported `not linked: <title> — <reason> — fix: <fix>`. A delete whose unlink did not land is
reported `not unlinked: <title> — <reason> — fix: <fix>`. Each report keeps the staged file, so the next
run retries the link. An `upsert` that landed but was not linked rewrites the staged file's `live-hash` to the body
the run sent (`restageLiveHash`, called by `settle`), so the retry's guard does not refuse the page for the run's own write.
Each other reference to a deleted page prints `link kept in parent "<parent>": <line>`. A timeout in the
parent edit stops the batch, as every other bounded call does (ADR 0130).

Two or more staged files sharing one title are the aggregate-page case, since a `patch` filename is
`<title-slug>--<section-slug>.md` and an outline entry's sections arrive as sibling files.
`processTitleGroup` applies each file in turn, re-reading the live page as it then stands, so the
second file's merge sees the first file's own section already landed. It leaves both files staged and
unresolved when two siblings name the identical section heading. A group where not every file carries
`action: patch` is ambiguous, and nothing in it publishes. A staged file's backend call landing is
what deletes it. A call that fails leaves the file staged, so the next run retries exactly what did
not make it. A malformed file (no frontmatter, no title, or an unknown action) is reported and left
untouched. A timeout on one sibling stops the rest of that group untried, the same stop the outer
batch loop applies between groups (ADR 0130, time-bound). A host that black-holes one call
black-holes the next, regardless of which loop is calling it.

`--read <title>` is a read-only entry (ADR 0094, INV-0091), invoked directly rather than through
`run()`'s scope-and-staging path: it resolves the backend the same way, then runs `find` and `read`
under the same bound as every other call, and never writes to it or moves a staged file. It prints
`{"title","exists","body","hash"}` as one JSON object on stdout — `hash` the sha256 of `read`'s
stdout, normalised for CRLF and a trailing newline, so two reads of an unchanged page agree — and a
page `find` does not find prints `exists: false` and exits 0, never as a refusal. A backend
declaring no `read` template, a failed call, or an exhausted bound each refuse with a one-line
reason, the same shape `main()`'s `isRefusal` catch already gives every other refusal.

A staged `upsert`'s frontmatter may carry the `live-hash` key: the hash of the live body the page
was staged against. Before an `upsert` replaces a page `find` reports as already existing,
`publishUpsert` checks that recorded hash against a fresh `read` of the live page (`checkLiveHash`)
and refuses — leaving the page staged, with the refusal reported per page exactly like any other
`left-staged` reason — when the recorded hash differs from the live one, or when the staged page
carries no recorded hash at all: a writer that never read the live page has nothing to check an
overwrite against, so it is refused precisely like a mismatch, never treated as leave-it-blank means
overwrite-it-blind. A backend with no `read` template refuses the same way, since the check cannot
run at all. `action: delete` and `action: patch` are untouched by the guard.

Before a hashless `upsert` finds the page absent and sends `create`, `markStagedCreate` writes a
`created-by-publish: <ISO-8601 time>` line into the staged file's own frontmatter, ahead of the
`create` call — a call this same run then sends. A create killed after it lands leaves that marker
on the staged file that survives it, so a later run whose `find` locates the page reads the marker
and sends `update` directly (ADR 0130), never the hash guard and never a `read` call. A hashless
`upsert` `find` reports existing, carrying no marker, is refused exactly as before: only a page this
run itself just created skips the guard.

Before publishing, `checkContainment` refuses a scope whose branch is not confirmed merged into
`docs/agents/code-management.md`'s base branch. It resolves the branch from the ledger's
`**Branch:**` header, falling back to the same branch-shape scan `hooks/scope-prune.js` applies. A scope
whose branch and run root are both gone reads as contained rather than as a refusal: `hooks/scope-prune.js`
reaps the two together, and gates that reap on the branch already reading contained in base or gone, so
their joint absence is the fully-reaped steady state a publish meets (ADR 0071). A run root that survives
without a resolving branch is the real unreachable case, and still refuses. A branch listing can fail in four
ways. `git for-each-ref` can exit non-zero, end by a signal, fail to start, or end in another spawn error such
as ENOBUFS. Any of these is no absent branch. The check refuses and names how git failed, whether or not the run
root survives (INV-0194). A ledger `**Branch:**` line that resolves never runs the listing. `checkContainment`
delegates the ancestry test to `plugin/lib/containment.js`'s exported `judgeContainment` (or `testContainment`) instead of reimplementing it.
`--allow-unmerged` overrides a containment refusal once the operator confirms. It does not override the refusal of an unreadable `code-management.md`. `_adhoc`, the literal value
`/superdev:document` writes for a doc pass outside a live scope, skips the check entirely. The report
a run prints never carries a page's body, only filenames, titles, and reasons.

The module guards its CLI entry with `require.main === module`. It exports `resolveMainCheckout`, `classifyBackend`,
`parseCommandsTemplates`, `parseStagedPage`, `runFind`, `addParentLink`,
`removeParentLink`, `parseBaseBranch`, `parseRemote`,
`hashBody`, and `run`, and `timeoutMs`. Every export but `run` comes from the module that holds it. The suites exercise the CLI through its exported
`run()`, the way the `tests/scope-*.test.js` suites exercise `scope.js`'s own CLI verbs (ADR 0059), and split by topic over `tests/publish-kb-setup.js`
(ADR 0151): `publish-kb` (the pure readers and the pin that the publish code keeps no copy of what `lib/` owns), `publish-kb-scope` (backend
configuration refusals and scope selection), `publish-kb-publish` (`upsert` and `delete` end to end), `publish-kb-patch`, `publish-kb-guard` (the live-hash
guard, the storage body, and `parent:`), `publish-kb-parent-link-<topic>` (the parent link under `- **Hierarchy:** links`: add, delete, hang-add, hang-delete, placeholder, pure, and refused;
`pure` calls `addParentLink` and `removeParentLink` directly to pin the link-line readers), `publish-kb-containment`, `publish-kb-read`, `publish-kb-timeout`, and `publish-kb-templates` (the backend templates this repository ships).

### run-tests.js, the suite runner

`node scripts/run-tests.js` runs every suite under `tests/` and the tail; `package.json` carries no test script. It discovers the suites under `tests/` by
name: every `*.test.js` file directly in that directory, in name order, so a suite added to the tree runs
with no roster edit. The suites start longest first by the durations the last run recorded in
`node_modules/.cache/run-tests.json`, a suite with no recorded duration first of all, and in name order where no
record orders them. Each run merges what it measured into that file. A helper (`spawn-verdict.js`, `linear-time.js`), a shared setup file (`tests/*-setup.js`), and a subdirectory
(`tests/fixtures/`) are not suites. It runs each suite under `node`, then the fixed tail: `invariant-check.js
--root .`, `drift-check.js --selftest`, `drift-check.js`, and `claude plugin validate ./plugin`. The steps, suites and tail alike, run
concurrently. The runner keeps as many going as `os.availableParallelism()` reports, each in its own process group.
A full run starts every suite and every tail step on every call. It gets faster by running steps at the same time and
by cheaper setup, never by running fewer of them; `tests/run-tests.test.js` asserts that a full run starts them all.
It prints a step's output whole when that step ends, so the output of two steps never interleaves.

Every step that finishes prints one `run-tests: <label>: <ms> ms` line. `docs/agents/verification.md` names it as the
repository's timing command. The line measures the wall clock from the step's start to its end. Under concurrency that
span includes the time the step waited for a CPU that other steps held. A step's line in a full run is longer than its
time alone, and the lines add up to more than the run's wall clock. To rank suites by their own cost, time each alone:
`time node tests/<suite>.test.js`.

The first failing step ends every running step with its processes. The runner starts no further step, prints which
suite or tail command failed, and exits nonzero. Each step the runner ended prints one `run-tests: <label>: cancelled`
line, with no output and no timing line. A step that had already exited on its own prints its output and result as
usual. A SIGINT, SIGTERM, or SIGHUP, and a write error on stdout, end the running steps the same way. A child that was
killed, never started, or whose spawn threw counts as a failure (INV-0009).

The kill reaches each step's process group, so a descendant that starts a group of its own escapes it. On Windows a
negative pid names no process group, so no failure or signal ends a running step there. The run still exits nonzero
once every step ends (ADR 0150).

The suites carry a requirement the runner relies on: a suite builds each fixture repository once per process
(`templateOnce` in `tests/fixture-git.js`) and copies it per case (`copyFixture`), so no case rebuilds it. Measured
cost, including the machine and the Node build, is in `docs/agents/verification.md`: about 90 s for the full run on
Node v26.12.1, against about 375 s for the suites run one after another. A `tests/` directory holding no suite prints
`no suite found` and exits nonzero.

`node scripts/run-tests.js --related <path>...` is the focused mode, the second fence of
`docs/agents/verification.md`. The tail always runs. `selectSuites` picks the suites the repository-relative
paths reach, matching by name, so a deleted path maps like any other. A suite is reached when its own text
names the changed file (its basename, or its bare stem between path or quote delimiters), when the shipped
file its name pins (`plugin/hooks/<name>.js`, `plugin/lib/<name>.js`, `plugin/scripts/<name>.js`, or `scripts/<name>.js`) is the
changed file or requires it, or the suite file itself requires it, or when the path is the suite itself. A path under
`scripts/drift/` is the exception to the naming rule, because its basename and stem (`lib`, `checks`, `adr`) are
common path segments. Two kinds of suite reach it. The first requires it, directly, through its pinned file, or through
the modules the walk follows. Those modules are `plugin/lib/` files, `scripts/drift/` files, and non-suite files under
`tests/`. The second holds its full repository-relative path (`scripts/drift/lib.js`) in its text. A drift path no suite reaches selects no suite and never
every suite, because the drift selftest runs in the tail. A suite split off another
(`tests/scope-ledger.test.js`, with no `scope-ledger.js` entry point shipped) pins the file of the longest
`-`-delimited prefix of its name that pins one (`plugin/scripts/scope.js`), and an exact pin wins. A test helper reaches every suite that names
it. A basename more than one file of the tree carries (`AGENTS.md`, `hooks.json`; a nested checkout such as a linked
worktree under `.claude/worktrees/` does not count) names a file only through a directory part its path ends with: the
path text before the mention with `./` and `../` dropped, or the literal arguments before it in a `path.join` call. A
bare mention of such a basename names the file at the repository root. A `.md` path follows the same naming rule, because a suite may execute or pin a document,
with one narrowing: its basename counts only where it ends a string outside a comment, and only in a path anchored the
way a named directory is (below): a `./` or `../` string (`'../docs/x.md'`), or a literal argument of a join from
`__dirname`, a `./` or `../` literal, `path.dirname(...)`, or a variable the suite's text assigns one of those or a
`require.resolve` of a relative path (`const repo = path.join(path.dirname(scopePath), '..')`). A comment citation
(`// (AGENTS.md, ADR 0086)`), a sentence of fixture text, a bare relative string (`'docs/agents/verification.md'`), and a
join from any other value (`path.join(S3, 'docs', 'agents', 'verification.md')`) build no read of the repository's file (
`tests/publish-kb-templates.test.js` runs the templates of `docs/agents/knowledge-base.md`, `tests/scope-ledger.test.js` pins a
sentence of `plugin/references/scope-mode.md`). A `.md` path also reaches a suite whose text names a directory
holding it, because a suite that lists or scans a directory reads every document in it
(`tests/run-trace-model.test.js` lists `plugin/agents/`, `tests/invariant-check.test.js` scans `plugin/`). A named directory
is a `./` or `../` path string that resolves from `tests/` to a directory of the repository, or the literal segments of
a `path.join` or `path.resolve` call. A call whose first argument is `__dirname` or a `./` or `../` literal is anchored at
`tests/`. A bare relative literal (`'docs/agents'`, `path.join('docs', 'agents')`) names nothing, because suites build
their fixture trees from such paths. A suite that scans a repository directory through a bare cwd-relative literal
is therefore missed, so a suite names a repository directory from `__dirname` or with `../`. A call whose leading
directory is `path.dirname(<name>)`, where the suite's own text assigns `<name>` a `require.resolve` of a relative path
(`const hookPath = require.resolve('../plugin/hooks/run-trace.js')`), is anchored at that path's directory. Any
other `path.dirname(...)` names its literal tail, which matches that tail at any depth, so
it may select a suite for a directory the suite does not scan and never misses one it does. A call whose leading
directory is any other computed value (a variable, `os.tmpdir()`) builds a path in a fixture tree and names nothing. A directory built from
computed expressions with no literal segment names nothing. The directory rule never applies to a code path. A `.md` path no
suite names, directly or by directory, reaches no suite. A code path no rule places runs every suite, except a deleted one no suite names, which reaches no suite, except the repository-root release tooling
(`release.config.cjs`, `package.json`, `bun.lock`, the `RELEASE_TOOLING` list), which reaches only the suites that name it,
because semantic-release and Bun read it and no suite's code under test does. An empty list runs the tail alone and exits 0. A path under
`mods/superdev-view/` places itself: it adds `claude plugin test mods/superdev-view` before the tail, and runs no
other suite unless one names it. The full run
never runs the mod suite. The
`require` scan is a regex over relative `require` calls, wherever the call sits. It follows the edges from the
suite file and from its pinned file, and continues through a `plugin/lib/` module or a shared setup file under
`tests/` (a cycle ends the walk). It stops at any other file, a hook or script having a suite of its own. A focused run is never a full suite
(INV-0017).

The runner accepts three forms: no argument (the full run), `--related` as the first argument followed by paths
(the focused run), and `-h` or `--help` (the usage on stdout, exit 0). `-h` or `--help` anywhere among the arguments
asks for help, ahead of any refusal. Every other argument is refused: an unknown flag (`--relatd`, `--related=a.js`), a
word before `--related`, and after it a dash-led word (a second `--related`, `-`, `--`) or an empty path. A dash-led
path therefore cannot be passed, and no `--` separator exists. A refusal prints `run-tests: unknown argument: <arg>`
and the usage on stderr, and exits 2. An empty argument is named `(empty argument)`.

`--related` takes repository-relative file paths. A backslash separator reads as a forward slash on every host (ADR
0150), so `plugin\lib\x.js` selects what `plugin/lib/x.js` selects. A path that does not exist maps like a deleted
file.

The runner refuses three kinds of path. The first is an absolute path in any spelling: POSIX `/…`, a Windows drive
`C:\…` or `C:/…`, a Git Bash drive `/c/…`, or a network share `\\host\…`. The second is a path that leads outside the
repository, such as `../x.js`. The third is a path naming an existing folder, which includes `.` and a symlink to a
folder. One such path refuses the whole call.

The refusal prints `run-tests: --related takes repository-relative file paths: <arg> (<reason>)`. `<reason>` is
`absolute`, `outside the repository`, or `a folder`. The usage follows on stderr, and the exit code is 2. Help and a
refusal start no step and write no recorded durations.

Its suite is `tests/run-tests.test.js`, which calls `discoverSuites`, `selectSuites`, `parseArgs`, and
`runAll` against throwaway trees it removes at the end. It drives the CLI end to end from a copy of the runner in a
throwaway tree, never against this repository. It carries no roster of this repository's suites. The
tail is exported as `TAIL`, so a suite reads it instead of matching the runner's source text.

### invariant-check.js, the invariant register validator (ADR 0093)

`node scripts/invariant-check.js --root <dir>` validates `<dir>/docs/invariants.md`. `node scripts/run-tests.js` runs
it with `--root .`. The maintainer also runs it by hand against another repository's register, so it
takes the root as an argument rather than reading its own checkout. It prints one line per
failure, `<id>: <field>: <reason>`, then a summary, and exits 1 on any failure. A root with no register
file at all exits 0 and says so; a register file that exists but parses to zero entries — an empty
file, a file whose encoding reads as garbage (a UTF-16LE file, since the CLI never sniffs an encoding),
or one whose every heading is blockquoted or indented — fails instead, as `(register): id: no
\`### INV-NNNN\` entry found`, rather than passing as "0 entries hold". A missing or non-directory
`--root` exits 2 with usage.

It checks these kinds of rule:

- **Format.** `Class`, `Concepts`, `Statement` and `Breaks` are present. `Class` and `Statement` each
  carry a word once unquoted: a letter or a digit, in any script. `-`, `—` or `_` fails as carrying no
  word. `Concepts`, and `Paths` or `Symbols` when their line is present, each name at least one comma-separated item
  once trimmed. An empty `Paths:` or `Symbols:` line and a bare `,` fail as naming no concept, path, or symbol. An entry
  with no `Paths:` line passes. A `Breaks:`
  value is `silently` or `loudly`, matched case-insensitively, optionally followed by ` — ` and a
  reason and nothing else — anchored, so `loudly, silently` fails rather than passing as loudly and
  skipping the `Check:` requirement. Any other shape fails too. A reason after the dash carries a word. `silently —`
  and `silently — .` fail as carrying no reason, and a bare `silently` passes. A `Breaks: silently` entry carries
  `Check:`, its backticks stripped before the check, and the three ways it can fail each name a
  different reason: missing fails as naming no proof at all, and `` `none` `` (bare or backticked)
  with no reason fails as needing the reason nothing cheaply tests it. `none` wrapped in any other
  punctuation (`*none*`, `"none"`, `(none)`) fails the same way. A value with no letter or digit
  once unquoted (`-`, `_`, empty backticks) fails as naming no proof; `TBD` stays legal content. No id
  repeats. An entry is a `### INV-NNNN` heading — exactly three
  `#`, `INV-` and four digits, nothing else on the line — and the `Key: value` lines under it, in any
  order, and a heading may follow the previous entry's last field with no blank line. A heading that
  mentions an id (case-insensitive `INV-` plus digits) but is not exactly that form fails, naming the
  heading text, rather than silently dropping every field under it — this also covers a heading
  missing its required space (`###INV-0002`) or carrying leading whitespace (` ### INV-0002`), neither
  of which either heading pattern recognises: instead of falling through as a field line on the entry
  above, each is caught by the non-field-line rule below. Outside any entry, a `Key: value` line fails,
  naming the line, and so does any other line that — once leading whitespace, `>` blockquote markers
  and list markers are stripped — still begins with a heading marker or a field-like shape and mentions
  an invariant id: this catches a retired entry left blockquoted or indented under a non-`INV` heading
  (e.g. `## Retired`) instead of silently dropping it. The register's own title and intro prose cite no
  id, so this narrower, heading-or-field-shaped test never flags it. Inside an entry, a non-blank line
  that is not a `Key: value` field line fails, naming the entry and the line, rather than silently
  reparenting onto the entry above. A field key repeated inside one entry fails as appearing twice,
  naming the entry and the key, and the first value is kept rather than overwritten. A field key that
  is not one of the seven the format names — `Class`, `Concepts`, `Statement`, `Breaks`, `Check`,
  `Symbols`, `Paths` — fails, naming that key, so a misspelling like `Path:` or `Symbol:` is never
  silently ignored; a key matching one of the seven case-insensitively but written in the wrong case
  (`paths:`) is reported as such, naming the correct spelling, rather than as an unrecognised field.
  CRLF reads as LF, and a leading byte-order mark is dropped before parsing.
- **Resolution.** Every `Concepts` value equals a glossary term — the bold text opening a line, or a `- `/`* `
  list item, of any `CONTEXT.md` the walk reaches, so a multi-context repository needs no map parser. Every `Paths` glob
  matches a file. Every `Symbols` value appears as a whole word in the files the entry's `Paths` match, or
  anywhere but the register when the entry carries no `Paths:` line. An empty `Paths:` line governs no file and never
  widens that scope. A dotted symbol matches on its last segment. A symbol with an empty segment fails, because its
  pattern would match any file. `foo.`, `a..b`, and empty backticks are such symbols. Every path-shaped token in
  `Check:` names a file inside the root, and four kinds of token fail.
  - A path that leads outside the root, such as `../x.js`, fails even when the file exists.
  - An absolute path fails the same way. It is rooted at `/`, at `~/`, or at a drive (`C:/`, `C:\`).
  - A path rooted at a variable fails once, as starting at a variable. `${CLAUDE_PLUGIN_ROOT}/scripts/a.js`,
    `$HOME/a.js`, and `$(cmd)/a.js` are such paths.
  - A path-shaped token holding a glob character (`*`, `?`, `[`, `{`) fails, because `Check:` names literal files and
    the validator expands no glob there.

  A token needs a `/` to be path-shaped, so bold prose such as `**Branch:**` is no glob. Bold markers around a path
  (`**scripts/a.js**`) and link syntax (`[scripts/a.js](scripts/a.js)`) are no glob characters. Drift ids and quoted
  test names are prose and stay unchecked.
- **Citations.** Every `INV-NNNN` cited in a walked file names an entry the register carries, so
  retiring or renumbering an entry cannot leave its citations silently stale. A citation is `INV-` and
  four digits. No letter, combining mark, or digit, in any script, may sit directly before `INV-`, and no digit after the
  four digits. So `_` or punctuation on either side does not hide it, and an unrelated id such as
  `SINV-2024` stays out. A stale citation fails as
  `<id>: citation: cited at <file>:<line>, …`. The register itself, `CHANGELOG.md` and every file under
  `docs/adr/` are not scanned. The changelog is release-managed and an ADR is superseded rather than
  edited, so a stale citation there is dated history that no edit can fix.

The walk prunes `.git/`, `node_modules/`, `.superdev/` and `.claude/` — the last because
`.claude/worktrees/` holds whole repository copies with their own `CONTEXT.md`, and the walk reads
no `.gitignore`: an ignored file outside the pruned directories still counts toward `Concepts`,
`Paths`, `Symbols` and citations. Parsing `.gitignore`, or shelling out to `git ls-files`, is out of scope — the
CLI is deliberately pure Node with no shell-out. It builds relative paths with `/` itself, so
a glob matches the same files on every OS. `globMatcher` is its own, because its semantics are what the register's `Paths:` field means. `**` spans segments, `*` and `?` stay inside one, and braces and character classes are literal. The validator filters and ranks no entry — `/superdev:plan` and
`final-reviewer` still read the register whole (INV-0088) — and nothing under `plugin/` requires it
(INV-0051). Its suite, `tests/invariant-check.test.js`, runs the CLI against throwaway repositories under
the OS temp dir, every spawn through `assertSpawnDecided` (INV-0009).

### drift-check.js, the mechanical-fact and forbidden-form checks (ADR 0153)

`drift-check.js` is the entry point only: it walks the check registry and reports. The checks themselves
live beside it, in `scripts/drift/`.

| File | Owns |
|------|------|
| `drift-check.js` | the CLI: `runChecks(checks, root)` (the per-check walk, catching a thrown `run()` as that check's own `threw` result instead of letting it crash the walk), `formatGap` (a missing-document gap printed by path, every other gap by its check's own format), `main()`, the ok line, the exit code, and the `--selftest` handoff. Guards its CLI dispatch with `require.main === module`, so a `require` of the file (the selftest's own import) runs neither branch |
| `drift/checks.js` | the **registry**, one entry per check: `id`, `run`, its `ok` phrase, and how one gap prints, plus `contracts` on a table-driven check |
| `drift/contracts.js` | the contract tables and patterns. Data only |
| `drift/scanners/` | the bespoke scanners, every check whose assertion is more than one pattern over one document. `index.js` is the barrel `checks.js` and the selftest require. One file per topic holds the scanners: `references.js`, `adr.js`, `prose-avoid.js`, `shell-spawn.js`, `base-branch-ship.js`, `marketplace-readme.js`, `register-join.js`, `root-inventory.js`, and `test-seams.js`. `walkers.js` holds the document walks and the absence-check shape they share |
| `drift/lib.js` | what they share: `maskFences`, `maskedSentences`, `normalizeWhitespace`, `docPath`, `readDoc`, `missingDoc`, `observeContracts`, `scanContract`, and `stripComments`. `maskFences` blanks every fenced block to spaces, keeping each line's length, and reads fences only through `plugin/lib/md-sections.js`'s `fenceOpener` and `fenceCloses`. An unclosed fence masks to end of file. `scanContract` runs a table of `[document, pattern, expectation]` rows against fence-masked text. A row carrying a fourth element `{ fenced: true }` tests the unmasked text, for a heading that exists only inside a fenced template. `stripComments` removes `//` and `/* … */` comments wherever they sit, and an unclosed block comment runs to end of file. It keeps a comment marker inside a string, a template literal, or a regular-expression literal |
| `drift/selftest/` | `index.js` (the `fixture` helper, `found`, `realRoot`, temp-dir cleanup, and the coverage assertion) plus one suite per scanner topic, named for its file in `drift/scanners/`. Further suites are `lib.test.js` (the shared helpers), `contracts` (the table-driven checks), `checks` (every registered check against an empty tree), `observation` (the coverage observation itself), and `drift-check` (`runChecks` and the registry wiring). `coverage.js` is the coverage verdict helper |

Every check tests a mechanical fact — a link or section target resolves, a number is unique, a file or
command exists, a property of code or configuration holds — or forbids a form in shipped prose or in the root `AGENTS.md` (ADR 0153).
No check asserts how a positive clause is worded. A check that reads a named document fails, naming the
path, when that document is missing. A check that walks a directory reads whatever the directory holds, except every `AGENTS.md` at any depth: `walkFiles`, `proseDocuments`, and `agent-tool-agnostic` skip it (ADR 0189). No check reads a `README.md`.

| Check | What it tests | Class |
|-------|---------------|-------|
| `reference` | every `references/*.md` path that `skills/`, `agents/`, or `references/` names exists | structural |
| `heading-citation` | every "`<file>.md`'s `## Heading`" citation (heading level two to four) in `skills/`, `agents/`, or `references/` prose names a heading the cited file carries at that level. A line break in a citation reads as one space, so a wrapped heading matches. A heading matches by `md-sections.js`'s `headingKeyOf`, the key `scope.js section` matches by. A heading inside a fenced block is no heading. A cited file with an unterminated fence is one gap, whatever it is cited for. A bare file name resolves in `references/`, then `agents/`, then the repository root. A file that resolves nowhere is a finding too. The exception is a `references/<name>.md` path, which the `reference` check reports. A section-map entry (a list item of a file name and its headings) counts as a citation of each heading it lists | structural |
| `source-sections` | `plan-contract.md`, `plan-authoring.md`, `store-records.md`, `test-selection.md`, `content-types.md`, `controlled-prose.md`, `review-checklist.md`, `review-design-lenses.md`, `prompt-concept-overlap.md`, `prompt-prose-form.md`, and `scope-branch.md`'s `## Pushing the scope branch`, and each agent body another file cites by heading, still carry each section a reader is sent to, by heading. The row also fails when `controlled-prose.md` carries a `##` heading outside the set `prompt-prose-form.md` lists as applied or exempt | structural |
| `command-resolution` | every `/superdev:<name>` a skill or agent names has a `skills/<name>/SKILL.md` | structural |
| `governed-skill-files` | every backticked path in `CONTEXT.md`'s **Prompt concept** entry, the list of governed files, names a file (ADR 0190, ADR 0270) | structural |
| `audit-set-globs` | `docs/agents/documentation.md` carries `## Audit set`, and every pattern listed there matches a file | structural |
| `marketplace-source` | each `.claude-plugin/marketplace.json` source resolves to a tree carrying `.claude-plugin/plugin.json`; a `git-subdir` source names this repository's clone URL and pins `ref` to `v` plus that tree's version | structural |
| `adr-numbers` | no two ADRs in `docs/adr/` share a number | structural |
| `adr-status` | every ADR carries a `**Status:**` line with a recognised value outside a fenced example | structural |
| `adr-relations` | A relation header sits anywhere in an ADR's header block, from its title to its body, above or below `**Status:**`. Above it only the relation labels open a header. Every ADR link (link text `ADR NNNN`) in a relation header names an existing ADR that carries the reverse header. Every other `AGENTS.md` link in a `**Superseded by:**` header names an existing file, where a setup decision moved to a working rule. A header whose links are all such `AGENTS.md` links needs no ADR link, even where its prose mentions an ADR. `**Status:** Superseded` goes with `**Superseded by:**`. | structural |
| `invariant-register-join` | every drift id a `docs/invariants.md` `Check:` line names is registered, and every invariant a contract row cites covers that row's document in its `Paths:` | structural |
| `run-root` | the execution documents address run-root artifacts by `<run-root>/…`, never by a checkout-relative `.superdev/scopes/<scope>/…` path | prohibition |
| `scopetree-run-root` | `skills/ship/SKILL.md`, `skills/document/SKILL.md`, and `scripts/publish-kb.js` address another run's scopetree by `<run-root>/scopetree`, never by a checkout-relative path (ADR 0080) | prohibition |
| `change-type` | `references/scope-mode.md`, `CONTEXT.md`, and `lib/ledger.js` carry the same change-type set, each in its own frame, so a copy with an extra or a missing type fails | structural |
| `no-second-reader` | no file under `plugin/hooks/` builds a ledger-header regex of its own, and no file under `plugin/lib/` other than `ledger.js` does (ADR 0022) | prohibition |
| `shell-spawn` | no file under `plugin/hooks/`, `plugin/scripts/`, or `plugin/lib/` starts a shell by absolute path, starts `bash`, or uses Node's default shell (INV-0153) | prohibition |
| `worktree-list-one-parser` | no file at the top level of `plugin/hooks/`, `plugin/scripts/`, or `plugin/lib/` other than `lib/git-spawn.js` spawns `git worktree list` (a `'worktree', 'list'` argument pair outside a comment), so `listWorktrees` stays the one reader of the working trees (INV-0198) | prohibition |
| `test-seams` | no JavaScript file at any depth of `plugin/` names a file of the repository's `tests/` directory by base name or by a `tests/` path that carries a glob (`tests/scope-*.test.js`), and none reads `process.env.NAME`, `process.env['NAME']`, or a destructured `NAME` that no Markdown document under `plugin/` names, unless `NAME` starts with `CLAUDE_`; none uses a `SUPERDEV_` name on any object, `process.env` or an alias or passed-in one (a property, a bracket, a destructuring, an object key plain, quoted, computed by a literal, or shorthand, a `const`, `let`, or `var` binding, or a `NAME=` prefix; a key built by concatenation or held in a variable matches no form), and no Markdown file under `plugin/` names a `SUPERDEV_` identifier, with `SUPERDEV_TEXT_EOF` allowed by name and a document naming a `SUPERDEV_` variable allowing none (ADR 0207, INV-0180); a classifier glob such as `**/tests/` or `**/tests/**` names no file (INV-0156, ADR 0154) | prohibition |
| `containment-delegation` | `lib/kb-containment.js` imports and calls `lib/containment.js`'s `testContainment` or `judgeContainment` (ADR 0053) | structural |
| `past-pr-skills` | the skills a chain start reaches (review, document, submit-pr, ship, verify-ship, wrap-up), plus publish-kb, carry no `disable-model-invocation: true` in their frontmatter, where CRLF reads as LF. Neither verify-ship nor wrap-up names `--unattended`. Ship, verify-ship, and `references/response-shapes.md` name no `--from-ship`. Every line of `references/review-scope-mode.md` and `skills/document/SKILL.md` that starts `/superdev:ship` names `scope.js consent` (INV-0066, INV-0093, ADR 0253, ADR 0268) | structural |
| `no-offer-start` | no file of the shipped tree, `AGENTS.md` included, names `start_session` or the removed offer's marker line; the bare word "offer" stays free, so plan's intent and triage offers pass (ADR 0253) | prohibition |
| `no-ci-wait` | no Markdown file of the shipped tree names a wait or a poll on CI: a `--watch` flag (`gh pr checks --watch`), `gh run watch`, or a line pairing `sleep` with a check or a status. A shell loop written over several lines is read as one line, from its `until` or `while … do` line through its `done`, so a multi-line CI wait loop is caught. A local loop on a run file and one paging through results pass. Shipped code is not scanned (INV-0192, ADR 0255) | prohibition |
| `no-base-branch-commit` | no file under `skills/` or `references/` instructs a commit, a push, or a merge to the base branch, other than ship's host-API merge (INV-0001) | prohibition |
| `background-rule-names-limit` | no skill, agent, or reference, and no `AGENTS.md` at any depth under `plugin/skills/`, `plugin/agents/`, or `plugin/references/`, states the background rule against an unnamed Bash limit: "the Bash tool's time limit" or "the tool's limit", matched across a line wrap and a run of spaces, fenced examples masked, so the rule names the ceiling (600000 ms, or the higher `BASH_MAX_TIMEOUT_MS`). No `AGENTS.md` under those trees at all is reported as missing (ADR 0232) | prohibition |
| `conflict-conclusion-no-commit` | no skill, agent, or reference concludes a resolved merge conflict with `git commit` (ADR 0123) | prohibition |
| `dod-box-rule` | no skill, agent, or reference judges a Definition-of-Done line by its checkbox or calls a `ceiling:` line settled: the spellings "neither ticked nor `accepted`", "ticked or (noted) `accepted`", "a ticked line or an `accepted`", "ticked with no `ceiling`", "ticked, `ceiling:`, or `accepted`", "already-ticked line changes nothing", and "settled" said of a `ceiling:` line, each word joined by `\s+` so a line break matches, fenced examples masked; the documents are the prose directories read at scan time (ADR 0247, INV-0190) | prohibition |
| `plugin-root-quoted` | no shipped markdown file, every skill, agent, and reference and `plugin/references/AGENTS.md` included, writes `node` followed by an unquoted `${CLAUDE_PLUGIN_ROOT}` or `$CLAUDE_PLUGIN_ROOT` path, whitespace and backticks between them, a line break included; fenced code is read too, since a fenced command is one an agent copies, so every call reads `node "${CLAUDE_PLUGIN_ROOT}/…"` and an install path holding a space stays one argument | prohibition |
| `plugin-prefix-path` | no shipped markdown file, `plugin/references/AGENTS.md` included, names a path with this repository's `plugin/` prefix before `hooks/`, `references/`, `scripts/`, `skills/`, `agents/`, or `lib/`; a prefix after a word character, `.`, `/`, or `-` is left alone, so `.claude-plugin/plugin.json` and a URL's `/plugin/` path pass; fenced code is read too | prohibition |
| `code-management-no-force` | no code-management document sends `force_merge: true` or `--admin` on a merge, in prose or in a fenced code block. A `never` right before the option excuses it (INV-0092) | prohibition |
| `forgejo-tea-only` | no Forgejo backend document names a token env var, an `Authorization` header, or a curl call (ADR 0111) | prohibition |
| `github-wiki-gh-only` | neither the GitHub wiki seed nor `docs/agents/knowledge-base.md` names a token env var (`GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN`) or an `Authorization` header | prohibition |
| `kb-no-backend-call` | plan, document, `doc-writer`, and `doc-pass.md` carry no instruction that reaches a knowledge-base backend (ADR 0023) | prohibition |
| `agent-tool-agnostic` | no agent under `agents/` names a concrete toolchain command | prohibition |
| `deploy-runner-exclusivity` | no skill, agent, or reference names a deploy target's command as something it runs, `skills/ship/SKILL.md` and `references/deployment.md` excepted. A hit passes when ship is its subject, directly before it in the same sentence ("`/superdev:ship` runs …", "Only ship runs …"). It also passes when the sentence denies the run. "Before you ship, run each deploy target's command yourself." is reported (INV-0098) | prohibition |
| `ship-no-opens-pr` | no shipped surface attaches opening the pull request to `/superdev:ship` (ADR 0096) | prohibition |
| `derive-no-dod` | plan's derive dispatch bullet hands `final-reviewer` no Definition of Done, and `final-reviewer`'s `## Derive mode` reads none (INV-0158, ADR 0158) | prohibition |
| `unmapped-paths-form` | `skills/setup/SKILL.md` and `references/test-selection.md` propose no `{paths}` form to a runner that maps no source file to its tests (ADR 0074) | prohibition |
| `doc-setup-no-test-run` | `skills/document/SKILL.md`, `skills/setup/SKILL.md`, `agents/doc-writer.md`, `agents/doc-reader.md`, and `references/doc-pass.md` instruct no test run: no `scope.js test` or `scope.js fail-to-pass` call, and no run of the full, focused, whole-repo, or affected command; a sentence stating that no test runs passes when its negation negates the run itself. That means `no` directly before the hit, or `not`, `never`, `nor`, or `without` directly before it or before one run verb heading it. An `ever` intensifier and an infinitive `to` may sit before the verb, past an opening quote or backtick, so "Remember not to run the full command" passes. "Without fail run the full command", "Do not skip running the full command", and "Do not forget to run the full command" are reported (ADR 0189, INV-0175) | prohibition |
| `implement-no-full-run` | implement's base step (`references/scope-branch.md`'s `## Bringing the scope branch to base` section alone), `references/run-handoff.md`, `references/implement-full.md` with its rare-branch files (`implement-full-resume.md`, `implement-full-fix-cycle.md`, `implement-full-denied.md`, `implement-full-minor-sweep.md`), and `references/implement-lite.md` instruct no full or whole-repo run: no `scope.js test full` or `scope.js test whole` call, no `test focused` with no path, no run, rerun, execution, or invocation of the full or whole-repo command or suite, no gate on one, and no such command or suite as the subject of `runs` up to two words later; a negation of the run itself excuses it, by `doc-setup-no-test-run`'s rule. A `no` directly before the hit or its article does, and so does a `not`, `never`, `nor`, or `without` directly before it or before one run verb heading it. An `ever` intensifier and an infinitive `to` may sit before the verb, so "Remember not to run the full command" passes. A negation heading a list of code spans excuses it too. A negation of another word ("Do not skip running the full command", "Do not forget to run the full command") excuses nothing. The rest of `scope-branch.md` stays unscanned (ADR 0192, INV-0128) | prohibition |
| `observation-no-suite-run` | `references/review-scope-mode.md`'s `### 4.3 Observations` section names no suite run as an observation's source: no suite, test, entry, exit, focused, or full run, no `§4.2` citation, and no failing test or failing run, so a failing test in a scope review's suite run joins the fix list; a missing section or document is a gap (INV-0157) | prohibition |
| `scope-review-no-full-run` | every `references/review-scope-*.md` file, read at scan time, `skills/review/SKILL.md`, and `agents/final-reviewer.md` instruct no full or whole-repo run, by `implement-no-full-run`'s patterns and negation excuse: no `scope.js test full` or `test whole`, no `test focused` with no path, and no run of the full or whole-repo command or suite. The list item that opens `- **The operator asks for the full suite**`, the ad-hoc clause, is excused, and fenced examples are masked (ADR 0255, INV-0193, INV-0173) | prohibition |
| `root-no-inventory` | the root `AGENTS.md`, read whole and unmasked so its fenced Structure tree counts, names no `plugin/lib/` module and no `tests/*.test.js` suite as a whole path segment, and no `plugin/agents/` agent: a hyphenated agent name as a whole segment, bare prose included, and an unhyphenated one backticked or as `superdev:<agent>`; each name set is read from disk at scan time, so a module, suite, or agent added later is caught with no edit to the check; a missing root is the missing-document finding, and a name directory that cannot be read or holds no name is a finding. Ceiling: an unhyphenated agent name outside backticks and outside `superdev:<agent>`, hook, skill, reference, and suite-topic names, and abbreviated forms, are not matched; hand review holds them | prohibition |

## Work Guidance

- Scripts and modules are CommonJS, like the hooks. `plugin/hooks/` and `plugin/scripts/` hold only entry points, and every module lives
  in `plugin/lib/` (ADR 0151). An entry point requires only modules, and a module requires no entry point, so a hook loads only the
  modules it uses and no module meets an incomplete `module.exports` while its entry point loads. Each module must stay `require`-able under
  plain `node`. `adopt`'s payload boundary is a pair of markers, not a heading, but a marker can still be shown inside a fenced
  illustrative example, so the marker scan needs the same fence-masking `md-sections.js`'s `extractSection()` already owns.
  `publish-kb.js` and `kb-patch.js` share `md-sections.js` through `kb-apply.js`, `kb-backend.js`, `kb-parent-link.js`, and the CLI itself.
- A module holds one responsibility and opens with its file name and a colon. A suite tests through the entry point, and a large entry point's
  suite splits flat by topic into `tests/<entry>-<topic>.test.js` over one `tests/<entry>-setup.js` that is no suite. A copy of a helper
  merges into `lib/git-spawn.js` or `lib/refusal.js` only when its behavior is identical (ADR 0151).
- The shipped scripts each have a suite in `tests/`, same convention as the hooks (ADR 0059).
  `drift-check.js` is maintainer-only and keeps its inline `--selftest`. `invariant-check.js` is
  maintainer-only too, and has its suite in `tests/` like a shipped script, because it takes no part in
  drift-check's registry. `run-tests.js` follows the same rule, with `tests/run-tests.test.js`.
- A **prohibition check that matches English prose states its ceiling beside its patterns.** A pattern
  over English catches the phrasings it names and not every paraphrase, and on a prohibition a missed
  paraphrase is a **silent pass**: the check reads the reworded instruction as gone and stays green while
  it is still there. Write the ceiling down next to the patterns, in a `simplicity:` comment, so a
  reviewer who finds one more evadable phrasing reads it as the stated ceiling rather than a defect.
- A new drift check tests a mechanical fact or forbids a form in shipped prose or in the root `AGENTS.md` (ADR 0153). It is one
  entry in the `drift/checks.js` registry, one row in the table above keyed on its own `id`, and its own
  cases in the `drift/selftest/` suite of its topic: its seeded violation, a clean fixture, and, when it reads a
  named document, the missing-document case the registry-wide selftest asserts. No check enforces the row. A review judges the row and the selftest cases.

## Verification

`node scripts/run-tests.js` (repo root) runs each suite under `tests/` and the tail (`invariant-check.js`
against this repository's register, `drift-check.js`'s own `--selftest`, `drift-check.js`, and `claude plugin validate ./plugin`)
concurrently, all under `node`, which matches the production runtime. The first failing step ends the rest. `node scripts/run-tests.js --related <path>...` is the focused run.

## Child DOX Index

None. `scripts/` has no subdirectories with rules of their own.
