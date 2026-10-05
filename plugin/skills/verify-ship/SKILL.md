---
name: verify-ship
description: Verify a shipped superdev scope's open Definition-of-Done criteria by observing the deployed system, ticking each one that holds with its evidence. Only a human runs it, after `/superdev:ship` merged and deployed, and it is safe to run again.
disable-model-invocation: true
argument-hint: "[<scope>  (empty = the only shipped run in this repo)]"
---

# superdev verify-ship

Settle the Definition-of-Done criteria a scope left open at the merge, by observing what `/superdev:ship`
deployed (ADR 0106). It dispatches no subagents, carries no unattended mode of its own (INV-0066,
INV-0093), and never moves the stage. Verifying a line observes; it changes no system outside the
repository (ADR 0084, INV-0006). It never runs a deploy target's command (INV-0098).

Every message this command ends on closes with the Next block, per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` section (INV-0111).

## 1. Scope + run root

Resolve `$ARGUMENTS` to one scope — a **run root**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
`## A live scope run` section:

- **A scope slug given** → use it. No run root by that name → say so and stop.
- **Empty** → this command's own **candidate set** (CONTEXT.md) is every run root whose stage is
  `shipped`. Run `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Resolving an empty argument`
  cascade over that set, restating no part of it here.

Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md` for how to capture `<run-root>` and how the run lock
behaves. Refresh `<run-root>/run.lock` now, per that file's rule.

## 2. Gate

Read the stage with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get stage --root <run-root>`:

- **`closed`** → say the scope is already closed, and change nothing.
- **Below `shipped`** (`planned`, `implementing`, `merged`, `reviewed`, `documented`,
  `documented-unreviewed`, `submitted`, or no line at all) → refuse: name the command that comes first
  (`/superdev:submit-pr` for a scope short of `submitted`, `/superdev:ship` for `submitted`), and
  observe nothing.
- **`shipped`** → continue.

## 3. Deploy check, before anything is observed

**A ledger with no `**PR:**` header** (`scope.js get pr` prints `absent`) → a legacy run, shipped before the deploy posture
existed (ADR 0101), with no merge commit to read: it reads as posture `none`, so ask nothing and go to §4.
Otherwise read the posture, the anchor's `**Deploy:**` line, and the deploy record per
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Reading the posture at the merge commit`.

- **`none`, a `**Deploy:** none` line, or no `**Deploy:**` line** → ask nothing, go to §4.
- **`auto`, and a listed target not recorded `deployed`** → refuse: name each such target, print
  `/superdev:ship <scope>`, and observe nothing.
- **`manual`, and a listed target recorded `pending` or carrying no record** → ask the operator once per
  such target whether it deployed. Yes → `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" deploy set <target>
  deployed --root <run-root>`. **Any no** → refuse: name the undeployed targets, and observe nothing.
  Records from an earlier yes stand when a later target is answered no, so a rerun does not ask about them
  again.
- **Every listed target `deployed`** → go to §4.

## 4. Observe

**Reconcile first.** Read the anchor's Definition-of-Done lines, per `docs/agents/issue-tracker.md`, and
pair them with `dod.md`'s per `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s `## Pairing dod.md with the
anchor`. For every paired line whose verdict on the anchor differs from `dod.md`, rewrite the anchor line
from `dod.md` through the store's `## Definition of Done ticks` section (`scope.js dod-line`), before
observing anything. A failed anchor write is reported once. A `dod.md` line unpaired on the anchor is
reported by name as needing a hand-sync of the anchor's criterion text, and this reconcile does not retry it.

Then take every Definition-of-Done line that is neither ticked nor `accepted:`, read from
`<run-root>/dod.md`. At `shipped` those are the `ceiling:` lines and this command's own
earlier `not met:` lines. A ticked line or an `accepted:` line is neither observed nor rewritten in `dod.md`. No such
line → skip to §6.

Observe each line yourself, inline, one at a time. Reach a target through `docs/agents/deployment.md`'s
`Read-only reach` column at the merge commit, or through an equivalent read: an HTTP GET, a DNS lookup,
an ssh read, a status command. A command that changes a system, and a deploy target's command, are
outside this command.

- **Observed true** → the verdict is `met: <evidence>`.
- **Observed false** → the verdict is `not met: <the observation>`.
- **Cannot observe** → ask the operator, naming the line and why it cannot be observed:
  - *verified* → `met:`, the operator's answer as the evidence.
  - *false* → `not met:`, the answer as the note.
  - *accept as unverifiable* → `accepted: <reason>`, the reason from the operator (ADR 0095).
  - *later* → the line stays as it stood, and nothing is written for it.

## 5. Write each verdict

For each verdict, at once and before the next line, write it into `<run-root>/dod.md` and onto the scope
anchor, per `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s *Verify-ship's case* and the store's
`## Definition of Done ticks` section, through `scope.js dod-line`. A failed anchor write is reported once,
and the `dod.md` verdict stands.

## 6. End

Publish the snapshot when a deploy record changed, per
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section. Print a summary: the
lines settled with their verdicts, and the lines still open. The stage stays `shipped`.

- **Every line settled** (ticked or `accepted:`) → say in one line that all criteria are settled and the scope is ready to close, then print `/superdev:wrap-up <scope>` as the next command. When §4 reported an unpaired line, wrap-up refuses until the anchor's criterion text is in sync: say "hand-sync, then `/superdev:wrap-up <scope>`" and print the command only after that.
- **Otherwise** → name each open line, and say running `/superdev:verify-ship <scope>` again is safe.

On both exits, name the scope's staged pages per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
`## Staged pages at close` (ADR 0119, INV-0123), with `/superdev:publish-kb <scope>` on an `Or:` line of
the Next block when the count is above zero.
