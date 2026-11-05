<!--
  Attribution: the anti-pattern, vulnerability-class, and reuse-audit lists below are distilled from
  awesome-skills/code-review-skill (MIT). Credit to its authors.
-->

# Review checklist — cross-cutting, language-agnostic

Concrete lenses for a reviewer to apply on top of its own judgment — named smells and vulnerability
classes beat a generic "check code quality" / "check security."

## Binding rules

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

## Test gaps

**`test-gap-auditor` alone reads this section**, and it sits outside `## Anti-patterns` for the reason
`## Test cost` does: the lenses below are judged over standing code and the whole list of test files,
which only a test audit's gap audit holds (ADR 0162). A diff-scoped reviewer judges new behaviour against
its acceptance criteria through **happy-path-only suite** instead.

- **Untested** — a symbol no test reaches. In a file some test reaches, name the file, the line, and the
  symbol. A file no test reaches at all is one finding for the file, listing its exported symbols, so a
  repository with few tests gets a bounded report.
- **Missing case** — a symbol whose tests leave an argument class or scenario untested: null, empty,
  negative, out of range, invalid, or a failure path. Name the symbol and the one case. "More edge cases"
  names no case and is no finding.
- **Reach counts indirectly.** A test reaches a symbol when it calls it, calls a caller of it, spawns the
  process or runs the command verb that runs it, drives the registry or table that dispatches to it, or
  sits inside the source file itself as an inline test. Report `untested` only when no such path exists.
- **Reach is tied to the module.** A test reaches a symbol only through the module that defines it: the
  file it imports, requires, or spawns. A test naming a same-named symbol in another module does not
  reach it.
- **Rank by risk.** A trust boundary first — parsing external input, I/O, authentication, money — then an
  exported symbol, then an internal one. Ties break on the number of untested branches. Give each finding
  a one-line reason for its tier.
- **Static evidence.** No coverage tool runs, so every gap finding is a judgment labelled `static`.

## Review coverage

**`final-reviewer` reads this section**, because the entry below is judged against the run trace
(`scope.js trace`), which hooks wrote, and no diff shows it (ADR 0117).

- **Unreviewed slice** — `final-reviewer`'s, on a `full` scope only: a merged `behavior` slice with no
  `dispatch` line of agent type `slice-reviewer` whose `completed` `dispatch-end` comes after the slice's last `completed`
  `dispatch-end` of `implementer`, and no `**Degraded:**` ledger entry naming that slice's denied review. A
  `dispatch-end` line ends with its outcome: `completed`, `failed`, `denied`, `stopped`, `unknown`, or `session-end`.
  A line with no outcome reads `completed`, and only a `completed` end finishes a dispatch, so a slice review that
  ended any other way reviewed nothing. Severity Important. No trace gets no finding: the report names the gap.
  A merged `mechanical` or `docs` slice gets no finding, because the full tier reviews it at the scope review alone
  (`implement-full.md`). A slice whose ledger type cannot be read gets no finding either: the report names the gap.

## Fail-to-pass run

**`final-reviewer` reads this section** on a `lite` scope and for fix cycles on either tier, and `slice-reviewer` reads it on the full tier, because both entries below are judged against the
run trace (`scope.js trace`), which `scope.js` wrote (ADR 0134, ADR 0117). A fail-to-pass run puts back every
file a `behavior` slice's range changed outside its test-path files and runs the range's test files again. The
implementer of the change runs it over its own range before its report (ADR 0182). Its outcome line is a
`fail-to-pass` line carrying the range, the outcome, a reason, and the command both runs used, and it is no test run.
Where the trace already holds a passing `path` run of those test files at the tip on a clean tree, that run is the first
run, and the verb runs only the second (ADR 0215).

**An outcome line counts only where its command runs the range's test files** (ADR 0188). The verb reads no word of
the command, so read it against the repository's runner and the test files the range adds or modifies. A line whose
command leaves one of them out counts as no outcome line for either entry below, and the finding names the file.
A line whose coverage you cannot judge, one with no command among them, counts, and the report names the doubt.

- **Pass-to-pass** — on a `behavior` slice, a latest outcome line over the slice's range that reads
  `pass-to-pass`: the slice's tests passed with the slice's other files put back as they stood before it, so
  they do not discriminate what it changed. Severity Important. A slice whose latest outcome line reads
  `fail-to-pass`, and a slice with no outcome line, get no such finding. At every dispatch, an entry dispatch
  included, the finding closes only when the trace records, after its `pass-to-pass` line, an outcome line that
  reads `fail-to-pass` over a range from the original change's base to the tip current when that closing run
  ran, so a fix that only strengthens the test closes it, and the finding stays closed once that line is
  written. A finding no fix can close carries the unclosable mark, defined below.
- **Missing fail-to-pass run** — on a `behavior` slice, a range that changes both a test-path file and another
  file, with no outcome line over that range. Severity Important. A slice whose ledger row records no range is
  read from its own trace: its `edit test` and `edit impl` lines name both a test-path file and another file.
  A slice with no `edit` line, a run with no trace, and a repository with no test command get no finding: the report
  names the gap. A range whose test-path changes are all deletions has no test of its own to run, so the verb refuses
  it: where its changes outside the test paths add no behaviour, it needs no outcome line and gets no finding (ADR 0196).
  Read every file such a range changed outside its test paths: one that adds behaviour leaves that behaviour with no
  test, so the range draws the finding, and its fix adds a test for that behaviour and runs the verb. Only `edit` lines count as a slice's or a cycle's change events, so a `run` or `ledger` line is none,
  even one written after the trace began for a slice whose edits came before it. The finding goes into the fix
  list: the fix implementer runs `scope.js fail-to-pass <base>..HEAD -- <command>` over the range the finding names,
  and the finding closes on the outcome line that run writes. Where the row records no range, the controller first
  reads the slice's commits from the scope branch's log, records the range with
  `scope.js slice <id> merged --range <base>..<tip> --root <run-root>`, and names it in the fix dispatch.

A fix cycle is a change too, on either tier, in `/superdev:review`'s fix loop (`review-scope-mode.md`'s `### 4.7 Fix cycles`)
(ADR 0134). Its range runs from the scope tip the controller recorded before the fix dispatch to the tip once the
cycle's report is accepted, after any send-back to the implementer, and both findings apply to it. Where the cycle's commits change both a test-path file and another file, the
cycle's implementer runs `scope.js fail-to-pass <base>..HEAD -- <command>` over that range from the scope checkout
before its report (ADR 0182), and the trace line names `scope`, because no ledger row records the range and no
slice is in progress. `final-reviewer` reads a
review cycle's range from the re-review's dispatch. A re-review hands `final-reviewer` only the current cycle's
range, so it reads the scope's earlier review cycles from the trace at every dispatch of `/superdev:review`: a `scope` range whose latest outcome line reads
`pass-to-pass` is a Pass-to-pass finding, and an `implementer` `dispatch` of `scope` with `edit` lines in its
window, whose commits that landed in that window change both a test-path file and another file, with no outcome
line over those commits, is a Missing fail-to-pass run finding. A fix cycle's window runs from each run of its
`implementer` dispatch of `scope` (its `dispatch` line, and each `dispatch-resume` line of that dispatch) to the first
`dispatch` line, whatever its agent type or slice, or the first reviewer `dispatch-resume` line (one whose first field is the `tool_use_id` of a `final-reviewer`, `slice-reviewer`, or `simplicity-reviewer` `dispatch` line), after the
`dispatch-end` line that closes that run, or to the end of the trace when none follows. A warm cycle's re-review
is a reviewer `dispatch-resume` line, so two warm cycles' commits never share one window. Whatever the end's outcome (`completed`, `failed`, `denied`, `stopped`, `unknown`, or
`session-end`), the window is bounded the same way. An implementer run with no `dispatch-end` line has a window that
ends at the first such `dispatch` or reviewer `dispatch-resume` line after its own `dispatch` or `dispatch-resume` line, or at the end of the trace. A cycle's commits are read along the scope branch's first-parent chain, so the base commits a merge brings
in are none of them, and neither is a merge commit that brings the base in. An implementer that edits a file to show
RED and restores it leaves an `edit` line that no commit carries, so the `edit` lines find a cycle and its commits
decide it. The original change's base is the base of the range the finding's `pass-to-pass` line names: a lite
slice's recorded range base, or the fix cycle's own base. A `scope` line that follows a finding's own `pass-to-pass`
line and starts its range at that line's base is the finding's closing run, not a cycle: it closes the finding or
keeps it open, and raises no second finding. A cycle's Missing finding goes into the fix list the same way a slice's
does, over the cycle's range, which the controller names in the fix dispatch.
The report names a cycle's finding with its range. No trace, a cycle with no `edit` lines, and a
repository with no test command get no finding: the report names the gap. A cycle whose commits change only
test-path files, or no file, has nothing to put back, and a cycle whose test-path changes are all deletions and whose
changes outside the test paths add no behaviour has no test of its own to run: either needs no outcome line and gets
no finding, and the report names no gap for it. A cycle whose test-path changes are all deletions and that adds
behaviour outside the test paths draws the Missing fail-to-pass run finding, as a slice's range does.

**An unclosable Pass-to-pass finding is one no fix can close** (ADR 0193, ADR 0196). It is unclosable in exactly three
cases, and the list is closed:

- **(a)** The range's behaviour change lies wholly in test-path files, so the put-back carries none of it. Read
  every file the range changed outside its test-path files: one that carries behaviour rules the case out. A file the
  outcome line's command does not read, such as prompt prose or a doc, carries no behaviour for the put-back. A file
  that command reads carries behaviour, as prose does in a repository whose tests read it (ADR 0193).
- **(b)** A test pins existing behaviour on purpose, so it passes before the change by design. The reason names
  the existing behaviour the test pins and why the range leaves it unchanged. New behaviour that no test detects
  is not case (b).
- **(c)** The range's changes outside its test-path files preserve behaviour: they restructure or remove code and
  add none, as a refactor does, or a cut that removes code together with its tests. The reason names, for each such
  file, what was restructured or removed and why no behaviour changed. A file that adds behaviour rules the case out.

A mark names exactly one case. A range whose changes outside the test paths only restructure or remove code is
case (c), whatever its test's intent. The reviewer that raises the finding marks it in one fixed form,
`unclosable (a): <reason>`, `unclosable (b): <reason>`, or `unclosable (c): <reason>`, and the finding stays Important. A slice's range and a fix cycle's range are judged
alike. The reviewer re-judges the mark at every dispatch against the current range, the scope's earlier review
cycles read from the trace included, so a re-raised finding carries its mark. A re-review that reads only the
latest cycle's range, the warm re-review and the Minor sweep's, restates each unclosable finding the last verdict
listed with its mark re-judged (`scope-findings.md`'s `## Warm cycles`). A later change that adds
behaviour to a file outside the test paths makes the finding closable again. An implementer's or the lite
controller's claim of a case is input the reviewer checks against the range, never a verdict it adopts. Any
other Pass-to-pass finding is closable, and a Missing fail-to-pass run finding never carries the mark.

Both findings take the 3-cycle fix cap and the escape path of ADR 0125: a scope or slice whose only remaining
Critical or Important findings are Pass-to-pass or Missing fail-to-pass run proceeds at the cap, and the
report names each finding with its slice. An unclosable finding takes the escape at once, before the cap, and
never enters a fix list (ADR 0193). Any of them beside a Critical or Important finding of another kind
blocks at the cap.

**On the full tier, `slice-reviewer` applies both entries** (ADR 0134) to each range its dispatch names: the slice's
range, from the commit its slice branch was cut from to the tip the first review read (the same range on every
review), and on a re-review the fix cycle's range as well, from the tip the earlier review read to the current tip.
A fix cycle whose range is empty, or whose commits change only test-path files, has nothing to put back, and one whose
test-path changes are all deletions and whose changes outside the test paths add no behaviour has no test of its own
to run: it needs no outcome line and draws neither finding. A slice's range or a fix cycle's range whose test-path
changes are all deletions and that adds behaviour outside the test paths draws Missing fail-to-pass run.
The implementer runs the verb from the slice's base on the slice dispatch and
on every slice fix dispatch (ADR 0182), so an outcome line over a range from the slice's base to a range's tip covers
that range: the latest one decides Pass-to-pass, and one satisfies Missing fail-to-pass run, on the slice's own range
and on a fix cycle's range alike. A Pass-to-pass finding closes on a `fail-to-pass` outcome over a range from the
slice's base to the current tip. The slice's ledger row records no range while the slice is under review, so the
range comes from the dispatch, and a Missing fail-to-pass run finding goes into the next fix dispatch, which names the
slice's base.

**An `unknown` outcome is no finding.** A `fail-to-pass` line reading `unknown` records a run that could not judge
(ADR 0134, INV-0139). Either the tests did not pass against the changed code, and `control=`
names the exit status or the signal they ended with. Or the run before the change outlasted ten times the duration
the run against the changed code took or 10 seconds, whichever is larger (ADR 0142;
`verification.failToPassFloorMs` in `.superdev/info.json` overrides the 10-second floor), or ended by a signal, and `bound=` names the bound the run ran under. A run
whose command could not start reads `start-failed:<code>` in place of its exit status. A prepare command that did not
succeed before a run reads `prepare=` with its exit, its signal, `start-failed:<code>`, or `dirty` (it changed a tracked
file), as `prepare=…` before the run against the changed code or `control=0,prepare=…` before the run before the
change (ADR 0218): no run of the tests carries a verdict there either. A reviewer
that reads the trace (`slice-reviewer`, `final-reviewer`) names every `unknown` in its report
with its slice and its reason, raises no finding for it, and starts no fix cycle. The line counts as an outcome line
for **Missing fail-to-pass run**, and the latest line reading `fail-to-pass` or `pass-to-pass` decides
**Pass-to-pass**, so an `unknown` neither raises nor closes it. The controller, not the reviewer, captures the scope
run's first `unknown` that `references/scope-findings.md`'s `## Observations` does not exempt, as an observation.

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
  where one owns it and the other should link; flag the copy that drifted. Where
  `## Prompt-concept overlap` applies to a governed body, judge a pair the overlap test forms by that section
  instead, so one pair draws one finding.
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

## Prompt-concept overlap

Applies to a review subject, a change or standing code, that includes a governed body or a reference
section a governed body directs its reader to read, in a repository whose glossary (`CONTEXT.md`) defines
**Prompt concept**. A governed body is an agent body, or a skill file the glossary's **Prompt concept**
entry lists. Read the governed set from that entry. A repository whose glossary has no such entry gets no
finding from this section.

- **The test.** Two sentences overlap when they apply under the same condition and give the same
  instruction, so deleting either one leaves every dispatch's instructions unchanged. Apply it to a pair
  inside one governed body, and to a pair of one body sentence and one sentence in a reference section the
  body directs its reader to read. A change that edits only such a reference section gets the test on
  every pair that section forms with a body that directs its reader to it.
- **A dispatch sentence.** In a listed skill file, a sentence the controller relays to an agent, as the
  text of a dispatch or as an instruction the dispatch hands the agent, forms a pair with the sentences of
  the agent body it reaches. Judge that pair by the test above. A sentence that tells the controller what
  to do, such as when to dispatch, what to read, or what to do with the report, is a controller-only
  instruction and forms no pair, even where it names agent behaviour. To tell the two apart, ask who acts
  on the sentence: the agent receives and acts on a relayed sentence, and the controller acts on a
  controller-only one. Dispatch prose of a skill the glossary does not list stays outside the test.
- **Not an overlap.** A sentence that adds a condition, an exception, or a different effect. A pointer that
  names a prompt concept or a reference section and adds no instruction of its own. A statement an
  invariant register entry requires in that governed body. A pointer that
  also restates its target's instruction is a restatement, and the test applies to the restated part. A
  pair that is no overlap can still differ, and `Grades` judges it.
- **Grades.** A same-instruction pair is **Minor**. A pair that instructs differently for one situation is
  **Important**, the glossary's No conflict invariant, unless one of the two sentences names the rule it
  departs from: "instead of", "except", or a pointer to that concept. A narrower condition alone states no
  precedence.
- **The finding.** Label it **Prompt-concept overlap**, and cite both `file:line`s, the shared condition,
  and the shared instruction. A pair whose shared condition or shared instruction you cannot name is no
  finding.

| Pair | Verdict |
|---|---|
| "Applies to every dispatch. You report to the controller." beside "On every dispatch, report to the controller." | Minor: same condition, same instruction |
| "Name the specific smell." beside "For a security finding, also name the vulnerability class." | no finding: the second adds a condition and an effect |
| "Apply `## Binding rules` in `review-checklist.md` to every finding." beside that section | no finding: a pointer that adds no instruction |
| "Run the suite once." beside "On a docs slice, run no suite." | Important: neither sentence names the rule it departs from |
| A listed skill's dispatch sentence "Run the suite once." beside the agent body's "Run the suite once." | Minor: the controller relays the sentence, so it forms a pair with the body it reaches |
| A listed skill's "Dispatch the reviewer after the merge." beside the agent body's "Review the merge." | no finding: the first tells the controller when to dispatch and forms no pair |
| A change that edits only a reference section, whose sentence repeats a sentence of the agent body that directs its reader to it | Minor: the section forms the pair, although no body is in the diff |
