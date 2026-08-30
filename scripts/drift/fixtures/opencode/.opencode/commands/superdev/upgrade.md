---
description: "Check for a newer superdev release and upgrade the plugin in place from the marketplace. Restart Claude Code afterward to load it."
model: anthropic/claude-haiku-4-5
allowed-tools: "Bash(claude plugin marketplace update:*), Bash(claude plugin update:*)"
---

# superdev upgrade

Upgrade the installed **superdev** plugin to the latest published version, hands-off. You (the model)
run the two commands below with the Bash tool; the user just restarts at the end.

## 1. Upgrade

Run both — `claude plugin update` is idempotent (no-op if already current), so no version compare is
needed:

```
claude plugin marketplace update superdev
claude plugin update superdev@superdev
```

The first git-pulls the marketplace source so the latest version is visible; the second installs it.
Report each command's output verbatim — it states whether an update happened or the plugin was already
current. If `claude plugin` isn't available in this environment, fall back to telling the user to run
`/plugin marketplace update superdev` → `/plugin update superdev@superdev` in an interactive Claude Code
CLI.

## 2. Done

Report the result from the command output, then tell the user to **restart Claude Code** to load it — a
plugin update needs a restart, not just `/reload-plugins`.
