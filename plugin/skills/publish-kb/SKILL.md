---
name: publish-kb
description: Put a scope's staged knowledge-base pages on the configured backend. The only path from superdev to a remote knowledge base; run it once the feature has reached its readers.
argument-hint: "[<scope>  (empty = the only scope with staged pages)]"
---

# superdev publish-kb

`/superdev:plan` and `/superdev:document` write knowledge-base pages as **staged pages** instead of
sending them (ADR 0023). This command sends them, by invoking `plugin/scripts/publish-kb.js` (ADR 0069) —
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

Nothing was staged, or the operator declined at §2 → say that in one line. Report no success that did not
happen.
