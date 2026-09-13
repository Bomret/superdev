superdev-render-overlay
source: agents/final-reviewer.md
body-lines: 182
---
# generated-by: superdev-adapter — a re-render overwrites this file
description: "Whole-scope reviewer. Reviews the integrated scope branch against the global Definition of Done before the PR. Read-only; dispatched by /superdev-review, in both its ad-hoc and scope modes."
mode: subagent
model: anthropic/claude-opus-4-1
tools:
  "*": false
  bash: true
  grep: true
  invalid: true
  read: true
permission:
  read:
    "*": "allow"
    "*.env": "ask"
    "*.env.*": "ask"
    "*.env.example": "allow"
---
@51
`/superdev-ship` ticks. Yours exists to show what the DoD left out.
@76
Read `<plugin-root>/references/review-checklist.md` and apply its anti-pattern, design-smell,
