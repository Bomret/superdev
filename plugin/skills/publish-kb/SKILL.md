---
name: publish-kb
description: Put a scope's staged knowledge-base pages on the configured backend. The only path from superdev to a remote knowledge base; run it once the feature has reached its readers.
argument-hint: "[<scope>  (empty = the only scope with staged pages)]"
---

# superdev publish-kb

## Role and terms

Applies to every start. You send a scope's **staged pages**, the knowledge-base pages `/superdev:document` writes instead of sending them, through the script, the only path from superdev to a remote knowledge-base backend and the owner of every mechanical rule of a publish. You dispatch no subagent: you invoke the script, answer the two questions only a human can answer, and relay what it reports.

- **The script**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/publish-kb.js"`.
- **A human stop**: one of the two refusals in §2, the only ones you answer by asking the operator.
- **`parent-section`**: an ATX heading of the parent, a line opened by `#`; a setext heading is not read.
- **`sub_url`**: an optional key a `find` template may emit (the backend command contract).

## No unattended run

Applies to every start. This command takes no `--unattended` flag. The two human stops in §2 are unconditional, never a default an automation caller can skip.

## 1. Invoke the script

Applies to every start. Run the script with `--scope <value>` when `$ARGUMENTS` names one, and with no flags at all otherwise.

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/publish-kb.js" [--scope <slug>]
```

## 2. The two human stops

**Flags follow a refusal.** Applies to every invocation of the script. Add a `--scope` that `$ARGUMENTS` did not name, or `--allow-unmerged`, only after the script has refused for that flag's reason and the operator has answered. The first call never carries `--allow-unmerged`.

**More than one pending scope.** Applies when no `--scope` was given and the script exits nonzero listing every pending scope with its page count on stderr. Relay that list and ask which one to publish, without guessing. Once the operator answers, re-invoke the script with `--scope <the chosen slug>`.

**An unmerged scope.** Applies when the scope branch is not contained in base, or a surviving run root names no branch that resolves, and the refusal ends with `— nothing published (pass --allow-unmerged to publish anyway)`. A scope whose branch and run root are both reaped publishes silently instead. Ask once, naming exactly what the script found.

- **Declined** → publish nothing, delete nothing, and report that.
- **Confirmed** → re-invoke the same command with `--allow-unmerged` added.

## 3. Every other refusal

Applies to every refusal outside §2. Relay the script's stderr reason and stop, asking nothing back.

- No knowledge-base configuration, or a `local`/`none` backend — nothing to publish.
- `docs/agents/knowledge-base.md` carries no `## Commands` section — relay the refusal and its `/superdev:setup` pointer.
- An unresolvable `--scope`, an unresolvable staging root, or any other reason the script names.

## 4. Report

**The success report.** Applies when the script succeeds. It prints on stdout the scope, the backend it reached, every page published, every page removed, and every page left staged with its reason, plus an `unmerged:` line when §2's unmerged stop was confirmed. Relay that report as the result.

**A page left staged for its hash.** Applies to a page left staged for carrying no recorded `live-hash` and no `created-by-publish` marker, or for a recorded hash that no longer matches the live page. Relay the reason and take no other action: re-running `/superdev:document` re-reads the live page and re-stages it with a fresh hash.

**The create marker.** Applies to a page carrying the `created-by-publish` marker. With no recorded `live-hash`, it is the script's retry of a create a killed run landed, and publishes as an update. A recorded `live-hash` is checked regardless of the marker.

**Parent links.** Applies to a knowledge base whose configuration declares `- **Hierarchy:** links`. The script links each published page into its parent's live body and unlinks a staged `delete` from its parent, per the cases below. A `not linked` or `not unlinked` page keeps its staged file, and the next publish after the fix retries it; relay every `not linked:` and `not unlinked:` line with its reason and fix, and every `link kept in parent` line as printed.

| Case | Outcome |
|------|---------|
| `{sub_url}` in the `parent-link` target, live parent lacks the link | replaced with the `sub_url` the backend's `find` returns for the landed page |
| `{sub_url}` placeholder, parent already links the page | no fill needed |
| `{sub_url}` placeholder, `find` emits no `sub_url`, or one with a character outside letters, digits, and `-._~!$&'*+,;=%/:@?#` | not linked |
| `parent-link` with no placeholder | written as staged |
| a page that could not be linked | `not linked: <title> — <reason> — fix: <fix>` |
| an upsert that landed but was not linked | its `live-hash` is set to the body the script sent, so the retry checks the live page before it writes |
| a staged `delete` naming a parent | removes the page's own list-item link from the staged `parent-section` of that parent |
| that parent gone, or its body empty or only whitespace | holds no link, so the delete clears |
| a `delete` naming a parent but no `parent-section` | refused before any backend call |
| a `delete` whose parent could not be edited, or whose section the parent lacks or repeats | `not unlinked: <title> — <reason> — fix: <fix>` |
| a link to the page on any other line, or on a list item with a nested item, a continuation line, a lazy continuation line, or fenced code | stays in the parent: `link kept in parent "<parent>": <line>` |

**No publish.** Applies when nothing was staged, or the operator declined at §2. Say that in one line. Report no success that did not happen.
