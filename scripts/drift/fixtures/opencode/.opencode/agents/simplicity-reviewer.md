superdev-render-overlay
source: agents/simplicity-reviewer.md
body-lines: 75
---
# generated-by: superdev-adapter — a re-render overwrites this file
description: "Over-engineering reviewer. Reviews the diff it is handed for unnecessary complexity only. Read-only; dispatched by /superdev-implement and /superdev-review."
mode: subagent
model: anthropic/claude-haiku-4-5
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
