# 0156: Maintainer documents are checked against each other

**Status:** Accepted

**Amends:** [ADR 0126](0126-a-numbering-collision-is-found-by-number-not-by-conflict.md), whose base step moves a
colliding number and leaves updating its citations to the controller.

**Context.** Several of this repository's documents state the same fact in two places, and nothing
fails when one side changes. Triage #489 lists five such pairs. The `## Timing command` heading has a
writer, a definition, and a reader, and a rename in any one of them leaves every test audit `unmeasured`
while the suite stays green. A fenced block inside a `CONTEXT.md` entry splits that entry for the drift
checks' paragraph scan. An invariant register entry's `Paths:` and `Check:` drift from the contract tables
that pin its invariant. INV-0020 claimed the four review agents carry the judge-discipline text verbatim,
and they do not. An ADR's `**Amends:**` header has no matching `**Amended by:**` on the amended ADR in
about thirty cases. Triage #1034 adds the Review verdict and Review cycle glossary entries, which no check
holds against ADR 0136. Triage #971 adds the shipped case: after the base step renumbers a colliding ADR
or invariant, a missed citation of the old number points at the base's unrelated record once the base is
merged.

**Decision.**

- *Heading and text pins are contract rows.* The Timing command heading joins
  `SOURCE_SECTION_CONTRACTS`. The judge-discipline clauses and the two glossary entries get rows in
  contract tables, so no new scanner is needed for them.
- *The fence split is fixed where the split happens.* The glossary paragraph scan keeps a fenced block
  inside its paragraph. `maskFences` is unchanged, because every other caller relies on blank masking and
  equal line lengths.
- *The register is joined to the contract tables in drift-check.* A drift id a `Check:` line names must
  be a registered check, and a contract row whose expectation cites an invariant must pin a document that
  invariant's `Paths:` covers. `scripts/invariant-check.js` stays the generic register validator, because
  drift ids exist only in drift-check.
- *INV-0020 states the shared core.* Each review agent judges a different subject, so the copies are
  adapted on purpose. The invariant names the two clauses every copy carries, and a contract table pins
  them in each agent.
- *ADR relations pair in both directions.* `**Amends:**` pairs with `**Amended by:**`, and
  `**Supersedes:**` with `**Superseded by:**`. Every `[ADR NNNN]` link in a relation header is a relation
  target, so a header holds no context link. The existing ADRs are backfilled to pass.
- *A renumber is verified, not performed, by `scope.js`.* After the base step moves a number and updates
  its citations, a `scope.js` verb reports every line the scope branch added that still cites an old
  number. The controller fixes each line it names and runs the verb again. An attended operator may keep a
  line as a legitimate citation of the old number. The base then merges once the verb exits 0 or only kept
  lines remain. An unattended run blocks on such a line.

**Considered options.**

- *Change `maskFences` to leave a placeholder on fence lines.* Rejected: eight callers depend on its
  output, and an empty line inside a fence still splits the paragraph.
- *Check only that `Check:` drift ids resolve.* Rejected: it misses the original instance, an INV-0006
  `Paths:` list out of step with the table that pins it.
- *Make the four judge-discipline copies identical.* Rejected: the proxy-count clause has nothing to apply
  to in the simplicity reviewer or the test auditor, and the subject each agent judges differs.
- *Pair only Amends and Amended by.* Rejected: a missing `**Supersedes:**` misleads a reader the same way,
  and ADR 0102 alone accounts for eight such gaps.
- *`scope.js` performs the renumber and rewrites citations itself.* Rejected: a rewrite engine over prose
  citation forms is larger and riskier than a check that names what the controller missed.

**Consequences.** `bun run test` fails when one side of a pinned pair changes alone. The register check
does not catch a `Paths:` glob wider than the rows that pin the invariant, because a wider glob can be
legitimate. The renumber check reads only lines the scope branch added, so a citation the base itself
carries is never reported. It runs before the base merge, when no scope line can yet cite the base's new
record under the old number.
