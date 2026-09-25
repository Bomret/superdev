superdev-render-overlay
source: skills/publish-kb/SKILL.md
body-lines: 75
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-publish-kb
description: "Put a scope's staged knowledge-base pages on the configured backend. The only path from superdev to a remote knowledge base; run it once the feature has reached its readers."
---
@4
`/superdev-plan` and `/superdev-document` write knowledge-base pages as **staged pages** instead of
@17
This command takes no `--unattended` flag, and `/superdev/afk` never drives it: deciding that a feature has
@24
node "<plugin-root>/scripts/publish-kb.js" [--scope <slug>]
@27
Pass `--scope <value>` when the message that invoked this skill names one; call the script with no flags at all otherwise. Never
@38
  operator answers, re-invoke `node "<plugin-root>/scripts/publish-kb.js" --scope <the chosen
@56
  `/superdev-setup` pointer.
@67
relaying the reason: re-running `/superdev-document` re-reads the live page and re-stages it with a
