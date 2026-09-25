superdev-render-overlay
source: agents/implementer.md
body-lines: 219
---
# generated-by: superdev-adapter — a re-render overwrites this file
description: "Slice implementer. Builds ONE vertical slice test-first, the laziest version that works. Dispatched by /superdev-implement — not for direct use."
mode: subagent
model: anthropic/claude-sonnet-4-5
tools:
  "*": false
  bash: true
  edit: true
  glob: true
  grep: true
  invalid: true
  read: true
  webfetch: true
  write: true
permission:
  read:
    "*": "allow"
    "*.env": "ask"
    "*.env.*": "ask"
    "*.env.example": "allow"
---
@32
never invent one, because `/superdev-document` proposes the term and the maintainer confirms it. A
@37
change type is `fix`, or a reviewer finding — read `<plugin-root>/references/diagnosis.md` and run its loop before the RED
@50
- **Read `<plugin-root>/references/test-selection.md` and run the command it selects for each RED
@100
Read `<plugin-root>/references/doc-verification.md` and apply it. Before writing code that
@180
end of the scope by `/superdev-document` (the `doc-writer`), not per slice, to avoid churn when a later
