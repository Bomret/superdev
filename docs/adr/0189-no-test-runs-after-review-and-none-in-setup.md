# 0189: No test runs after review, and none in setup

**Status:** Accepted

**Amends:** [ADR 0128](0128-a-green-suite-record-carries-across-markdown-only-commits.md), whose
Markdown-only carry needs a passing test run at the tip and whose Decision 3 has the documentation step run
the focused command from the record's commit to the tip,
[ADR 0175](0175-a-green-suite-record-carries-across-a-delta-a-complete-focused-selector-covered.md), under
which no carry builds on another,
[ADR 0172](0172-a-suite-that-fails-once-passes-the-gate-on-one-recorded-rerun.md), under which a red record
counts only at the tip its rerun ran on,
[ADR 0025](0025-the-scope-review-owns-the-full-suite-run.md), whose documentation step verifies its commits
with the focused command, and
[ADR 0105](0105-an-affected-full-command-and-a-whole-repo-gate-before-the-pull-request.md), whose setup
probes run the affected form and confirm it executed a test.

## Context

Tests verify a project's shipped artefacts. `/superdev:review` records the full suite green on the reviewed
tip. `/superdev:document` then lands doc commits and runs the focused command over them. That run verifies
no artefact. It exists only so that `scope.js suite reusable` accepts review's record at the later tip
(ADR 0128). The doc-reader already checks the docs the pass wrote.

`/superdev:setup` asks the operator for the configuration superdev relies on and writes it. On a monorepo
it runs the affected form twice: once on the base tip, and once on a probe commit to confirm the form
executed tests. A misconfigured form can select every project there, so setup can run a whole suite.

superdev's own drift-check asserts `README.md` and `scripts/AGENTS.md`, and its shipped-prose walk reads
`plugin/references/AGENTS.md`. A doc pass edits these files, so in this repository a doc commit can break
the suite.

## Decision

1. **`/superdev:document` runs no test command,** in a normal pass, an audit, a bootstrap, and every fix
   round.
2. **The Markdown-only carry needs no test run at the tip.** A green record at R carries to T when R is an
   ancestor of T, the run trace backs R, every changed path ends in `.md`, and no changed path is a test
   path or `docs/agents/verification.md`. A full, whole, path, or focused run recorded at T that failed
   refuses the carry, and so does a latest run at T reading `unknown`. A passing run on a dirty tree
   refuses nothing. No other step takes over the removed run. Under the `## Complete selector` declaration
   the two carries chain once: the record at R carries to T when some commit M on the ancestry path from R
   to T takes the complete-selector carry from R (ADR 0175), judged at M, and M..T takes the Markdown-only
   carry, judged at T. A run handoff or a review that reached its tip by carry leaves the record at R, so
   without the chain a doc pass's Markdown commits would need a focused run at T. A red record at R whose
   gate passed on its recorded rerun (ADR 0172) counts at T the same way: R is an ancestor of T, every rerun
   condition holds when judged at R, and R..T takes the Markdown-only carry, judged at T.
3. **`/superdev:setup` runs no test command.** It validates an affected form with read-only tool queries:
   the tool's list mode on a probe commit, and a query that the form's target exists on the selected
   projects, with remote caching off. A query that fails or cannot decide asks the operator to write the
   form as is, give a corrected form, or keep the whole-suite full command. Setup states how the form
   exits when no project is affected, from the tool's docs, and the operator confirms it.
4. **superdev's drift-check asserts no repository doc a doc pass edits.** The `readme-commands` and
   `narrative-coverage` checks are removed, `ship-no-opens-pr` stops reading `README.md`, and no walker
   over shipped prose reads a file named `AGENTS.md`. The checks over ADRs, the invariant register,
   `CONTEXT.md`, and the rest of the shipped prose stay.
5. **A drift check forbids a test run in document's and setup's skill prose** (INV-0175), and in the
   `doc-writer` and `doc-reader` agent bodies and `references/doc-pass.md`, which carry document's pass.

## Considered options

- **submit-pr runs the focused command at the tip.** Rejected: it moves the cost instead of removing it,
  for a run that verifies no artefact.
- **A repository declares that its suite asserts its docs, and only then does a step run at the tip.**
  Rejected: superdev's own suite was the case that needed it, and it stops asserting those docs instead.
- **A `verification.md` section listing the Markdown files the suite reads, which refuses the carry.**
  Rejected by the operator: the gap below is accepted instead.
- **Setup keeps the base-tip run, guarded by list mode first.** Rejected: setup asks and writes; it runs no
  test command.
- **Setup checks the form against the tool's docs only, with no query.** Rejected: a form with a wrong base
  or a mistyped target exits green having run nothing on every scope, and a read-only query catches both.

## Consequences

- A scope whose doc pass lands only Markdown commits merges through `/superdev:ship` with no test run after
  review (triage #931). That holds where review's gate passed on a recorded rerun too.
- A Markdown file the suite reads or executes gets no protection beyond `## Test paths`: shipped prompt
  prose, `docs/invariants.md`, an ADR, `CONTEXT.md`, a doctested README. A post-review edit to one carries
  with no run, a doc pass's edit to `docs/*.md` included. The next scope's review finds any breakage.
- The carry holds at every gate that calls `scope.js suite reusable`, not only after review. A review fix
  cycle whose commits are Markdown only reaches the fix loop's exit gate, and the exit gate reuses the
  record with no test run at the tip. The re-review reads the cycle's commits.
- In superdev's own repository, `scripts/invariant-check.js` still reads every `README.md` and `AGENTS.md`
  for `INV-` citations, as it reads `CONTEXT.md` and `docs/*.md`. A doc commit citing an id the register
  does not carry carries with no run and fails the suite on the base branch. The next scope's run handoff
  finds it. Skipping those two file names there would not close the gap for the other Markdown files a doc
  pass edits, so the gap is accepted with them.
- A consumer repository whose suite asserts its docs loses that check between review and ship.
- An affected form whose empty-change exit is wrong is caught by the operator's confirmation, not by a run.
- `scripts/AGENTS.md`'s drift-check table is no longer checked against the registry.
