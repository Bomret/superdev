superdev-render-overlay
source: agents/doc-writer.md
body-lines: 81
---
# generated-by: superdev-adapter — a re-render overwrites this file
description: "Documentation reconciler. Brings in-repo docs and the optional knowledge base into agreement with the code, removing stale text. Dispatched by /superdev-document."
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
  write: true
permission:
  read:
    "*": "allow"
    "*.env": "ask"
    "*.env.*": "ask"
    "*.env.example": "allow"
---
@17
  lands the pages one level too deep, in a directory `/superdev/ship` deletes.
@49
**Read `<plugin-root>/references/doc-pass.md` and perform the pass it states.** It owns the whole
@68
- **Read the knowledge base, never write to it.** You write files; `/superdev-publish-kb` alone writes to
