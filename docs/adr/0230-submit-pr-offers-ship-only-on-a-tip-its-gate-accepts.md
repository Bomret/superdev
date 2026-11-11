# 0230: submit-pr offers ship only on a tip its gate accepts, and a prose edit keeps the carry

**Status:** Accepted

**Amends:** [ADR 0128](0128-a-green-suite-record-carries-across-markdown-only-commits.md), whose carry refuses
any change to `docs/agents/verification.md`, and
[ADR 0175](0175-a-green-suite-record-carries-across-a-delta-a-complete-focused-selector-covered.md), whose
focused carry refuses the same change.

## Context

`/superdev:ship`'s plain suite gate refuses a tip that `scope.js suite reusable` does not accept and no focused
carry covers. `/superdev:submit-pr` checks the suite only where the repository configures a
`## Whole-repo command`. Elsewhere it opens the pull request and offers ship whatever the suite record says. Ship
then stops at once with "the tip carries no green full-suite result to reuse", and the offer that started it was
certain to fail.

The most frequent cause, across the operator's runs in several repositories, is the doc pass. `/superdev:document`
edits prose in `docs/agents/verification.md` after the review's exit run, such as a measured duration or one
punctuation mark. Both carries refuse any change to that file, because a change to it can rewrite the test
commands and the test paths the carry trusts. A prose edit rewrites neither.

## Decision

1. **submit-pr runs ship's reuse check before it offers ship.** Where no `## Whole-repo command` section
   applies, submit-pr runs the plain `scope.js suite reusable` call ship's plain gate runs. It runs no test. When
   the check refuses and the focused carry's preconditions do not hold (`references/test-selection.md`'s
   `## The carry run`, step 1), ship would refuse. submit-pr then still opens the pull request, names the
   refusal in its report, prints `/superdev:review <scope>` as the next command, and offers review in place of
   ship. A review at stage `submitted` records the suite result and prints ship. Every other outcome keeps
   today's offer of ship.
2. **A changed `verification.md` refuses a carry only where its run configuration changed.** The **run
   configuration** is the full and focused commands, the `## Whole-repo command`, the `## Prepare command`, the
   `## Test paths` entries, and the `## Complete selector` files, each as `plugin/lib/verification.js` reads it.
   Each carry leg compares it at the two commits that leg judges: the recorded commit and the tip, or, in the
   chained carry, each leg's own endpoints. Equal → the file counts as any other Markdown path. Different, or
   unreadable by git at either commit → the carry refuses as before. A file absent at one commit compares as
   the readers read an absent file, so it carries only where the readers' results match. `## Timing command`
   and every line of prose are outside it.
3. **submit-pr reads ship's inputs from the tip commit.** It decides whether a `## Whole-repo command` applies
   from the scope branch's tip commit, as ship does, and calls `suite reusable` with the flags ship's gate
   passes, `--base` included. Any exit other than 0 counts as a refusal.

## Considered options

- **submit-pr runs the full suite when the tip is not reusable.** Rejected by ADR 0128 for its cost, and
  ADR 0192 keeps the review's exit run the scope's one full-suite run.
- **submit-pr refuses before it opens the pull request.** Rejected: the operator then runs review and
  submit-pr again before ship. Opening the pull request costs nothing, and review at `submitted` already
  leads to ship.
- **The doc pass leaves `verification.md` alone.** Rejected: its prose is documentation the doc pass owns, and
  an operator or another author edits it the same way.
- **Compare the fenced blocks only.** Rejected: a `## Test paths` or `## Complete selector` change would then
  pass unseen and change what the carry trusts.
- **Compare the whole file without its prose.** Rejected: a `## Timing command` edit, which changes no test
  run, would still refuse.

## Consequences

- A scope whose doc pass edited only prose in `verification.md` merges through ship with no second full-suite
  run.
- submit-pr's offer of ship means ship's suite gate accepts the tip or may carry it. A failing carry run is
  still a red result only ship sees.
- A whitespace change inside a command fence counts as a change, so a reflowed command refuses the carry.
