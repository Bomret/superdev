# 0255: Ship owns the full-suite evidence, and CI can carry it

**Status:** Accepted

**Amended by:** [ADR 0280](0280-ship-waits-for-the-named-checks-through-one-bounded-verb.md), whose ship waits on CI.

**Supersedes:** [ADR 0254](0254-the-scope-review-runs-its-full-suite-at-the-exit-alone.md), whose exit run is withdrawn.

**Amends:** [ADR 0025](0025-the-scope-review-owns-the-full-suite-run.md) and
[ADR 0075](0075-the-scope-review-gates-on-a-full-suite-entering-and-leaving.md): the scope review runs no full suite.
[ADR 0192](0192-the-full-suite-runs-once-after-review-comes-back-clean.md): the scope's one full-suite run moves
from the review's exit to ship.
[ADR 0105](0105-an-affected-full-command-and-a-whole-repo-gate-before-the-pull-request.md): submit-pr runs no
whole-repo command, and ship carries it.
[ADR 0096](0096-opening-the-pull-request-and-merging-it-are-separate-commands.md): ship's merge rests on CI check
status or a local run. It stays pinned to the head whose evidence it read.
[ADR 0128](0128-a-green-suite-record-carries-across-markdown-only-commits.md): the carry serves ship's own record.
[ADR 0230](0230-submit-pr-offers-ship-only-on-a-tip-its-gate-accepts.md): submit-pr's ship check is withdrawn.

## Context

The scope review ran the scope's one full-suite run at its exit (ADR 0192, ADR 0254), and submit-pr ran the whole-repo
command before it opened the pull request (ADR 0105). In a repository whose CI already runs the full suite on every
pull request, that local run has four costs:

- It blocks the session for the suite's length.
- It cannot run a suite that needs services, secrets, an OS matrix, or hardware the machine lacks.
- It repeats what CI runs on the same commit.
- It chokes the machine when several sessions run it at once.

Ship accepted only a local green suite record as evidence. superdev recorded nothing about a repository's CI.
ADR 0128 deferred code-host CI status as the merge gate, because no code-host seed read check status.

## Decision

1. **The full suite runs after the pull request opens, at ship, in every repository.** `/superdev:review` starts no
   full-suite or whole-repo run, in scope mode or ad hoc, and its fix loop keeps its focused runs. An ad-hoc review
   still runs the full suite when the operator asks for it. `/superdev:submit-pr` runs no whole-repo command.
2. **CI counts only by named checks.** An optional `## CI` section of `docs/agents/verification.md` lists the check
   names that together run the full suite, or reads `none`. A repository whose CI runs only part of the suite records
   `none`. An absent section and `none` both put ship on the local path.
3. **Ship's suite gate takes the evidence for the exact head it merges.**
   - With `## CI`, ship reads the code host's check status for the pull request's head SHA. It uses the code-host
     document's check-status call. `scope.js ci` judges the status against the section at that commit.
   - Every named check green merges, pinned to that SHA.
   - A missing or pending check refuses and names the SHA.
   - A failed check refuses and points at `/superdev:review`.
   - Without `## CI`, ship runs the full command on the head it merges, after its reuse and carry checks. It runs the
     whole-repo command instead where one is configured.
   - Where base will move, ship runs the suite on the merged tip alone, never also on the pre-merge tip.
   - A `## CI` section that holds both `none` and a name is a configuration error. Ship refuses. Submit-pr reports it
     and asks no ship question. Review says so once and continues.
4. **Ship never waits on CI.** Nothing in superdev polls a check or waits for one. A push that ship makes, after a base
   merge or for local commits the pull request lacks, ends in the pending refusal.
5. **Ship reads CI status fresh and records none.** The suite record stays the record of a local run.
6. **Review reads red evidence as its starting finding.**
   - A local red suite record becomes a Critical finding at review entry.
   - A failed named check becomes one too, on the recorded pull request's head, where that head is the scope branch's
     tip or an ancestor of it. A failed check on an ancestor is reported for that head, never as the tip's state.
   - A head that is no ancestor of the tip has its verdict reported for that head and raises nothing.
   - The fix loop's focused runs prove the fix, and ship checks the evidence again.
   - A fix cycle's runs write no suite record. Red evidence raises no finding where later passing runs on a clean
     tree, at a commit on the tip's ancestry, already cover it.
   - A red record's failed test files are covered by a passing `path` run of each. A passing focused run whose path
     set includes each covers them too. A fix cycle's final run adds each failed test file in either fence
     configuration, because a fix that changes only source leaves those files unchanged.
   - A red record with no failed test file is covered by a passing focused run over the scope's whole range. A failed
     check names no test file and is covered the same way.
   - A fix cycle whose list holds such a finding makes that run. Its final focused run covers every path changed
     since the scope's range base.
   - Where the focused fence repeats the full fence, that run would be a full run, which a fix cycle never makes.
     There the finding closes on the cycle's own passing `path` run of every test file the cycle changed, at the
     cycle's tip on a clean tree.
   - Where the cycle changed no test file, the finding closes on the cycle's tip being clean.
   - The report says ship checks the evidence again, through the named checks or its local suite gate.

## Considered options

- **Review's exit waits on CI instead of running locally.** Rejected: the session still blocks for the CI run.
  superdev would poll. Ship needs a CI gate anyway, because doc commits and a moved base change the head.
- **Repositories without CI keep review's exit run.** Rejected: review would carry two code paths, where one model
  holds everywhere.
- **Every check on the SHA counts as the full suite.** Rejected: it passes partial CI silently. This repository's own
  `template-tests.yml`, which runs one suite, is an example.
- **superdev triggers a CI run itself.** Rejected: it needs per-provider dispatch APIs. CI already runs on push and
  on the pull request.
- **Ship records a CI verdict in the suite record.** Rejected: it needs a new record kind and a parser change. The
  record goes stale while the host's answer cannot.
- **Submit-pr keeps its pre-PR whole-repo run where no `## CI` exists.** Rejected: it is a second code path. A red
  tip can stand as an open pull request, the cost ADR 0105 avoided.

## Consequences

A scope pays its full-suite run once, at ship, or never locally where CI carries it. A red suite surfaces after the
pull request opens. Before, it sent a fix cycle back from the review's exit.

Ship's merge rests on CI's verdict for the named checks. A named check that does not run the whole suite weakens the
merge gate. Only the operator's `## CI` list states that it does.

With `## CI`, submit-pr asks no ship question, because CI has not reported when the pull request opens.
