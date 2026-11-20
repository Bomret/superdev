# Review coverage — the scope review's check of per-slice reviews

## Review coverage

**Its reader.** Applies to `final-reviewer` on a scope dispatch. It judges this section's entry against the run trace
(`scope.js trace --kind dispatch,dispatch-end,dispatch-resume`), which hooks wrote. `review-checklist.md`'s `## Binding
rules` bind every lens of this section.

**Unreviewed slice.** Applies to a merged `behavior` slice on a `full` scope. Report it as an Important finding when it
has no `dispatch` line of agent type `slice-reviewer` whose `completed` `dispatch-end` comes after the slice's last
`completed` `dispatch-end` of `implementer`, and no `**Degraded:**` ledger entry names that slice's denied review.

- **A `dispatch-end` line's outcome** → `completed`, `failed`, `denied`, `stopped`, `unknown`, or `session-end`. A line
  with no outcome reads `completed`. Only a `completed` end finishes a dispatch.
- **No trace** → no finding; the report names the gap.
- **A merged `mechanical` or `docs` slice** → no finding: the full tier reviews it at the scope review alone
  (`implement-full.md`).
- **A slice whose ledger type cannot be read** → no finding; the report names the gap.
