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
  one.
- **Tautological test** — an assertion that recomputes the expected value the way the code does (e.g.
  `expect(add(a,b)).toBe(a+b)`), so it passes by construction and would keep passing if the code were
  wrong. The expected value must come from an independent source of truth — a literal, a worked example,
  the specification.
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
  --worktree --source=<base> -- <paths>`, a failing run, `git restore -- <paths>`, a passing run, never `git stash` (`<base>` is the commit the slice branch was cut from, which the dispatch names). A `run … unknown` line is not a failing run: it neither satisfies the RED step nor closes the finding, and the implementer answers it by re-running the test without a pipe or `|| true`.
  The finding names failing order and no failing behaviour, so its fix takes no RED test. `final-reviewer`
  applies it to every slice's trace lines on a `lite` scope, with the same closing sequence and no-trace rule.
- **Unreviewed slice** — `final-reviewer`'s, on a `full` scope only: a merged slice with no
  `dispatch` line of agent type `slice-reviewer` whose `dispatch-end` comes after the slice's last `dispatch-end` of
  `implementer`, and no `**Degraded:**` ledger entry naming that slice's denied review. Severity
  Important. No trace gets no finding: the report names the gap.

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
