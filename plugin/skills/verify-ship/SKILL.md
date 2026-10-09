---
name: verify-ship
description: Start only when the operator asked for it or agreed to `/superdev:ship`'s offer: verify a shipped superdev scope's open Definition-of-Done criteria by observing the deployed system, ticking each one that holds with its evidence. Run it after `/superdev:ship` merged and deployed. It is safe to run again.
argument-hint: "[<scope>  (empty = the only shipped run in this repo)]"
---

# superdev verify-ship

Settle the Definition-of-Done criteria a scope left open at the merge, by observing what `/superdev:ship`
deployed (ADR 0106). It dispatches no subagents, carries no unattended mode of its own (INV-0066,
INV-0093), and never moves the stage. A model starts it only when the operator typed the command, asked for
it, or agreed to the offer `/superdev:ship` makes (ADR 0132). Every gate and every ask below holds on every
start. Verifying a line observes; it changes no system outside the
repository (ADR 0084, INV-0006). It never runs a deploy target's command (INV-0098).

Every message this command ends on closes with the Next block, per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` section (INV-0111).

## 1. Scope + run root

**`--from-ship`, if present, comes out first** — never part of the scope slug. `/superdev:ship`'s offer passes
it when it starts this skill, and the operator never types it. It changes one thing, in §6.

Resolve `$ARGUMENTS` to one scope — a **run root**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
`## A live scope run` section:

- **A scope slug given** → use it. No run root by that name → adopt it per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Adopting a shipped original`. Nothing adopted →
  say so and stop.
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
`<run-root>/dod.md`. At `shipped` those are the `ceiling:` lines and the `not met:` lines, this
command's own earlier ones and any written before merge. A ticked line or an `accepted:` line is neither observed nor rewritten in `dod.md`. No such
line → skip to §6.

**Every `not met:` note this command writes ends with the repair citation** that
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Routing a shipped run` defines. Read this scope's
repairs once, through that section's step 4, before the first observation.

Observe each line yourself, inline, one at a time. Reach a target through `docs/agents/deployment.md`'s
`Read-only reach` column at the merge commit, or through an equivalent read: an HTTP GET, a DNS lookup,
an ssh read, a status command. A command that changes a system, and a deploy target's command, are
outside this command.

- **Observed true** → the verdict is `met: <evidence>`.
- **Observed false** → the verdict is `not met: <the observation>`, ending in the repair citation.
- **Cannot observe** → ask the operator, naming the line and why it cannot be observed:
  - *verified* → `met:`, the operator's answer as the evidence.
  - *false* → `not met:`, the answer as the note, ending in the repair citation.
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

- **Every line settled** (ticked or `accepted:`) → say in one line that all criteria are settled and the scope is ready to close, then print `/superdev:wrap-up <scope>` as the next command. When §4 reported an unpaired line, wrap-up refuses until the anchor's criterion text is in sync: say "hand-sync, then `/superdev:wrap-up <scope>`" and print the command only after that. **Under `--from-ship`, with no unpaired line**, print no Next block: `/superdev:ship` routes again, starts wrap-up when that route is wrap-up with no hand-sync pending, and prints the block itself when it starts no wrap-up, so only the last message of its chain carries the block.
- **The run routes to re-verify** per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
  `## Routing a shipped run` → name each open line. Print `/superdev:verify-ship <scope>` as the next
  command, with one line: a repair of this scope has closed since the line was last observed. Print
  `/superdev:plan` on an `Or:` line, for a repair that did not hold.
- **The run routes to repair** per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Routing a shipped run`
  → name each observed `not met:` line with its observation. Print `/superdev:plan` as the next command,
  with one line: its repair choice plans a `fix` feature for this scope (ADR 0124). For each open anchor
  among the repairs §4 read whose `**Repairs:**` line names this scope's anchor, print the Repair route's
  open-repair line too. Print `/superdev:verify-ship <scope>` on an `Or:` line, for an observation that
  was transient.
- **Otherwise** → name each open line, an unobserved `not met:` line among them, and say running
  `/superdev:verify-ship <scope>` again is safe.

On every exit, name the scope's staged pages per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
`## Staged pages at close` (ADR 0119, INV-0123), with `/superdev:publish-kb <scope>` on an `Or:` line of
the Next block when the count is above zero.

**This command starts no wrap-up itself.** A verify-ship the operator types ends by printing the next command
and starts nothing, because verification can take several passes and the close is permanent (ADR 0106,
ADR 0132). Only `/superdev:ship`'s offer starts wrap-up after it.
