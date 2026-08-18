# 0030 — Domain shapes are declared before the first test

**Status:** Accepted

## Context

An implementer opens a `behavior` slice by writing one RED test. That test is the first artifact naming
the data the slice moves, so the structure of that data is settled implicitly, inside a test, by an agent
that has not yet said what an `Order` or a `Person` is in this project's terms. The maintainer's position
is that a language model writes better code when the domain shapes exist as declarations first.

Two recorded disciplines make this look like a contradiction. `agents/implementer.md` runs a strict
one-test-then-one-implementation loop, and its minimalism ladder forbids an unrequested abstraction — "no
interface with one implementation". A rule that says "write the shapes first" reads as a violation of
both.

## Decision

A slice `spec` names the domain shapes the slice needs, by name, in `CONTEXT.md` vocabulary. The
implementer declares those shapes before its first RED test, on both execution tiers.

Names only. Fields stay with the implementer, because `references/plan-contract.md`'s **Negotiable** rule
makes a `spec` a contract of outcomes rather than a line-by-line script, and because a planner writing
field lists guesses at structure the code has not yet shown it.

Neither discipline is weakened. A shape the `spec` names is *requested*, so the ladder still forbids every
abstraction the `spec` did not name. The test-first loop still starts at RED for behaviour; what precedes
it is a declaration, not logic.

The rule carries no gate for a repository whose language has no shape convention. The implementer
declares "the shapes the `spec` names, if any", so a `spec` naming none leaves nothing to declare, and
this repository — Markdown plus CommonJS — is one where the step never fires.

No reviewer verifies it. Whether the declarations were written before the tests is invisible in a
finished diff. The instruction is the whole mechanism, and the rule is therefore never a Definition of
Done criterion.

## Considered options

- **The `spec` names shapes and their fields.** Most deterministic for the implementer, and exact across
  slices. Lost because field lists are the *how* inside a contract of outcomes, a merged slice's `spec` is
  immutable, and slice 4 routinely learns what slice 1 could not know.
- **A shape-convention field in `docs/agents/toolchain.md`.** A deterministic gate for untyped
  repositories. Lost because it needs a setup question, a configuration field, and a drift surface to
  answer what an empty shape list already answers.
- **Seeding `<run-root>/interfaces.md` with shared shapes before the first wave**, leaving slice-local
  shapes to the implementer. The smallest change, and it prevents two parallel slices inventing rival
  `Order`s. Lost because it exists only on the full tier and does nothing for the reason the rule was
  asked for. `interfaces.md` keeps its after-merge role.
- **A drift check guarding the wording across the two tiers.** Lost on cost: a new check hand-updates four
  count claims across `AGENTS.md` and `scripts/AGENTS.md` and renumbers every ordinal after its insertion
  point, to guard four sentences. The tracer-bullet discipline the shapes step sits beside is already
  duplicated across both tiers unguarded; only the test *command* earned extraction into
  `references/test-selection.md`.
