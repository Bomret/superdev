# 0146: The derive pass reads the changed code for failure-mode classes

**Status:** Accepted

**Amends:** [ADR 0099](0099-plan-derives-criteria-from-the-intent-before-slicing.md), whose derive pass
works from the intent alone.

**Amended by:** [ADR 0158](0158-the-derive-dispatch-runs-in-the-background-and-reads-no-definition-of-done.md),
whose reviewer names the classes without opening the Definition of Done afterwards.

**Context.** ADR 0099's derive pass started on 2026-10-03. The week after was the highest-volume week
for triage records. Of the 52 deferred records that state why no Definition-of-Done criterion covered
them, many name a robustness property the reviewer derived from the code: a bound that cannot degenerate,
a read-back after a write. Many others are single cases of one input class, filed one by one: shell-word
spellings (#1027, #1030, #1070), run-trace path spellings (#978, #988, #1003, #1073). The intent does not
show these. The code does.

**Decision.** `/superdev:plan` hands the derive dispatch the paths of the files the solution shape
changes. The reviewer reads them and returns the failure-mode classes in that code, each grounded in a
cited file, with the same criterion, fold, or non-goal lean as every derived criterion. The controller
settles each class as it settles every gap. A denied dispatch leaves the same pass to the controller.

A criterion stated as a class puts a later instance of it in scope. The fix loop's deferral boundary is a
remedy that adds a capability the Definition of Done never named, so an instance of a named class is a
finding to fix, never a deferred finding.

**Considered options**

- **A separate pre-mortem dispatch.** It keeps derive mode unchanged. It loses because `final-reviewer`
  already owns the derive procedure, and a second dispatch adds a description in permanent context.
- **Name each known case as its own criterion.** It is precise. It loses because the next case of the
  same class is then again outside the Definition of Done, and is deferred.

**Consequences.** Every plan's derive pass reads more files and returns more gaps, and the Definition of
Done grows by class criteria or named non-goals. The review's own derivation still runs, and finds fewer
gaps.
