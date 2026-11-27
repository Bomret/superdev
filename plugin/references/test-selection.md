# Test selection

Applies to every prose caller that runs a test or reads `docs/agents/verification.md`. Read the section your caller
cites at runtime.

## Every run answers a question

**The question.** Applies before every test run. Make a run only where it answers one question below that no cheaper
source and no earlier run at the same commit answers. Make the smallest run that answers it: one test picked by the
runner's own filter (a test name, a `-t`/`-k`/`--grep` pattern, a `file:line`) where the runner allows one.

- **An increment's run:** one run of the increment's test file, after its new test is written and before the code
  that passes it is. It shows the new test failing and the file's earlier tests passing. No separate passing run
  follows it.
- **The focused run:** the tests the changed paths reach pass. Once per work unit, over its whole changed-path set,
  after its last commit, as its last check (`## The changed-path set`).
- **The fail-to-pass run:** the tests detect the change. Once per range, after the focused run. It reuses a passing
  run from the run trace where it admits one, and settles from the trace where the trace holds every run it needs.
- **A gate's run:** the integrated scope passes where no record or carry already shows it.

**A run that answers nothing.** Applies to every other run. Make none of these: a rerun of a passing run at the same
commit on a clean tree, a run after a change to Markdown or prose alone, and a wider run where a narrower one answers
the question. Rerun a failing run only after a change meant to fix it.

## The two commands

**The two fences.** Applies to `docs/agents/verification.md` in a repository with a suite. Its first fenced block is
the **full command**, run verbatim. Its second fenced block is the **focused command**, a command that costs less than
the full suite: a run scoped to changed paths, or a fast subset such as the unit tests alone. A repository with no
suite carries no such file.

- **The focused command where narrowing is impossible:** the second fence repeats the full command, with prose beside
  it stating why.
- **Position decides.** A fence is reserved for these two commands. A watch command, a coverage command, sample
  failure output, the reason for a repeated full command, and everything else stays unfenced, as prose or a backtick
  span. A third fence reads as nothing.
- **Fence syntax.** A fence opens on a line of three or more backticks or tildes, indented by up to three spaces,
  with any info string after them (a backtick fence's info string holds no backtick). It closes on a line of the same
  character at least as long as the opener. A fence that never closes holds no block.

**The runner.** Applies to every full, focused, whole-repo, and direct test run. Run it through `scope.js test` from
the tree the work lives in: `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test full`, `test focused [<path>…]`,
`test focused --since <ref>`, `test whole`, or `test path <file>... -- <command>` and `test path --since <ref> --
<command>` for the test files it names. The runner runs the configured command as configured, `test path` runs its
command as given from the current directory, and either records one run line with the command's own exit status
however the call is piped, redirected, backgrounded, or wrapped.

- **Secrets.** A test command is recorded as typed and pushed with the run state. Keep a secret in the environment.
- **Trimming output.** Pipe the runner into `tail`, or redirect it to a file outside the working tree, such as one
  from `mktemp` under `$TMPDIR`, and read the file afterwards. A redirect into the working tree leaves an untracked
  file, and on a passing run it also records an implementation edit.
- **A run outside the runner.** The run trace records it as `unknown` whenever its exit status does not reflect the
  test. An `unknown` run is no passing run: `scope.js suite reusable` never reuses it, and the suite runs again at
  the next gate.
- **The whole-repo command** is the third command (`## Whole-repo command`). `scope.js suite reusable` reads its runs
  too.

**The background wait.** Applies to every test run, every `scope.js fail-to-pass` call, and every `scope.js prepare`
call, in the main session and in a dispatched subagent alike. Run it in the background, redirected to a file outside
the working tree, with its exit status appended: `<run> > "$f" 2>&1; echo "exit=$?" >> "$f"`. Wait with Bash calls
that each end within 170 s: `timeout 170 sh -c 'until grep -q "^exit=" "$f"; do sleep 5; done'`. Repeat the call until the
file holds the `exit=` line. Then read the file (ADR 0264, ADR 0291).

- **A run may first wait for a test slot.** The `test`, `fail-to-pass`, and `prepare` verbs each hold one of the
  repository's **Test slots** (CONTEXT.md) while their command runs, and wait while none is free. A waiter prints one
  stderr line naming the run that holds the slot and its record.
- **The Bash ceiling never ends a run.** The ceiling is 600000 ms unless `BASH_MAX_TIMEOUT_MS` raises it, and a run
  that waits for a slot, or one whose two runs and preparations outlast it, would end at it in the foreground. Claude
  Code also moves a subagent's foreground Bash call to the background after about 180 s, whatever its `timeout`, and
  stops it when the subagent's run ends.
- **`scope.js fail-to-pass`** runs its command twice, after a prepare where one is configured, and holds one slot for
  the whole call. A verb the ceiling kills writes no outcome line.
- Start no second copy of a running run, and end no turn while it runs.

## Affected form

**What qualifies.** Applies to a full command that selects projects instead of running the whole suite verbatim. It
qualifies only where the repository's own dependency-graph tool (nx, turborepo, pnpm, or dotnet-affected) selects the
changed projects and every project depending on them, and runs each selected project's whole suite. It never selects
fewer projects than the change can break: a change the graph cannot attribute to one project selects every project.
Selection by path prefix does not qualify.

- It exits green when the change reaches no project.
- It selects at least one project on a change that touches one, and its target exists on the selected projects.
- A repository whose full command takes this form also configures the whole-repo command (`## Whole-repo command`).

**Setup's check.** Applies to `/superdev:setup` before it writes an affected form. Setup checks the selection and the
target through read-only tool queries. The operator confirms the green exit on no affected project from the tool's
docs. Setup runs no test command and never starts the form.

## Whole-repo command

**The section.** Applies to an optional `## Whole-repo command` section of `docs/agents/verification.md`. It holds one
command that runs every project's suite, in a backtick span and never in a fence. A repository configures one only
together with an affected form (`## Affected form`). An absent section leaves the full command as the whole suite.

**Its readers.** Applies to ship and submit-pr. On its local path, `/superdev:ship` runs the whole-repo command in
place of the full command on a tip that carries no green `whole` record, and reuses a green `whole` record of that tip
instead. `/superdev:submit-pr` names it as where the full suite runs and runs nothing (ADR 0255).

## Prepare command

**The section.** Applies to an optional `## Prepare command` section of `docs/agents/verification.md`. It holds the
one shell command that makes a new worktree of the repository ready to run its tests, such as a dependency install. A
fence inside the section is no command and never shifts which fence is the full or the focused command.

- **Three states.** The section's first backtick span is the command. The span `` `none` ``, or with no span a line
  holding the bare word `none` in lowercase, states that a new worktree needs no preparation. No section, or a
  section holding neither, is absent.
- **No preparation is a test command.** It never changes which command runs as the full, the focused, or the
  whole-repo command.

**`scope.js prepare`.** Applies to every worktree superdev creates or reuses for a test run. Call
`scope.js prepare <tree>` before its first test run (`scope-branch.md`'s `## Preparing a worktree`); the verb runs
the command at the worktree's root, reading `<tree>`'s own `verification.md`. The call is no test run. A command
that fails, is ended by a signal, cannot start, or changes a tracked file exits 3.

- **A prepared tree skips it.** A run that succeeds on a tree with no tracked change leaves a stamp in the tree's git
  directory. The next call on that tree skips the command and prints one note while the command is the same, every
  untracked path the run left is still there, and every tracked change and every new untracked file git does not
  ignore is a Markdown file. A test, source, or manifest change runs the command again.

**`scope.js fail-to-pass`'s preparation.** Applies to the fail-to-pass verb. It runs the prepare command in its own
worktree before each of its two runs, reading the tip's `verification.md` once, and a reused control skips the
first one. A preparation that fails, is ended by a signal, cannot start, or changes a tracked file makes the outcome
`unknown`, with a `prepare=` reason.

- **The clean between runs** keeps every path the first preparation wrote, so the second run sees what the first
  preparation built from the tip's files. A prepare command whose output depends on source files, such as a build
  into `dist/`, removes output that the put-back files no longer produce itself. An install-only command needs
  nothing more.
- **The reuse gate.** The verb takes a passing control from the run trace only where the tip states a command or
  `none`. With the section absent, the control runs in the verb's worktree.

## CI

**The section.** Applies to an optional `## CI` section of `docs/agents/verification.md`. It lists the **Named
check**s (`CONTEXT.md`) that together run the full suite on every pull request, or reads `none` (ADR 0255).
`/superdev:setup` writes it, and `scope.js ci` reads it at a commit through git, never from a working tree.

- **Names.** Each name sits in a backtick span, one list item each. Every backtick span outside a fenced block other
  than `none` counts as a name, and a bare `none` line counts as `none`, so prose in the section carries no span. The
  reader cuts the section out before it reads the fences, so a fence placed there is never a test command.
- **Matching.** A name matches the code host's check-run names and commit-status contexts exactly and
  case-sensitively. A name listed twice is one requirement.

**What it decides.** Applies to every reader of the section.

- **Absent, `none`, or holding no name** → no named checks: `/superdev:ship` runs the full command, or the whole-repo
  command, locally on the head it merges.
- **Names present** → `/superdev:ship` merges only when every named check reads green on the exact head it merges,
  and runs no local suite (INV-0191). A check not named counts for nothing, so a CI that runs part of the suite records
  `none`.
- **Both `none` and a name** → a configuration error `scope.js ci` cannot judge: ship refuses, submit-pr reports it
  and asks no ship question, and review says so once and continues.

## Timing command

**The section.** Applies to an optional `## Timing command` section of `docs/agents/verification.md`. It holds one
command, in a backtick span and never in a fence, that reports what the suite's tests cost: per-test durations where
the runner gives them, total wall clock otherwise. `/superdev:review-tests` is its reader and ranks its findings by
the measured cost. `scope.js test timing` is its runner: it runs the command from the tree root under a test slot,
records a `timing` run line inside a run tree, and prints `test: timing ran <ms> ms`, the command's own run time with
the slot wait excluded. No gate counts a `timing` run line as a full, focused, or whole-repo run.

- **An absent section** leaves the audit `unmeasured`, ranking by judgment instead. A repository states the reason
  it configures none as prose beside the section's absence.

## Test paths

**The section.** Applies to an optional `## Test paths` section of `docs/agents/verification.md`. It lists the glob
patterns that name the repository's test files, as an unfenced list, one pattern per list item, optionally in a
backtick span. `hooks/run-trace.js` reads it to class each recorded edit as `test` or `impl`, from the tree the edit
lands in.

- **Pattern syntax.** `*` matches within one path segment, `**` across segments, and a trailing `/` marks a
  directory. A pattern holding a `/` matches from the repository root. A pattern without one matches a file name at
  any depth.
- **A malformed entry is skipped**, and the others still apply: an entry with whitespace, a leading `/`, or a `..`
  segment.
- **The defaults** apply to an absent section and to a section with no usable entry: `tests/`, `test/`,
  `__tests__/`, and `spec/` directories at any depth, matched by whole path segment; directories whose name ends in
  `.Tests` or `.Test`; and the file names `*.test.*`, `*.spec.*`, `*_test.*`, `test_*.py`.

## The `{paths}` token

**Substitution.** Applies to a focused command that contains the token `{paths}`. Pass the changed paths to the
runner as arguments, each path its own argument (`scope.js test focused <changed paths>`), and the runner substitutes
the shell-quoted set for the token. Or run `scope.js test focused --since <ref>`, which takes the set from git: every
path changed since `<ref>`, committed and uncommitted, plus untracked files git does not ignore, relative to the tree
root.

- A `test focused` with no paths runs the full command and records `full`.
- An empty path argument is refused. An argument that holds whitespace and names no file is a joined path list, and
  is refused.
- A `--since` run is a path-given run and records the paths it resolved. An empty resolved set is refused and never
  runs as the full command.

**Which runner takes `{paths}`.** Applies to a repository choosing its focused command. A `{paths}` form belongs to a
runner that maps a source file to the tests covering it, such as `vitest related` or `jest --findRelatedTests`. Such a
form also carries that runner's pass-with-no-tests flag, so a change set holding no tests, such as one of prose or
source files alone, reports green.

**No token.** Applies to a focused command without `{paths}`. Run it verbatim.

- A **fixed fast subset** (`pytest tests/unit`, `go test ./internal/...`) names its tests itself and always collects
  tests.
- A **self-detecting runner flag** (`vitest --changed`, `jest -o`) computes the change set on its own and collects
  nothing from an empty one. It carries the runner's own pass-with-no-tests flag (`vitest --changed
  --passWithNoTests`, `jest -o --passWithNoTests`).

**A path shaped like an option.** Applies to a changed path such as `--config.js`. Quoting keeps the shell from
splitting a path, and it does not keep the runner from reading it as an option. Rely on a `--` separator only where
the runner's own CLI reference documents one; neither `vitest related` nor `jest --findRelatedTests` documents one.

## Complete selector

**The declaration.** Applies to an optional `## Complete selector` section of `docs/agents/verification.md`. It
declares that the focused command, given the changed-path set, selects every test any changed path can affect. It
takes effect only where the focused command carries `{paths}`.

- **Listed files.** The section may list the selector's own files as list items (marker `-`, `*`, `+`, or an ordered
  `1.`), one path from the repository root in the item's first backtick span; text after the span is a comment. A
  listed path covers itself and every path under it, a trailing `/` being optional.
- **Reading.** The heading is read outside code fences, and the section runs to the next heading of level 2 or above.

```markdown
## Complete selector

The focused command selects every test a changed path can affect.

- `scripts/run-tests.js`
```

**The complete-selector carry.** Applies to `scope.js suite reusable` under the declaration, read from the tip
commit, never a working tree. A green record at an ancestor A carries to the tip T, with its kind, when the run trace
backs A as it does at an exact tip and a passing focused run on a clean tree at T recorded a path set covering every
path changed in A..T.

- **Changed paths.** A rename counts both its sides, and a deletion counts. Changed paths are listed from the root
  whatever the working directory and `diff.relative`.
- **Coverage.** A changed path is covered only where the recorded set names that path itself: a directory, the
  repository root included, covers no file under it. Recorded paths are normalized to repository-root paths before
  they are compared.

**Refusals.** Applies to the complete-selector carry. It is refused, each time with its own reason, when:

- the section is absent, or the focused command carries no `{paths}`;
- A is not an ancestor of T, or the record is not green;
- a path changed in A..T is a listed path or a path under one, or is a `docs/agents/verification.md` whose **Run
  configuration** (CONTEXT.md) differs between A and T; the reason names the part that changed;
- the latest focused run at T failed, ran on a dirty tree, read `unknown`, covered fewer paths than changed, or
  carries no recorded path set (a run an earlier release wrote, or one made by a direct call); only passing clean
  runs after the last failed focused run at T count toward coverage;
- a full, whole, or path run at T failed;
- git cannot answer a step of the decision.

**Read-time only.** Applies to every carry. No verb writes a carried record, and every carry is judged from its
record's own commit. A focused run over only the paths since an intermediate tip therefore carries nothing.

**The Markdown-only carry.** Applies to a repository without the declaration, and to a Markdown-only range under it.
A green record at an ancestor A carries to T when the run trace backs A, every path changed in A..T ends in `.md`, and
none is a test path at T. It also needs `docs/agents/verification.md` to carry the same run configuration at A and at
T, no full, whole, path, or focused run recorded at T to have failed, and the latest run recorded at T not to read
`unknown`.

- It needs no test run at T, and a passing run on a dirty tree refuses nothing.
- A `verification.md` git cannot read at either commit refuses.

**The chained carry.** Applies under the declaration. A green record at A carries to T when some commit M on the
ancestry path from A to T takes the complete-selector carry from A, judged at M, and M..T takes the Markdown-only
carry, judged at T. Each leg compares the run configuration at its own two commits. A gate that reached M by carry
leaves the record at A, so a doc pass's Markdown commits after M carry with no test run at T.

## The carry run

**Who takes it.** Applies to every gate whose `scope.js suite reusable` call refuses the tip: ship's local suite gate
(§3), and ship's moved-base gate and push gate (§4), each on ship's local path. Run the steps below in order before
the gate runs the full command or refuses. Ship's CI path takes no carry, and implement runs no full suite.

1. **Check the preconditions.** One `scope.js state --root <run-root>` call prints the `suite` field. The
   preconditions are all of these, and any one missing goes to step 4:
   - a green record at a commit A, or a red record at A whose failing test files `## The recorded rerun`'s step 1
     recorded (its `failed` field prints `<test-file>... @ A`, and the record carries no `whole` kind);
   - A differs from the tip;
   - the record carries the kind `whole` where the gate calls `suite reusable --whole`;
   - `git merge-base --is-ancestor A <tip>` succeeds;
   - the tip's own `docs/agents/verification.md` (`git show <tip>:docs/agents/verification.md`) carries the
     `## Complete selector` section, and the focused command carries `{paths}`.
2. **Run the focused command over A..<tip>.** After a red record at A, first run the files that `failed` field
   prints through `scope.js test path <file>... -- <command running only those files>` at the tip on a clean tree,
   from the tree root. A failing run of them is the gate's red result, as step 3 states for the focused run. Then,
   from the tree the gate works in, at the tip on a clean tree, run `scope.js test focused --since A`. A path set too
   large for the command to start leaves no passing run: go to step 4.
3. **Judge the focused run.**
   - **It fails** → the gate's red result. Record it with `scope.js suite set red <tip> --root <run-root>` (with
     `--whole` where the gate runs the whole-repo command), and the gate takes the exit a failing full run takes. A
     failing carry run takes no `## The recorded rerun`.
   - **It passes** → call `scope.js suite reusable` again. Exit 0 → the tip is carried, and the gate runs no full
     command.
4. **No carry.** A missing precondition (such as a record at the tip itself, or a record with no `whole` kind at a
   `--whole` gate), a refused second call, a killed or `unknown` focused run, or a path set too large: the gate takes
   its own no-carry exit.
   - **Ship's moved-base gate** runs the full command, or the whole-repo command where one is configured, and records
     its result as the gate states.
   - **Ship's local suite gate** runs the full command, or the whole-repo command where one is configured, after its
     standing-finding check.
   - **Ship's push gate** takes the local full run on the tip, and pushes nothing on a failing carry or a red, denied, or unfinished run.

**The record stays.** Applies to a tip reached by carry. Write no suite record for it: the record stays at A, and the
next gate judges its own tip from A.

## The recorded rerun

**Who takes it.** Applies to every gate that records a failed full run at a tip T, under the `## Complete selector`
declaration. Run the steps below in order, once per tip. A full run at T that fails in one test file counts green once
the rerun is recorded and passed, and step 1 records the failing test files of every attributable failed full run for
`## The carry run` at the fix cycle's tip.

1. **Attribute the failure.** Read the failed run's own output.
   - **It ran to its end**, closing on a summary that covers the whole suite, and names one or more test files and no
     failure outside them → after `scope.js suite set red <tip> --root <run-root>`, record them with
     `scope.js suite failed <file>... --root <run-root>` from the checkout at the tip. Exactly one file → step 2.
     Several files → the failure stays red at this tip, and the gate takes the exit a failing full run takes.
   - **No file named, a failure outside any test file, or a run that stopped at its first failure** (a fail-fast
     option such as `--bail`, `-x`, or `-failfast`) → the failure is unattributable. It records no files and stays
     red, and the gate takes the exit a failing full run takes.
2. **Write the triage record.** File it through the repository's triage flow with the failing lines quoted verbatim,
   and keep its reference (`#<n>` or the record's id, one token).
3. **Record the rerun.** Run `scope.js suite rerun <test-file> <triage-ref> --root <run-root>` from the checkout at
   the tip. The verb refuses a tip that already carries a rerun record, so a second failure at the tip stays red.
4. **Run the file alone.** Run `scope.js test path <file> -- <command running only that file>` at the tip on a clean
   tree, from the tree root, through the runner. A failing or dirty rerun stays red.
5. **Run the focused command over the scope's range.** Run `scope.js test focused --since <range-base>` at the tip on
   a clean tree. `<range-base>` is what `scope.js base resolve --branch <branch> --base <base> --root <run-root>`
   prints, `<base>` being the base branch `docs/agents/code-management.md` names.
6. **Check reuse.** Run `scope.js suite reusable --branch <branch> --base <base> --root <run-root>`; without `--base`
   the verb refuses. Exit 0 → the gate takes its green exit, and the suite record stays `red` at T. Exit 1 → the gate
   takes the failing-run exit.

**What `scope.js` checks.** Applies to the rerun's reuse decision. It checks the ledger and the run trace for all of
these:

- the rerun record for the tip;
- the file alone, and no other file in the same run, passing clean at the tip after the failed full run, run at the
  tree root;
- every run of it alone recorded there after that failure, from any directory, passing clean; a run of it before the
  failure counts for nothing;
- a passing clean focused run there after the failed full run, whose recorded path set covers every path from
  `base resolve`'s range base to the tip;
- the declaration, exactly one failed full run at the tip, and no failed run of another test file at the tip.

A recorded file name is read against the directory the run was made in, so `a.test.js` from `tests` is
`tests/a.test.js`. Nothing reruns on its own, and no step reruns a failed suite until it passes.

**A later tip.** Applies to a later tip U that T is an ancestor of. The `red` record at T counts at U when every check
above holds judged at T and T..U passes the Markdown-only carry of `## Complete selector`, judged at U. A doc pass's
Markdown commits after a gate that passed on the rerun need no test run at U.

## A fix cycle's runs

**No run inside the cycle.** Applies to review's fix loop. The loop runs no test inside a cycle and no full-suite run.
The cycle's implementer runs the tests that verify its fix and its fail-to-pass run over the cycle's commits, per
`## The changed-path set`. The re-review reads those runs from the run trace.

## The changed-path set

**A chain gate's carry run.** Applies to `## The carry run`. Its set is every path changed from the suite record's
commit to the gate's tip.

**The build loop.** Applies to the implementer's TDD loop, the lite tier's inline loop, and a fix cycle.

1. **Each increment** runs its one test file once through `scope.js test path <file> -- <command>`, a runner filter
   allowed, after it writes the new test and before it writes the code that passes it. That run shows the new test
   failing and the file's earlier tests passing. No separate passing run per increment and no separate control run
   follows.
2. **The final run.** Once the last increment is committed, one `scope.js test focused --since <ref>` runs over the
   whole changed-path set as the last passing run and the final check, `<ref>` being the slice base, or `<cycle-base>`
   on a fix cycle. Name the ref, and never build the path list in the shell. A step that works on no test file makes
   this run too.
3. **A failing final run** is a RED step: fix, commit, and run it again.
4. **The order.** The final run runs before the fail-to-pass run, and the trace settlement of ADR 0251 counts it as
   the passing run over each test file it names.

**Only the work's tests.** Applies to every loop run. A loop run names a ref or at least one path, or runs test files
through `test path`. `test full`, `test whole`, and a `test focused` with neither a path nor a ref run only at ship's
gates, and in an ad-hoc review where the operator asks for the full suite. The run trace records every run, and a
focused command with no `{paths}` token runs verbatim.

**Red evidence in a fix cycle.** Applies to a review fix cycle whose list holds a red-evidence finding.

- **A finding that names failed test files** needs a passing `path` run of each at the cycle's tip, in either fence
  configuration. Where the fences differ, make that `path` run unless the final focused run's recorded path set
  already holds the file.
- **A finding that names no failed test file** (a failed named check, or a red suite record whose `failed` field
  prints no file), where the fences differ → widen the final run to `scope.js test focused --since <range-base>`,
  `<range-base>` being the scope's range base the implementer resolves from the dispatch's range-base input.

**A focused fence that repeats the full fence.** Applies where the second fence of `docs/agents/verification.md`
repeats the first. `test focused` there runs the whole suite whatever paths it gets, so the loop makes no whole-set
run.

- Each increment runs its test file through `test path`.
- The final run is one `scope.js test path --since <ref> -- <command>` over every test file the range changed, plus
  one `test path` run of each failed test file a red-evidence finding names, from the tree root with the verb's exact
  command, which the fail-to-pass verb reuses as its first run.
- A finding that names no failed test file widens that run to no other file. That run, passing at the cycle's tip on
  a clean tree, closes the finding, or the clean tip does where the cycle changed no test file, per
  `review-scope-mode.md`'s `### 4.2 Red evidence`; ship checks the evidence again.
- A step that works on no test file makes no run. The full-suite evidence ship takes covers that work, and the
  fail-to-pass run still runs.

**The documentation step.** Applies to the doc pass. It runs no test command and builds no set. `scope.js suite
reusable` carries a green record across Markdown-only commits with no test run at the tip, through a tip a gate
reached by the complete-selector carry too (`## Complete selector`). A `red` record at a tip that passed on
`## The recorded rerun` counts at the doc commits too.

**The fail-to-pass verb.** Applies to `scope.js fail-to-pass`. Its caller hands it the command, written to run every
test file the range adds or modifies in whatever form the runner selects them: `cargo test --test foo`,
`dotnet test --filter Orders`, or one runner per package in a monorepo. The verb reads none of its words, and the
outcome line records it for the reviewer.

- Every path changed in `<base>..<tip>`, with a rename split into its old and its new path (`--no-renames`), decides
  what the second run puts back.
- The test paths come from the tip's own `docs/agents/verification.md`, never a working tree's.
- The verb refuses an empty range, so `## Fallback to the full command` never applies to it.

## Fallback to the full command

**The one fallback.** Applies to a focused run given paths. Run the full command instead of the focused one when the
changed-path set is empty and the focused command consumes `{paths}`. A fixed fast subset and a self-detecting runner
flag carry no `{paths}` token and run unchanged on an empty set. A run given a ref never falls back: `scope.js test
focused --since <ref>` refuses an empty set and runs nothing.

## Stop on a missing focused command

**One fence.** Applies to a prose caller that finds exactly one fenced block in `docs/agents/verification.md`. Report
the missing focused command, name `/superdev:setup`, and run no command. Record the stop as a **degraded pass**, the
"pass that cannot complete its own work" shape of `scope-findings.md`'s `## Degraded passes`. A caller with no run
root, such as a standalone `/superdev:review`, takes only that shape's report half and says so in its own output.

**Zero fences.** Applies to a `verification.md` carrying no fenced block, prose-only or gutted by a hand edit. Read it
as an absent file: the repository has no suite to run.
