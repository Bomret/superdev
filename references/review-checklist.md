<!--
  Attribution: the anti-pattern, vulnerability-class, and reuse-audit lists below are distilled from
  awesome-skills/code-review-skill (MIT). Credit to its authors.
-->

# Review checklist — cross-cutting, language-agnostic

Concrete lenses for a reviewer to apply on top of its own judgment — named smells and vulnerability
classes beat a generic "check code quality" / "check security."

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
- **Justified workaround** — if it takes a paragraph-long comment to justify why a workaround is OK, the
  code is wrong — fix the code. Stubbing a function out to silence a compile/test failure is the same
  smell.

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

## Consistency

- **Convention drift** — new code that ignores the conventions already established in the codebase:
  naming, file/module layout, error-handling style, the idiom used for the same job elsewhere. Match
  what's there rather than introduce a second way to do one thing.
- **Cross-slice divergence** — the same concept given a different name, API shape, or vocabulary across
  slices; two seams that should agree but don't.
- **Duplicated fact** — the same fact (a count, a name-list, a described behavior) stated in two places
  where one owns it and the other should link; flag the copy that drifted.
