# 0197: The run trace records no review verdict

**Status:** Accepted

**Supersedes:** [ADR 0136](0136-the-run-trace-records-each-slice-review-verdict.md).

**Amends:** [ADR 0140](0140-the-run-files-record-each-step-start-and-each-dispatch-end.md).

**Context.** ADR 0136 and ADR 0140 make the run-trace hook write a `verdict` line per completed
`slice-reviewer` dispatch and a `final-verdict` line per `final-reviewer` run. They read the report from the
`SubagentHandback` tool, the foreground hand-back, or `SubagentStop`. No superdev decision reads either line:
the fix loops act on the reviewer's report, and the progress log keeps the verdict. Their only reader is
superdev-view's verdict suffix on a reviewer's row. The lines cost `plugin/lib/verdicts.js`, its suite, two
invariants, and a hand-back read that tracks a platform behaviour (`docs/known-issues.md`).

**Decision.** The run-trace hook writes no `verdict` and no `final-verdict` line. Every `dispatch`,
`dispatch-bind`, `dispatch-resume`, and `dispatch-end` line keeps its write. A reader of the trace tolerates
the two kinds in a trace an older release wrote. superdev-view draws no review verdict. A trace line kind is
written only while a superdev decision or a reviewer rule reads it, and a kind only a view reads is not one.

**Considered options**

- **Keep the lines for the view.** It keeps the pane's verdict at a glance. It loses because the operator
  traded that suffix for a leaner trace, and the verdict stays in the report and the progress log.
- **Replace the trace's dispatch lines with session transcripts.** It loses because `dispatch.js` needs the
  `dispatch` and `dispatch-bind` lines at hook time to attribute an agent's edits and runs to its slice, and
  no transcript reaches a hook.

**Consequences.** superdev-view shows that a review ran and how it ended, but not what it decided.
