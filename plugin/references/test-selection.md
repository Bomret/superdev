# Test selection

The rule that picks between the full test command and the focused one (ADR 0025, ADR 0074). Every prose caller
reads this file at runtime, the same shared-file-read-at-dispatch pattern as `references/scope-mode.md`.

## The two commands

`docs/agents/verification.md` carries two fenced code blocks in every repository with a suite (ADR 0085).
A repository with no suite at all carries no such file.

- **The full command** is the first fenced block. Run it verbatim.
- **The focused command** is the second fenced block, and it is the command every step inside
  the loop runs. What defines it is that it **costs less than the full suite**: a run scoped to a set of
  changed paths qualifies, and so does a fast subset — the unit tests, with the slow integration tests
  left out. Where narrowing is impossible, the second fence records the full command again, with prose
  beside it stating why. A second fenced block is **only ever** the focused command — never a watch
  command, a coverage command, or sample failure output.

**Run the full, focused, or whole-repo command through `scope.js test`** (ADR 0127). From the tree the
work lives in, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test full`, `test focused [<path>…]`, or
`test whole`, and `test -- <command>` for a direct run of a test file. The runner runs the configured command
as configured and records one run line with the command's own exit status, however the caller pipes,
redirects, backgrounds, or wraps the call. To trim the output, pipe the runner into `tail`, or redirect it to a
file outside the working tree, such as one from `mktemp` under `$TMPDIR`, and read the file afterwards.
A redirect into the working tree leaves an untracked file, and on a passing run also records an implementation edit.
**A suite longer than the Bash tool's time limit runs through the runner in the background, and you wait for
its end before acting on it.** **`scope.js fail-to-pass` follows the same rule:** it runs its command up to
twice, so run it in the background when the suite outlasts the Bash tool's time limit, and wait for its end before
you read its outcome. A verb the tool's limit kills writes no outcome line. The run trace records a run made outside the runner as `unknown` whenever its
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

The full command may take an **affected form** (ADR 0105): instead of running the whole suite verbatim,
it selects through the repository's dependency-graph tool the changed projects and every project
depending on them, dependents included, and runs each selected project's whole suite using nx, turborepo,
pnpm, or dotnet-affected. It never selects fewer projects than the change can break: a change the graph
cannot attribute to one project selects every project. It exits green when the change reaches no project, and it selects at least one project on a change that touches one, and running it on that change executes at least one task or test. `/superdev:setup` probes all three before it writes the form.

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
- **`/superdev:submit-pr`, `/superdev:ship`, and a scope review read it** (ADR 0105): submit-pr runs it
  once on the scope branch's tip before opening the pull request and reuses a green `whole` record of that
  tip instead, ship runs it on a tip that carries no green `whole` record, and a review entered while the suite record reads red of kind `whole` runs it in place of the
  full command.
- **An absent section leaves the full command as the whole suite**, and every caller unaffected.

## Timing command

An optional **`## Timing command`** section, holding one command that reports what the suite's tests
cost: per-test durations where the runner gives them, total wall clock otherwise.

- **Its command lives in a backtick span**, per the rule above — a fenced block would land in the
  focused slot of a repository that has not yet recorded a focused command, hiding the missing
  configuration, and every caller would then run the timing command as the focused command.
- **A test audit is its only reader.** `/superdev:review-tests` runs it to rank its findings by
  measured cost (ADR 0066). Nothing in the implement loop reads it.
- **An absent section leaves the audit `unmeasured`**, ranking by judgment instead, and every other
  caller unaffected. A repository states the reason it configures none as prose beside the section's
  absence.

## Test paths

An optional **`## Test paths`** section of `docs/agents/verification.md`, listing the glob patterns that
name the repository's test files. `hooks/run-trace.js` reads it to class each recorded edit as `test` or
`impl` (ADR 0117), from the tree the edit lands in.

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
and the runner substitutes them; a `test focused` with no paths runs the full command and records `full`, and an empty path argument is refused.
**A `{paths}` form belongs to a runner that maps a source file to the tests covering it** — for
example `vitest related` or `jest --findRelatedTests`. The changed-path set holds source files and prose
alongside tests, and a runner without that mapping collects nothing from them. Such a form also carries
that runner's pass-with-no-tests flag, so a change set holding no tests reports green: the documentation
step reaches exactly that case on every scope, since its range holds only prose on the ordinary path.

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
command, given the changed-path set, selects every test any changed path can affect (ADR 0175). It takes
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
- a path changed in A..T is `docs/agents/verification.md`, a listed path, or a path under one;
- the latest focused run at T failed, ran on a dirty tree, or read `unknown`, covered fewer paths than changed,
  or carries no recorded path set (a run an earlier release wrote, or one made by a direct call). Only passing
  clean runs after the last failed focused run at T count toward coverage;
- a full, whole, or path run at T failed;
- git cannot answer a step of the decision.

The carry is a read-time check. No verb writes a carried record, and every carry is judged from its record's
own commit, so a focused run over only the paths since an intermediate tip carries nothing. A repository
without the section keeps the Markdown-only carry described below.

## The carry run

Every gate that runs the full suite takes the carry before it runs the full command (ADR 0175): implement's
base gate, run handoff's suite run, review's entry and exit runs, and ship's moved-base gate. Each gate cites
this section and runs the steps in order, after its own `scope.js suite reusable` call refuses the tip:

1. **Check the preconditions.** `scope.js get suite --root <run-root>` prints a green record at a commit A,
   `git merge-base --is-ancestor A <tip>` succeeds, the tip's own `docs/agents/verification.md`
   (`git show <tip>:docs/agents/verification.md`) carries the `## Complete selector` section, and the focused
   command carries `{paths}`. Any precondition missing → run the full command, as the gate does without
   this section.
2. **Run the focused command over A..<tip>.** From the tree the gate works in, over every path
   `git diff --name-only --no-renames A <tip>` lists, through `scope.js test focused <paths>`. The
   changed-path set of this caller is that list, whole. A path set too large for the command to start
   leaves no passing run: skip to step 4.
3. **Judge the focused run.** It **fails** → that is the gate's red result: record it with
   `scope.js suite set red <tip> --root <run-root>` (with `--whole` where the gate runs the whole-repo
   command), and the gate takes the exit a failing full run takes. It **passes** → call `scope.js suite
   reusable` again. Exit 0 → the tip is carried: the gate runs no full command.
4. **No carry** (a refused second call, a killed or `unknown` focused run, or a path set too large) → run
   the full command, and record its result as the gate states.

No gate writes a suite record for a tip it reached by carry: the record stays at A, and the next gate
judges its own tip from A.

## The recorded rerun

A full run at the tip T that fails in one test file, under the `## Complete selector` declaration, counts
green once the rerun below is recorded and passed (ADR 0172). Every gate that records a failed full run
cites this section and runs the steps in order, once per tip:

1. **Attribute the failure.** Read the failed run's own output. It names exactly one test file → go on. It
   names several, none, or a failure outside any test file → the failure is unattributable and stays red:
   the gate takes the exit a failing full run takes.
2. **Write the triage record.** File it through the repository's triage flow with the failing lines quoted
   verbatim, and keep its reference (`#<n>` or the record's id, one token).
3. **Record the failed run and the rerun.** `scope.js suite set red <tip> --root <run-root>`, then
   `scope.js suite rerun <test-file> <triage-ref> --root <run-root>` from the checkout at the tip. The verb
   refuses a tip that already carries a rerun record: a second failure at the tip stays red.
4. **Run the file alone.** `scope.js test -- <command running only that file>` at the tip on a clean tree,
   through the runner so the trace records it. A failing or dirty rerun stays red.
5. **Run the focused command over the scope's range.** `scope.js test focused <paths>` over every path
   `git diff --name-only --no-renames <range-base> <tip>` lists, at the tip on a clean tree. The range base
   is what `scope.js base resolve --branch <branch> --base <base> --root <run-root>` prints, `<base>` being
   the base branch `docs/agents/code-management.md` names.
6. **Check reuse.** `scope.js suite reusable --branch <branch> --base <base> --root <run-root>` exits 0 →
   the gate takes its green exit, and the suite record stays `red` at T. Exit 1 → the gate takes the
   failing-run exit. Without `--base` the verb refuses, because it cannot judge the range.

`scope.js` checks the ledger and the run trace: the rerun record for the tip, the file alone (and no other
file in the same run) passing clean at the tip after the failed full run, every run of it alone recorded
there after that failure passing clean (a run of it before the failure counts for nothing), a passing clean focused run there
after the failed full run whose recorded path set covers every path `base resolve`'s range base to the tip
changes, the declaration, exactly one failed full run at the tip, and no failed run of another test file at
the tip. Nothing reruns on its own, and no step reruns a failed suite until it passes.

## A fix cycle's runs

Review's fix loop and run handoff's fix loop run no test inside a cycle (ADR 0182). The cycle's implementer runs
the tests that verify its fix and its fail-to-pass run over the cycle's commits, and the re-review reads those runs
from the run trace. Each loop's exit full-suite run is the gate the stage advances on.

## The changed-path set

Each caller judges its own range and builds the set from it:

- **A chain gate's carry run.** Every path changed from the suite record's commit to the gate's tip, per
  `## The carry run`.
- **The implementer's TDD loop, and the lite tier's inline loop.** A failing-test or passing-test step runs
  over the test files that hold the tests the step works on, and passes those files alone to `scope.js test
  focused`. The last run before the implementer reports, and before the lite tier commits a slice, runs over
  the slice's whole changed-path set: the slice base against the working tree. A step that works on no test
  file runs over that whole set too. A focused command with no `{paths}` token runs unchanged at every step,
  and the run trace records every step's run either way (ADR 0139). Every loop run passes at least one path, or
  runs one test file through `test -- <command>`, so the loop runs only the tests that verify the work. `test full`,
  `test whole`, and a `test focused` with no path run only at the controller's gates (ADR 0177).
  Where the focused fence repeats the full fence, `test focused` runs the whole suite whatever paths it gets. There a
  failing-test or passing-test step runs each test file it works on through `test -- <command>`, the runner's own
  invocation of that one file. The last run before the implementer reports, or before the lite tier commits a slice,
  does not run, and neither does a step that works on no test file: the controller's next gate runs the suite over
  that work (ADR 0180). The fail-to-pass run still runs (ADR 0182).
- **The documentation step.** On a live scope run whose suite record's commit is an ancestor of the scope
  branch's tip (`scope.js get suite` names the commit), every path changed from that commit to the tip.
  `scope.js suite reusable` carries a green record across Markdown-only commits on the strength of a
  passing test run at the tip (ADR 0128, INV-0017), so that run covers the whole range, a commit another
  author landed after the review included. With no record, or a commit that is not an ancestor, its own
  doc commits — the ones the doc-writer just landed on the scope branch, never the wider range the chain
  is reconciling.
- **The `scope.js fail-to-pass` verb.** Its caller hands it the command, which names every test file the range
  adds or modifies (ADR 0182). Every path changed in `<base>..<tip>`, with a rename split into its old and its new
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
command was never configured (ADR 0085, INV-0007). A prose caller finding one fenced block reports the
missing configuration and names `/superdev:setup`, running no command. `/superdev:plan` and
`/superdev:implement` already auto-invoke `/superdev:setup` on missing configuration, so this case is
unreachable once a repository has been configured. A `verification.md` carrying **zero** fenced blocks —
prose-only, or gutted by a hand edit — is not this case: every caller reads it exactly as it reads an
absent file, with no suite to run.

A caller that stops here runs no suite and records a **degraded pass** rather than a silent skip, per
`references/scope-mode.md`'s `## Degraded passes` — the "pass that cannot complete its own work" shape.
A caller with no run root has no ledger to write `scope.js degraded add` to, so it takes only that
shape's report half: say so in its own output. A standalone `/superdev:document` or `/superdev:review`
on an unmigrated repository is exactly this caller: it falls outside the auto-invoke argument — neither
`/superdev:plan` nor `/superdev:implement` sits ahead of it in that dispatch — so it reaches this stop
with nothing else recording that no suite ran.
