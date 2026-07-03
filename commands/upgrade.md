---
description: Check for a newer superdev release and upgrade the plugin in place — fetches the latest from the marketplace and installs it, with no manual /plugin steps. Restart Claude Code afterward to load it.
---

# superdev upgrade

Upgrade the installed **superdev** plugin to the latest published version, hands-off. You (the model)
run the steps below with the Bash tool; the user just restarts at the end.

## 1. Compare versions

- **Installed:** read `version` from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.
- **Latest:** fetch the version on the marketplace's main branch and read its `version`:
  ```
  curl -fsSL https://codeberg.org/bomret/superdev/raw/branch/main/.claude-plugin/plugin.json
  ```
  (Or `node -e` with `https` if `curl` is unavailable.) If the fetch fails, say so — likely offline —
  and stop.
- Compare as semver. **Installed ≥ latest** → report `superdev is up to date (vX.Y.Z)` and **stop**.

## 2. Upgrade

Only if the latest is newer, run:

```
claude plugin marketplace update superdev
claude plugin update superdev@superdev
```

The first git-pulls the marketplace source so the new version is visible; the second installs it. Report
each command's result. If a command isn't available (e.g. `claude plugin` missing in this environment),
fall back to telling the user to run `/plugin marketplace update superdev` → `/plugin update
superdev@superdev` in an interactive Claude Code CLI.

## 3. Done

Report `superdev upgraded vOLD → vNEW`, then tell the user to **restart Claude Code** to load it — a
plugin update needs a restart, not just `/reload-plugins`.
