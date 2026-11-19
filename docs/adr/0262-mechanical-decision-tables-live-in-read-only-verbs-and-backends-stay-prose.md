# 0262: Mechanical decision tables live in read-only verbs, and backends stay prose

**Status:** Accepted

**Amended by:** [ADR 0263](0263-a-verdict-verb-reads-run-root-files-and-a-store-result-its-caller-fetched.md), which lets a verdict verb read a store result its caller fetched.

**Amends:** [ADR 0261](0261-mechanical-review-grading-lives-in-read-only-verbs.md).

## Context

ADR 0261 moved review grading that the run trace and git decide into read-only `scope.js` verbs. Measured runs
show the same cost outside grading. Agents apply decision tables over the ledger, the trace, and git by hand: the
execution tier is restated in about nine files, and the open Definition-of-Done criteria, the scope review's red
evidence, and the containment procedure each take kilobytes of prose. Agents also read whole references and the
slice-store document to reach one cited section.

## Decision

A decision table whose every branch the ledger, the run trace, `dod.md`, or git decides is a read-only `scope.js`
verb whose output is the verdict, under ADR 0261's rule that each verb deletes the prose it replaces. A section that
shipped prose cites as `` `<path>`'s `## <heading>` `` is read with `scope.js section`, which prints that section
alone. Backends stay prose seeds that `/superdev:setup` turns into `docs/agents/*.md`, and agents read their calls by
section.

## Considered options

- **A JS slice-store adapter per backend.** It saves the most context per store call. It would overturn the prose
  seeds that keep backends pluggable, and it cannot carry the seed deviations each adopter records in its store
  document. Rejected.
- **Rewrite each section citation into the literal command.** It is explicit at every site, but it rewrites hundreds
  of lines and adds bytes to each. One sentence per skill and agent carries the rule instead. Rejected.
