# 0169: Agent bodies are written as prompt concepts

**Status:** Accepted

**Amended by:** [ADR 0190](0190-listed-skill-files-are-written-as-prompt-concepts.md), which extends the
convention to the skill files the glossary lists.

**Amended by:** [ADR 0170](0170-prompt-concept-overlap-is-judged-by-rule-equivalence.md), which records
how a reviewer checks **One home per rule** and gives the test and the grades one home in
`plugin/references/review-checklist.md`.

## Context

The agent bodies in `plugin/agents/` grew by accretion. A rule often appeared in two sections of one
body, or restated a rule that a reference the agent reads already owns. A later edit changed one copy and
left the other, so two copies instructed differently for one situation. A reviewer could not tell which
copy was the contract.

## Decision

Every agent body is written as **prompt concepts**. [`CONTEXT.md`](../../CONTEXT.md) defines the term,
its invariants, and the **main sentence** it counts. The decision sets these rules:

- **The cap counts main clauses.** A prompt concept is stated in at most three main sentences. A written
  sentence that joins main clauses counts once for each main clause it joins.
- **The cap excludes data and the condition head.** Lists, tables, output templates, and code spans carry
  data, so the cap does not count them. The "Applies to …" sentence that states when the prompt concept
  applies does not count either.
- **One home per rule.** A rule is stated in one prompt concept. Another concept that needs the rule
  names that concept as a pointer. Where two concepts could instruct differently for one situation, one
  of them states the precedence.
- **A pointer replaces a restated reference.** Where a reference the agent reads owns a rule, the body
  names the reference and its section, and does not restate the rule. The pointer keeps the rule reaching
  the agent.

The operator decided the counting rule and its exclusions while the epic ran (epic #1166, `## Rulings`).

## Considered options

- *Count every written sentence, and count lists and templates.* Rejected: an output template or a table
  of categories would then exceed the cap, and splitting it would scatter data the agent reads as a unit.
- *Keep a restated rule in the body beside the reference.* Rejected: the two copies drift, and the drift
  is the defect this decision removes.

## Consequences

An agent body is shorter, and it carries more pointers into `plugin/references/`. A rule the agent must
follow reaches it only through a reference it reads, so a pointer to a missing section loses that rule.
The `reference` drift check confirms that each cited reference file exists, and the `source-sections`
check pins only the sections its table lists. A review of an agent body therefore confirms each other
cited section, and judges each prompt concept against the invariants in `CONTEXT.md`.
