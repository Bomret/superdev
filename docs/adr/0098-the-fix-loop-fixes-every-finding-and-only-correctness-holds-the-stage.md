# 0098: The fix loop fixes every finding, and only correctness holds the stage

**Status:** Accepted

**Amended by:** [ADR 0125](0125-missing-red-never-blocks-a-slice-at-the-fix-cap.md).

**Context.** The scope review asked to fix only when it found a Critical or Important finding, a broken
criterion, or a red suite. The full tier's per-slice review fixed only Critical and Important findings. A
Minor finding had no defined path: a Minor-only verdict advanced the stage, and its Minors disappeared or
reached the slice store as triage records through the clean-verdict clause (triage #660). Minors
accumulated across runs, and some became follow-up work of their own.

**Decision.** Both loops fix every listed finding, Minors included. The scope review asks on a Minor-only
verdict too, and offers to fix every finding, to fix Critical and Important findings only, or to fix
nothing. `--unattended` fixes every finding without asking. Each cycle dispatches one fix carrying the
complete list, at the slice level too. The loop repeats until the review lists no finding, capped at 3
cycles, and every cycle counts toward the cap. A fix for a finding that names failing behaviour opens with
a RED test. A fix for a finding that names none, such as style or doc polish, takes no RED test, and the
re-review verifies it.

Only correctness holds the stage. At the cap, a remaining Critical or Important finding blocks as before.
A remainder of only Minor findings advances the stage, or merges the slice, and the review's report is
its only record. An attended operator who declines to fix Minors leaves no record either (INV-0094). A
Minor finding whose remedy adds a capability the Definition of Done never named is still a deferred
finding with a triage record, under ADR 0035: the boundary is the kind of remedy, not the severity.

**Considered options**

- **Minors start the first fix cycle only.** Later re-reviews add Minors only to a cycle a Critical or
  Important finding runs anyway. It bounds cost more tightly. It loses because the Minors a fix cycle
  introduces are the ones most likely to cause follow-up work, and it leaves them standing.
- **Leftover Minors get a ledger line that `/superdev:ship` copies into the pull request.** It keeps a
  trail. It loses because the aim is less recorded follow-up, and it needs a new `scope.js` verb for a
  record nothing reads.
- **A separate Nit band that is never fixed.** It keeps unattended runs from fixing taste findings. It
  loses because both reviewers already sort by actual severity, and an attended operator can choose
  Critical and Important only.
- **A RED test for every fix.** It keeps one rule. It loses because a style Minor then needs a contrived
  test that costs more than it proves.

**Consequences.** A scope reaches `/superdev:document` with its Minors fixed or bounded by the cap. A run
takes more fix cycles, and an unattended run spends them without asking. A scope whose verdict was
Minor-only gets a fix cycle, a re-review, and a full-suite run it did not get before.
