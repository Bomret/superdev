# 0204: A report carries only what the controller acts on

**Status:** Accepted

## Context

A subagent's report enters the controller's context and stays there for the rest of the session. From
2026-10-24 to 2026-10-29, `slice-reviewer` and `implementer` reports had a median of about 4.7k characters
each. The slice reviewer appends its full findings to the slice's progress log and also returns them whole.
The fix implementer reads the findings from that log. The implementer's report adds file lists and
decision narrative beyond its required shape, and its progress log already holds that narrative.

## Decision

1. **The slice reviewer's report is a summary.** It returns its verdict line and one line per finding:
   the severity, the `file:line` (or the slice or range, for a range-level finding), and what is wrong,
   with the marks the controller's fix loop reads. Its full findings, blind pass and after-reading section
   alike, go to the progress log as before. A review whose log entry is missing goes back to the same
   reviewer to append it, because the report alone no longer carries the remedies.
2. **The implementer's report is its required shape.** It returns the status, the commit range, a one-line
   test summary, the fail-to-pass outcome, its concerns, one line per listed Definition-of-Done line with
   its evidence, the cross-slice interfaces it decided, and a fix dispatch's checked-and-changed list. It
   repeats nothing the progress log holds.
3. **The final reviewer's report is unchanged.** It is what the operator reads at the end of a review, and
   its findings live nowhere else.

## Considered options

- **Shorten the final reviewer's report too.** It is the largest report, but its findings have no other
  home, and the operator reads them. Moving them to a log would change how the review's fix loop and its
  final message work.

## Consequences

The controller classifies a slice review as Minor-only or blocking from the summary lines. It reads
the mechanical judgment, the fix list, and every other detail it needs beyond them from the reviewer's
entry in the progress log.
