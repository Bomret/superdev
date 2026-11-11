---
name: verify-ship
description: Start only when the operator typed it, asked for it, or agreed to an offer: verify a shipped superdev scope's open Definition-of-Done criteria by observing the deployed system, ticking each one that holds with its evidence, and start `/superdev:wrap-up` when every line settles. Run it after `/superdev:ship` merged and deployed. It is safe to run again.
argument-hint: "[<scope>  (empty = the only shipped run in this repo)]"
---

# superdev verify-ship

## Role and terms

Applies to every start. You settle the open Definition-of-Done criteria of a shipped scope (ADR 0106). You dispatch no subagent. You never move the stage.

- **Open line**: a line of `<run-root>/dod.md` that is neither ticked nor `accepted:`. At `shipped` it is a `ceiling:` line or a `not met:` line, written by this command or before the merge.
- **Settled line**: a ticked line or an `accepted:` line.
- **Repair citation**: the ending of a `not met:` note, as `${CLAUDE_PLUGIN_ROOT}/references/shipped-run.md`'s `## Routing a shipped run` defines it.
- **Equivalent read**: an HTTP GET, a DNS lookup, an ssh read, or a status command.

## Start conditions

Applies to every start. Start this command only on one of the starts below (ADR 0157). The command carries no unattended mode of its own (INV-0066, INV-0093, ADR 0214). Every gate and every ask below holds on every start.

- The operator typed the command.
- The operator asked for it.
- The operator agreed to an offer.
- Another session's brief asked for it.

## No extra question

Applies to every start. Ask no extra question.

## Observe only

Applies to every observation. Observe within the observe-only bound of `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s *Verify-ship's case* (ADR 0084, INV-0006). Run no deploy target's command (INV-0098).

## The closing message

Applies to every message this command ends on, the wrap-up start in §6 excepted. Close it with the Next block per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` section (INV-0111). An attended run first makes the offer in that file's `## The offer` section at every exit, a refusal included (ADR 0157).

## 1. Scope + run root

Resolve `$ARGUMENTS` to one scope, a **run root**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## A live scope run` section:

- **A scope slug given** → use it. No run root by that name → adopt it per `${CLAUDE_PLUGIN_ROOT}/references/shipped-run.md`'s `## Adopting a shipped original`. Nothing adopted → say so and stop.
- **Empty** → this command's **candidate set** (CONTEXT.md) is every run root whose stage is `shipped`. Run `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Resolving an empty argument` cascade over that set.

Capture `<run-root>` per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## A live scope run`. Refresh `<run-root>/run.lock` per that file's `## The run lock`.

## 2. Gate

Read the stage with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get stage --root <run-root>`:

- **`closed`** → say the scope is already closed and change nothing.
- **Below `shipped`** (`planned`, `implementing`, `merged`, `reviewed`, `documented`, `documented-unreviewed`, `submitted`, or no line at all) → refuse and observe nothing. Name the command that comes first: `/superdev:submit-pr` for a scope short of `submitted`, `/superdev:ship` for `submitted`.
- **`shipped`** → run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step set verify-ship --root <run-root>` before any other ledger or store write, then continue.

**The step's exits.** Applies after `step set`. Every exit ends in one call from the list below. A blocked stop and a refusal each run `step block` first.

- `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step clear --root <run-root>`
- a stage write
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step block --root <run-root>`

## 3. Deploy check

**A legacy run.** Applies to a ledger with no `**PR:**` header (`scope.js get pr` prints `absent`), before any posture read. It reads as posture `none` (ADR 0101). Ask nothing and go to §4.

**The deploy read.** Applies to a ledger that carries a `**PR:**` header, before its first observation. Read the posture, the anchor's `**Deploy:**` line, and the deploy record per `${CLAUDE_PLUGIN_ROOT}/references/shipped-run.md`'s `## Reading the posture at the merge commit`.

- **`none`, a `**Deploy:** none` line, or no `**Deploy:**` line** → ask nothing and go to §4.
- **`auto`, and a listed target not recorded `deployed`** → refuse and observe nothing. Name each such target and print `/superdev:ship <scope>`.
- **`manual`, and a listed target recorded `pending` or carrying no record** → ask the operator once per such target whether it deployed. Yes → `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" deploy set <target> deployed --root <run-root>`. Any no → refuse, name the undeployed targets, and observe nothing. The Next block puts `First: deploy <targets>` before the fence, and prints `/superdev:verify-ship <scope>` in it. A recorded yes stands when a later target is answered no.
- **Every listed target `deployed`** → go to §4.

## 4. Observe

**The anchor sync.** Applies to every run that reaches §4. Read the anchor's Definition-of-Done lines per `docs/agents/issue-tracker.md`. Run the anchor sync of `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s `## Pairing dod.md with the anchor` before any observation.

- **A failed anchor write** → report it once.
- **An anchor whose Definition-of-Done lines could not be read** → report it once. §6 then prints `/superdev:wrap-up <scope>` and starts no wrap-up.
- **A `dod.md` line unpaired on the anchor** → report it by name as needing a hand-sync of the anchor's criterion text.

**The open lines.** Applies after the anchor sync. Read `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s *Verify-ship's case*. Take the open lines from `<run-root>/dod.md` as that case states. With no open line go to §6 before the repairs read.

**The repairs read.** Applies when an open line exists. Read this scope's repairs once before the first observation. Read them through `${CLAUDE_PLUGIN_ROOT}/references/shipped-run.md`'s `## Routing a shipped run`, step 4.

**The observation.** Applies to each open line. Observe it yourself and inline. Observe one line at a time. Reach a target through `docs/agents/deployment.md`'s `Read-only reach` column at the merge commit or through an equivalent read.

- `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s *Verify-ship's case* maps an observation, true or false, and each operator answer to its note.
- **Cannot observe** → ask the operator, naming the line and why it cannot be observed. Offer *verified*, *false*, *accept as unverifiable*, and *later* (ADR 0095).

## 5. Write each verdict

Applies to each verdict. Write it at once, before the next line, into `<run-root>/dod.md` and onto the scope anchor. Follow `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s *Verify-ship's case* and `docs/agents/issue-tracker.md`'s `## Definition of Done ticks` section, through `scope.js dod-line`. Report a failed anchor write once.

## 6. End

**The end step.** Applies to every §6 exit. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step clear --root <run-root>` first. It replaces `step block` on every §6 exit. The hand-sync `First:` wait departs from the `step block` rule for a `First:` wait in `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## The ledger`.

**The summary.** Applies after the `step clear`. Publish the snapshot when a deploy record changed, per `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state` section. Print a summary of the lines settled with their verdicts and the lines still open. Leave the stage at `shipped`.

**The exits.** Applies after the summary. End on exactly one exit below.

- **Every line settled** → say in one line that all criteria are settled and the scope is ready to close.
  - With no unpaired line from §4 and the anchor's lines read → the wrap-up start below.
  - With no unpaired line from §4 and the anchor's lines unread → print `/superdev:wrap-up <scope>` as the next command.
  - With an unpaired line → say "hand-sync, then `/superdev:wrap-up <scope>`" and print the command on a `First:` wait.
- **The run routes to re-verify** per `${CLAUDE_PLUGIN_ROOT}/references/shipped-run.md`'s `## Routing a shipped run` → name each open line. Print `/superdev:verify-ship <scope>` as the next command, with one line: a repair of this scope has closed since the line was last observed. Print `/superdev:plan` on an `Or:` line, for a repair that did not hold.
- **The run routes to repair** per `${CLAUDE_PLUGIN_ROOT}/references/shipped-run.md`'s `## Routing a shipped run` → name each observed `not met:` line with its observation. Print `/superdev:plan` as the next command, with one line: its repair choice plans a `fix` feature for this scope (ADR 0124). For each open anchor among the repairs §4 read whose `**Repairs:**` line names this scope's anchor, print that section's open-repair line too. Print `/superdev:verify-ship <scope>` on an `Or:` line, for an observation that was transient.
- **Otherwise** → name each open line, an unobserved `not met:` line among them, and say running `/superdev:verify-ship <scope>` again is safe.

**The wrap-up start.** Applies to the settled exit that reaches it, after the summary and its one line (ADR 0224). Call the Skill tool with `superdev:wrap-up` and the resolved scope slug, in the same turn, and ask no question first. Make no offer on this exit, print no Next block and no staged-pages lines, and print nothing after wrap-up returns. Wrap-up's last message ends the chain: it names the staged pages on every exit, a refusal or a stop included, and makes its own offer.

- **A wrap-up that started and then refused or stopped** → its message stands as the chain's last, unchanged.
- **The Skill tool refuses the start, errors, or finds no such skill** → print `/superdev:wrap-up <scope>` as the next command, with the staged-pages lines and the offer below.

**The offer.** Applies to every exit but the wrap-up start, a refusal included, ahead of the Next block. The conditions of `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The offer` alone decide it. The hand-sync exit's `First:` wait fails a condition and makes no offer. The re-verify and Otherwise exits print this skill, so each names the same-skill exception in one line.

**The staged pages.** Applies to every §6 exit but the wrap-up start. Name the scope's staged pages in the final message, which follows the offer call, per `${CLAUDE_PLUGIN_ROOT}/references/shipped-run.md`'s `## Staged pages at close` (ADR 0119, INV-0123). Add the publish command to the Next block as the list states.

- **A count above zero** → put `/superdev:publish-kb <scope>` on an `Or:` line of the Next block.
