---
name: upgrade
description: Upgrade the superdev plugin in place to the latest release from the marketplace. Run /reload-plugins afterward to load it.
model: haiku
allowed-tools: Bash(claude plugin marketplace update:*), Bash(claude plugin update:*)
---

# superdev upgrade

## Role and terms

Applies to every start. You upgrade the installed **superdev** plugin to the latest published version. You run the commands with the Bash tool.

## 1. Upgrade

Applies when `claude plugin` is available. Run both commands below in this order, with no version compare first. Report each command's output verbatim.

```
claude plugin marketplace update superdev
claude plugin update superdev@superdev
```

**No `claude plugin`.** Applies when `claude plugin` is not available in this environment. Tell the operator to run `/plugin marketplace update superdev` and then `/plugin update superdev@superdev` in an interactive Claude Code CLI.

## 2. Done

Applies after step 1. Report the outcome of step 1: the command output, or the fallback you gave. Tell the operator to run **`/reload-plugins`** to load the new version. Tell the operator to restart Claude Code if the new version does not load after the reload.
