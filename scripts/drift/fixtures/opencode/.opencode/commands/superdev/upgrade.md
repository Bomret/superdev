---
description: "Pull the latest superdev source and re-render this project's OpenCode surfaces (commands, agents, hook bridge) in place."
model: anthropic/claude-haiku-4-5
---

# superdev upgrade (OpenCode)

Upgrade this project's rendered superdev surfaces to the latest published source, hands-off.
You (the model) run the two commands below with the Bash tool, checking each one's exit
status before moving on. If either command fails, stop and tell the user the upgrade is
**stale/incomplete** instead of continuing to the next step or reporting success.

## 1. Pull the latest source

```
git -C "<plugin-root>/.." pull
```

## 2. Re-render

```
node "<plugin-root>/scripts/adapter.js" --dest "$(pwd)" --harness opencode --model-map "haiku=anthropic/claude-haiku-4-5" --model-map "opus=anthropic/claude-opus-4-1" --model-map "sonnet=anthropic/claude-sonnet-4-5"
```

Re-rendering rewrites every file this adapter generates — every command under
`.opencode/commands/superdev/`, every agent it wrote under `.opencode/agents/`, and
`.opencode/plugins/superdev.js` — to match the pulled source. The command above already
carries this project's resolved model-map, so it re-renders non-interactively with no prompts.

## 3. Done

Once both commands have succeeded, report both commands' output, then tell the user to
**start a new OpenCode session** in this project — OpenCode loads commands, agents, and
plugins at startup, with no documented hot-reload, so a running session keeps the old ones
until it restarts.
