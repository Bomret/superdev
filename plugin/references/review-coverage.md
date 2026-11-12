# Review coverage — the scope review's check of per-slice reviews

## Review coverage

**`final-reviewer` reads this section** on a scope dispatch, because the entry below is judged against the
run trace (`scope.js trace`), which hooks wrote, and no diff shows it. `review-checklist.md`'s `## Binding rules` bind every lens below.

- **Unreviewed slice** — `final-reviewer`'s, on a `full` scope only: a merged `behavior` slice with no
  `dispatch` line of agent type `slice-reviewer` whose `completed` `dispatch-end` comes after the slice's last `completed`
  `dispatch-end` of `implementer`, and no `**Degraded:**` ledger entry naming that slice's denied review. A
  `dispatch-end` line ends with its outcome: `completed`, `failed`, `denied`, `stopped`, `unknown`, or `session-end`.
  A line with no outcome reads `completed`, and only a `completed` end finishes a dispatch, so a slice review that
  ended any other way reviewed nothing. Severity Important. No trace gets no finding: the report names the gap.
  A merged `mechanical` or `docs` slice gets no finding, because the full tier reviews it at the scope review alone
  (`implement-full.md`). A slice whose ledger type cannot be read gets no finding either: the report names the gap.
