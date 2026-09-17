superdev-render-overlay
source: skills/status/SKILL.md
body-lines: 44
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-status
description: "Report per-scope DAG progress for every superdev run in this repo, from each scope's ledger. Read-only; makes no changes."
allowed-tools: "Bash"
---
@4
Give a compact, read-only snapshot of every in-flight `/superdev-implement` run in this repo. You never
@12
node "<plugin-root>/scripts/scope.js" status
@18
`<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section — its unresolved-defect
@37
`/superdev-document` wrote but did not send, waiting for `/superdev-publish-kb` (ADR 0023). A shipped
@43
blocked slice, that's `/superdev-implement` or manual intervention, not this command.
