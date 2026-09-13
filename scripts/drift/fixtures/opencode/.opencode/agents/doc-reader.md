superdev-render-overlay
source: agents/doc-reader.md
body-lines: 123
---
# generated-by: superdev-adapter — a re-render overwrites this file
description: "Fresh-eyes doc verifier. Reads just-reconciled docs cold and checks every claim against the repo, flagging ungrounded, stale, or ambiguous text. Read-only; dispatched by /superdev-document."
mode: subagent
model: anthropic/claude-sonnet-4-5
tools:
  "*": false
  bash: true
  grep: true
  invalid: true
  read: true
  webfetch: true
permission:
  read:
    "*": "allow"
    "*.env": "ask"
    "*.env.*": "ask"
    "*.env.example": "allow"
---
@17
Read `<plugin-root>/references/content-types.md` first — it names the four kinds of information a
@46
  that matters, Read `<plugin-root>/references/doc-verification.md` and apply its discipline:
@57
`controlled` points at `<plugin-root>/references/controlled-prose.md`; any other value is a
