# scripts/

## Purpose

Standalone deterministic code that `package.json` runs, alongside `plugin/hooks/`.
The shipped CLIs live in `plugin/scripts/`: `scope.js` (the run-state CLI, ADR 0022), `kb-patch.js`
(the knowledge-base section merge, ADR 0027), `publish-kb.js` (the backend-independent half of publishing a scope's staged
knowledge-base pages, ADR 0069), `profile.js` (the run profile, ADR 0103), and `plugin/lib/md-to-storage.js` (the markdown to Confluence `storage` conversion
`lib/kb-apply.js` requires, ADR 0109). Every other module behind them lives in `plugin/lib/` (ADR 0151). The maintainer-only ones live here in `scripts/`: `drift-check.js`
(the checks of mechanical facts and forbidden forms, ADR 0153), `invariant-check.js` (the invariant register validator,
ADR 0093), and `run-tests.js` (the suite runner). This doc owns them all regardless of which dir each lives in.

## Ownership

This doc owns what each script guards and the contracts between them. Repo-wide rules stay in the root
[`AGENTS.md`](../AGENTS.md): the stack, the working rules, and the release flow.

## Local Contracts

### scope.js, the run-state CLI (ADR 0022)

`scope.js` owns the CLI and the verbs, and requires only modules from `plugin/lib/` (ADR 0151). Each verb's code lives in
a module of its own: the ledger verbs in `ledger-lifecycle.js` and `ledger-records.js`, `suite` and `base` and `get` in
`suite-base-get.js`, `test` in `test-verb.js`, `publish` with `adopt` in `run-state.js`, and `dod-line`, `fail-to-pass`,
`citations`, `collisions`, `source-set`, and `status` each in the module of its name. The vocabulary beneath them is `ledger.js` (the stage rank and the readers and writers of
a ledger's header lines, bullets, and table rows), `refusal.js` (the refusal error `fail`), `verification.js` (`verificationCommands`,
`verificationCommandsOf`, `isTestPath`), `git-spawn.js` (`gitSpawn`, `gitThrow`, `parseBranchList`, `resolveCommit`, `refResolves`, `fileAt`),
`containment.js` (`testContainment`, `baseHistoryHasPatch`), `main-work-tree.js` (`mainWorkTree`, `scopesDirFor`, `mainTreePath`), and
`trace-log.js` (`appendTrace`, `readTrace`, `traceField`, `untraceField`). The root [`AGENTS.md`](../AGENTS.md) *Structure* names every module and its
responsibility. `scope.js` keeps every export it had. No module requires an entry point. `scope.js` owns the ledger's schema through `ledger.js` and is the only `ledger.md` read and write path in the chain:
`init`, `stage set`, `slice`, `degraded add|add-denial|reset-denials`, `unresolved add|clear`,
`deferred add|resolve`,
`docs set <value>|clear`, `pr set <n>|clear`,
`deploy set <target> pending|deployed|failed [--exit <n>]`, `deploy get`,
`suite set <green|red|denied|none> <sha> [--whole]`,
`suite reusable --branch <b> [--whole]`,
`base set <sha>`, `base resolve --branch <b> --base <ref>`,
`get stage|branch|anchor|slices|unresolved|degraded|deferred|denials|docs|pr|suite`,
`status` (which renders the whole `/superdev:status` report), `trace [--slice <id>]` (prints the run trace, read-only), `publish`, `adopt`, `root <slug>`,
`staging <scope> [--count]`, `collisions --base <ref> --branch <ref> --range-base <ref> [--also <ref> …]`, `citations --range-base <ref> --branch <ref> <id>…`, `source-set [<path>]`, `dod-line`, `fail-to-pass <base>..<tip>`, and `test`.
`--help` or `-h`, alone or after any verb, prints the usage and exits 0, except that a flag's value, or the text after `add`, `add-denial`, `reset-denials`, or `resolve`, is data and never a help request. It is checked before any verb
reads stdin or touches a ledger, so a stdin verb such as `dod-line` never waits on input for it.
`suite set` writes the **suite record** (CONTEXT.md) — the last full-suite run's result and the commit
it ran on, as `**Suite:** <result> @ <sha>` — refusing a sha that does not resolve to a commit in the
repository; `get suite` prints `<result> <sha>` back, or nothing on a ledger with no record (INV-0017).
`suite reusable` is the read half of that same reuse rule: it exits 0 (printing `reusable`) when the
record is `green`, the run trace backs the recorded commit, and `<branch>`'s tip is that commit, and
refuses (exit 1) otherwise, an unrecognized argument included. No slice store commits its own records on
the scope branch (ADR 0110), so a commit since the record counts. The one exception is a Markdown-only
range (ADR 0128): the recorded commit is an ancestor of the tip, every path changed since ends in `.md`
and is no test path and not `docs/agents/verification.md`, and the run trace shows the latest test run at
the tip passed on a clean tree with no failed full or whole run there. The test paths come from the tip
commit's `verification.md`, through `isTestPath` of `lib/verification.js`, the classifier the run trace's `lib/run-tree.js` wraps. A
refusal on a moved tip names the condition that failed after `predates tip`.
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
`scope.js` still exports the names it exported before the modules moved out of it, among them
`readLedgerHeader`, but no hook and no sibling script requires `scope.js`: each requires the module that
holds what it uses. `readLedgerHeader`, the per-header ledger-line reader, lives in `plugin/lib/ledger.js`,
and `hooks/scope-prune.js` and `hooks/slicetree-sweep.js` both require it there instead of carrying their own
regex. `hooks/scope-prune.js` requires `baseHistoryHasPatch` — the containment probe (ADR 0082) — from
`plugin/lib/containment.js` through a `require` of its own, and the two fall back
differently: the reader missing stops that hook's sweep outright, while the probe missing, because its
module cannot load or carries no probe, narrows its containment test back to the tree comparison alone,
silently. A module requires no entry point, so a `require` of a module runs no CLI code, and `scope.js`
guards its own CLI entry with `require.main === module`. `profile.js` takes
`mainWorkTree` from `main-work-tree.js` and `SLUG_RE` and `CHANGE_TYPES` from `ledger.js`, so the run profile resolves the
main working tree and reads a feature label by the same rules the ledger does. `hooks/run-trace.js` takes
the trace writer `appendTrace`, the trace reader `readTrace`, and the field decoder `untraceField` from `trace-log.js`, the ledger
row reader `sliceType` from `ledger.js`, the verification-command reader `verificationCommands` from `verification.js`,
the tree locator `locate`, the test-path classifier `isTestPath` (ADR 0128), and `treeState` from `run-tree.js`,
the run classifiers `testRuns` and `verificationKind` from `test-runs.js`, and the dispatch, verdict, write-target, and start-stash
readers from `dispatch.js`, `verdicts.js`, `bash-writes.js`, and `start-stash.js`. Each `require` has its own guard, and a module that fails to load
leaves the hook recording nothing (ADR 0117, INV-0159). `hooks/tree-guard.js` takes `mainWorkTree` from `main-work-tree.js` (ADR 0148). `publish-kb.js` reaches
the containment test `testContainment` from `containment.js`, which refetches the base before it answers not contained (ADR 0053,
ADR 0065), `refResolves` from `git-spawn.js`, and `readLedgerHeader`, `SLUG_RE`, `CHANGE_TYPES` from `ledger.js`, through its `lib/kb-*.js` modules. `base set` appends a `ledger`
trace event like every other ledger-writing verb. Normalisation is per
header: `Stage` and `Branch` are single tokens,
cut to the first whitespace-delimited token and stripped of markup and trailing punctuation.
`Anchor` is a prose title that reaches a pull request, trimmed and otherwise left alone. An empty
header line reads as absent, not as an empty string. Both `readLines` and `readLedgerHeader` split
on `\r?\n`. A `ledger.md` an editor or `core.autocrlf` wrote with CRLF line endings reads exactly as
an LF one does. A lone `\r`, the classic-Mac line ending, reads as absent, and that is deliberate.
Any verb that writes the file normalises it back to LF. A scope whose ledger stage reads `shipped` or `closed`
collapses to one line, `<scope>  (shipped)` or `<scope>  (closed)`. It drops the slice tally and the blocked list.
`hooks/scope-prune.js` (ADR 0007) is about to reap that run root, so per-slice detail is no longer
work in flight. Its `**Degraded:**` line, its `**Unresolved:**` line, its `**Deferred:**` line, and its
staged-page lines survive the collapse, because each is otherwise recorded nowhere else. `deferred add`
carries no `clear` counterpart: a defect stops being true once a run re-verifies the scope green, while
unplanned work stays unplanned until somebody plans it (ADR 0035). `deferred resolve` removes one finding
the same run fixed after all (ADR 0121). It matches the exact bullet text, removes every identical bullet,
drops the line once none remain, and refuses text that matches no bullet, leaving the ledger unchanged.

`root <slug>` is a verb that touches no ledger (ADR 0080). It resolves and prints a run root's
absolute path — `<main-worktree>/.superdev/scopes/<slug>`, where `<main-worktree>` is the parent of
`git rev-parse --git-common-dir`, or the checkout that directory's `core.worktree` names inside a submodule
(never the superproject's `.git/modules`) — so it takes no `--root` of its own. `mainWorkTree` in `plugin/lib/main-work-tree.js` is the one
resolver; `lib/kb-staging.js`, `profile.js`, `lib/status.js`, `lib/fail-to-pass.js`, and `hooks/tree-guard.js` call it. The result is identical whichever
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

`staging <scope> [--count]` is another verb that touches no ledger and needs no run root (ADR 0119). It
prints a scope's staging directory, `<main-worktree>/.superdev/kb-pending/<scope>`, resolved the same way
`root` resolves a run root, so a page staged from a scopetree or a slicetree lands in the main working
tree and survives that checkout's removal. It accepts `_adhoc`, and refuses what `root` refuses, outside a
git repository included. `--count` prints the number of `.md` pages in that directory instead, `0` when
it is missing. The staged-page scan behind `status` resolves its staging root through the same main
working tree.

`test full|whole`, `test focused [<path>…]`, and `test -- <command>` run a test command through `sh -c`, `sh` resolved from PATH (ADR 0150), and append one
`run` line carrying the command's own exit status, an **Observed run** (CONTEXT.md, ADR 0127, INV-0117). The verb
streams the command's output and exits with its status. `full`, `focused`, and `whole` run the command
`docs/agents/verification.md` configures, as written; `focused` substitutes its shell-quoted paths for `{paths}`
and, given none, runs the full command and records `full`. `--` runs a command that `testRuns` of `lib/test-runs.js`
classifies as exactly one test run, and records the kind and files a direct run records. A word counts as a
path argument of that classification only when its file part names an existing file or directory; a runner node id
(`a.py::test_x`, `a.test.js:12`) counts by its file part, and a glob word keeps its reading. A quoted note that begins
with a test path is therefore free text, and so is a test path that names no file. A status the
command shape hides from the test, such as a pipe without `pipefail`, records `unknown`. A command that classifies
as no test run, or a kind with no configured command, is refused and nothing runs. The verb reads the run root,
slice, commit, and tree state when the command starts, and appends the line when it finishes. A run during which
HEAD moved, the tree was dirty at either end, or the trace recorded an edit, revert, or restore for the slice
during the run records `dirty`, so it never backs `suite reusable`. A change no hook records shows only at the two ends. A command ended by a
signal, or a verb killed first, writes no line, and the command's run ends with the verb: a Node watcher process supervises it and ends it
through `endRun` (a process-group kill, `taskkill /pid <pid> /t /f` on Windows), which covers `SIGKILL`. `test` ends the group with `SIGTERM`. A failed trace write prints a note on stderr and leaves the exit status unchanged.
Outside every run tree the command runs and nothing is written. So does a command that `cd`s out of every run tree:
`outsideTree` of `lib/test-runs.js` classifies the `cd` target against its repository top. The verb takes no option that sets an outcome,
kind, slice, or tree state. `lib/test-verb.js` requires `lib/run-tree.js` (`locate`, `treeState`) and `lib/test-runs.js` (`testRuns`) at call time, the locator and classifier it shares with the
run-trace hook. When the classifier's own module cannot be found, it classifies no command as a test run, so `test --` refuses every command and a configured kind still runs.
`hooks/run-trace.js` records no run for a Bash command that runs `scope.js test`, and still evaluates the Missing
RED note after a foreground call.

`fail-to-pass <base>..<tip>` runs a commit range's tests twice and reports whether they discriminate
(CONTEXT.md **Fail-to-pass run**, ADR 0134, INV-0139). It creates a throwaway worktree detached at `<tip>`. In a run
root the worktree sits beside `slicetrees/`, outside every tree the run trace attributes a run to. Outside a run root it
sits under `.superdev/`, which the verb git-ignores first through the repository's `info/exclude`. The command and the
test paths come from `<tip>`'s own `docs/agents/verification.md`. The verb runs the focused command over the range's whole
changed-path set where the focused command carries `{paths}`, and the full command otherwise.

The first run is against the changed code and must pass. The verb then resets and cleans the worktree. The verb puts
every changed file outside the test paths back as that file stood at `<base>`, and commits the put-back on the detached
HEAD. The verb runs the command again and bounds that second run at 10 times the first run's duration, measured in the
same invocation, or at a floor of 10 000 ms, whichever is larger (INV-0009, ADR 0142). `SUPERDEV_FAIL_TO_PASS_FLOOR_MS`
overrides the floor in milliseconds; a value that is not a positive integer, or that exceeds 2147483647 (the
longest delay Node's timer holds), reads as absent, and the verb names that value in one line on stderr. The suite's cases that hang
the second run set the override, so none waits the floor. `lib/fail-to-pass.js` exports the bound as the pure function
`failToPassBoundMs(controlMs, floorMs)`, and the verb calls it with the floor it reads once. The suite pins the factor and
the floor on that function with no clock, because the first run's measured duration includes its own start-up, and load
stretches that start-up by seconds. The verb refuses a range that changes no file and a range that changes only test files,
because nothing is put back.

The outcome is `fail-to-pass` when the second run fails, and `pass-to-pass` when it passes. It is `unknown` when the first
run fails, when the second run is killed at its bound or ended by a signal, and when either run's command cannot start
(E2BIG on a long `{paths}` list among the causes), its reason then reading `start-failed:<code>` in place of the exit
status. No reviewer reads `unknown` as a verdict,
and no gate reads it as green.

Inside a run root the verb appends one `fail-to-pass` trace line, `<base>..<tip> <outcome> <reason>`. Its slice is the
ledger row that records exactly that range, else the slice the run's directory attributes to, else `scope`. The line is no
`run` line, so it satisfies no Missing RED step and moves no suite record. The trace's first `unknown` of any kind draws a
stderr note that tells the controller to capture an observation. The observation goes to the scope run's first non-exempt
`unknown` (`references/scope-mode.md`, `## Observations`). An inherited `unknown` earns none. A slice cut after a break
between two slices inherits that failing test, and its control failure also shows at the slice's base. The note can
therefore name an exempt one.

The verb exits 0 when it read an outcome and 1 on a refusal or an error. It exits 2 when no test command is configured, so
nothing ran, and 128 plus the signal number when interrupted. An interrupt ends the command's run through `endRun` with `SIGKILL`, and the Node
watcher process covers a killed verb, so no worktree outlives the verb. A suite that outlasts the Bash tool's time limit runs the verb
in the background (`references/test-selection.md`).

`scope.js` has one suite per topic, so a test-first step on one verb runs only that verb's cases (ADR 0139, ADR 0151). `tests/scope-setup.js`
holds the setup they share and is no suite. `tests/scope-test-verb.test.js` holds the `test` verb's cases and `tests/scope-fail-to-pass.test.js`
the `fail-to-pass` verb's. The rest: `scope-ledger` (init, stage, step, slice, the bullet and header records, get, status, and the ledger-fixtures pin),
`scope-ledger-header` (`readLedgerHeader`), `scope-suite` (the suite and base records), `scope-dod-line`, `scope-publish-adopt` (`publish`, `adopt`, and the
`maskFencedLines` pin), `scope-trace` (the run trace and `appendTrace`), `scope-root-base` (`root`, `staging`, `base` from a linked worktree),
`scope-containment`, `scope-citations-collisions`, `scope-source-set`, and `scope-help`. A focused run for `scope.js`, or for a module it requires, selects
every suite that reaches it (`run-tests.js`, below).

`source-set [<path>]` prints the gap audit's source set and touches no ledger and no run root (ADR 0162). It prints one
repository-relative path per line: every file `git ls-files` lists, under `<path>` when given, that is no test path, no
doc, configuration file (a dot-prefixed one included), or lockfile, no binary asset (image, font, archive, media, native binary,
bytecode), and under no `vendor/` or `node_modules/` directory at any depth, nor under `dist/` or `build/` at the repository
root. The test-path rule is `verification.js`'s `testPathPatterns`, the classifier the run trace shares, so the configured
`## Test paths` of `docs/agents/verification.md` decide, or their defaults where it has none. An untracked file is outside the
set, and so is an index entry that is no regular file on disk (a submodule gitlink, a file deleted from the working tree). An extensionless name counts as a doc in any case when it is `readme`, `history`, `changes`, `notice`, `changelog`, `authors`, `codeowners`, `contributors`, `license`, `licence`, or `copying` (`DOC_NAME_RE`). A `LICENSE` or `COPYING` stem also counts with a `-` suffix and no extension in any case, or with any `-` or `.` suffix in uppercase (`LICENSE-MIT`, `license-apache`, `COPYING.LESSER`). A lowercase or mixed-case stem with an extension is code (`license.js`, `license-check.js`). A `<path>` that does not exist refuses, naming it. A directory that is no git repository refuses too, and a set with no file prints nothing and exits 0.
`/superdev:review-tests` §1 calls it. The classification lives in `plugin/lib/source-set.js`.

`dod-line` is another verb that touches no ledger, and makes no store call of its own
(`references/dod-ticks.md`, INV-0014, triage #664): `--match <criterion text>|--match-file <path>
--verdict met|not-met|ceiling|accepted --note <text>|--note-file <path> [--line]`. It is the one
Definition-of-Done checklist-line edit every store's own `## Definition of Done ticks` section cites
instead of restating by hand — a store seed fetches the checklist text through its own call, runs
`dod-line` on it as the producer in its gated **Edit an issue's body** rule, and writes back what comes
out on stdout only when `dod-line` exited 0 with non-empty output (ADR 0115), the same shape `kb-patch.js`
already gives a staged knowledge-base patch (ADR 0027). `--match-file`/`--note-file` are each an
alternative to `--match`/`--note` that reads the same text from a file instead of a shell-interpolated
argument, one trailing newline stripped verbatim otherwise — the text a controller pipes in this way is
typically report-derived, and may carry a quote, a backtick, a `$(`, or worse (`references/dod-ticks.md`,
triage #680); giving both forms of the same argument refuses. The verb writes the verdict's own label, so a note that
already opens with that label (`met: …` under `--verdict met`) loses that one prefix and carries the label
once. A note opening with any other verdict's label is note text and stays as given. The default mode takes a whole markdown
body on stdin and prints the transformed body; `--line` takes and prints exactly one checklist line
instead, for the Jira seed's ADF text node, which is JSON, not markdown lines. A checklist line is `- [ ]
<criterion>[ — <tag>][ — <verdict>: <note>]` (`plan-contract.md`'s line format) — the tag absent on a
single-slice feature's own DoD, a run predating tagging, or one untagged line inside an
otherwise-tagged DoD; `--line` mode accepts the same line with no leading `- `, the shape a Jira text
node's own string carries. The tag — slice ids (`01`, `01, 02`), store refs (`#667`, `#672, #673`), or the
literal `scope` or `docs`, each standing alone (ADR 0161) — and any verdict note past it are parsed off the line's *right* end, greedily handing
everything before that to the criterion, which is what keeps a criterion carrying its own " — "
(`plan-contract.md`'s own worked example, "Reachable: none — entrance unchanged; … — scope") intact
instead of splitting at its first dash. An untagged criterion that merely ends in something shaped like a
tag (`- [ ] Retries capped — 3`) offers a second reading alongside the rightmost-tag one — the whole line,
untagged — and a line matches when either reading's criterion equals `--match` (triage #679); a genuinely
tagged line still parses its tag as before. The same offer reaches a line that already carries a note
(`- [x] Retries capped — 3 — met: e`), so a re-judge against the same untagged criterion still finds it —
a line offering two readings still counts once toward the match limit below. Matching runs after both the line's own criterion text and
`--match` collapse internal whitespace to one space and trim, so a criterion an editor reflowed onto two
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
values, on a missing `--match`/`--match-file` or `--note`/`--note-file`, or on both forms of the same
argument given together.

`init` writes a fresh ledger at stage `planned` (ADR 0079) — the one stage that precedes the four-command
chain rather than naming a step within it, ranked below `implementing` so `stage set implementing` (or any
higher stage) moves forward out of it and no later write moves back. `init` over an existing ledger at
stage `planned` overwrites it, since a plan that cut the branch and scopetree but ran no slice yet has
nothing to lose; any other stage still refuses. `stage set` refuses a ledger that carries no `**Stage:**` line, as it
refuses one carrying an unknown stage, and writes nothing. A header-writing verb (`step`, `docs`, `pr`, `deploy`,
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
(ADR 0023): a `pending publish:` line per scope, a scope with no run root under `(no ledger)`, a
non-`.md` file staged and ignored, and a `.md` file staged directly under `.superdev/kb-pending`
outside any scope directory. Each is a page `/superdev:publish-kb` would otherwise silently miss.

The stage machine's transition rules are enforced in its code, not in prose, and
`hooks/ledger-guard.js` denies every other write path. `tests/scope-ledger.test.js` carries the retired
drift assertions along with scope.js's own behavior: the stage machine, the ledger schema and header
lines, a pre-CLI ledger parsing unchanged, and the scope-slug charset staying equal across `scope.js`,
`hooks/run-lock.js`, and `references/scope-mode.md`. A further pin — the same class of assertion as
the `arg-token` pin of the Bash hooks' scanner require, adapted for a
shared function instead of a shared module — asserts, in `tests/scope-publish-adopt.test.js`, that `lib/run-state.js` and `lib/dod-line.js` still require
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
a doc pass re-runs, not on the live page it would otherwise strand. Heading detection runs on fence-masked lines (matches
`scripts/drift/lib.js`'s `maskFences`, including its at-least-as-long closing-fence rule), so a
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

`kb-patch.js` re-exports `maskFencedLines`, `merge`, and `headingKeyOf` from `md-sections.js`. `lib/kb-apply.js`
requires both, and detects two sibling staged
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
`kb-staging.js` holds the staging root and scope selection, `kb-backend-config.js` the backend classification and command templates,
`kb-staged-page.js` the staged-page parse and the `created-by-publish` marker, `kb-backend.js` the template runner and the
`upsert`, `delete`, and `patch` of one page, `kb-apply.js` the per-file application by title group, `kb-containment.js` the merge check,
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
never shifts which template a later verb reads. Each template runs under `sh -c`, `sh` resolved from PATH (ADR 0150). Every value
passes to it as an environment variable, never interpolated into the command string. A title carrying
a quote, a `$`, a backtick, or a newline therefore reaches the backend unchanged and starts no shell of
its own.

Every template runs under a **30-second bound** (ADR 0130), applied at `runTemplate`'s own `spawnSync`
with `killSignal: 'SIGKILL'` — the same shape `testContainment` in `plugin/lib/containment.js` bounds its `git fetch`
with. The bound sits in the script rather than in the templates, so it covers an operator-written
template carrying no `curl --max-time` of its own. `SUPERDEV_PUBLISH_KB_TIMEOUT_MS` overrides it, and
sits outside the `SUPERDEV_KB_` prefix on purpose: `fieldsToEnv` forwards every key a `find` result
carries under that prefix, so a backend returning `timeout_ms` would otherwise rewrite the bound from
the wire. A value that is not a positive integer reads as absent, never as "no bound" or "kill at once".

**A timeout stops the batch, and nothing else does.** `processStagedFiles` walks the title groups and
breaks on the first result carrying `timedOut`, reporting every remaining file as `untried` and leaving
all of them staged. A host that black-holes one call black-holes the next, so continuing would spend the
bound once per staged page and reproduce the hang the bound removes. `spawnFailure` is the single site
that tells a timeout from any other `res.error`: a `maxBuffer` overflow and a shell that will not start
say nothing about the host, so each still fails only its own page.

`find`'s exit code is the contract the other four verbs rest on (ADR 0069's table). Exit `0` with a
JSON object on stdout means `found`, and each key in that object becomes a `SUPERDEV_KB_<KEY>`
variable for the later verbs. Exit `3` means `absent`, the only verdict that may create a page. Any
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
(INV-0109). A staged page's optional `parent:` names the title of the page it is created under.
`resolveParent` looks that title up through `find` on the create path only, and passes the id as
`SUPERDEV_KB_PARENT_ID`. An `absent` or `unknown` parent leaves the page staged, with the parent named in
the reason. A `create` template that never mentions `SUPERDEV_KB_PARENT_ID` leaves a parented page staged
with a reason naming the fix, and resolves and creates nothing. `parentsFirst` orders the title groups by their depth in the batch's own parent chain, so a
parent staged in the same batch is created before its children.

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
without a resolving branch is the real unreachable case, and still refuses. It
delegates the ancestry test to `plugin/lib/containment.js`'s exported `testContainment` instead of reimplementing it.
`--allow-unmerged` overrides the refusal once the operator confirms. `_adhoc`, the literal value
`/superdev:document` writes for a doc pass outside a live scope, skips the check entirely. The report
a run prints never carries a page's body, only filenames, titles, and reasons.

The module guards its CLI entry with `require.main === module`. It exports every function above,
`resolveMainCheckout`, `listPendingScopes`, `resolveScope`, `classifyBackend`,
`parseCommandsTemplates`, `parseStagedPage`, `runTemplate`, `runFind`, `publishUpsert`,
`publishDelete`, `publishPatch`, `processFile`, `processStagedFiles`, `resolveScopeBranch`,
`parseBaseBranch`, `parseRemote`, `checkContainment`, `hashBody`, `readPage`, `renderReport`, and
`run`, and `timeoutMs`. Every export but `run` comes from the module that holds it. The suites exercise the CLI through its exported
`run()`, the way the `tests/scope-*.test.js` suites exercise `scope.js`'s own CLI verbs (ADR 0059), and split by topic over `tests/publish-kb-setup.js`
(ADR 0151): `publish-kb` (the pure readers and the pin that the publish code keeps no copy of what `lib/` owns), `publish-kb-scope` (backend
configuration refusals and scope selection), `publish-kb-publish` (`upsert` and `delete` end to end), `publish-kb-patch`, `publish-kb-guard` (the live-hash
guard, the storage body, and `parent:`), `publish-kb-containment`, `publish-kb-read`, `publish-kb-timeout`, and `publish-kb-templates` (the backend templates this repository ships).

### profile.js, the run profile (ADR 0103)

`profile.js` prints where a scope run's wall-clock time went. `skills/profile/SKILL.md` runs it
and prints the report as written, with no reading of its own (INV-0148). `profile.js` is the CLI and the scope attribution. It requires
`lib/transcripts.js` (finding and reading the transcripts), `lib/command-keys.js` (command keying), `lib/session-events.js` (the intervals, point
events, and phase segments), `lib/time-sinks.js` (the sink rules), and `lib/profile-report.js` (the printed report). The script reads the transcripts Claude Code writes under
`${CLAUDE_CONFIG_DIR:-~/.claude}/projects/` and writes nothing there (INV-0101). The repository's
transcript directory is the main working tree's absolute path with every non-alphanumeric character
replaced by `-`. A directory carrying that name plus `--superdev-scopes-` holds the sessions started
inside one of its run roots, and is read too. A sibling repository whose path only shares the prefix is
not. Each session's `<session>/subagents/` transcripts and `.meta.json` files are read with it. The
format is Claude Code's own and undocumented: an entry lacking a field the script reads is reported as
unrecognized, never counted, and a tree with no recognized entry exits non-zero with "format not
recognized".

A **phase segment** (`CONTEXT.md`) starts at every superdev command invocation, typed or through the
`Skill` tool, and runs to the next one. Only implement, review, document, submit-pr, and ship segments
are reported. A segment belongs to the scope a whole `<change-type>/<slug>` argument names, or the
right-hand `<change-type>/<slug>` of a `BASE..branch` or `BASE...branch` review-range argument, or a
lone bare slug argument some cwd read elsewhere in the transcripts evidences as a real run root — never
a bare word with no such evidence, which would otherwise let a mode word like `audit` or `staged` pass
for a scope. Only when the arguments name none of these does the segment fall back to the run root any
entry of the session, or of a subagent it dispatched, ran under (`.superdev/scopes/<slug>/`); a named
scope is never diluted by a leftover cwd from a session that has not yet cd'ed into it, and a
`BASE..branch` argument whose right-hand side names no scope falls back the same way. With no slug
argument, the scope whose segment ended last is profiled, ties broken alphabetically.

The phases view splits each segment's wall-clock time by precedence, so the columns sum to it: human
wait first (`AskUserQuestion`, a rejected dispatch's own window, and the gap from a turn's end to
whatever closes it, INV-0102), then subagent time (each `Agent` call's window joined with its subagent
transcript's own span), then the time of a background Bash call, then idle time, then tool time. The
background call is a precedence step only: its time reports in the tool column, and the view has no
separate background column. A turn end is `type: "system"`, an assistant
entry with no `tool_use` block, a synthetic assistant entry (`message.model === "<synthetic>"` — a
rate-limit or spend-limit notice, a "No response requested." filler after a cut-off), or an interrupt
entry (`type: "user"`, not `isMeta`, its text `[Request interrupted by user]` or a variant such as
`[Request interrupted by user for tool use]`). Consecutive turn ends, with any filler between them, form
one block, and the gap runs from the block's last real, non-synthetic assistant entry — the model's own
last real output — walking back only past a turn end that carries none (a thinking-only entry, a
synthetic notice). The walk-back stops at an interrupt entry instead of walking further back to it,
since that is where machine work stopped: a real assistant entry still streaming when the operator cuts
it off never lends its own generation time to the gap. The walk-back likewise stops at a Stop hook
summary (`type: "system"`, `subtype: "stop_hook_summary"`) that follows the block's last real output,
so the gap starts at the summary rather than the output before it — the hook's own recorded duration is
then counted once, as hook time, never also folded into human wait or idle. A block with no real
assistant entry still starts at its earliest turn end. Harness filler — an attachment (a hook result, a
SessionStart context block on resume) other than a
task-notification, a compact summary (the harness's own injected recap after a context compaction), an
isMeta note wrapped in a harness tag (a caveat ahead of a typed `/command`), or a non-meta
harness-injected `user` entry that is not itself a task-notification (a local command's own echoed
stdout) — sits between a turn end and whatever closes the gap, carrying no signal of its own, and is
walked past rather than closing anything itself. The first entry after the block that is neither filler
nor a turn end closes the gap: a `user` entry carrying no `tool_result` (a typed prompt — including one
carrying only an image, with no text of its own — a peer-session message, a plain-text resumption note
such as "Continue from where you left off." or "Your response above was cut off..."), or a
task-notification attachment. A typed prompt makes the gap human wait; anything else — a cross-session
message from a peer Claude Code session, a resumption note, or a task notification — makes it **Idle**
(CONTEXT.md, INV-0102). There is no separate allow-list of wake shapes: whatever is not a typed prompt is
idle. Idle only claims what human wait, subagent time, and a background Bash call left uncovered. A
subagent interval that spans the same gap stays subagent time. A background call that spans it stays tool
time. Recorded hook durations come out of the tool time around a
tool hook and out of the remainder for every other hook, and model time is what is left. Several Stop
hooks in one `stop_hook_summary` run in parallel, so only the slowest one's duration is taken out as hook
time — the session waited for that one, not their sum — while the per-hook-name breakdown the report
prints keeps every hook's own duration, so it can sum to more than the hook column. A tool call with
no result is listed as unfinished and adds nothing (INV-0103). A background Bash call
(`run_in_background`) returns its own result at launch. It runs from its launch to the first
task-notification whose `<tool-use-id>` names it, whatever its `<status>` (ADR 0143). That holds in the
main session and in a subagent, in the phases view and the repeated-commands view alike. A later
notification for the same call changes nothing, and a notification that names no call adds nothing. A
background call with no notification is listed as unfinished and adds nothing, its launch included. A dispatch rejected at the permission
prompt counts its own window as human wait — the operator deciding, not the machine working — while a
dispatch denied by the auto-mode classifier or blocked by a PreToolUse:Agent hook stays subagent time,
since the classifier or a hook decided, not the operator. The repeated-commands view drops the body
lines of a heredoc (`<<[-]?['"]?WORD['"]?` through the line that is exactly WORD, recognized inside a
double-quoted string only where a `$(` opened earlier in that same quoted span is still open — plain
quoted text such as `"use <<EOF here"` opens no heredoc) and of a quoted argument that spans several
lines, so a `node -e '…multi-line…'`, a `cat <<'EOF' … EOF`, or a `git commit -m "$(cat <<'EOF' … EOF )"`
groups only under its own opening line, never under a body line such as `const` or `Co-Authored-By:`.
Once a quote closes — on its opening line or a later one — the real code past the closing quote is kept
and rescanned, so a statement following a multi-line quoted argument on the same physical line
(`"…multi-line…" && git log …`) still gets its own key. A run of backslashes escapes the character after
it only when the run's length is odd (`\\"` is an escaped backslash followed by the real closing quote,
not an escaped quote), except inside a single-quoted string, which has no escapes, and a `#` at a word
start outside any quote starts a comment that drops the rest of its line. It then splits each Bash call
into its statements on `&&`, `||`, `;` and line breaks, recognizing an operator only outside a quote — an
operator inside quoted text (a `;` in a commit message) never splits the statement there, so a quoted
argument keys once, as its real command, not once per fragment a naive split would cut mid-quote — drops
a leading `time`, drops a leading shell keyword (`while`, `until`, `do`, `done`, `if`, `then`, `elif`,
`else`, `fi`, `esac`, `{`, `}`, `(`, `)`) so the real command after it on the same statement keys
instead (`do bun run test` keys `bun run test`) and a statement left with nothing after the drop keys
nothing. A `for` or `select` statement keys nothing, since its words are a loop variable and a list; a
`case … in` header keys nothing and each arm keys its command, the pattern before `)` being no command.
A backslash-newline joins the next line into the statement, and a `(` or `{` attached to the first word
is dropped. It keeps each pipeline's first stage past any `cd`, assignment, or redirection.
A whole `VAR=$(cmd …)` statement, with the substitution optionally double-quoted and the assignment
optionally led by `export`, `local`, `readonly` or `declare`, keys the command inside the substitution
instead of the assignment's own leftover word (`SHA=$(git rev-parse HEAD)` keys `git rev-parse`, not
`rev-parse`). A quote opens only where an odd backslash run does not escape it, in every scan. An interpreter
(`node`, `python3`, `python`, `bun`, `deno`, `ruby`, `bash`, `sh`) keys instead by its first non-flag
argument when that argument looks like a script path (`node tests/profile-cli.test.js`) or starts with `$`,
quoted or not (`node $S`, `node "$S"` both key `node $S`), or by that argument itself when it is an
inline-source flag (`node -e`, `python3 -c`, `node -`), so each interpreter call keys by what it ran
rather than collapsing every one under the interpreter's own name; an argument that is neither, such as
`run` in `bun run test`, falls back to the plain-word rule. An absolute script path, quoted or not, past a
version-numbered directory — the shape a plugin cache installs a script under
(`…/superdev/0.41.0/scripts/scope.js`) — keys past that directory (`node scripts/scope.js`), so two
plugin versions running the same script group under one key rather than splitting one row per version.
`scope.js` keys by its test-runner mode instead, whatever path ran it. The rows are `scope.js test full`,
`scope.js test whole`, `scope.js test focused`, `scope.js test --`, and `scope.js fail-to-pass`. A call
through a shell-variable script argument, such as `node $S test full`, keys the same way. The paths after `focused`, the command after `--`, and the range after `fail-to-pass` never
enter the key. Every other `scope.js` verb keys by its script path. A call with one key credits its whole duration to that key. A call with
several keys splits its duration by weights: a key's weight is the median duration of its single-key
calls across every transcript session the profile reads for the repository, not only the profiled
scope's segments. A key with no single-key call takes the mean of the other
keys' weights in that call, or an even split when none has one, and a call whose weights are all 0 splits
evenly. The count stays the number of calls that ran the command. A call with no command key, such as
`cd /tmp` or `X=1`, is in no total. The report says how a compound call's time is shared, and that a
background row counts from launch to completion and can overlap other rows. The dispatches view reads each `Agent` result's
`totalDurationMs`, `totalToolUseCount`, and `totalTokens`; a background (`run_in_background`) dispatch's
own result carries none of these, so its figures come from the later task-notification entry's `<usage>`
block instead, keyed by the dispatch's tool-use id. A dispatch whose notification never arrives is
reported as "not yet notified", never counted as zero (INV-0101) and never reported unrecognized. A
failed or killed dispatch's notification carries `<status>` and no `<usage>` block at all. A dispatch
refused before it ran carries no notification at all — only its own tool_result string: the fixed string
`User rejected tool use` for a rejection at the permission prompt, a string starting "Error: Permission
for this action was denied by the Claude Code auto mode classifier" for a classifier denial, or a string
starting "Error: PreToolUse:Agent hook error:" for a hook block. The report names that status — "failed",
"killed", "rejected", "denied", or "blocked" — in place of a duration, still never zero and never
unrecognized. The view groups dispatches whose time spans overlap into numbered parallel batches,
flagging each batch's longest.

The report closes with the **Time sinks** section (`CONTEXT.md`, ADR 0143), which `timeSinks` builds from
fixed rules alone (INV-0148). Machine time is the scope's summed phase wall time less human wait and idle.
A machine-time sink holds at least 20% of it, compared unrounded. The rules are:

- **Test runs.** The `scope.js test` and `scope.js fail-to-pass` keys, and every direct run of a
  configured verification command (`verificationCommands` from `plugin/lib/verification.js`), each call by its weighted
  share, with count, total, and median per mode. A direct run takes its mode from its own statement's
  words. A statement that matches the focused command, with `{paths}` standing for one or more words, is
  `focused`. A statement equal to the full command is `full`, and one equal to the whole command is `whole`.
  Any other statement that shares a configured command's key is `whole` when that key belongs to the whole
  command alone. Otherwise it is `full`. The run is labelled by that mode and joins the row of the same
  `scope.js test <mode>`. The lever is the focused command in
  `docs/agents/verification.md` when focused runs and full or whole runs both ran and the focused median
  is at least 80% of the full-or-whole median. Otherwise it is `/superdev:review-tests`.
- **Permission mode.** The tool time of the phases run in a prompting permission mode. Approval waits are
  inside that time, and the lever is the permission mode.
- **Model time, subagent time per agent type, and hook time per event.** Subagent time is the joined span
  of that type's dispatches. The hook sink uses the same slowest-hook figure as the phases view, for parallel Stop hooks of one summary. These sinks carry no lever.
- **Other commands.** Any other key's share, less the time the call overlaps another call's background
  test run. A loop that polls a background test run therefore counts toward the test-run sink alone. No
  lever.
- **Wait.** Human wait plus idle, when it exceeds machine time. With no machine time, it is the only sink
  that can appear. No lever.

Each call's figure leaves out the human wait it spans. The machine-time denominator leaves out human wait
and idle (INV-0102). Sinks are listed longest first, ties by name. Every remedy names the
focused command, `/superdev:review-tests`, or the permission mode, or says the repository holds no lever
(INV-0149). With no sink, the section says no dominant cause was found. When the report lists unfinished
calls or unrecognized entries, the section says its figures exclude them.

The exit codes are 0 for a report, 1 for no transcript directory, no segment for the slug, or an
unrecognized format, and 2 for an argument that is not a slug. Each non-zero exit prints one line on
stderr, and the first two name the slug and the path searched. Its suites build synthetic
transcript trees (`tests/profile-setup.js`) in a temporary directory and point `CLAUDE_CONFIG_DIR` and `HOME` at them. They split by topic (ADR 0151):
`profile` (repeated commands, command keying, background Bash calls), `profile-cli` (unrecognized entries and the CLI), `profile-dispatches`,
`profile-idle`, `profile-phases`, `profile-scopes`, and `profile-sinks`.

### run-tests.js, the suite runner

`node scripts/run-tests.js` runs every suite under `tests/` and the tail; `package.json` carries no test script. It discovers the suites under `tests/` by
name: every `*.test.js` file directly in that directory, in name order, so a suite added to the tree runs
with no roster edit. A helper (`spawn-verdict.js`, `fixture-git.js`, `linear-time.js`), a shared setup file (`tests/*-setup.js`), and a subdirectory
(`tests/fixtures/`) are not suites. It runs each suite under `node`, then the fixed tail: `invariant-check.js
--root .`, `drift-check.js --selftest`, `drift-check.js`, and `claude plugin validate ./plugin`. Every step,
suite and tail alike, prints one `run-tests: <label>: <ms> ms` line carrying its wall clock, which
`docs/agents/verification.md` names as the repository's timing command. The first
failure stops the run, prints which suite or tail command failed, and exits nonzero; a child that was
killed or never started counts as a failure (INV-0009). A `tests/` directory holding no suite prints
`no suite found` and exits nonzero.

`node scripts/run-tests.js --related <path>...` is the focused mode, the second fence of
`docs/agents/verification.md`. The tail always runs. `selectSuites` picks the suites the repository-relative
paths reach, matching by name, so a deleted path maps like any other. A suite is reached when its own text
names the changed file (its basename, or its bare stem between path or quote delimiters), when the shipped
file its name pins (`plugin/hooks/<name>.js`, `plugin/lib/<name>.js`, `plugin/scripts/<name>.js`, or `scripts/<name>.js`) is the
changed file or requires it, or the suite file itself requires it, or when the path is the suite itself. A suite split off another
(`tests/scope-ledger.test.js`, with no `scope-ledger.js` entry point shipped) pins the file of the longest
`-`-delimited prefix of its name that pins one (`plugin/scripts/scope.js`), and an exact pin wins. A test helper reaches every suite that names
it. A `.md` path follows the same naming rule, because a suite may execute or pin a document
(`tests/publish-kb-templates.test.js` runs the templates of `docs/agents/knowledge-base.md`, `tests/scope-ledger.test.js` pins a
sentence of `plugin/references/scope-mode.md`). A `.md` path also reaches a suite whose text names a directory
holding it, because a suite that lists or scans a directory reads every document in it
(`tests/model-explicit.test.js` lists `plugin/agents/`, `tests/invariant-check.test.js` scans `plugin/`). A named directory
is a path string that is a directory of the repository, or the literal segments of a `path.join` or `path.resolve`
call. A call whose first argument is `__dirname` or a literal is anchored at the repository root. A call whose leading
directory is computed (`path.dirname(hookPath)`) names its literal tail, which matches that tail at any depth, so
it may select a suite for a directory the suite does not scan and never misses one it does. A directory built from
computed expressions with no literal segment names nothing. The directory rule never applies to a code path. A `.md` path no
suite names, directly or by directory, and a path under `scripts/drift/`, reach no suite, because the drift selftest sits in the tail. A code path no rule places runs every suite, and an empty list runs the tail alone and exits 0. A path under
`mods/superdev-view/` places itself: it adds `claude plugin test mods/superdev-view` before the tail, and runs no
other suite unless one names it, so `scope.js fail-to-pass` can judge a range that only the mod suite tests. The full run
never runs the mod suite. The
`require` scan is a regex over relative `require` calls, wherever the call sits. It follows the edges from the
suite file and from its pinned file, and continues through a `plugin/lib/` module or a shared setup file under
`tests/` (a cycle ends the walk). It stops at any other file, a hook or script having a suite of its own. A focused run is never a full suite
(INV-0017).

Its suite is `tests/run-tests.test.js`, which calls `discoverSuites`, `selectSuites`, `parseArgs`, and
`runAll` against throwaway trees it removes at the end. It carries no roster of this repository's suites. The
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
  word. `Concepts`, and `Paths` or `Symbols` when present, each name at least one comma-separated item
  once trimmed. A bare `,` fails as naming no concept, path, or symbol. A `Breaks:`
  value is `silently` or `loudly`, matched case-insensitively, optionally followed by ` — ` and a
  reason and nothing else — anchored, so `loudly, silently` fails rather than passing as loudly and
  skipping the `Check:` requirement; any other shape fails too. A `Breaks: silently` entry carries
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
  anywhere but the register when the entry names none. A dotted symbol matches on its last segment. Every path-shaped
  token in `Check:` names a file; drift ids and quoted test names are prose and stay unchecked.
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
a glob matches the same files on every OS. `globMatcher` is its own: the CLI does not call `fs.globSync`, which needs Node 22. The validator filters and ranks no entry — `/superdev:plan` and
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
| `drift/scanners/` | the bespoke scanners, every check whose assertion is more than one pattern over one document. `index.js` is the barrel `checks.js` and the selftest require. One file per topic holds the scanners: `references.js`, `adr.js`, `prose-avoid.js`, `shell-spawn.js`, `base-branch-ship.js`, `marketplace-readme.js`, and `register-join.js`. `walkers.js` holds the document walks and the absence-check shape they share |
| `drift/lib.js` | what they share: `maskFences`, `maskedSentences`, `normalizeWhitespace`, `docPath`, `readDoc`, `missingDoc`, `observeContracts`, and `scanContract` |
| `drift/selftest/` | `index.js` (the `fixture` helper, `found`, `realRoot`, temp-dir cleanup, and the coverage assertion) plus one suite per scanner topic (`references`, `adr`, `prose-avoid`, `shell-spawn`, `base-branch-ship`, `marketplace-readme`, with the narrative-coverage cases in `register-join`), `contracts` (the table-driven checks), `checks` (every registered check against an empty tree), `observation` (the coverage observation itself), `drift-check` (`runChecks` and the registry wiring), and `register-join`, and `coverage.js`, the coverage verdict helper |

Every check tests a mechanical fact — a link or section target resolves, a number is unique, a file or
command exists, a property of code or configuration holds — or forbids a form in shipped prose (ADR 0153).
No check asserts how a positive clause is worded. A check that reads a named document fails, naming the
path, when that document is missing. A check that walks a directory reads whatever the directory holds.

| Check | What it tests | Class |
|-------|---------------|-------|
| `reference` | every `references/*.md` path that `skills/`, `agents/`, or `references/` names exists | structural |
| `source-sections` | `plan-contract.md`, `test-selection.md`, `content-types.md`, `controlled-prose.md`, and `review-checklist.md` still carry each section a reader is sent to, by heading | structural |
| `command-resolution` | every `/superdev:<name>` a skill or agent names has a `skills/<name>/SKILL.md` | structural |
| `readme-commands` | `README.md` names every shipped skill as `/superdev:<name>`, and no command without one | structural |
| `audit-set-globs` | `docs/agents/documentation.md` carries `## Audit set`, and every pattern listed there matches a file | structural |
| `marketplace-source` | each `.claude-plugin/marketplace.json` source resolves to a tree carrying `.claude-plugin/plugin.json`; a `git-subdir` source names this repository's clone URL and pins `ref` to `v` plus that tree's version | structural |
| `adr-numbers` | no two ADRs in `docs/adr/` share a number | structural |
| `adr-status` | every ADR carries a `**Status:**` line with a recognised value | structural |
| `adr-relations` | every ADR relation header links an existing ADR that carries the reverse header, and `**Status:** Superseded` goes with `**Superseded by:**` | structural |
| `invariant-register-join` | every drift id a `docs/invariants.md` `Check:` line names is registered, and every invariant a contract row cites covers that row's document in its `Paths:` | structural |
| `run-root` | the execution documents address run-root artifacts by `<run-root>/…`, never by a checkout-relative `.superdev/scopes/<scope>/…` path | prohibition |
| `scopetree-run-root` | `skills/ship/SKILL.md`, `skills/document/SKILL.md`, and `scripts/publish-kb.js` address another run's scopetree by `<run-root>/scopetree`, never by a checkout-relative path (ADR 0080) | prohibition |
| `change-type` | `references/scope-mode.md`, `hooks/scope-prune.js`, `CONTEXT.md`, and `lib/ledger.js` carry the same change-type set | structural |
| `no-second-reader` | no file under `plugin/hooks/` builds a ledger-header regex of its own, and no file under `plugin/lib/` other than `ledger.js` does (ADR 0022) | prohibition |
| `arg-token` | `hooks/merge-guard.js`, `hooks/ledger-guard.js`, `lib/ledger-writes.js`, and `lib/bash-command.js` require the shell scanner `shell-words.js` (`../lib/shell-words.js` from a hook) and declare no shell-word reader or `((` spread of their own (ADR 0135) | structural |
| `shell-spawn` | no file under `plugin/hooks/`, `plugin/scripts/`, or `plugin/lib/` starts a shell by absolute path, starts `bash`, or uses Node's default shell (INV-0153) | prohibition |
| `containment-delegation` | `lib/kb-containment.js` imports and calls `lib/containment.js`'s `testContainment` (ADR 0053) | structural |
| `past-pr-skills` | the skills an offer starts past the open pull request (ship, verify-ship, wrap-up, publish-kb) carry no `disable-model-invocation: true`, neither verify-ship nor wrap-up names `--unattended`, and ship, verify-ship, and `references/response-shapes.md` name no `--from-ship` (INV-0066, INV-0093, ADR 0157) | structural |
| `no-base-branch-commit` | no file under `skills/` or `references/` instructs a commit, a push, or a merge to the base branch, other than ship's host-API merge (INV-0001) | prohibition |
| `conflict-conclusion-no-commit` | no skill, agent, or reference concludes a resolved merge conflict with `git commit` (ADR 0123) | prohibition |
| `code-management-no-force` | no code-management document sends `force_merge: true` or `--admin` on a merge (INV-0092) | prohibition |
| `forgejo-tea-only` | no Forgejo backend document names a token env var, an `Authorization` header, or a curl call (ADR 0111) | prohibition |
| `kb-no-backend-call` | plan, document, `doc-writer`, and `doc-pass.md` carry no instruction that reaches a knowledge-base backend (ADR 0023) | prohibition |
| `agent-tool-agnostic` | no agent under `agents/` names a concrete toolchain command | prohibition |
| `deploy-runner-exclusivity` | no skill or agent but ship names a deploy target's command as something it runs (INV-0098) | prohibition |
| `ship-no-opens-pr` | no shipped surface attaches opening the pull request to `/superdev:ship` (ADR 0096) | prohibition |
| `derive-no-dod` | plan's derive dispatch bullet hands `final-reviewer` no Definition of Done, and `final-reviewer`'s `## Derive mode` reads none (INV-0158, ADR 0158) | prohibition |
| `unmapped-paths-form` | `skills/setup/SKILL.md` and `references/test-selection.md` propose no `{paths}` form to a runner that maps no source file to its tests (ADR 0074) | prohibition |
| `narrative-coverage` | this table carries exactly one row per registered check, and no row for an unregistered id | structural |

## Work Guidance

- Scripts and modules are CommonJS, like the hooks. `plugin/hooks/` and `plugin/scripts/` hold only entry points, and every module lives
  in `plugin/lib/` (ADR 0151). An entry point requires only modules, and a module requires no entry point, so a hook loads only the
  modules it uses and no module meets an incomplete `module.exports` while its entry point loads. Each module must stay `require`-able under
  plain `node`. `adopt`'s payload boundary is a pair of markers, not a heading, but a marker can still be shown inside a fenced
  illustrative example, so the marker scan needs the same fence-masking `md-sections.js`'s `extractSection()` already owns.
  `publish-kb.js` and `kb-patch.js` share `md-sections.js` through `kb-apply.js`, `kb-backend.js`, and the CLI itself.
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
- A new drift check tests a mechanical fact or forbids a form in shipped prose (ADR 0153). It is one
  entry in the `drift/checks.js` registry, one row in the table above keyed on its own `id`, and its own
  cases in the `drift/selftest/` suite of its topic: its seeded violation, a clean fixture, and, when it reads a
  named document, the missing-document case the registry-wide selftest asserts. The `narrative-coverage`
  check enforces the row. The selftest cases and the row's accuracy stay a review's job.

## Verification

`node scripts/run-tests.js` (repo root) runs each suite under `tests/`, then `invariant-check.js`
against this repository's register, then `drift-check.js`'s own `--selftest`, all under `node`, which
matches the production runtime. `node scripts/run-tests.js --related <path>...` is the focused run.

## Child DOX Index

None. `scripts/` has no subdirectories with rules of their own.
