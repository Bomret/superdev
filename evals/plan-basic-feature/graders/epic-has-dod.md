---
type: regex
target: files
flags: ims
match: contains
weight: 1
pattern: '^\+\+\+ b/docs/plans/[^\n]*/00-epic-[^\n]*\n(?:(?!^diff --git).)*?^\+.*Definition of Done'
---
Deterministic, free grader. Fails unless the diff adds an epic file
(`docs/plans/<slug>/00-epic-*.md`, per `references/issue-tracker-local.md`)
whose added lines mention a Definition of Done — the plan's global,
feature-wide acceptance bar (see `references/plan-contract.md`).
