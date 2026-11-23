---
name: submit-pr
description: Submit a pull request for a superdev scope — the stage gate, the Unresolved ask-once, and the pull request body. The last step of the implement chain; run it after /superdev:review and /superdev:document.
argument-hint: "[<scope>  (empty = the only run in this repo)]  [--unattended]"
---

# superdev submit-pr

## Role and terms

Applies to every start. You open a pull request for a run whose slices are on the scope branch. You dispatch no subagent. You leave the run standing: the scopetree, the slicetrees, the run lock, and the scope anchor stay, and `/superdev:wrap-up` takes them down.

- **The scope checkout**: the checkout `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md` finds. §4's read and §5's git commands run in it.
- **`<branch>`**: the scope branch, the ledger's `**Branch:**` line, the `branch` field of the one `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" state --root <run-root>` call this entry makes. §3 reads the `stage` and `pr` fields of that same output.
- **`<sha>`**: `git rev-parse <branch>`, run in the scope checkout.
- **The publish**: the run's one snapshot publish, per `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state` section. It is the last act of the exit that ends the run, after the closer §3's **The step** lists. No write site publishes.
- **An unattended block**: a stop that counts as a block under `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section.
- **The body**: the pull request body §5 builds.

**Cited sections.** Applies to every cited `## <heading>` section of a document. Read it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" section <path>` and the heading on stdin through a quoted heredoc.

## The closing message

Applies to every message this command ends on. Close it per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` and `## The chain start`.

## 1. Scope + run root

**An `--unattended` argument.** Applies before anything else in this file. Take it out of `$ARGUMENTS` first, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section. It is never part of the scope slug.

**The run root.** Applies to every start. Resolve `$ARGUMENTS` to one scope, a **run root**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## A live scope run` section.

- **A scope slug given** → use it. No run root by that name → say so and stop.
- **Empty** → this command's **candidate set** (CONTEXT.md) is every run root whose stage is neither `shipped` nor `closed`. Run `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Resolving an empty argument` cascade over that set. Create nothing before the cascade resolves one run root.

**The run lock.** Applies once one run root is resolved. Capture `<run-root>` and refresh `<run-root>/run.lock` now, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`.

## 2. Scope checkout

Applies to every start past §1. Find the scope checkout.

## 3. Stage gate

**The stage.** Applies to every start past §2. Take the `stage` field of the one `scope.js state` call **Role and terms** names under `<branch>`, where `absent` means no line.

- **`shipped`** → report that the scope is already shipped and stop. Open no pull request.
- **`closed`** → report that the scope is already closed and stop, with no push and no pull request.
- **`submitted`** → report that the scope is already submitted. Print the pull request the `pr` field of that same `state` output names; on `absent`, print the existing pull request if the code host still lists one. Stop, and open no second one.
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

**Entries standing.** Applies after **A missing step**. Read every bullet from the `unresolved` field of the one `scope.js state` call **Role and terms** names under `<branch>`, one bullet per line, never through the cwd-dependent `status`, per `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Unresolved defects` section.

- **No output** → proceed silently.
- **Output present, attended** → name every bullet and ask once whether to submit with it standing. Declined → stop, open no pull request, and write nothing further. Confirmed → proceed, and record in the report that the scope was submitted with the defect standing.
- **Output present, `--unattended`** → refuse. Name what stands, open no pull request, and stop.

**A criterion that holds no stage.** Applies to a `dod.md` criterion noted `accepted:` or `ceiling:`. It holds no stage and is no defect; a `ceiling:` line stays open until `/superdev:verify-ship` observes it (`${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s `## The note rule`). It writes no `**Unresolved:**` bullet and never reaches this gate.

## 4. Where the full suite runs

**No test run.** Applies to every run past §3. Run no test command and no `scope.js suite reusable` call: `/superdev:ship` takes the scope's full-suite evidence on the head it merges (ADR 0255, INV-0193).

**The named checks.** Applies to every run past §3. Read the `## CI` section of `docs/agents/verification.md` from the scope branch's tip commit (`git -C <run-root>/scopetree show <branch>:docs/agents/verification.md`), never the working tree. Its backtick spans outside a fenced block, other than `none`, are the named checks, and a bare `none` line counts as `none` (`CONTEXT.md` → *Named check*).

- **Named checks, and no `none`** → the full suite runs in those checks, which this command lists in the body and its report.
- **None** (no document, no section, or a section reading `none`) → the full suite runs locally at ship: the full command, or the whole-repo command where `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s `## Whole-repo command` section is configured.
- **Both `none` and a name** → a configuration error that `scope.js ci` cannot judge and ship refuses. Report it in the body's `## Full suite` section and the report, point at `/superdev:setup`, and ask no ship question.

## 5. Pull request

**The remote.** Applies before §5's push. No `Remote:` value in `docs/agents/code-management.md` → refuse before any push: run `step block`, name the missing `Remote:` value, open no pull request, and point at `/superdev:setup`.

**The open.** Applies to every run past §4. Per `docs/agents/code-management.md`, push the scope branch, then open the pull request at the configured posture, with a body built from the Definition of Done and the slice list. No host CLI or API access → degrade exactly as that document says: push, then print the compare URL and the ready-to-run call. Report the pull-request URL.

**The number.** Applies the moment the pull request opens. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" pr set <n> --root <run-root>`, `<n>` the number the host's own open call returned. Degraded to the compare-URL fallback → record nothing. `pr clear` need not run.

**The body sections.** Applies to the body. Read the three list fields below with one `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" state --root <run-root>` call. Add each heading below in its own section, distinct from the others. A source with no output adds no empty heading, except `## Full suite`, which the body always carries.

| Heading | Content |
|---|---|
| `## Full suite` | where the full suite runs, per §4: the named checks, listed, a local run at ship, or the `## CI` configuration error |
| `## Degraded passes` | every bullet of the `degraded` field, one per line (`${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes`) |
| `## Unresolved defects` | every bullet of the `unresolved` field, one per line (`scope-findings.md`'s `## Unresolved defects`) |
| `## Deferred to a plan` | every bullet of the `deferred` field, one per line (`scope-findings.md`'s `## Deferred findings`) |
| `## Post-merge checklist` | every `dod.md` line carrying `— ceiling: <partial evidence>`, as a checkbox; the note format is `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s note rule |

**No tick.** Applies to the post-merge checklist. Copy what an earlier step recorded. Write no tick anywhere.

**The stage write.** Applies after the open. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set submitted --root <run-root>`. Then run the publish.

**The ship question.** Applies to an attended run, after the stage write and its publish, where §4 found no configuration error and the open recorded a pull request number. Ask one `AskUserQuestion`: ship it now? Its text names the pull request URL, says nobody has reviewed it, and says what a yes does, with the host's approvals and branch protection in force:

- **§4 found no named checks** → a yes merges it now through `/superdev:ship`, which first takes the full-suite evidence (a reusable record, the carry, or a local run).
- **§4 found named checks** → a yes merges it through `/superdev:ship` once every named check is green on the pull request's head, ship waiting up to 60 minutes for them.

Put the explicit yes option first and a no option second.

- **The yes option** → start `/superdev:ship <scope>` per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The chain start`; the yes is the merge consent.
- **Any other answer, a dismissal, or a question the platform cannot ask** → print the next command below and start nothing.

**No ship question.** Applies where §4 found the configuration error, where no pull request number was recorded, and to an unattended run. Ask nothing, start nothing, and print the next command below.

**The next command.** Applies to every run that reaches the stage write. Print `/superdev:ship <scope>` as the next command, with one line on what it does: it merges the pull request once an operator has reviewed it and applies the repository's deploy posture to the merge. It then starts `/superdev:verify-ship <scope>`, or `/superdev:wrap-up <scope>` when nothing is left to verify.

- **§4 found named checks** → add one line: ship waits up to 60 minutes for the named checks on the pull request's head and merges once every one is green, where `docs/agents/code-management.md` carries the check-status read script; without the script it refuses while one is pending.
- **§4 found the configuration error** → put fixing the `## CI` section through `/superdev:setup` on a `First:` line: ship refuses until the section holds names or `none` alone.
- **No pull request number was recorded** (the `push-only` posture, or an open degraded to the compare URL) → add one line: ship has no pull request to read until one is opened and its number recorded.
