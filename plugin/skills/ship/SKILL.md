---
name: ship
description: Start only when the operator typed it, asked for it, said yes to submit-pr's ship question, or a clean review or document pass at `submitted` started it under carried consent: merge a superdev scope's pull request, pinned to the tested head, through the host's merge API — apply the repository's deploy posture to the merge, then hand off to `/superdev:verify-ship`, to `/superdev:wrap-up` when nothing is left to verify, or to `/superdev:plan` when a criterion needs a repair, starting verify-ship or wrap-up on those routes. Run it once `/superdev:submit-pr` has opened the pull request and it has been reviewed.
argument-hint: "[<scope>  (empty = the only run in this repo)]"
---

# superdev ship

## Role and terms

Applies to every start. You merge the pull request `/superdev:submit-pr` opened, and apply the deploy posture to the merge. You dispatch no subagent, close no anchor, write no tick, and remove no checkout, slice checkout, or lock.

- **The tip**: the local scope-branch tip, `git -C <run-root>/scopetree rev-parse <branch>`.
- **A reusable tip**: a tip `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite reusable --branch <branch> --base <base> [--whole] --root <run-root>` accepts. Run it from any checkout of the repository.
- **The carry**: `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s `## The carry run`, run in `<run-root>/scopetree` with no ask. A carried tip proceeds, and ship writes no suite record for it.
- **The red exit**: merge nothing, name the result, and point at `/superdev:review <scope>` to fix it. A review at stage `submitted` leaves the stage where it is.
- **The named checks**: the check names the `## CI` section of `docs/agents/verification.md` lists at a commit, read with `git -C <run-root>/scopetree show <commit>:docs/agents/verification.md` (`CONTEXT.md` → *Named check*, ADR 0255). The tip naming checks puts this run on **the CI path**; a section reading `none`, an absent section, or an absent document puts it on **the local path**. A section holding both `none` and a check name, a check name being any backtick span outside a fenced block other than `none`, and a bare `none` line counting as `none`, puts it on neither path: it is a configuration error, the one `scope.js ci` cannot judge. Refuse: run `step block`, name the error, merge nothing, and point at `/superdev:setup`. **Adopting a hand merge** records it at `head.sha` as a cannot-judge `**Degraded:**` bullet instead.
- **The CI read**: `docs/agents/code-management.md`'s `## Check status` read for one commit, its lines read into a file, then fed to `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" ci --sha <sha> --root <run-root>/scopetree`. The verb prints `ci: <verdict> <sha>` and one line per check that is not green, and exits 0 (green), 3 (not yet green: pending, missing, or finished not green), 4 (failed), or 2 (cannot judge). A read that fails passes nothing to the verb. The CI read writes no suite record, and a local suite record neither blocks nor permits a merge on the CI path.
- **The PR read**: the `pr` field of the `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" state --root <run-root>` call §2 makes, then the pull request read by that number per `docs/agents/code-management.md`'s `## Merge` section: its `state`, `merged`, `merge_commit_sha`, `head.sha`, and `mergeable`.
- **The deployment document**: `docs/agents/deployment.md`. Its posture is its `## Posture` section's `Posture:` line. A missing document, or one with no such line, reads as posture `none`.
- **`<range-base>`**: per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`.

**Cited sections.** Applies to every cited `## <heading>` section of a document. Read it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" section <path>` and the heading on stdin through a quoted heredoc.

## Start conditions

Applies to every start. Start this command only on one of the starts below. The command carries no unattended mode of its own.

- Calling it is the consent to merge: ask no question after the gate passes beyond the asks this file names.

- The operator typed the command.
- The operator asked for it.
- The operator said yes to `/superdev:submit-pr`'s ship question, which started it.
- Another session's brief asked for it, confirmed by the one yes `## A brief started` asks first.
- A clean scope review or a document pass on a scope at `submitted` started it where `scope.js consent --root <run-root>` printed `carried`: the latest ship step after the scope's last submit step ended blocked. It takes no `## A brief started` path.

## No extra question

Applies to a typed start, a start the operator asked for, the start submit-pr's ship question made on its yes, and a start under carried consent. Ask no extra question beyond the asks this file names: that yes, or the earlier ship start the carried consent records, is the merge consent.

## A brief started

Applies when another session's brief started this command, a prompt that carries a marker line of an older superdev offer included. Your first act is one `AskUserQuestion` confirming `/superdev:ship` with its arguments. It comes before any `step set`, ledger write, store write, or host call.

- **A yes** → run the command as typed.
- **Any other answer** → write nothing and end on the Next block with the same command in its fence.

A brief is never merge consent.

## The closing message

Applies to every message this command ends on. Close it per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` and `## The chain start`. Every refusal prints its command and starts nothing, whatever started this run: failed or pending checks, a conflict, a red or denied suite, a numbering collision, the push and draft refusals, and a denied merge call.

## 1. Scope + run root

**An `--unattended` argument.** Applies before anything else in this file. Say that every unattended run ends at `/superdev:submit-pr`, print `/superdev:ship <scope>` as the command an operator runs, and stop. `<scope>` is the slug the arguments carry beside `--unattended`; with none, print the bare `/superdev:ship`.

**The run root.** Applies to every other start. Resolve `$ARGUMENTS` to one scope, a **run root**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## A live scope run` section. Capture `<run-root>` and refresh `<run-root>/run.lock` now per that file.

- **A scope slug given** → use it. No run root by that name → say so and stop.
- **Empty** → this command's **candidate set** (CONTEXT.md) is every run root whose stage is `submitted`, plus every run root at `shipped` that §3 finds resumable. Run `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Resolving an empty argument` cascade over that set.

**A resumable run.** Applies to a run root at `shipped`. It is resumable when its ledger carries a `**PR:**` header, its posture at the merge commit is `auto`, and its deploy record (`scope.js deploy get`) leaves a listed target not recorded `deployed`. That is an `auto` deploy §5 stopped mid-way.

## 2. Scope checkout

Applies to every start past §1. Read the stage and the pull request number with one `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" state --root <run-root>` call, its `stage` and `pr` fields.

- **`closed`** → say the scope is already closed and change nothing. Recreate no checkout.
- **`shipped`** → recreate nothing here. §3 decides whether the run needs a checkout.
- **Any other stage** → find the scope checkout per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`, and recreate it when it is absent at `submitted`. §4's git commands run through it.

## 3. Read the pull request, and gate

**The step.** Applies to every stage except a refusal for a stage short of `submitted`. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step set ship --root <run-root>` before any other ledger or store write. Every exit after it ends in one call from the list below, and a blocked stop, a refusal, and a `First:` wait each run `step block` first.

- `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step clear --root <run-root>`
- a stage write
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step block --root <run-root>`

**The publish.** Applies to every exit after `step set ship`. When this run made a ledger write `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state` section lists, publish the snapshot once per that section, as the exit's last act: after its closer and after every ledger write the exit makes past it. A §5 exit after the stage write, a failed or declined deploy included, carries no closer of its own and publishes at that exit. No write site publishes.

**The stage.** Applies to every start past §2.

- **Short of `submitted`** (`planned`, `implementing`, `merged`, `reviewed`, `documented`, `documented-unreviewed`, or no line at all) → refuse with no step. Name the missing step, print `/superdev:submit-pr` as what has not run yet, and merge nothing.
- **`shipped`** → take **A shipped run**.
- **`submitted`** → proceed to **Find the pull request**.

**A shipped run.** Applies to `shipped`. Read the deploy record with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" deploy get --root <run-root>`; the listed targets are the anchor's `**Deploy:**` line, per `docs/agents/issue-tracker.md`. Only when a listed target is not `deployed`, read the posture at the merge commit from the invoking checkout, by the PR read first, per `${CLAUDE_PLUGIN_ROOT}/references/shipped-run.md`'s `## Reading the posture at the merge commit`.

- **Every listed target reads `deployed`, or none is listed, or the posture is not `auto`** → report "already shipped", run `step clear`, print the next command §5's **Hand off** picks, and stop. Recreate no scope checkout.
- **The posture is `auto` and a listed target reads `pending`, `failed`, or carries no record** → an earlier `auto` deploy stopped mid-way (a declined unshown config left it `pending`, a session that ended before §5's first `deploy set` left no record). Recreate an absent scope checkout per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`, and go to §5's **Find the merge commit**. Nothing merges again.

**Find the pull request.** Applies to `submitted`. Take the PR read; `/superdev:submit-pr` records the number when it opens the pull request (`${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## The ledger`).

- **A number** → read that pull request by index. A read that finds nothing takes **None found**.
- **`absent`** → use the code host's find-open-pull-requests-by-head-branch call per `docs/agents/code-management.md`'s `## Merge` section, filtered to **open** pull requests only.
  - **Exactly one** → read it by index, and record it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" pr set <n> --root <run-root>`.
  - **Two or more** → refuse: name how many the lookup found, and merge nothing.
  - **Zero** → take **None found**.

**The pull request's state.** Applies to the pull request found.

- **None found** → refuse and merge nothing. Name both cases the operator tells apart. **No pull request was ever opened** (the `push-only` posture opens none) → print `/superdev:submit-pr`. **One was opened and has since merged or closed by hand** → find its number on the host, record it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" pr set <n> --root <run-root>`, then run `/superdev:ship <scope>` again.
- **Closed, and `merged` is false** → refuse: name that it was closed without merging, and merge nothing.
- **`merged` is true** → take **Adopting a hand merge**.
- **Open** → continue to **The deploy gate**.

**Adopting a hand merge.** Applies to a pull request whose `merged` is true. Judge the merged `head.sha` by the named checks at that commit, or by the local suite record where it names none, and take its bullet below. Then take the adopt's stage write.

- **Named checks at `head.sha`, or a `## CI` section holding both `none` and a name** → take the CI read for `head.sha`. **Green** → add no `**Degraded:**` bullet. **Not yet green, failed, cannot judge, or a failed read** → run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" degraded add "the merge landed on <head.sha>, whose named checks read <state>"`, one bullet, `<state>` naming the verdict and each check not green, or the read's error.
- **No named checks, `suite reusable` with `--branch <head.sha>`, plain and never `--whole`, exits 0** → the merged head is a commit the suite record covers (an exact match, a Markdown-only range that needs no test run at the tip, a focused-selector carry, alone or followed by Markdown-only commits, or a recorded rerun, alone or followed by Markdown-only commits). Add no `**Degraded:**` bullet.
- **No named checks, and it exits 1 or finds no record** → run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" degraded add "the merge landed on <head.sha>, not a commit the green suite record covers"`.

**The adopt's stage write.** Applies after the adopt's bullet. Set the stage to `shipped` with `scope.js stage set shipped --root <run-root>` unless it already reads that. Go to §5.

**The deploy gate.** Applies to an open pull request, before anything merges. Read the deployment document from the scope branch's tip (`git -C <run-root>/scopetree show <branch>:docs/agents/deployment.md`) and the anchor's `**Deploy:**` line per `docs/agents/issue-tracker.md`. §4 runs this gate again at the merged tip whenever its merge moves the tip.

- **A listed target the `## Targets` table lacks** → refuse: name it, and merge nothing.
- **The pull request's diff touches the deployment document** (`git -C <run-root>/scopetree diff <range-base>..<branch> -- docs/agents/deployment.md` finds anything) → print the changed posture and target lines here, before anything merges. Calling ship is the consent to exactly the commands it is about to run.
- **The pull request's diff changes the `## CI` section** (`git -C <run-root>/scopetree diff <range-base>..<branch> -- docs/agents/verification.md` touches it) → print the named checks before and after the change here, before anything merges.
- **A start under carried consent, with either print above** → a fix cycle made the change after the consent, so ask once whether to merge with the changed posture, target, or named checks, after the prints and before anything merges. Declined → run `step clear`, stop, merge nothing, and write nothing further.

**The suite gate.** Applies after the deploy gate. It takes the full-suite evidence for the exact head ship merges.

- **The CI path** → run no `scope.js test` call and no carry. The CI read runs in §4, at **The CI gate**, once the equality check and **The draft gate** have passed.
- **The local path** → take **The local suite gate**.
- **A `## CI` section at the tip holding both `none` and a name** → take the configuration-error refusal of **The named checks**.

**The local suite gate.** Applies on the local path.

- **No `docs/agents/verification.md` at the tip, or one with no fenced command** → run nothing, write no record, and proceed. The report says no test command is configured.
- **Otherwise** → run `suite reusable` on `<branch>`, with `--whole` when **The whole-repo gate** applies. **Exits 0** → proceed. **Exits 1** → take the carry; a carried tip proceeds, and a failing carry run takes **A failing carry**. **No carry, or no record** → take **The base-move test**.

**The base-move test.** Applies on the local path to a tip with no reusable green result and no carry, before **The local run**. Run `git -C <run-root>/scopetree merge-base --is-ancestor <base> <branch>`.

- **It succeeds** → base will not move: take **The local run** on the tip.
- **It fails** → base will move, and §4's base merge makes a new head. First apply **The local run**'s invalidation refusal on the tip, before any question and any branch write. Otherwise run nothing here, and proceed. §4's **The merged-tip run** is the evidence.

**A failing carry.** Applies to a carry run that fails at the tip, in §3, in §4's merged-tip run, or in §4's push. Record `suite set red <tip> --root <run-root>`, with `--whole` where **The whole-repo gate** added it, and take no `test-selection.md`'s `## The recorded rerun`. Then take the red exit.

**The whole-repo gate.** Applies on the local path when `docs/agents/verification.md` at the scope branch's tip (`git -C <run-root>/scopetree show <branch>:docs/agents/verification.md`) has a `## Whole-repo command` section, per `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s section of that name. Add `--whole` to the `suite reusable` call of **The local suite gate** and to every `suite reusable` call in §4; **Adopting a hand merge** keeps its plain call. Without the section, every call stays as written.

**The local run.** Applies on the local path to a tip with no reusable green result and no carry: the tip **The base-move test** keeps, §4's merged tip, and §4's push.

- **No `docs/agents/verification.md` at that tip, or one with no fenced command** → **The local suite gate**'s first bullet decides it.
- **The `suite` field of `scope.js state --root <run-root>` prints `none <sha>`, and its `unresolved` field prints any bullet** → refuse: name every standing bullet, merge nothing, and point at `/superdev:review <scope>`. That record is the invalidation `/superdev:review` left, and a run here would overwrite it.
- **Any other tip** → run the full command over the tip in the scope checkout through `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test full`, or the whole-repo command through `test whole` under **The whole-repo gate**, in the foreground with Bash's `timeout` at its ceiling (600000 ms unless `BASH_MAX_TIMEOUT_MS` raises it), and in the background only when the suite can outlast the ceiling, waiting for its end.
  - **Green, red, or denied** → record it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite set <green|red|denied> <tip> --root <run-root>`, with `--whole` for the whole-repo command. **Green** → proceed. **Red or denied** → take the red exit. A red full run takes `test-selection.md`'s `## The recorded rerun` first: the triage record quoting the failure, then the rerun record, the failing test file alone, and the focused run; an unattributable failure stays red.
  - **Killed or never started** → the run carries no verdict (INV-0009): record no suite result, merge nothing, name the stop, and print `/superdev:ship <scope>` to run again.

**Entries standing.** Applies after the suite gate. Read every bullet from the `unresolved` field of the `scope.js state` call §2 made: no step before this one writes an unresolved entry.

- **No output** → proceed silently.
- **Output present** → name every bullet and **ask once** whether to merge with it standing. Declined → run `step clear`, stop, merge nothing, and write nothing further: the decline withdraws the merge consent, so no later review or document pass starts ship on it. Confirmed → proceed, and record in the report that the scope merged with the defect standing.

## 4. Base moved, then the merge

**The pre-merge tip.** Applies before the merge. Capture the tip as `<pre-merge-tip>`; §3's deploy gate read the deployment document at this commit.

**Numbering collisions.** Applies before the base merge. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" collisions --base <base> --branch <branch> --range-base <range-base>`, with one `--also <ref>` for each other live plan run's scope branch whose ref resolves, as `${CLAUDE_PLUGIN_ROOT}/references/scope-branch.md`'s `## Bringing the scope branch to base`, step 4, chooses them.

- **Exit 0** → continue.
- **Exit 1** → merge nothing and change nothing on the scope branch. Print each line; it names the colliding ADR number or invariant id and the number it should take. Point at renumbering it on the scope branch, then `/superdev:review <scope>`, then `/superdev:ship <scope>`.
- **Exit 2** → the check could not run: name its message, merge nothing, and never read it as no collision.

**The base merge.** Applies after the collision check. Merge base into the scope branch, in the scope checkout, by its literal absolute path: `git -C <run-root>/scopetree merge <base>`, with `<run-root>` spelled out as the real path, never a shell variable.

- **Base already an ancestor of the tip** → nothing moved: go to **The push**.
- **A conflict** (`MERGE_HEAD` still set) → list the conflicting files (`git -C <run-root>/scopetree diff --name-only --diff-filter=U`), run `git -C <run-root>/scopetree merge --abort`, and stop: merge nothing. Point at `/superdev:review <scope>` to resolve them, since a resolution is unreviewed code.
- **A clean merge** → take **The merged-tip run**.

**The merged-tip run.** Applies to a clean merge.

- **The CI path** → run nothing locally. Take **The deploy gate again**, then **The push**, which pushes the merged tip and refuses as pending: CI has not reported on it.
- **The local path, carry** → take the carry first. A carried merged tip runs no full command and writes no record. A failing carry run takes **A failing carry**.
- **The local path, no carry** → take **The local run** on the merged tip, the whole-repo command in place of the full command under **The whole-repo gate**, never beside it.

**The deploy gate again.** Applies after a clean merge moved the tip. Read the deployment document and the anchor's `**Deploy:**` line again at the merged tip, as §3's deploy gate reads them.

- **A listed target the `## Targets` table now lacks** → refuse: name it, and merge nothing.
- **The deployment document differs between `<pre-merge-tip>` and the merged tip** (`git -C <run-root>/scopetree diff <pre-merge-tip> <branch> -- docs/agents/deployment.md` finds anything) → print the changed posture and target lines, sourced from base's document, here, before anything merges on the host.

**The push.** Applies to every run that reaches it, whether or not base moved. Compare the tip with the `head.sha` §3 read. To push, print `git -C <run-root>/scopetree log <head-sha-just-compared>..<branch> --oneline`, and go on even when that log fails with "unknown revision". Then run `git push origin <scope-branch>` per `docs/agents/code-management.md`, a push of the **scope branch**, never of base.

- **Identical** → nothing to push.
- **They differ, on the CI path** → push. An accepted push refuses as pending: run `step block`, merge nothing, name the new SHA the named checks have not reported on, and print `/superdev:ship <scope>` to run once they are green. A rejected push takes **The push result**.
- **They differ, on the local path** → run `suite reusable` on the tip (`--whole` where §3 added it). **Refuses** → take the carry; a failing carry run takes **A failing carry** and pushes nothing. **No carry** → take **The local run** on the tip; a red, denied, or unfinished run pushes nothing. **Accepts, carried, or a green local run** → push.

**The push result.** Applies to a push that ran, except an accepted push on the CI path, which **The push** ends.

- **Rejected, non-fast-forward** → the pull request's head carries commits this scope branch lacks. Refuse: name that gap and merge nothing. Put fetching those commits into the scope branch on a `First:` line, and print `/superdev:review <scope>` as the next command, then `/superdev:ship <scope>` again.
- **Rejected for any other reason** (authentication, a pre-receive hook, the network) → relay git's error and merge nothing. Stop.
- **Accepted, on the local path** → repeat the PR read until its `head.sha` equals the tip just pushed, at most 3 times with a short pause, the bound `plugin/references/code-management-github.md` uses for a `null` `mergeable`. Still different → the equality check refuses.

**The equality check.** Applies before the merge. The freshest `head.sha`, from the read after a push or from §3 without one, must equal the tip: on the local path, the tip `suite reusable` accepted, the carry covered, or the local run passed; on the CI path, the local tip. They differ → refuse: name both shas, and merge nothing.

**The draft gate.** Applies once the equality check passes, after every gate before the merge, and before the merge call. Read the pull request's draft state through the code-management document's **Read the draft state** call. ADR 0249 states the rule.

- **Not a draft** → go to **The CI gate**.
- **A draft, and the document states a Mark ready call** → run that call under the merge consent already given, with no further question, then go to **The CI gate**. On the CI path the call comes before the CI read, so a check that skips drafts runs and cannot hold the merge forever. A Forgejo merge title carries no `WIP:` or `[WIP]` prefix. A refusal or stop earlier in this command leaves the draft a draft.
- **A draft, and the document states no Mark ready call or no draft-state read** → refuse: name that the pull request is a draft and the document lacks the call, point at `/superdev:setup`, and merge nothing.
- **A Mark ready call the permission classifier denies** → take the denial stop of **The merge**: merge nothing, try no other route, run `step block`, name the denial and its mitigation.
- **A Mark ready call that fails otherwise** (an auth, network, or host error) → relay its error and merge nothing. Read the draft state again through the **Read the draft state** call and report whether the pull request is still a draft or now ready: a call that timed out can have taken effect on the host.

**The CI gate.** Applies once **The draft gate** passes. On the local path, go to **The merge**. On the CI path, take the CI read for the tip, the SHA the equality check matched. Nothing here waits for a check or reads it again later (INV-0192).

- **No `## Check status` section in the code-management document** → refuse: run `step block`, merge nothing, and point at `/superdev:setup`.
- **The read fails** (no CLI, no login, an HTTP error, or the network) → refuse: run `step block`, relay its error, and merge nothing.
- **Green, exit 0** → go to **The merge**, pinned to that SHA.
- **Not yet green, exit 3** → refuse: run `step block`, merge nothing, name the SHA and each check the verb lists as pending, missing, or finished not green, and print `/superdev:ship <scope>` to run once they are green.
- **Failed, exit 4** → refuse: run `step block`, merge nothing, name each failed check with its link, and point at `/superdev:review <scope>`, which starts from that red.
- **Cannot judge, exit 2, or a usage refusal, exit 1** → refuse: run `step block`, name the verb's reason or its usage error, and merge nothing.
- **Any refusal above, after The draft gate's Mark ready call ran** → add that the pull request is now ready, as **The merge**'s host-refusal bullet does.

**The merge.** Applies once **The CI gate** passes. Print the pull request, its head, the base, and the CI verdict, the suite result, or the carry outcome. Then squash-merge it into the base branch through the host's merge API, pinned to the tip, per `docs/agents/code-management.md`'s `## Merge` section: the one write this plugin makes straight onto base, and the only merge this contract admits.

- The pinned sha is the local tip, never a value read from the host. Never send a force or bypass option.
- **A host refusal** (an unmet approval, branch protection, or a head that moved since) → relay its message and merge nothing. Where **The draft gate** marked the pull request ready, add that it is now ready.
- **A merge call the permission classifier denies** (the tool result names a denial by Claude Code's permission classifier, auto mode's included) → merge nothing further, and try no other route to merge: no switch between `gh` and the host's API, no retry in another form. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step block --root <run-root>`. Name the denial, and name the operator's mitigation: an allow rule for the merge command in the permission settings, or `/superdev:ship <scope>` run in a mode that prompts for it.

## 5. After the merge

**Find the merge commit.** Applies after ship's merge, an adopted hand merge, or a resumed run. Repeat the PR read by the ledger's `**PR:**` number, never a value read from anywhere else.

- **`merged` reads false** → refuse: the pull request no longer reads as merged on the host. Run `step block`, change nothing else, and write no stage.
- **Otherwise** → take `merge_commit_sha` and `head.sha`.

**The stage write.** Applies after the merge commit is found. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set shipped --root <run-root>` unless the stage already reads `shipped`.

**The deploy posture.** Applies after the stage write. Only ship runs a target's command, only under `auto`, only after the merge, only in a tree detached at the merge commit. Read the posture and the anchor's `**Deploy:**` line fresh here, never reused from §3 or §4, at the merge commit, per `${CLAUDE_PLUGIN_ROOT}/references/shipped-run.md`'s `## Reading the posture at the merge commit`. Read through the scope checkout: `git -C <run-root>/scopetree fetch origin <base>` when the commit is missing, then `git -C <run-root>/scopetree show <merge-commit-sha>:docs/agents/deployment.md`.

- **`none`, a `**Deploy:** none` line, or no `**Deploy:**` line** → deploy nothing. Say so in one line and go to **Hand off**.
- **`manual`** → print each listed target's command not already recorded `deployed`, in listed order. Record each with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" deploy set <target> pending --root <run-root>`, and go to **Hand off**.
- **`auto`** → run `git -C <run-root>/scopetree fetch origin <base>`, then `git -C <run-root>/scopetree checkout --detach <merge-commit-sha>`. Never switch or pull the invoking checkout. Take **The unshown deployment document**.

**The unshown deployment document.** Applies under `auto`, before any target runs. Diff `git -C <run-root>/scopetree diff <tested-head> <merge-commit-sha> -- docs/agents/deployment.md`, with `<tested-head>` the `head.sha` just read, to catch a base change landing between §4's gate and the squash.

- A document present on one side only counts as a difference.
- A diff that fails to run counts as non-empty, and the ask says the comparison could not run.

- **No §3 or §4 gate ran in this invocation** (an adopted hand merge, or a resumed deploy) → also find the fork point with `git -C <run-root>/scopetree merge-base <tested-head> <merge-commit-sha>`, and diff `git -C <run-root>/scopetree diff <fork-point> <merge-commit-sha> -- docs/agents/deployment.md`. A non-zero exit or empty output from `merge-base` counts as non-empty, since an empty `<fork-point>` diffs against the working tree. A fork-point diff that fails to run counts as non-empty too.
- **Either diff non-empty** → print the changed posture and target lines, or the diff itself when neither changed, and ask once whether to deploy under them. **Confirmed** → run the targets. **Declined** → deploy nothing. Record `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" deploy set <target> pending --root <run-root>` for every listed target the deploy record does not yet name, print `/superdev:ship <scope>` as the resume, which asks again, and stop.
- **Both diffs empty** → ask nothing and run the targets.

**The targets.** Applies to a confirmed or unasked `auto` deploy. Run every listed target's command not already recorded `deployed`, in listed order, in the foreground, relaying its output as it runs.

- **A listed target the `## Targets` table lacks** → name it and stop, as a failed target does.
- **Exit 0** → record `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" deploy set <target> deployed --root <run-root>` and run the next target.
- **A non-zero exit** → record `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" deploy set <target> failed --exit <n> --root <run-root>`, name every target not yet deployed, and print `/superdev:ship <scope>` as the resume. It re-reads the merge commit and starts at the first undeployed target. Stop.
- **Every listed target `deployed`** → go to **Hand off**.

**Hand off.** Applies when §5 sends the run here: every target deployed, none applicable, or `manual`. A failed or declined deploy stopped above and never reaches it. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step clear --root <run-root>` first, then pick the next command with `scope.js route`, called as `${CLAUDE_PLUGIN_ROOT}/references/shipped-run.md`'s `## Routing a shipped run` states, and take its verdict line as the route.

- The routing reads only choose the command: write no verdict and rewrite no anchor line from them.

- **It routes to re-verify** → print `/superdev:verify-ship <scope>`, with one line: a repair of this scope has closed since the `not met:` line was last observed, and verify-ship observes it again. Print `/superdev:plan` on an `Or:` line, for a repair that did not hold.
- **It routes to repair** → print `/superdev:plan`, with one line: a criterion reads `not met:`, and its repair choice plans the fix. Print the route's open-repair line for each open repair, and `/superdev:verify-ship <scope>` on an `Or:` line, for a transient observation.
- **It routes to wrap-up** → start `/superdev:wrap-up <scope>`: nothing is left to verify, and wrap-up closes the scope. A `dod.md` line unpaired on the anchor puts the hand-sync of the anchor's criterion text under `First:`, and that exit prints the command instead.
- **It routes to verify-ship** → start `/superdev:verify-ship <scope>`: it observes the open Definition-of-Done lines (`scope.js dod-open`), and `/superdev:wrap-up <scope>` closes the scope afterwards.
- **The anchor cannot be read** → print `/superdev:verify-ship <scope>`; its reconcile reads the anchor again.

**The staged pages.** Applies to every route that prints its command, a failed start included. Name the scope's staged pages with the line `scope.js staging <scope> --line` prints, per `${CLAUDE_PLUGIN_ROOT}/references/shipped-run.md`'s `## Staged pages at close`. A line beginning with a count puts `/superdev:publish-kb <scope>` on an `Or:` line of the Next block. On a started route, the chain's last message names them, whichever command ends it and whether it finishes, refuses, or stops.

**The start.** Applies to the verify-ship and wrap-up routes. Start that command per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The chain start`, after the `step clear` above and the publish; its **After the start** decides what ship prints. The re-verify, repair, and unreadable-anchor routes print their command and start nothing; a refusal follows **The closing message**. A started verify-ship starts wrap-up itself at its settled exit.
