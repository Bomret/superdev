---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-upgrade
description: "Pull the latest superdev source and re-render this project's Codex surfaces in place."
---

# superdev upgrade (Codex)

Upgrade this project's rendered superdev surfaces to the latest published source, hands-off.
You (the model) run the two commands below with the shell tool, checking each one's exit
status before moving on. If either command fails, stop and tell the user the upgrade is
**stale/incomplete** instead of continuing to the next step or reporting success.

## 1. Pull the latest source

```
git -C "<plugin-root>/.." pull
```

## 2. Re-render

```
node "<plugin-root>/scripts/adapter.js" --dest "$(pwd)" --harness codex --model-map "haiku=anthropic/claude-haiku-4-5" --model-map "opus=anthropic/claude-opus-4-1" --model-map "sonnet=anthropic/claude-sonnet-4-5"
```

Re-rendering rewrites every skill directory this adapter generates under `.agents/skills/` to
match the pulled source. The command above already carries this project's resolved model-map, so
it re-renders non-interactively with no prompts.

## 3. Done

Once both commands have succeeded, report both commands' output, then tell the user to
**start a new Codex session** in this project, so it loads the freshly rendered skills.
