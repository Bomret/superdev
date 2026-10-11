<!--
  Attribution: the anti-pattern, vulnerability-class, and reuse-audit lists below are distilled from
  awesome-skills/code-review-skill (MIT). Credit to its authors.
-->

# Review checklist — cross-cutting, language-agnostic

Concrete lenses for a reviewer to apply on top of its own judgment — named smells and vulnerability
classes beat a generic "check code quality" / "check security."

These rules bind every lens below:

- **The repo overrides.** A documented repo standard wins; where it endorses something a lens would
  flag, suppress the finding.
- **Skip what tooling already enforces.** A linter or formatter the repo runs
  (`docs/agents/toolchain.md`) already catches its own class of issue; re-reporting it spends review
  attention on a solved problem.

Every smell is a labelled judgment call ("possible feature envy"), never a hard violation.

## Anti-patterns

- **Parameter sprawl** — a function/constructor taking so many params that call sites are unreadable or
  error-prone (wrong-order same-type args). Group into a value object, or split the function.
- **Leaky abstraction** — a module's callers must know its internal implementation detail to use it
  correctly. The interface hides nothing.
- **Nested conditionals** — three-plus levels of nested `if`/branches. Prefer early return, guard
  clauses, or a lookup table.
- **Stringly-typed code** — a string standing in for a closed set of states/kinds where an enum/union
  would catch typos and invalid values at compile/parse time.
- **TOCTOU (time-of-check to time-of-use)** — a check (file exists, balance sufficient, lock free)
  followed by a separate action that assumes the checked condition still holds, racy under concurrency.
- **No-op update** — code that writes back the same value it read, or fires an update path that changes
  nothing (wasted I/O, spurious change events/timestamps).
- **Redundant state** — a value stored in two places that must be kept in sync by convention rather than
  derived once from a single source of truth.
- **Weakened net** — a diff that edits, deletes, or skips a *pre-existing* test to get the suite green.
  The existing suite is the safety net; a change that must loosen it is hiding a regression, not fixing
  one. Regenerating a snapshot, a golden file, or another recorded expected output to match new output is
  the same smell, unless a slice's acceptance criteria or the Definition of Done changed that output: the
  recorded output was the net, and the diff replaces it with whatever the code now produces.
- **Tautological test** — a test that passes whatever the code under test does. The probe: would it still
  pass if every call to the code under test returned an empty value (nothing, zero, an empty collection)
  or a wrong one? Name the shape in the finding:
  - an assertion on presence, type, or the absence of an error alone (`assertNotNull(result)`,
    `assert isinstance(result, dict)`, `expect(run).not.toThrow()`, a Go `require.NoError(t, err)` with
    nothing after it);
  - an assertion that a collaborator was called, with no check of what it received
    (`verify(mailer).send(any())`, `mock.assert_called()`);
  - an expected value recomputed the way the code computes it (`expect(add(a, b)).toBe(a + b)`);
  - a restated constant or configuration value where the mechanism that reads it could run instead
    (`assert TIMEOUT == 30` where a call could show the timeout applied);
  - an assertion on data the test built, with the code under test never called.

  The expected value comes from an independent source of truth: a literal, a worked example, the
  specification. Pair an absence assertion (no error, no match, nothing returned) with a presence assertion
  on another input, so a function that always returns nothing fails one of the two. Two cases are not this
  smell: a check that two sources agree (a schema and its fixture, a table's rows against each other), and
  a pin on text whose only runtime reader is a person or a model (a prompt's wording, a clause a document
  must carry). A `fail-to-pass` outcome does not clear this finding, because a fail-to-pass run reads exit
  statuses only and cannot see two cases: a test of a symbol the change introduces fails before the change
  at compile, import, or name lookup in every language, and a weak test beside a discriminating one leaves
  the whole change reading `fail-to-pass`. Read the assertions of both.
- **Happy-path-only suite** — new behaviour whose tests exercise only the success path, with no assertion
  for the failure and boundary cases named in its acceptance criteria. Name the specific uncovered case,
  not a vague "add more tests."
- **Redundant test coverage** — a new test re-proving a case an existing test already covers. Name the
  covering test's location, so the reader can decide which of the two survives. This is the counterweight
  to the lenses above, which all argue for more coverage; a suite pays for every test it carries on
  every run. Distinct from **weakened net**: that one loosens a test already there, this one adds a test
  nothing needed.
- **Overweight fixture** — a test standing up a heavier fixture than the behaviour it proves requires: a
  container, a real database, or a live network where an in-memory fake, a stub, or a direct call proves
  the same thing. Name the lighter form. A heavy fixture is right where that integration is itself the
  behaviour under test; the smell is the case where it is merely the most realistic option available.
- **Justified workaround** — if it takes a paragraph-long comment to justify why a workaround is OK, the
  code is wrong — fix the code. Stubbing a function out to silence a compile/test failure is the same
  smell.
- **Drive-by change** — a hunk that traces to no acceptance criterion and to nothing in the
  specification: a reformatted function the change never touched, a renamed unrelated variable, an
  "improved" neighbouring comment, a refactor nobody asked for. It widens the review surface and the
  merge-conflict surface for no requested value. Deleting *pre-existing* dead code is this smell too —
  the report should name it, not remove it. Removing what the change itself orphaned is not.

## Design smells

The classical catalogue (Fowler), each one nameable and huntable:

- **Mysterious name** — a name that requires reading the body to learn what it does.
- **Feature envy** — a function more interested in another module's data than its own; it wants to move
  to the data.
- **Data clumps** — the same few fields or params travelling together everywhere: a type wanting to be
  born.
- **Primitive obsession** — a domain concept passed around as a bare string/number where the glossary
  has a name for it.
- **Repeated switches** — the same `switch`/if-chain over one discriminator in several places; one
  polymorphic seam replaces them.
- **Shotgun surgery** — one logical change forcing edits in many places; the scattered pieces want one
  home.
- **Divergent change** — one module edited for many unrelated reasons; it wants splitting.
- **Message chains** — `a.b().c().d()` coupling the caller to the whole path.
- **Middle man** — a module that only delegates; call the target.
- **Speculative generality** — flexibility nobody asked for. The `simplicity-reviewer` owns this on a
  slice diff; flag it here only on a whole-scope range that reviewer never saw.
- **Single-adapter seam** — a port/interface with exactly one adapter behind it and no second in sight:
  a hypothetical seam, which is indirection, not architecture. Two adapters make a seam real — one of
  them may be the in-memory test adapter of a true external dependency.
- **Orphan production symbol** — a new production symbol the running application cannot reach: nothing
  registers it with the container or a manifest/configuration file (`hooks.json`, a skill the harness
  dispatches by name), no route or handler maps to it, and no non-test code references it.
  The feature was built and tested in isolation and never wired in, so the suite is green while the
  capability does not exist. Name the symbol and the entrance it never reached. `final-reviewer` owns
  this on the integrated scope, where the whole feature is in view: one slice diff **cannot tell an
  orphan from a caller** that arrives in a later slice.

## Vulnerability classes

- **SQL injection** — unparameterized/string-concatenated query built from external input.
- **XSS (cross-site scripting)** — external input rendered without output encoding/escaping.
- **CSRF (cross-site request forgery)** — a state-changing endpoint with no anti-CSRF token/origin check.
- **SSRF (server-side request forgery)** — a server-side fetch whose target URL/host is influenced by
  external input, without an allowlist.
- **IDOR (insecure direct object reference)** — an object looked up by an ID from the request with no
  ownership/permission check.
- **Command injection** — external input reaching a shell/subprocess call unescaped or unvalidated.
- **Path traversal** — a file path built from external input reaches a filesystem op without
  normalization/allowlisting (e.g. `../` escapes an intended base directory).
- **Hardcoded secrets** — a credential, API key, or token committed in source instead of config/vault/env.
- **Broken access control** — an action executes with no authorization check for the caller's role/owner
  (broader than IDOR: not just an object lookup, any privileged action).

## Reuse audit

Before accepting new code, search the project's own utils/helpers/adjacent and shared modules for an
existing equivalent — a duplicate implementation is a quality issue even when each copy is individually
correct. Prefer extending or calling the existing one over adding a parallel implementation.

## Test cost

**`test-auditor` alone reads this section**, and it sits outside `## Anti-patterns` for that reason:
the lenses below are judged against a **measured duration** over a whole test tree, which only a test
audit holds (ADR 0066). A diff-scoped reviewer sees one slice's changed files and no durations at all,
so an entry placed among the anti-patterns above would reach `slice-reviewer` on every slice and be
guessed at rather than measured.

- **Dead test** — a test whose subject is gone, or which the runner skips: an `@Ignore`, a `skip`, a
  `.only` elsewhere that mutes it, or an assertion against a symbol no production code defines any more.
  It proves nothing and the suite carries it on every run. Name the subject it lost, and the lighter
  form: deletion, or the condition under which it runs again.
- **Expensive test** — a test whose measured duration is out of proportion to what it proves, where no
  lighter fixture explains the cost: a multi-second sleep, a container or a live network call standing
  behind one assertion, a loop running thousands of cases to prove one branch. Name the duration and the
  lighter form. Cost is right where the slow thing is itself the behaviour under test; the judgment is
  the case where it is merely how the test was written.

## Test order

**`slice-reviewer` and `final-reviewer` read this section**, because the entry below is judged against the
run trace (`scope.js trace`), which hooks wrote, and no diff shows it (ADR 0117).

- **Missing RED** — on a `behavior` slice, a test edit followed by an implementation edit or a passing run
  with no failing run between them. A trace in the order implementation edits, then test edits, then
  only passing runs meets this definition. Severity Important. A `mechanical` or `docs` slice, a repository
  with no test command, and a slice with no trace events get no finding: the report names the gap. On a
  re-review the finding closes only when the trace shows, after the finding, a revert (or an implementation
  edit), a failing run that covers that test (the full or focused command, or a run naming that test
  file), a restore (or an implementation edit), and a passing run. The remedy is `git add <paths>`, `git restore
  --worktree --source=<base> -- <paths>`, a failing run, `git restore -- <paths>`, a passing run, never `git stash` (`<base>` is the commit the slice branch was cut from, which the dispatch names). A `run … unknown` line is not a failing run: it neither satisfies the RED step nor closes the finding, and the implementer answers it by re-running the test through `scope.js test`.
  The finding names failing order and no failing behaviour, so its fix takes no RED test. `final-reviewer`
  applies it to every slice's trace lines on a `lite` scope, with the same closing sequence and no-trace rule.
- **Unreviewed slice** — `final-reviewer`'s, on a `full` scope only: a merged slice with no
  `dispatch` line of agent type `slice-reviewer` whose `completed` `dispatch-end` comes after the slice's last `completed`
  `dispatch-end` of `implementer`, and no `**Degraded:**` ledger entry naming that slice's denied review. A
  `dispatch-end` line ends with its outcome: `completed`, `failed`, `denied`, `stopped`, `unknown`, or `session-end`.
  A line with no outcome reads `completed`, and only a `completed` end finishes a dispatch, so a slice review that
  ended any other way reviewed nothing. Severity Important. No trace gets no finding: the report names the gap.

## Fail-to-pass run

**`final-reviewer` reads this section** on a `lite` scope and for fix cycles on either tier, and `slice-reviewer` reads it on the full tier, because both entries below are judged against the
run trace (`scope.js trace`), which `scope.js` wrote (ADR 0134, ADR 0117). A fail-to-pass run puts back every
file a `behavior` slice's range changed outside its test-path files and runs the slice's tests again. Its
outcome line is a `fail-to-pass` line carrying the range, the outcome, and a reason, and it is no test run: it
satisfies no Missing RED step and closes no Missing RED finding.

- **Pass-to-pass** — on a `behavior` slice, a latest outcome line over the slice's range that reads
  `pass-to-pass`: the slice's tests passed with the slice's other files put back as they stood before it, so
  they do not discriminate what it changed. Severity Important. A slice whose latest outcome line reads
  `fail-to-pass`, and a slice with no outcome line, get no such finding. At every dispatch, an entry dispatch
  included, the finding closes only when the trace records, after its `pass-to-pass` line, an outcome line that
  reads `fail-to-pass` over a range from the original change's base to the tip current when that closing run
  ran, so a fix that only strengthens the test closes it, and the finding stays closed once that line is
  written. A test that pins existing behavior on purpose passes before the change by design and still draws
  the finding: the escape path below carries it.
- **Missing fail-to-pass run** — on a `behavior` slice, a range that changes both a test-path file and another
  file, with no outcome line over that range. Severity Important. A slice whose ledger row records no range is
  read from its own trace: its `edit test` and `edit impl` lines name both a test-path file and another file.
  A slice with no `edit` line, a run with no trace, and a repository with no test command get no finding: the report
  names the gap. Only `edit` lines count as a slice's or a cycle's change events, so a `run` or `ledger` line is none,
  even one written after the trace began for a slice whose edits came before it. The controller answers the finding
  by running `scope.js fail-to-pass <base>..<tip>` over the range itself, with no implementer cycle, and the finding closes on the outcome line that run
  writes. Where the row records no range, the controller first reads the slice's commits from the scope
  branch's log and records the range with `scope.js slice <id> merged --range <base>..<tip> --root <run-root>`,
  then runs the verb over it.

A fix cycle is a change too, on either tier, in `/superdev:review`'s fix loop and in run handoff's fix loop
(ADR 0134). Its range runs from the scope tip the controller recorded before the fix dispatch to the tip once the
cycle's report is accepted, after any send-back to the implementer, and both findings apply to it. Where the cycle's commits change both a test-path file and another file, the
controller runs `scope.js fail-to-pass <base>..<tip>` over that range from the scope checkout, and the trace
line names `scope`, because no ledger row records the range and no slice is in progress. `final-reviewer` reads a
review cycle's range from the re-review's dispatch. Run handoff has no re-review of its own, and a re-review hands
`final-reviewer` only the current cycle's range, so it reads run handoff's cycles and the scope's earlier review
cycles from the trace at every dispatch of `/superdev:review`: a `scope` range whose latest outcome line reads
`pass-to-pass` is a Pass-to-pass finding, and an `implementer` `dispatch` of `scope` with `edit` lines in its
window, whose commits that landed in that window change both a test-path file and another file, with no outcome
line over those commits, is a Missing fail-to-pass run finding. A fix cycle's window runs from each run of its
`implementer` dispatch of `scope` (its `dispatch` line, and each `dispatch-resume` line of that dispatch) to the first
`dispatch` line, whatever its agent type or slice, after the `dispatch-end` line that closes that run, or to the end of
the trace when none follows. Whatever the end's outcome (`completed`, `failed`, `denied`, `stopped`, `unknown`, or
`session-end`), the window is bounded the same way. An implementer run with no `dispatch-end` line has a window that
ends at the first `dispatch` line after its own `dispatch` or `dispatch-resume` line, or at the end of the trace. A cycle's commits are read along the scope branch's first-parent chain, so the base commits a merge brings
in are none of them, and neither is a merge commit that brings the base in. An implementer that edits a file to show
RED and restores it leaves an `edit` line that no commit carries, so the `edit` lines find a cycle and its commits
decide it. The original change's base is the base of the range the finding's `pass-to-pass` line names: a lite
slice's recorded range base, or the fix cycle's own base. A `scope` line that follows a finding's own `pass-to-pass`
line and starts its range at that line's base is the finding's closing run, not a cycle: it closes the finding or
keeps it open, and raises no second finding. The controller answers a cycle's Missing finding the same way it answers a slice's, over the
cycle's range, which for a run handoff cycle it reads from the scope branch's first-parent log over that window.
The report names a cycle's finding with its range. No trace, a run handoff cycle with no `edit` lines, and a
repository with no test command get no finding: the report names the gap. A cycle whose commits change only
test-path files, or no file, has nothing to put back: it needs no outcome line and gets no finding, and the report
names no gap for it.

Both findings take Missing RED's 3-cycle fix cap and escape path (ADR 0125): a scope whose only remaining
Critical or Important findings are Missing RED, Pass-to-pass, or Missing fail-to-pass run proceeds, and the
report names each finding with its slice. Any of them beside a Critical or Important finding of another kind
blocks.

**On the full tier, `slice-reviewer` applies both entries** (ADR 0134) to each range its dispatch names: the slice's
range, from the commit its slice branch was cut from to the tip the first review read (the same range on every
review, which the outcome line the controller wrote before the first dispatch covers), and on a re-review the fix
cycle's range as well, from the tip the earlier review read to the current tip. A fix cycle whose range is empty, or
whose commits change only test-path files, has nothing to put back: it needs no outcome line and draws neither
finding. On the slice's own range, the latest outcome line over any range that starts at the slice's base decides
Pass-to-pass, and an outcome line over any range that starts at the slice's base satisfies Missing fail-to-pass run.
A Pass-to-pass finding closes on a `fail-to-pass` outcome over a range from the base of the range that drew it to the
current tip: the slice's base for the slice's own range, the tip before the cycle for a fix cycle's range. A
`pass-to-pass` line the controller's own run writes to answer a Missing fail-to-pass run finding is a Pass-to-pass
finding on that range, closed the same way. The slice's ledger row records no range while the slice is under review,
so the range comes from the dispatch and the controller answers Missing fail-to-pass run by running the verb,
recording no range first: over the slice's base to the current tip for a finding on the slice's own range, and over
the range the finding names otherwise.

**An `unknown` outcome is no finding.** A `fail-to-pass` line reading `unknown` records a run that could not judge
(ADR 0134, INV-0139), for one of two reasons. Either the tests did not pass against the changed code, and `control=`
names the exit status or the signal they ended with. Or the run before the change outlasted ten times the duration
the run against the changed code took, or ended by a signal, and `bound=` names the bound the run ran under. A reviewer
that reads the trace (`slice-reviewer`, `final-reviewer`) names every `unknown` in its report
with its slice and its reason, raises no finding for it, and starts no fix cycle. The line counts as an outcome line
for **Missing fail-to-pass run**, and the latest line reading `fail-to-pass` or `pass-to-pass` decides
**Pass-to-pass**, so an `unknown` neither raises nor closes it. The controller, not the reviewer, captures the scope
run's first `unknown` as an observation (`references/scope-mode.md`'s `## Observations`).

## Dependency verification

**`slice-reviewer` alone reads this section**, and it sits outside `## Anti-patterns` for that reason:
the entry below is judged against a slice's progress log, which only a per-slice review holds and opens
only after its blind pass (ADR 0114). The reviewer adds the finding in its `### After reading the
progress log` section, never in the blind pass.

- **Unverified dependency** — a new dependency: a direct dependency the diff declares in a package
  manifest, development dependencies included. No progress-log line names that exact package together
  with a URL. A different spelling of the package (a typosquat such as `reqeusts` for `requests`) does not
  verify it. A lockfile-only change, a version change of a dependency already present, and an addition
  outside a manifest (a CI action, a container image, a one-off runner) are not new dependencies. A
  dependency the repository itself provides (a workspace, path, or file reference) is not a new
  dependency either.
  Only a line that records the package as verified, written by the implementer, counts: a line marking
  the package unverified never verifies it, whatever URL it carries. A log line that explains or excuses
  a dependency never clears its finding. On a re-review the finding closes when this check now passes:
  the diff no longer declares the package, or a log line records that exact package as verified with the
  URL checked. Severity Critical. A missing progress log makes every new dependency
  Critical. The finding names no failing behaviour, so its fix takes no RED test: verify and record the
  package, or replace or remove it.

## Consistency

- **Convention drift** — new code that ignores the conventions already established in the codebase:
  naming, file/module layout, error-handling style, the idiom used for the same job elsewhere. Match
  what's there rather than introduce a second way to do one thing.
- **Cross-slice divergence** — the same concept given a different name, API shape, or vocabulary across
  slices; two seams that should agree but don't. On standing code, with no slices to compare, this reads
  as a divergent second way to do one job living inside the code itself.
- **Duplicated fact** — the same fact (a name-list, a described behavior) stated in two places
  where one owns it and the other should link; flag the copy that drifted. A drift contract table's row
  count is a growing-set count, not a fixed arity (ADR 0064); flag prose that states one.
- **Glossary drift** — vocabulary that departs from the repository's glossary (`CONTEXT.md`). Flag a
  synonym listed in an entry's `_Avoid` line, used where that entry's term is meant, as Minor. Flag a
  glossary term used against its entry's definition as Important. Read identifiers, test names, and
  prose in what the change adds, and the whole target on standing code. Grep those terms against the
  glossary's entry headwords and `_Avoid` lines and open only the entries that match. Each finding names
  the term and its glossary entry. Where `CONTEXT-MAP.md` maps contexts to paths, check a path against
  the glossary of the context that holds it, and a path no context holds against the root `CONTEXT.md`.
  No glossary, no finding. Exempt: the glossary itself, ADR text, quoted external or API names, and an
  ordinary English word outside its domain sense. A term the glossary lacks is no finding: adding one
  needs a human's confirmation.
