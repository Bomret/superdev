# 0255: Ship owns the full-suite evidence, and CI can carry it

**Status:** Accepted

**Supersedes:** [ADR 0254](0254-the-scope-review-runs-its-full-suite-at-the-exit-alone.md), whose exit run is withdrawn.

**Amends:** [ADR 0025](0025-the-scope-review-owns-the-full-suite-run.md) and
[ADR 0075](0075-the-scope-review-gates-on-a-full-suite-entering-and-leaving.md): the scope review runs no full suite.
[ADR 0192](0192-the-full-suite-runs-once-after-review-comes-back-clean.md): the scope's one full-suite run moves from
the review's exit to ship. [ADR 0105](0105-an-affected-full-command-and-a-whole-repo-gate-before-the-pull-request.md):
submit-pr runs no whole-repo command, and ship carries it. [ADR 0096](0096-opening-the-pull-request-and-merging-it-are-separate-commands.md):
ship's merge rests on CI check status or a local run, still pinned to the head whose evidence it read.
[ADR 0128](0128-a-green-suite-record-carries-across-markdown-only-commits.md): the carry serves ship's own record.
[ADR 0230](0230-submit-pr-offers-ship-only-on-a-tip-its-gate-accepts.md): submit-pr's ship check is withdrawn.

## Context

The scope review ran the scope's one full-suite run at its exit (ADR 0192, ADR 0254), and submit-pr ran the whole-repo
command before it opened the pull request (ADR 0105). In a repository whose CI already runs the full suite on every
pull request, that local run blocks the session for the suite's length, cannot run a suite that needs services,
secrets, an OS matrix, or hardware the machine lacks, repeats what CI runs on the same commit, and chokes the machine
when several sessions run it at once. Ship accepted only a local green suite record as evidence. superdev recorded
nothing about a repository's CI. ADR 0128 deferred code-host CI status as the merge gate because no code-host seed read
check status.

## Decision

1. **The full suite runs after the pull request opens, at ship, in every repository.** `/superdev:review` starts no
   full-suite or whole-repo run, in scope mode or ad hoc, and its fix loop keeps its focused runs. An ad-hoc review
   still runs the full suite when the operator asks for it. `/superdev:submit-pr` runs no whole-repo command.
2. **CI counts only by named checks.** An optional `## CI` section of `docs/agents/verification.md` lists the check
   names that together run the full suite, or reads `none`. A repository whose CI runs only part of the suite records
   `none`. An absent section and `none` both put ship on the local path.
3. **Ship's suite gate takes the evidence for the exact head it merges.** With `## CI`, it reads the code host's check
   status for the pull request's head SHA through the code-host document's check-status call, and `scope.js ci` judges
   it against the section at that commit. Every named check green merges, pinned to that SHA. A missing or pending
   check refuses and names the SHA. A failed check refuses and points at `/superdev:review`. Without `## CI`, ship runs
   the full command, or the whole-repo command where one is configured, on the head it merges, after its reuse and
   carry checks. Where base will move, ship runs it on the merged tip alone, never also on the pre-merge tip. A
   `## CI` section that holds both `none` and a name is a configuration error: ship refuses, submit-pr reports it and
   asks no ship question, and review says so once and continues.
4. **Ship never waits on CI.** Nothing in superdev polls a check or waits for one. A push that ship makes, after a base
   merge or for local commits the pull request lacks, ends in the pending refusal.
5. **Ship reads CI status fresh and records none.** The suite record stays the record of a local run.
6. **Review reads red evidence as its starting finding.** A local red suite record, or a failed named check on the
   recorded pull request's head where that head is the scope branch's tip, becomes a Critical finding at review entry.
   The fix loop's focused runs prove the fix, and ship checks the evidence again. A red record that a later passing
   `path` run of its failed test files, or a passing focused run, on a clean tree on the tip's ancestry already closed
   raises no finding, because a fix cycle's runs write no suite record. A head behind the tip has its verdict reported
   for that head and raises nothing.

## Considered options

- **Review's exit waits on CI instead of running locally.** Rejected: the session still blocks for the CI run, superdev
  would poll, and ship needs a CI gate anyway, because doc commits and a moved base change the head.
- **Repositories without CI keep review's exit run.** Rejected: two code paths in review, where one model holds
  everywhere.
- **Every check on the SHA counts as the full suite.** Rejected: it passes partial CI silently, such as this
  repository's own `template-tests.yml`, which runs one suite.
- **superdev triggers a CI run itself.** Rejected: per-provider dispatch APIs, and CI already runs on push and on the
  pull request.
- **Ship records a CI verdict in the suite record.** Rejected: a new record kind and parser change, and a record that
  goes stale while the host's answer cannot.
- **Submit-pr keeps its pre-PR whole-repo run where no `## CI` exists.** Rejected: a second code path. A red tip can
  stand as an open pull request, the cost ADR 0105 avoided.

## Consequences

A scope pays its full-suite run once, at ship, or never locally where CI carries it. A red suite surfaces after the
pull request opens, where it sent a fix cycle back from the review's exit. Ship's merge rests on CI's verdict for the
named checks, so a named check that does not run the whole suite weakens the merge gate, and only the operator's
`## CI` list states that it does. With `## CI`, submit-pr asks no ship question, because CI has not reported when the
pull request opens.
