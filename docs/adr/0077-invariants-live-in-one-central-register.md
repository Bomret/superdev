# 0077: Invariants live in one central register

**Status:** Accepted

**Amended by:** [ADR 0091](0091-the-definition-of-done-is-ticked-while-the-run-works.md), which routes
a held register match's id into the touching slice's `spec` and `acceptance` instead of a
Definition-of-Done criterion under that id; the epic states the behaviour the entry protects, and
`final-reviewer` judges an entry covered by either half.

**Amended by:** [ADR 0093](0093-a-pre-register-backfill-records-only-what-nothing-else-catches.md), which
adds a register validator that selects nothing, and records how a repository that predates the register
is backfilled.

**Context.** A system holds rules that must never break: a module is loaded once, a removed module is
unloaded, an order total equals the sum of its lines, the domain layer imports no infrastructure. A
feature built in isolation breaks one without noticing, because the rule lives somewhere the work never
looks — a wiki page, or a comment in a class the change does not touch. The suite stays green. superdev's
full tier sharpens this: each slice is built in its own slicetree by an implementer that sees one slice
and nothing else, and nothing in the plan, the implement loop, or the review carries a system's standing
rules into that isolation.

`.claude/rules/` with a `paths:` glob is the platform's own answer to locality, and it works — the file
loads when Claude reads a matching file. It loses on three counts anyway. A hidden directory is not where
a human looks for the rules of their system. It binds the rule to one harness, while superdev also renders
its prompts to OpenCode (ADR 0055). And a file glob is the most volatile coordinate a repository has: a
class split across two files, or moved to another library, silently unbinds its rule while the rule still
reads correct.

**Decision.** A repository records its invariants in `docs/invariants.md`, one register at a fixed path,
created lazily when the first invariant crystallises and committed to the base branch beside `CONTEXT.md`
and `docs/adr/` under the same base lock (ADR 0058).

Each entry carries an id, a `Class`, the `Concepts` it governs, its `Statement`, and how it `Breaks`, and
optionally the `Symbols` and `Paths` it governs. `Concepts` is mandatory and draws on `CONTEXT.md`'s
vocabulary. An entry whose `Breaks` reads `silently` also answers `Check:`, naming the executable proof or
`none` with the reason.

`/superdev:plan` reads the register whole while it grounds a decomposition, and judges which entries the
feature touches against the touch map and the vocabulary the interview settled. Each match becomes a
Definition-of-Done criterion under its id **and** is written into the `spec` of the slice that touches it.
`final-reviewer` reads the register itself rather than only the criteria it is handed, and reports an entry
the Definition of Done does not carry as a plan-coverage gap. `/superdev:document` checks that each
`Paths` glob and each `Symbols` entry still resolves to something in the repository.

`/superdev:plan` writes no `.claude/rules/` file and `final-reviewer` carries no rule-compliance check.
`/superdev:setup check` reports a non-empty `.claude/rules/` directory, naming the register as where its
content belongs.

**Why.** One home is what makes the register readable by a human, which is half the point: a developer
who wants to know what always holds in this system opens one file.

Concepts are the coordinate that survives. A path breaks on the refactor that is most likely to threaten
an invariant in the first place, and the break is silent. A concept moves only when the domain language
does, which is the deliberate act `CONTEXT.md` already records. `Paths` survives as an optional field for
the case where the path boundary is itself the invariant, as in a layering rule, where a moved boundary is
a change to the decision rather than drift away from it.

superdev is its own transport. Because `/superdev:plan` writes the matching invariant into the slice `spec`
that the implementer already reads, the register reaches the isolated slicetree with no change to
`/superdev:implement` or either execution playbook, and with no dependency on a harness feature — which is
what keeps the OpenCode rendering whole.

**Considered options.**
- *`.claude/rules/` as the invariant home.* Rejected: a hidden directory is not where a human reads the
  rules of their system, it binds the invariant to one harness, and keeping it beside a central register
  gives two homes to overlapping content — the `duplicated fact` smell `review-checklist.md` names.
- *Path globs as the primary scope coordinate.* Rejected: paths rot silently under exactly the refactors
  that threaten invariants, and they miss the outside-in break, where a reference held from outside a
  subsystem keeps a load context alive without touching a file under its glob.
- *Prose scope, judged by the agent.* Rejected: maximally expressive and undecidable. It reintroduces the
  attention gate that loses the invariant in the first place — a rule that must be noticed can be missed,
  where a named concept makes the hit undeniable.
- *A configurable register path declared in `docs/agents/documentation.md`.* Rejected: `docs/agents/`
  carries backend configuration, and a register has no backend. It costs a seed change, a setup question,
  a config read in both `/superdev:plan` and `final-reviewer`, and a drift row holding them together.
- *A `## Invariants` section in the root `AGENTS.md`.* Rejected: it is always loaded, so it charges every
  session for a list that grows, and it mixes a subtree's work contract with a system's standing rules.
- *A script that parses the register and matches entries mechanically.* Rejected: a register carries tens
  of entries, so reading it whole costs less than a parser, a test suite, and a format that becomes a
  pinned contract. The scope fields stay proof rather than filter — a match the plan passes over is
  visible.
- *A mandatory `Check:` on every silently breaking entry.* Rejected: an invariant nobody can cheaply test
  today would go unrecorded and stay in somebody's head, which is the failure being fixed. The forced
  answer, `none` with a reason included, records the absence instead.
- *Carrying matching invariants into every `/superdev:implement` dispatch.* Rejected: it reaches slices
  the plan did not mark, at the cost of rebuilding both execution playbooks, context on every slice, and
  new drift rows holding dispatch and agent prose together. The slice `spec` already reaches the
  implementer.

**Consequences.** A repository carrying `.claude/rules/` loses its rule-compliance check. `/superdev:setup
check` is what tells its operator, and the content moves into the register by hand, because `Class` and
`Concepts` are mandatory and a glob-scoped rule records neither — a conversion would invent them.

The register helps only once somebody writes an entry. A brownfield repository's existing invariants stay
in its wiki and its source comments until a separate feature harvests them.

`/superdev:plan`'s judgment is the only matcher. An entry it passes over still reaches `final-reviewer`,
which reads the register itself — that is the second chance, and there is no third.
