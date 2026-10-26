---
name: publish-kb
description: Put a scope's staged knowledge-base pages on the configured backend. The only path from superdev to a remote knowledge base; run it once the feature has reached its readers.
argument-hint: "[<scope>  (empty = the only scope with staged pages)]"
---

# superdev publish-kb

`/superdev:document` writes knowledge-base pages as **staged pages** instead of sending them (ADR 0023,
ADR 0191). This command sends them, by invoking `plugin/scripts/publish-kb.js` (ADR 0069) —
the only path from superdev to a remote knowledge-base backend, and nothing else in the plugin may reach
one. Every mechanical rule for what "publish" means lives in that script: resolving the staging root,
grouping titles, telling absence from a read failure, deciding which staged file to delete, and making the
backend call itself. This command dispatches no subagent, keeps no mechanics of its own, and does nothing
the script cannot already do on its own — it invokes the script, answers the two questions only a human can
answer, and relays what the script reports.

**You decide when.** A published page is a claim that the feature exists, and superdev cannot tell when a
feature reaches a reader — a merge is not a deploy, and a deploy is not a release — so the operator runs
this command at the moment they know it did.

This command takes no `--unattended` flag: deciding that a feature has
reached its readers is the human judgment this command's design rests on, so the two stops in §2 below are
unconditional, never a default an automation caller can skip.

## 1. Invoke the script

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/publish-kb.js" [--scope <slug>]
```

Pass `--scope <value>` when `$ARGUMENTS` names one; call the script with no flags at all otherwise. Never
pass `--allow-unmerged` on this first call — that flag exists only for the re-invocation in §2, after the
script has refused for that reason and the operator has confirmed.

## 2. The two human stops

The script never guesses past either of these — it refuses and states what it found, and asking the
operator is this command's job, not the script's.

- **More than one pending scope, no `--scope` given.** The script exits nonzero, listing every pending
  scope with its page count on stderr. Relay that list and ask which one to publish. Never guess. Once the
  operator answers, re-invoke `node "${CLAUDE_PLUGIN_ROOT}/scripts/publish-kb.js" --scope <the chosen
  slug>`.
- **The scope branch is not contained in base, or a surviving run root names no branch that resolves.**
  A scope whose branch and run root are both reaped publishes silently instead (ADR 0071). The script's refusal
  names what it found and ends with `— nothing published (pass --allow-unmerged to publish anyway)`. Ask
  once, naming exactly what it found. **Declined** → publish nothing, delete nothing, and report that.
  **Confirmed** → re-invoke the same command with `--allow-unmerged` added.

Neither `--scope` nor `--allow-unmerged` is ever passed before the script has refused for that reason and
the operator has answered. Passing either pre-emptively is guessing on the operator's behalf — exactly the
failure these two stops exist to prevent.

## 3. Every other refusal

The script refuses these without asking anything back. Relay its stderr reason and stop.

- No knowledge-base configuration, or a `local`/`none` backend — nothing to publish.
- `docs/agents/knowledge-base.md` carries no `## Commands` section — relay the refusal and its
  `/superdev:setup` pointer.
- An unresolvable `--scope`, an unresolvable staging root, or any other reason the script names.

## 4. Report

On success the script prints its report on stdout: the scope, the backend it reached, every page
published, every page removed, and every page left staged with its reason, plus an `unmerged:` line when
§2's second stop was confirmed. Relay that report as the result.

A page left staged for carrying no recorded `live-hash` and no `created-by-publish` marker, or a
recorded hash that no longer matches the live page (ADR 0094, INV-0091), needs no action here beyond
relaying the reason: re-running `/superdev:document` re-reads the live page and re-stages it with a
fresh hash, so the next publish either checks out clean or reports a genuine, still-current mismatch.
A page carrying the marker, and no recorded `live-hash`, is not refused: it is this same script's own
retry of a create that landed after a prior run was killed, and it publishes as an update. A recorded
`live-hash` is checked regardless of the marker.

On a knowledge base whose configuration declares `- **Hierarchy:** links`, the script also links each
published page into its parent's live body (ADR 0168). `parent-section` names an ATX heading of the
parent, a line opened by `#`; a setext heading is not read. `sub_url` is an optional key a `find` template
may emit (the backend command contract, ADR 0069). A `{sub_url}` in the `parent-link` target is replaced
with the `sub_url` the backend's `find` returns for the landed page, once the live parent is found to lack
the link; a parent that already links the page needs no fill. A backend whose `find` emits no `sub_url`
gets the not-linked refusal for a placeholder. A `find` that returns no
`sub_url`, or one holding a character outside the URL-safe set (letters, digits, and `-._~!$&'*+,;=%/:@?#`),
leaves the page not linked. A
`parent-link` with no placeholder is written as staged. A page it could not link is reported as
`not linked: <title> — <reason> — fix: <fix>`, and its staged file stays. Relay the line, reason and fix
included. Once the fix is made, the next publish retries the link. An upsert that landed but was not linked
has its `live-hash` set to the body the script sent, so the retry checks the live page before it writes.
A staged `delete` that names a parent also removes the page's own list-item link from the staged
`parent-section` of that parent. A parent that is gone, or whose body is empty or only whitespace, holds no link, so the delete clears. A delete
that names a parent but no `parent-section` is refused before any backend call. A delete whose
parent could not be edited, or whose section the parent lacks or repeats, is reported as
`not unlinked: <title> — <reason> — fix: <fix>`, and its staged file stays. A link to the page on any other
line, or on a list item that carries a nested item, a continuation line, a lazy continuation line, or fenced code, stays in the parent and is reported as `link kept in parent "<parent>": <line>`. Relay those lines too.

Nothing was staged, or the operator declined at §2 → say that in one line. Report no success that did not
happen.
