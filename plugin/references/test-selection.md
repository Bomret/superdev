# Test selection

The rule that picks between the full test command and the focused one. Every prose caller
reads this file at runtime, the same shared-file-read-at-dispatch pattern as `references/scope-mode.md`.

## Every run answers a question

Tests cost time, so every test run answers a question that no cheaper source and no earlier run at the same commit
answers. Before a run, know which of these it answers, and make the smallest run that answers it. The smallest is
often one test, picked by the runner's own filter (a test name, a `-t`/`-k`/`--grep` pattern, a `file:line`), not
the file or suite around it:

- **A failing-test step:** the new or changed test fails before the change. Run that test alone.
- **A passing-test step:** that test passes with the change. Run it alone. Only the last passing-test step runs the
  range's test files whole, once, as the fail-to-pass control.
- **The focused run:** the tests the changed paths reach still pass. Once per work unit, after its last commit.
- **The fail-to-pass run:** the tests detect the change. Once per range, reusing the last passing-test step.
- **A gate's run:** the integrated scope passes where no record or carry already shows it.

A run that answers none of these is not made: a rerun of a passing run at the same commit on a clean tree, a run
after a change to Markdown or prose alone, and a wider run where a narrower one answers the question. A failing run
is rerun only after a change meant to fix it.

## The two commands

`docs/agents/verification.md` carries two fenced code blocks in every repository with a suite.
A repository with no suite at all carries no such file.

- **The full command** is the first fenced block. Run it verbatim.
- **The focused command** is the second fenced block, and it is the command the loop runs
  once over its whole changed-path set, after the work is committed. What defines it is that it **costs less than the full suite**: a run scoped to a set of
  changed paths qualifies, and so does a fast subset — the unit tests, with the slow integration tests
  left out. Where narrowing is impossible, the second fence records the full command again, with prose
  beside it stating why. A second fenced block is **only ever** the focused command — never a watch
  command, a coverage command, or sample failure output.

**Run the full, focused, or whole-repo command through `scope.js test`**. From the tree the
work lives in, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test full`, `test focused [<path>…]`, or
`test whole`, and `test path <file>... -- <command>` for a direct run of the test files it names. The runner runs the configured command
as configured, and `test path` runs its command as given from the current directory, and records one run line with the command's own exit status, however the caller pipes,
redirects, backgrounds, or wraps the call. A test command is recorded as typed and pushed with the run state, so a secret belongs in the environment, never on the command line. To trim the output, pipe the runner into `tail`, or redirect it to a
file outside the working tree, such as one from `mktemp` under `$TMPDIR`, and read the file afterwards.
A redirect into the working tree leaves an untracked file, and on a passing run also records an implementation edit.
**Every test run passes the Bash tool's `timeout` at its ceiling, 600000 ms unless `BASH_MAX_TIMEOUT_MS` raises it, and runs in the foreground.
Only a run that can outlast the ceiling runs through the runner in the background, and you wait for
its end before acting on it.** **`scope.js fail-to-pass` follows the same rule:** it runs its command twice, after a
prepare where one is configured, so run it in the background when two runs of the range's test files can outlast the ceiling,
and wait for its end before you read its outcome. A verb the ceiling kills writes no outcome line. The run trace records a run made outside the runner as `unknown` whenever its
exit status does not reflect the test. An `unknown` run is no passing run, so `scope.js suite reusable` never
reuses it and the suite runs again at the next gate. The whole-repo command is the third command
(`## Whole-repo command` below), and `scope.js suite reusable` reads its runs too.

Both commands are taken **by position**, so a fence is reserved for them alone. A watch command, a
coverage command, sample failure output, the reason a repository records for duplicating the full command
as the focused one, or anything else a repository keeps in `verification.md` stays **unfenced** — prose,
or a backtick span. A third fence is read as nothing at all.

A fence opens on a line of three or more backticks or tildes, indented by up to three spaces, with any info
string after them (a backtick fence's info string holds no backtick). It closes on a line of the same
character at least as long as the opener. A fence that never closes holds no block.

## Affected form

The full command may take an **affected form**: instead of running the whole suite verbatim,
it selects through the repository's dependency-graph tool the changed projects and every project
depending on them, dependents included, and runs each selected project's whole suite using nx, turborepo,
pnpm, or dotnet-affected. It never selects fewer projects than the change can break: a change the graph
cannot attribute to one project selects every project. It exits green when the change reaches no project, it selects at least one project on a change that touches one, and its target exists on the selected projects. `/superdev:setup` checks the second and third through read-only tool queries, and the operator confirms the first from the tool's docs, before it writes the form. Setup runs no test command and never starts the form.

Selection by path prefix does not qualify — a change to a shared library reaches every project that
depends on it, and a prefix match over changed paths cannot see that dependency. Only the repository's
own dependency-graph tool selects.

A repository whose full command takes this form also configures the **whole-repo command** below.

## Whole-repo command

An optional **`## Whole-repo command`** section, holding one command that runs every project's suite —
the check a repository whose full command is an affected form still needs before a merge lands. A
repository configures one only together with an affected form.

- **Its command lives in a backtick span**, per the rule above — a fenced block would land in the
  focused slot the same way the timing command's would, and every caller would then run it as the
  focused command.
- **`/superdev:submit-pr`, `/superdev:ship`, and a scope review read it**: submit-pr runs it
  once on the scope branch's tip before opening the pull request and reuses a green `whole` record of that
  tip instead, ship runs it on a tip that carries no green `whole` record, and a review entered while the suite record reads red of kind `whole` runs it at its exit run in place
  of the full command.
- **An absent section leaves the full command as the whole suite**, and every caller unaffected. submit-pr
  then runs ship's plain reuse check, which runs no test, and routes a tip ship would refuse to
  `/superdev:review`.

## Prepare command

An optional **`## Prepare command`** section, holding the one shell command that makes a new worktree of the
repository ready to run its tests, such as an install of its dependencies. A new worktree holds the
tracked files only, so a repository whose tests need installed dependencies states this command.

- **Three states.** The section's first backtick span is the command. The span `` `none` ``, or with no span a line
  holding the bare word `none`, lowercase, states that a new worktree needs no preparation. No section, or a
  section holding neither, is absent.
- **Its command lives in a backtick span**, per the rule above: a fence inside the section is no command, and it
  never shifts which fence is the full or the focused command.
- **`scope.js prepare <tree>` runs it** at the root of a worktree, reading `<tree>`'s own `verification.md`. Every
  worktree superdev creates or reuses for a test run calls the verb before its first test run
  (`scope-branch.md`'s `## Preparing a worktree`). The call is no test run. A command that fails, is ended by a
  signal, cannot start, or changes a tracked file exits 3.
- **A tree already prepared skips it.** A run that succeeds on a tree with no tracked change leaves a stamp in the
  tree's git directory. The next call on that tree skips the command and prints one note while the command is the
  same, every untracked path the run left is still there, and every tracked change since is a test path or a
  Markdown file. A source or manifest change runs the command again, since the verb cannot know which files the
  command reads.
- **`scope.js fail-to-pass` runs it** in its own worktree before each of its two runs, reading the tip's
  `verification.md` once. The clean between the runs keeps every path the first preparation wrote, so a command
  that skips work already done prepares the second run fast. A reused control skips the first one. A preparation that fails, is ended by a signal, cannot start, or changes a tracked file
  makes the outcome `unknown`, with a `prepare=` reason.
- **The reuse gate.** `scope.js fail-to-pass` takes a passing control from the run trace only where the tip states
  a command or `none`, because only then does its worktree hold what the tree that recorded the control held. With
  the section absent, the control runs in the verb's worktree.
- **No preparation is a test command.** It never changes which command runs as the full, the focused, or the
  whole-repo command.

## Timing command

An optional **`## Timing command`** section, holding one command that reports what the suite's tests
cost: per-test durations where the runner gives them, total wall clock otherwise.

- **Its command lives in a backtick span**, per the rule above — a fenced block would land in the
  focused slot of a repository that has not yet recorded a focused command, hiding the missing
  configuration, and every caller would then run the timing command as the focused command.
- **A test audit is its only reader.** `/superdev:review-tests` runs it to rank its findings by
  measured cost. Nothing in the implement loop reads it.
- **An absent section leaves the audit `unmeasured`**, ranking by judgment instead, and every other
  caller unaffected. A repository states the reason it configures none as prose beside the section's
  absence.

## Test paths

An optional **`## Test paths`** section of `docs/agents/verification.md`, listing the glob patterns that
name the repository's test files. `hooks/run-trace.js` reads it to class each recorded edit as `test` or
`impl`, from the tree the edit lands in.

- **Its entries are an unfenced list**, per the rule above: one pattern per list item, optionally in a
  backtick span. A fence would land in the focused slot.
- **A pattern uses `*` (within one path segment), `**` (across segments), and a trailing `/` for a
  directory.** A pattern holding a `/` matches from the repository root. A pattern without one matches a
  file name at any depth.
- **A malformed entry is skipped** and the others still apply: an entry with whitespace, a leading `/`,
  or a `..` segment.
- **An absent section applies the defaults**: `tests/`, `test/`, `__tests__/`, and `spec/` directories at
  any depth, matched by whole path segment; directories whose name ends in `.Tests` or `.Test`; and the
  file names `*.test.*`, `*.spec.*`, `*_test.*`, `test_*.py`. A section with no usable entry applies them too.

## The `{paths}` token

Where the focused command contains the token `{paths}`, substitute the shell-quoted changed-path set
for it. The caller passes the paths to the runner as arguments (`scope.js test focused <changed paths>`),
and the runner substitutes them; a `test focused` with no paths runs the full command and records `full`, and an empty path argument is refused. Pass each path as its own argument: an argument that holds whitespace and names no
file is a joined path list, and is refused.
**A `{paths}` form belongs to a runner that maps a source file to the tests covering it** — for
example `vitest related` or `jest --findRelatedTests`. The changed-path set holds source files and prose
alongside tests, and a runner without that mapping collects nothing from them. Such a form also carries
that runner's pass-with-no-tests flag, so a change set holding no tests reports green: a change set of
only prose or only source files reaches exactly that case.

Where the focused command contains no such token, run it verbatim. Two shapes take this form: a **fixed
fast subset** (`pytest tests/unit`, `go test ./internal/...`) always collects tests, since it names them
itself rather than deriving them from the change set. A **self-detecting runner flag** (`vitest --changed`,
`jest -o`) computes the change set on its own, exactly as a `{paths}` form does, and collects nothing from
an empty one — it carries that runner's own pass-with-no-tests flag for the same reason a `{paths}` form
does (`vitest --changed --passWithNoTests`, `jest -o --passWithNoTests`).

Quoting a changed path keeps the shell from word-splitting it; it does not keep the runner from reading
it as an option. A `--` separator would protect a changed path shaped like `--config.js` from being read
as a flag — check the runner's own CLI reference before relying on one: neither `vitest related` nor
`jest --findRelatedTests`, the two runners a `{paths}` form now targets, documents a `--` separator for its
own argument parsing.

## Complete selector

An optional **`## Complete selector`** section of `docs/agents/verification.md` declares that the focused
command, given the changed-path set, selects every test any changed path can affect. It takes
effect only where the focused command carries `{paths}`. It may list the selector's own files as list items
(marker `-`, `*`, `+`, or an ordered `1.`), one path from the repository root in the item's first backtick span (text after the span is a comment). A listed path covers itself and every path under it, a trailing `/` being optional. The heading is read outside code fences,
and the section runs to the next heading of level 2 or above:

```markdown
## Complete selector

The focused command selects every test a changed path can affect.

- `scripts/run-tests.js`
```

`scope.js suite reusable` reads the section from the tip commit, never a working tree. Under it, a green
record at an ancestor A carries to the tip T, with its kind, when the run trace backs A as it does at an
exact tip, and a passing focused run on a clean tree at T recorded a path set covering every path changed
in A..T. A rename counts both its sides and a deletion counts. A changed path is covered only where the
recorded set names that path itself: a directory, the repository root included, covers no file under it,
because a selector may reach fewer tests for a directory than for a file under it. Recorded paths are normalized to repository-root paths before they are compared, and the
changed paths are listed from the root whatever the working directory and `diff.relative`.

The carry is refused, each time with its own reason, when:

- the section is absent, or the focused command carries no `{paths}`;
- A is not an ancestor of T, or the record is not green;
- a path changed in A..T is a listed path or a path under one, or is a `docs/agents/verification.md` whose **Run
  configuration** (CONTEXT.md) differs between A and T; the reason names the part that changed;
- the latest focused run at T failed, ran on a dirty tree, or read `unknown`, covered fewer paths than changed,
  or carries no recorded path set (a run an earlier release wrote, or one made by a direct call). Only passing
  clean runs after the last failed focused run at T count toward coverage;
- a full, whole, or path run at T failed;
- git cannot answer a step of the decision.

The carry is a read-time check. No verb writes a carried record, and every carry is judged from its record's
own commit, so a focused run over only the paths since an intermediate tip carries nothing. A repository
without the section, and a Markdown-only range under it, take the Markdown-only carry: a green record at an
ancestor A carries to T when the run trace backs A, every path changed in A..T ends in `.md`, none is a test path
at T, `docs/agents/verification.md` carries the same run configuration at A and at T, no full, whole, path, or
focused run recorded at T failed, and the latest run recorded at T does not read `unknown`. It needs no test run
at T, and a passing run on a dirty tree refuses nothing. A `verification.md` git cannot read at either commit
refuses.

Under the section, the two carries chain once. A green record at A carries to T when some commit M on the ancestry
path from A to T takes the complete-selector carry from A, judged at M, and M..T takes the Markdown-only carry,
judged at T. Each leg compares the run configuration at its own two commits. A gate that reached M by carry leaves the record at A, so a doc pass's Markdown commits after M carry
with no test run at T.

## The carry run

Every gate whose `scope.js suite reusable` call refuses the tip takes the carry before it runs the full command
or refuses: review's exit run, ship's plain gate and whole-repo gate (§3), and ship's
moved-base gate and push gate (§4). Implement runs no full suite. Each gate cites
this section and runs the steps in order, after its own `scope.js suite reusable` call refuses the tip:

1. **Check the preconditions.** `scope.js get suite --root <run-root>` prints a green record at a commit A, or a
   red record at A whose failing test files `## The recorded rerun`'s step 1 recorded (the ledger's `**Failed:**`
   line names A, and the record carries no `whole` kind), A differs from the tip, the record carries the kind `whole` where the gate calls `suite reusable --whole`,
   `git merge-base --is-ancestor A <tip>` succeeds, the tip's own `docs/agents/verification.md`
   (`git show <tip>:docs/agents/verification.md`) carries the `## Complete selector` section, and the focused
   command carries `{paths}`. Any precondition missing → skip to step 4.
2. **Run the focused command over A..<tip>.** After a red record at A, first run the files the `**Failed:**` line
   names through `scope.js test path <file>... -- <command running only those files>` at the tip on a clean tree,
   from the tree root: a fix cycle repaired them since A. A failing run of them is the gate's red result, as step 3
   states for the focused run. Then, from the tree the gate works in, over every path
   `git diff --name-only --no-renames A <tip>` lists, through `scope.js test focused <paths>`. The
   changed-path set of this caller is that list, whole. A path set too large for the command to start
   leaves no passing run: skip to step 4.
3. **Judge the focused run.** It **fails** → that is the gate's red result: record it with
   `scope.js suite set red <tip> --root <run-root>` (with `--whole` where the gate runs the whole-repo
   command), and the gate takes the exit a failing full run takes. A failing carry run takes no `## The recorded rerun`. It **passes** → call `scope.js suite
   reusable` again. Exit 0 → the tip is carried: the gate runs no full command.
4. **No carry** (a missing precondition, such as a record at the tip itself or a record with no `whole` kind
   at a `--whole` gate, a refused second call, a killed or `unknown` focused run, or a path
   set too large) → the gate takes its own no-carry exit. Review's exit run and ship's moved-base gate run
   the full command, or the whole-repo command where one is configured, and record its result as the gate
   states. Ship's plain gate and push gate refuse and run no full command. Ship's whole-repo gate runs the
   whole-repo command, after its standing-finding check.

No gate writes a suite record for a tip it reached by carry: the record stays at A, and the next gate
judges its own tip from A.

## The recorded rerun

A full run at the tip T that fails in one test file, under the `## Complete selector` declaration, counts
green once the rerun below is recorded and passed. Step 1 also records the failing test files of every
attributable failed full run, one or several, and `## The carry run` reads that record at the fix cycle's tip. Every
gate that records a failed full run cites this section and runs the steps in order, once per tip:

1. **Attribute the failure.** Read the failed run's own output. It names one or more test files and no failure
   outside them → after `scope.js suite set red <tip> --root <run-root>`, record them with
   `scope.js suite failed <file>... --root <run-root>` from the checkout at the tip, so the fix cycle's tip can take
   `## The carry run` from this red record. Exactly one file → go on with step 2. Several files → the failure stays
   red at this tip: the gate takes the exit a failing full run takes. None, or a failure outside any test file →
   the failure is unattributable, records no files, and stays red: the gate takes the exit a failing full run
   takes.
2. **Write the triage record.** File it through the repository's triage flow with the failing lines quoted
   verbatim, and keep its reference (`#<n>` or the record's id, one token).
3. **Record the rerun.** The red record and the failing file stand from step 1. Run
   `scope.js suite rerun <test-file> <triage-ref> --root <run-root>` from the checkout at the tip. The verb
   refuses a tip that already carries a rerun record: a second failure at the tip stays red.
4. **Run the file alone.** `scope.js test path <file> -- <command running only that file>` at the tip on a clean tree,
   from the tree root, through the runner so the trace records it. A failing or dirty rerun stays red.
5. **Run the focused command over the scope's range.** `scope.js test focused <paths>` over every path
   `git diff --name-only --no-renames <range-base> <tip>` lists, at the tip on a clean tree. The range base
   is what `scope.js base resolve --branch <branch> --base <base> --root <run-root>` prints, `<base>` being
   the base branch `docs/agents/code-management.md` names.
6. **Check reuse.** `scope.js suite reusable --branch <branch> --base <base> --root <run-root>` exits 0 →
   the gate takes its green exit, and the suite record stays `red` at T. Exit 1 → the gate takes the
   failing-run exit. Without `--base` the verb refuses, because it cannot judge the range.

`scope.js` checks the ledger and the run trace: the rerun record for the tip, the file alone (and no other
file in the same run) passing clean at the tip after the failed full run, run at the tree root, every run of it alone
recorded there after that failure, from any directory, passing clean (a run of it before the failure counts for nothing), a passing clean focused run there
after the failed full run whose recorded path set covers every path `base resolve`'s range base to the tip
changes, the declaration, exactly one failed full run at the tip, and no failed run of another test file at
the tip. A recorded file name is read against the directory the run was made in, so `a.test.js` from `tests` is `tests/a.test.js`. Nothing reruns on its own, and no step reruns a failed suite until it passes.

The `red` record at T also counts at a later tip U when T is an ancestor of U, every check above holds when
judged at T, and T..U passes the Markdown-only rule of `## Complete selector`, judged at U: every path changed
ends in `.md`, none is a test path at U, `docs/agents/verification.md` carries the same run configuration at T and
at U, no full, whole, path, or focused run recorded at U failed, and the latest run recorded at U does not read `unknown`. A doc pass's Markdown commits
after a gate that passed on the rerun so need no test run at U.

## A fix cycle's runs

Review's fix loop runs no test inside a cycle. The cycle's implementer runs
the tests that verify its fix and its fail-to-pass run over the cycle's commits, and the re-review reads those runs
from the run trace. The loop's exit full-suite run is the gate the stage advances on.

## The changed-path set

Each caller judges its own range and builds the set from it:

- **A chain gate's carry run.** Every path changed from the suite record's commit to the gate's tip, per
  `## The carry run`.
- **The implementer's TDD loop, and the lite tier's inline loop.** Each failing-test or passing-test step runs
  the test files it works on through `scope.js test path <file>... -- <command>`, a runner filter allowed, and never
  through the focused command. Once the work is committed, one `scope.js test focused <paths>` runs over the
  whole changed-path set: the slice base against the working tree, or `<cycle-base>..HEAD` on a fix cycle. It runs
  before the fail-to-pass run. The last passing-test step runs after the last commit, as a `test path` run of the range's
  test files from the tree root with the verb's exact command, which the verb reuses as its first run. A focused
  failure is a RED step: fix, commit, and run the focused command again. A step that works on no test file runs
  that focused command over the whole set. A focused command with no `{paths}` token runs verbatim, and the run
  trace records every run either way. Every loop run passes at least one path, or runs test files
  through `test path`, so the loop runs only the tests that verify the work. `test full`,
  `test whole`, and a `test focused` with no path run only at the scope review's and ship's gates.
  Where the focused fence repeats the full fence, `test focused` runs the whole suite whatever paths it gets. There
  each step runs each test file it works on through `test path`, and the loop makes no whole-set run: neither the
  committed-work run nor a step that works on no test file runs, because the scope review's exit run covers that work. The fail-to-pass run still runs.
- **The documentation step.** None: the step runs no test command and builds no set. `scope.js suite reusable`
  carries a green record across Markdown-only commits with no test run at the tip,
  so the doc commits need none. Where the record stays at an earlier commit because review reached
  its tip by the complete-selector carry, the record carries through that tip to the doc commits, per
  `## Complete selector`. Where review's gate passed on `## The recorded rerun`, the `red` record at that tip
  counts at the doc commits too, per that section.
- **The `scope.js fail-to-pass` verb.** Its caller hands it the command, written to run every test file the range
  adds or modifies in whatever form the runner selects them: `cargo test --test foo`, `dotnet test --filter Orders`,
  or one runner per package in a monorepo. The verb reads none of its words, and the outcome line records it
  for the reviewer. Every path changed in `<base>..<tip>`, with a rename split into its old and its new
  path (`--no-renames`), decides what the second run puts back. The test paths come from the tip's own
  `docs/agents/verification.md`, never a working tree's. The verb refuses an empty range, so the fallback
  below never applies to it.

## Fallback to the full command

One condition falls back to the full command instead of the focused one:

- **The changed-path set is empty, and the focused command consumes `{paths}`.** A substitution over no
  paths would report green having tested nothing. A fixed fast subset carries no such token and always
  collects tests on its own, so an empty set costs it nothing and it runs unchanged. A self-detecting
  runner flag carries no `{paths}` token either, but computes the change set itself and can collect
  nothing from an empty one — its own pass-with-no-tests flag is what keeps that case green, not this
  fallback.

## Stop on a missing focused command

`docs/agents/verification.md` carrying exactly one fenced block records a repository whose focused
command was never configured. A prose caller finding one fenced block reports the
missing configuration and names `/superdev:setup`, running no command. `/superdev:plan` and
`/superdev:implement` already auto-invoke `/superdev:setup` on missing configuration, so this case is
unreachable once a repository has been configured. A `verification.md` carrying **zero** fenced blocks —
prose-only, or gutted by a hand edit — is not this case: every caller reads it exactly as it reads an
absent file, with no suite to run.

A caller that stops here runs no suite and records a **degraded pass** rather than a silent skip, per
`references/scope-findings.md`'s `## Degraded passes` — the "pass that cannot complete its own work" shape.
A caller with no run root has no ledger to write `scope.js degraded add` to, so it takes only that
shape's report half: say so in its own output. A standalone `/superdev:review`
on an unmigrated repository is exactly this caller: it falls outside the auto-invoke argument — neither
`/superdev:plan` nor `/superdev:implement` sits ahead of it in that dispatch — so it reaches this stop
with nothing else recording that no suite ran.
