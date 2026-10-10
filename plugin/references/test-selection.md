# Test selection

The rule that picks between the full test command and the focused one (ADR 0025, ADR 0074). Every prose caller
reads this file at runtime, the same shared-file-read-at-dispatch pattern as `references/scope-mode.md`.
`hooks/green-gate.js` is the exception: it reimplements the same rule in code, because a hook fires
without a dispatch to read a reference at.

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
its end before acting on it.** **`scope.js fail-to-pass` follows the same rule:** it runs the test command up to
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
  focused slot the same way the timing command's would, and `hooks/green-gate.js` would then run it as
  the merge gate's suite.
- **`/superdev:submit-pr`, `/superdev:ship`, and a scope review read it** (ADR 0105): submit-pr runs it
  once on the scope branch's tip before opening the pull request and reuses a green `whole` record of that
  tip instead, ship runs it on a tip that carries no green `whole` record, and a review entered while the suite record reads red of kind `whole` runs it in place of the
  full command.
- **An absent section leaves the full command as the whole suite**, and every caller unaffected.

## Timing command

An optional **`## Timing command`** section, holding one command that reports what the suite's tests
cost: per-test durations where the runner gives them, total wall clock otherwise.

- **Its command lives in a backtick span**, per the rule above — a fenced block would land in the
  focused slot of a repository that has not yet recorded a focused command, silencing the one-fence
  notice, and `hooks/green-gate.js` would then run the timing command as the merge gate's suite.
- **A test audit is its only reader.** `/superdev:review-tests` runs it to rank its findings by
  measured cost (ADR 0066). Nothing in the implement loop reads it, and neither does the green-gate.
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
and the runner substitutes them; a `test focused` with no paths runs the full command and records `full`.
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

## The changed-path set

Each caller judges its own range and builds the set from it:

- **The implementer's TDD loop, and the lite tier's inline loop.** A failing-test or passing-test step runs
  over the test files that hold the tests the step works on, and passes those files alone to `scope.js test
  focused`. The last run before the implementer reports, and before the lite tier commits a slice, runs over
  the slice's whole changed-path set: the slice base against the working tree. A step that works on no test
  file runs over that whole set too. A focused command with no `{paths}` token runs unchanged at every step,
  and the run trace records every step's run either way (ADR 0139).
- **The slice-reviewer's Lens 2.** The slice branch against the scope branch.
- **The green-gate hook.** `ORIG_HEAD` against `HEAD`, read once the merge has landed: a completed
  `git merge`, or a conflicted one concluded by `merge --continue`. The hook runs on neither a merge still
  waiting on its conflict nor a commit that is no merge. A set it reads empty goes to the fallback below.
  Falls back to the first parent where `ORIG_HEAD` does not resolve.
- **The documentation step.** On a live scope run whose suite record's commit is an ancestor of the scope
  branch's tip (`scope.js get suite` names the commit), every path changed from that commit to the tip.
  `scope.js suite reusable` carries a green record across Markdown-only commits on the strength of a
  passing test run at the tip (ADR 0128, INV-0017), so that run covers the whole range, a commit another
  author landed after the review included. With no record, or a commit that is not an ancestor, its own
  doc commits — the ones the doc-writer just landed on the scope branch, never the wider range the chain
  is reconciling.
- **Run handoff's own fix loop.** The commits that cycle's implementer just landed, on the scope checkout.
- **The `scope.js fail-to-pass` verb.** Every path changed in `<base>..<tip>`, with a rename split into its
  old and its new path (`--no-renames`). The command and the test paths come from the tip's own
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
prose-only, or gutted by a hand edit — is not this case: `hooks/green-gate.js` reads it exactly as it
reads an absent file, `{ full: null, focused: null }`, no gate at all.

A caller that stops here runs no suite and records a **degraded pass** rather than a silent skip, per
`references/scope-mode.md`'s `## Degraded passes` — the "pass that cannot complete its own work" shape.
A caller with no run root has no ledger to write `scope.js degraded add` to, so it takes only that
shape's report half: say so in its own output. A standalone `/superdev:document` or `/superdev:review`
on an unmigrated repository is exactly this caller: it falls outside the auto-invoke argument — neither
`/superdev:plan` nor `/superdev:implement` sits ahead of it in that dispatch — so it reaches this stop
with nothing else recording that no suite ran.

`hooks/green-gate.js` is the one exception: a hook fires with no operator to ask, so it runs the full
command it found and emits a one-line notice naming `/superdev:setup`, rather than stopping.
