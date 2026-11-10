---
name: submit-pr
description: Submit a pull request for a superdev scope — the stage gate, the Unresolved ask-once, and the pull request body. The last step of the implement chain; run it after /superdev:review and /superdev:document.
argument-hint: "[<scope>  (empty = the only run in this repo)]  [--unattended]"
---

# superdev submit-pr

## Role and terms

Applies to every start. You open a pull request for a run whose slices are on the scope branch. You dispatch no subagent. You leave the run standing: the scopetree, the slicetrees, the run lock, and the scope anchor stay, and `/superdev:wrap-up` takes them down.

- **The scope checkout**: the checkout `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md` finds. §4's suite run and §5's git commands run in it.
- **`<branch>`**: the scope branch, the ledger's `**Branch:**` line, read with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get branch --root <run-root>`.
- **`<sha>`**: `git rev-parse <branch>`, run in the scope checkout.
- **The publish**: publish the snapshot per `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state` section.
- **An unattended block**: a stop that counts as a block under `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section.
- **The body**: the pull request body §5 builds.

## The closing message

Applies to every message this command ends on. Close it with the Next block per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` section (INV-0111). An attended run first makes the offer in that file's `## The offer` section (ADR 0157).

## 1. Scope + run root

**An `--unattended` argument.** Applies before anything else in this file. Take it out of `$ARGUMENTS` first, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section. It is never part of the scope slug.

**The run root.** Applies to every start. Resolve `$ARGUMENTS` to one scope, a **run root**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## A live scope run` section.

- **A scope slug given** → use it. No run root by that name → say so and stop.
- **Empty** → this command's **candidate set** (CONTEXT.md) is every run root whose stage is neither `shipped` nor `closed`. Run `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Resolving an empty argument` cascade over that set. Create nothing before the cascade resolves one run root.

**The run lock.** Applies once one run root is resolved. Capture `<run-root>` and refresh `<run-root>/run.lock` now, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`.

## 2. Scope checkout

Applies to every start past §1. Find the scope checkout.

## 3. Stage gate

**The stage.** Applies to every start past §2. Read it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get stage --root <run-root>`, where `absent` means no line.

- **`shipped`** → report that the scope is already shipped and stop. Open no pull request.
- **`closed`** → report that the scope is already closed and stop, with no push and no pull request.
- **`submitted`** → report that the scope is already submitted. Print the pull request `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get pr --root <run-root>` names; on `absent`, print the existing pull request if the code host still lists one. Stop, and open no second one.
- **Any other stage** → take **An unattended stage** and then **The step**.

**An unattended stage.** Applies under `--unattended` to any other stage except `documented`. Refuse before any step is recorded. Name what is missing (`/superdev:review`, `/superdev:document`, or both), open no pull request, and stop.

**The step.** Applies to every other run at any other stage. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step set submit --root <run-root>` before any other ledger or store write. Every exit after it ends in one call from the list below, and a blocked stop, a refusal, and a `First:` wait each run `step block` first.

- `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step clear --root <run-root>`
- a stage write
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step block --root <run-root>`

**A missing step.** Applies after `step set`.

- **`documented`** → proceed silently.
- **`documented-unreviewed`** → name `/superdev:review` as missing and ask once whether to submit anyway.
- **`implementing`, `merged`, `reviewed`, or `absent`** → name exactly what has not run (`/superdev:review`, `/superdev:document`, or both) and ask once whether to submit anyway.

**The missing-step answer.** Applies to an ask of **A missing step**. Declined → stop and print the missing command. Confirmed → proceed, and record in the report that the scope was submitted without it.

**Entries standing.** Applies after **A missing step**. Read every bullet with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get unresolved --root <run-root>`, one bullet per line, never through the cwd-dependent `status`, per `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Unresolved defects` section.

- **No output** → proceed silently.
- **Output present, attended** → name every bullet and ask once whether to submit with it standing. Declined → stop, open no pull request, and write nothing further. Confirmed → proceed, and record in the report that the scope was submitted with the defect standing.
- **Output present, `--unattended`** → refuse. Name what stands, open no pull request, and stop.

**A settled criterion.** Applies to a `dod.md` criterion noted `accepted:` (ADR 0095) or `ceiling:`. It is settled and no defect. It writes no `**Unresolved:**` bullet and never reaches this gate.

## 4. Whole-repo run

**The section.** Applies to every run past §3. Read `docs/agents/verification.md` from the scope checkout per `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s `## Whole-repo command` section (ADR 0105, INV-0017).

- **No such section** → run no suite. The outcome is `not configured`. Continue to §5.
- **Section present** → take **The reuse**.

**The reuse.** Applies to a present section. In the scope checkout, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite reusable --branch <branch> --whole --root <run-root>`. Only a record of kind `whole` satisfies this step, and a green record with no kind does not. Exit 0 → the outcome is `reused`, with no run, and you continue to §5.

**The run.** Applies when the reuse does not exit 0. Run the whole-repo command once in the scope checkout over the scope branch's tip, through `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test whole`. Record it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite set <green|red|denied|none> <sha> --whole --root <run-root>`, the value the result below names.

- **Green** → record `green`. The outcome is `green`. Continue to §5.
- **Red** → record `red`. The outcome is `red`. Add an unresolved defect naming the failing output's decisive lines, per `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Unresolved defects` section, then run the publish. Leave the stage where it was, print `/superdev:review <scope>` as the next command, and stop.
- **Denied** (the permission classifier refused the run) → record `denied`. The outcome is `denied`. Write a `**Degraded:**` entry naming the denied whole-repo run with plain `degraded add`, per `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes` section, then run the publish, and stop with the same report.
- **Killed, or never started** → record `none` (INV-0009). The outcome is `killed` or `not started`, saying which. Stop with the same report.

**A stopped run.** Applies to the red, denied, killed, and not-started results. Open no pull request. Under `--unattended` the stop is the same, and it is an unattended block.

**The outcome.** Applies to every outcome: `reused`, `green`, `red`, `denied`, `killed`, `not started`, or `not configured`. State it in this command's report.

## 5. Pull request

**The open.** Applies to every run past §4. Per `docs/agents/code-management.md`, push the scope branch, then open the pull request at the configured posture, with a body built from the Definition of Done and the slice list. No host CLI or API access → degrade exactly as that document says: push, then print the compare URL and the ready-to-run call. Report the pull-request URL.

**The number.** Applies the moment the pull request opens. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" pr set <n> --root <run-root>`, `<n>` the number the host's own open call returned (INV-0092). Degraded to the compare-URL fallback → record nothing. `pr clear` need not run.

**The body sections.** Applies to the body. Add each heading below in its own section, distinct from the others (ADR 0035). A source with no output adds no empty heading, except `## Whole-repo run`, which the body always carries.

| Heading | Content |
|---|---|
| `## Whole-repo run` | §4's outcome. `not configured` → say so. |
| `## Degraded passes` | every bullet of `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get degraded --root <run-root>`, one per line (`${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes`) |
| `## Unresolved defects` | every bullet of `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get unresolved --root <run-root>`, one per line (`scope-findings.md`'s `## Unresolved defects`) |
| `## Deferred to a plan` | every bullet of `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get deferred --root <run-root>`, one per line (`scope-findings.md`'s `## Deferred findings`) |
| `## Post-merge checklist` | every `dod.md` line carrying `— ceiling: <partial evidence>`, as a checkbox; the note format is `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s note rule |

**No tick.** Applies to the post-merge checklist. Copy what an earlier step recorded. Write no tick anywhere.

**The stage write.** Applies after the open. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set submitted --root <run-root>`, then run the publish.

**The offer.** Applies to an attended run. Make the offer for `/superdev:ship <scope>` per `## The offer` (ADR 0157, INV-0093). Its start options carry that section's **An offer of ship** wording, and each also says the pull request is not reviewed yet.

- The operator who wants to review first answers once the review is done, or stops here.

**The unattended end.** Applies to an unattended run. Make no offer. The next command below still prints.

**The next command.** Applies to every run that reaches the stage write. Print `/superdev:ship <scope>` as the next command, with one line on what it does: it merges the pull request once an operator has reviewed it and applies the repository's deploy posture to the merge. It then offers to start `/superdev:verify-ship <scope>`, or `/superdev:wrap-up <scope>` when nothing is left to verify, and prints that command when the operator does not take the offer.
