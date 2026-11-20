<!--
  Attribution: the anti-pattern and vulnerability-class lists below are distilled from
  awesome-skills/code-review-skill (MIT). Credit to its authors.
-->

# Review checklist — cross-cutting, language-agnostic

Concrete lenses a reviewer applies on top of its own judgment: named smells and vulnerability classes.

## Binding rules

**The binding rules.** Applies to every lens in this file, and to every lens of a reference that cites this section.

- **The repo overrides.** A documented repo standard wins. Where it endorses something a lens would flag, suppress
  the finding.
- **Skip what tooling already enforces.** A linter or formatter the repo runs (`docs/agents/toolchain.md`) owns its
  own class of issue. Report none of that class.
- **A smell is a judgment call.** Label every smell as one ("possible feature envy"), never as a hard violation.

## Anti-patterns

**The anti-patterns.** Applies to every review that cites this section. Flag each smell the change shows, named as
listed.

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
  Regenerating a snapshot, a golden file, or another recorded expected output to match new output is the same
  smell, unless a slice's acceptance criteria or the Definition of Done changed that output.
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
  must carry). A `fail-to-pass` outcome does not clear this finding: read the assertions of a test of a symbol the
  change introduces, and of a weak test beside a discriminating one.
- **Overclaiming check** — a test or a drift check whose name, assertion message, or the criterion it is
  cited for claims more than the input it feeds and the property it asserts. The probe: reconstruct the
  input the check feeds and the property it asserts, state both in the finding, and compare them with the
  claim. A check named "rejects every malformed header" that feeds one header missing its colon, or a drift
  check cited for "every link resolves" that reads one directory, is this smell. A check that exercises the
  code but asserts a narrower property than it claims is this smell; a check that passes whatever the code
  does is **Tautological test**. A finding names one of the two smells, never both. Tautological test's two
  exclusions hold here too: a check that two sources agree, and a pin on text whose only runtime reader is a
  person or a model. A review applies this smell, and the test audit does not.
- **Happy-path-only suite** — new behaviour whose tests exercise only the success path, with no assertion
  for the failure and boundary cases named in its acceptance criteria. Name the specific uncovered case,
  not a vague "add more tests."
- **Redundant test coverage** — a new test re-proving a case an existing test already covers. Name the
  covering test's location, so the reader can decide which of the two survives. Distinct from **weakened net**:
  that one loosens a test already there, this one adds a test nothing needed.
- **Overweight fixture** — a test standing up a heavier fixture than the behaviour it proves requires: a
  container, a real database, or a live network where an in-memory fake, a stub, or a direct call proves
  the same thing. Name the lighter form. A heavy fixture is no smell where that integration is itself the
  behaviour under test.
- **Justified workaround** — a workaround that takes a paragraph-long comment to justify. The remedy fixes the
  code. Stubbing a function out to silence a compile/test failure is the same smell.
- **Drive-by change** — a hunk that traces to no acceptance criterion and to nothing in the
  specification: a reformatted function the change never touched, a renamed unrelated variable, an
  "improved" neighbouring comment, a refactor nobody asked for. Deleting *pre-existing* dead code is this smell
  too: the report names it and removes nothing. Removing what the change itself orphaned is no smell.

## Vulnerability classes

**The vulnerability classes.** Applies to every review that cites this section. Flag each class the change shows,
named as listed. The citing agent body states its severity.

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
