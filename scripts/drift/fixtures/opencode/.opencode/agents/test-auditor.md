superdev-render-overlay
source: agents/test-auditor.md
body-lines: 77
---
# generated-by: superdev-adapter — a re-render overwrites this file
description: "Test-cost auditor. Prices a whole test tree against a duration table and reports what it costs more than it proves. Read-only; dispatched by a test audit."
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
@24
read-only inspection commands. You apply nothing: the audit reports, and `/superdev-plan` is where a
@37
Read `<plugin-root>/references/review-checklist.md` and apply its **test-cost** lenses —
