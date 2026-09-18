# 0074: the focused test command is the loop's cheap command

**Status:** Accepted

## Context

ADR 0025 introduced the second fenced block of `docs/agents/verification.md` and defined it as **the
narrowed run** — the command that scopes a run to a set of changed paths. Three consequences followed from
that framing, and all three cost the adopter ADR 0025 was written for.

`/superdev:setup` routed a runner that cannot map source files to tests directly to "record no focused
command", and `references/test-selection.md`'s fallback then ran the **full** command at every in-loop
caller: the implementer's TDD increments, the lite tier's inline loop, the slice-reviewer, the green-gate
after each controller merge, and the documentation step. That is the fifty-five-runs-per-scope cost
ADR 0025's own Context names, reached through the door its definition left open — and reached by exactly
the ten-minute-suite adopter it was meant to spare.

The narrowing framing also made `{paths}` look universal, so the shipped derivation proposed
`pytest {paths}`. `pytest` maps no source file to the tests covering it: handed a source path it collects
nothing from that path. A focused run over a change set holding no tests is not a run that proves nothing —
it reports **red**. `pytest` exits 5 on an empty collection, and `vitest`'s `passWithNoTests` defaults to
`false` (both verified 2026-09-18, against the projects' own documentation). The documentation step reaches
that case on every scope, because its range is its own doc commits and those are prose.

`hooks/green-gate.js` carried the same assumption in code. `pickCommand()` checked the empty-changed-path-set
fallback before it checked whether the focused command consumed `{paths}` at all, so a command that ignores
the path set was overridden by the full suite on an empty set.

## Decision

**The second fenced block is the command the implement loop runs, and what defines it is that it costs less
than the full suite.** Path scoping is one way to be cheaper, not the meaning of the slot. A fast subset —
unit tests with the integration tests excluded — is another, and `hooks/green-gate.js` already ran a
`{paths}`-less focused command verbatim, so the schema needed no change to carry it.

**`{paths}` requires a runner that maps source files to the tests covering them.** `/superdev:setup` derives
a `{paths}` form only for such a runner, and that form carries the runner's pass-with-no-tests flag, which
is what keeps a test-less change set from reporting red. Every other runner gets a `{paths}`-less fast
subset, which always collects tests and so never reaches the failure at all. One rule covers both branches,
and neither branch needs superdev to decide what a test path looks like.

**`none` survives for two cases, and setup records which applied**: the full suite is already cheap, or no
cheaper subset exists to name. "The runner cannot narrow" stops being one of them, because that case now
routes to a fast subset.

**The empty-changed-path-set fallback applies only to a command that consumes `{paths}`.** A `{paths}`
substitution over no paths would report green having tested nothing; a command that ignores the path set
runs its own fixed selection and proves what it always proves. `pickCommand()` reorders its two branches to
match.

## Considered options

- **A third configuration slot, `## Fast command`**, between the focused and full commands, held in a
  backtick span the way `## Timing command` already avoids the positional fence slots. It buys a repository
  that wants both a unit subset and path scoping the ability to keep them separate. It loses because that
  repository composes the two itself — `vitest related --project=unit {paths}` — while the section costs new
  parsing in `hooks/green-gate.js`, a new setup decision, and new drift rows for a case with no demonstrated
  adopter.
- **Filtering the changed-path set** down to the test paths it contains, dropping source paths a runner
  collects nothing from. It addresses the same failure. It loses because it requires superdev to classify a
  path as a test across every ecosystem it supports, where constraining the derivation requires nothing.
- **Teaching each caller to tolerate an empty collection.** It loses on runner knowledge superdev
  deliberately keeps out: pytest's exit 5 is distinguishable, and jest's and vitest's failure on no tests is
  an exit 1 indistinguishable from a real failure.

## Consequences

An adopter whose runner cannot narrow by path gets a cheap in-loop command instead of the full suite, which
is the outcome ADR 0025 intended and its definition prevented. An adopter whose runner does narrow gets the
same path-scoped command as before, with a flag that keeps a prose-only or test-less change set green.

A repository configured before this decision is unaffected. An absent second fenced block still falls back
to the full command at every caller, and a configured `{paths}` form still behaves as it did. The change
reaches an existing repository when its operator re-runs `/superdev:setup`; there is no migration.

`none` keeps a legitimate home, so this repository's own `docs/agents/verification.md` stays correct: its
suite finishes in seconds, which is the first of the two surviving cases.

ADR 0025 keeps its decision. The focused command, its in-loop callers, the ship step's and `doc-writer`'s
silence, and the documentation step's own focused run are untouched. This record narrows one clause of it,
the way ADR 0043 narrowed one clause of ADR 0004 rather than marking a still-governing decision
`Superseded`.
