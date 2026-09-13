superdev-render-overlay
source: agents/slice-reviewer.md
body-lines: 94
---
# generated-by: superdev-adapter — a re-render overwrites this file
description: "Per-slice correctness reviewer. Verifies one slice against its specification and independently re-runs the suite. Read-only; dispatched by /superdev-implement."
mode: subagent
model: anthropic/claude-sonnet-4-5
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
@44
Read `<plugin-root>/references/review-checklist.md` and apply its **anti-pattern** and **vulnerability-class**
@59
  that it's green. Read `<plugin-root>/references/test-selection.md` and run the command it
