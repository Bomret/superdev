---
name: ship
description: Start only when the operator typed it, asked for it, or agreed to an offer: merge a superdev scope's pull request, pinned to the tested head, through the host's merge API — apply the repository's deploy posture to the merge, then hand off to `/superdev:verify-ship`, to `/superdev:wrap-up` when nothing is left to verify, or to `/superdev:plan` when a criterion needs a repair, offering to start the next command. Run it once `/superdev:submit-pr` has opened the pull request and it has been reviewed.
argument-hint: "[<scope>  (empty = the only run in this repo)]"
---

# superdev ship

## Role and terms

Applies to every start. You merge the pull request `/superdev:submit-pr` opened, and apply the deploy posture to the merge. You dispatch no subagent, close no anchor, write no tick, and remove no checkout, slice checkout, or lock.

- **The tip**: the local scope-branch tip, `git -C <run-root>/scopetree rev-parse <branch>`.
- **A reusable tip**: a tip `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite reusable --branch <branch> --base <base> [--whole] --root <run-root>` accepts, the call `review-scope-mode.md`'s `### 4.2 The suite gate` uses. Run it from any checkout of the repository.
- **The carry**: `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s `## The carry run`, run in `<run-root>/scopetree` with no ask. A carried tip proceeds, and ship writes no suite record for it.
- **The red exit**: merge nothing, name the result, and point at `/superdev:review <scope>` to fix it and record a new one. A review at stage `submitted` records its suite result and leaves the stage where it is.
- **The PR read**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get pr --root <run-root>`, then the pull request read by that number per `docs/agents/code-management.md`'s `## Merge` section: its `state`, `merged`, `merge_commit_sha`, `head.sha`, and `mergeable`.
- **The deployment document**: `docs/agents/deployment.md`. Its posture is its `## Posture` section's `Posture:` line. A missing document, or one with no such line, reads as posture `none`.
- **`<range-base>`**: per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`.

## Start conditions

Applies to every start. Start this command only on one of the starts below. The command carries no unattended mode of its own.

- Calling it is the consent to merge: ask no question after the gate passes beyond the asks this file names.

- The operator typed the command.
- The operator asked for it.
- The operator agreed to an offer of it, which `/superdev:submit-pr` makes, as does any command whose Next block prints it.
- Another session's brief asked for it, confirmed by the one yes `## A brief started` asks first.

## No extra question

Applies to a typed start, to a start an offer's Start option or the card's Do it here button made in the conversation that offered it, and to an offer's new-session prompt: this command's text followed by the marker line `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The offer` section defines. Ask no extra question: the operator's click on the card is the merge consent.

## A brief started

Applies when another session's brief started this command, with no offer's marker line. Your first act is one `AskUserQuestion` confirming `/superdev:ship` with its arguments. It comes before any `step set`, ledger write, store write, or host call.

- **A yes** → run the command as typed.
- **Any other answer** → write nothing and end on the Next block with the same command in its fence.

A brief is never merge consent.

## The closing message

Applies to every message this command ends on. Close it per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` and `## The offer`.

## 1. Scope + run root

**An `--unattended` argument.** Applies before anything else in this file. Say that every unattended run ends at `/superdev:submit-pr`, print `/superdev:ship <scope>` as the command an operator runs, and stop. `<scope>` is the slug the arguments carry beside `--unattended`; with none, print the bare `/superdev:ship`.

**The run root.** Applies to every other start. Resolve `$ARGUMENTS` to one scope, a **run root**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## A live scope run` section. Capture `<run-root>` and refresh `<run-root>/run.lock` now per that file.

- **A scope slug given** → use it. No run root by that name → say so and stop.
- **Empty** → this command's **candidate set** (CONTEXT.md) is every run root whose stage is `submitted`, plus every run root at `shipped` that §3 finds resumable. Run `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Resolving an empty argument` cascade over that set.

**A resumable run.** Applies to a run root at `shipped`. It is resumable when its ledger carries a `**PR:**` header, its posture at the merge commit is `auto`, and its deploy record (`scope.js deploy get`) leaves a listed target not recorded `deployed`. That is an `auto` deploy §5 stopped mid-way.

## 2. Scope checkout

Applies to every start past §1. Read the stage with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get stage --root <run-root>`.

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

**Adopting a hand merge.** Applies to a pull request whose `merged` is true. Run `suite reusable` with `--branch <head.sha>`, plain and never `--whole`, and take its bullet below. Then take the adopt's stage write.

- **Exits 0** → the merged head is a commit the suite record covers (INV-0017 states every way it does: an exact match, a Markdown-only range that needs no test run at the tip, a focused-selector carry, alone or followed by Markdown-only commits, or a recorded rerun, alone or followed by Markdown-only commits). Add no `**Degraded:**` bullet.
- **Exits 1, or no record** → run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" degraded add "the merge landed on <head.sha>, not a commit the green suite record covers"`.

**The adopt's stage write.** Applies after the adopt's `suite reusable` bullet. Set the stage to `shipped` with `scope.js stage set shipped --root <run-root>` unless it already reads that. Go to §5.

**The deploy gate.** Applies to an open pull request, before anything merges. Read the deployment document from the scope branch's tip (`git -C <run-root>/scopetree show <branch>:docs/agents/deployment.md`) and the anchor's `**Deploy:**` line per `docs/agents/issue-tracker.md`. §4 runs this gate again at the merged tip whenever its merge moves the tip.

- **A listed target the `## Targets` table lacks** → refuse: name it, and merge nothing.
- **The pull request's diff touches the deployment document** (`git -C <run-root>/scopetree diff <range-base>..<branch> -- docs/agents/deployment.md` finds anything) → print the changed posture and target lines here, before anything merges. Calling ship is the consent to exactly the commands it is about to run.

**The suite gate.** Applies after the deploy gate. Run `suite reusable` on `<branch>`, with `--whole` when **The whole-repo gate** applies.

- **Exits 0** → proceed.
- **Exits 1** → take the carry. A carried tip proceeds, and a failing carry run takes **A failing carry**.
- **No carry, or no record** → under **The whole-repo gate**, take **The whole-repo run**. Otherwise refuse: name that the tip carries no green full-suite result to reuse, run no full command, and merge nothing.

**A failing carry.** Applies to a carry run that fails at the tip, in §3, in §4's merged-tip run, or in §4's push. Record `suite set red <tip> --root <run-root>`, with `--whole` where **The whole-repo gate** added it, and take no `test-selection.md`'s `## The recorded rerun`. Then take the red exit.

**The whole-repo gate.** Applies when `docs/agents/verification.md` at the scope branch's tip (`git -C <run-root>/scopetree show <branch>:docs/agents/verification.md`) has a `## Whole-repo command` section, per `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s section of that name. Add `--whole` to the `suite reusable` call of **The suite gate** and to every `suite reusable` call in §4; **Adopting a hand merge** keeps its plain call. Without the section, every call stays as written.

**The whole-repo run.** Applies to a tip with no green whole-repo result and no carry.

- **`scope.js get suite --root <run-root>` prints `none <sha>` with no trailing `whole`, and `scope.js get unresolved` prints any bullet** → refuse: name every standing bullet, merge nothing, and point at `/superdev:review <scope>`. That record is the invalidation `/superdev:review` left, and a run here would overwrite it. Ship's own killed run records `none <sha> whole`, which is not this record.
- **Any other tip** → run the section's command in the scope checkout over the tip through `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test whole`. Record it with `suite set <green|red|denied|none> <tip> --whole --root <run-root>`.
  - **Green** → proceed.
  - **Red, denied, or killed or never started** (no verdict, recorded as `none`) → take the red exit.

**Entries standing.** Applies after the suite gate. Read every bullet with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get unresolved --root <run-root>`.

- **No output** → proceed silently.
- **Output present** → name every bullet and **ask once** whether to merge with it standing. Declined → run `step block`, stop, merge nothing, and write nothing further. Confirmed → proceed, and record in the report that the scope merged with the defect standing.

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

- **Carry** → take the carry first. A carried merged tip runs no full command and writes no record. A failing carry run takes **A failing carry**.
- **No carry, with `## Whole-repo command` configured** → run **The whole-repo run** on the merged tip in place of the full command, never beside it, recorded with `--whole`.
- **No carry otherwise** → run the full command from `docs/agents/verification.md` once over the merged scope branch through `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test full`, in the foreground with Bash's `timeout` at its ceiling (600000 ms unless `BASH_MAX_TIMEOUT_MS` raises it), and in the background only when the suite can outlast the ceiling, waiting for its end. Record it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite set <green|red|denied|none> <new-head> --root <run-root>`. A failed full run takes `test-selection.md`'s `## The recorded rerun` first: the triage record quoting the failure, then the rerun record, the failing test file alone, and the focused run; an unattributable failure stays red.
- **No `docs/agents/verification.md`, or one with zero fenced blocks** → nothing runs and no record is written.
- **A full-command result that is red, denied, or `none`** → take the red exit.

**The deploy gate again.** Applies after a clean merge moved the tip. Read the deployment document and the anchor's `**Deploy:**` line again at the merged tip, as §3's deploy gate reads them.

- **A listed target the `## Targets` table now lacks** → refuse: name it, and merge nothing.
- **The deployment document differs between `<pre-merge-tip>` and the merged tip** (`git -C <run-root>/scopetree diff <pre-merge-tip> <branch> -- docs/agents/deployment.md` finds anything) → print the changed posture and target lines, sourced from base's document, here, before anything merges on the host.

**The push.** Applies to every run that reaches it, whether or not base moved. Compare the tip with the `head.sha` §3 read.

- **Identical** → nothing to push.
- **They differ** → run `suite reusable` on the tip (`--whole` where §3 added it). **Refuses** → take the carry; a failing carry run takes **A failing carry** and pushes nothing. **No carry** → refuse the command, name that the tip carries no reusable green result, point at `/superdev:review <scope>`, and push nothing. **Accepts, or carried** → print `git -C <run-root>/scopetree log <head-sha-just-compared>..<branch> --oneline`, and go on to the push even when that log fails with "unknown revision". Then run `git push origin <scope-branch>` per `docs/agents/code-management.md`, a push of the **scope branch**, never of base.

**The push result.** Applies to a push that ran.

- **Rejected, non-fast-forward** → the pull request's head carries commits this scope branch lacks. Refuse: name that gap and merge nothing. Put fetching those commits into the scope branch on a `First:` line, and print `/superdev:review <scope>` as the next command, then `/superdev:ship <scope>` again.
- **Rejected for any other reason** (authentication, a pre-receive hook, the network) → relay git's error and merge nothing. Stop.
- **Accepted** → repeat the PR read until its `head.sha` equals the tip just pushed, at most 3 times with a short pause, the bound `plugin/references/code-management-github.md` uses for a `null` `mergeable`. Still different → the equality check refuses.

**The equality check.** Applies before the merge. The freshest `head.sha`, from the read after a push or from §3 without one, must equal the tip `suite reusable` accepted or the carry covered. They differ → refuse: name both shas, and merge nothing.

**The merge.** Applies once the equality check passes. Print the pull request, its head, the base, and the suite result or the carry outcome. Then squash-merge it into the base branch through the host's merge API, pinned to the tip, per `docs/agents/code-management.md`'s `## Merge` section: the one write this plugin makes straight onto base, and the only merge this contract admits.

- The pinned sha is the local tip, never a value read from the host. Never send a force or bypass option.
- **A host refusal** (an unmet approval, branch protection, or a head that moved since) → relay its message and merge nothing.
- **A merge call the permission classifier denies** (the tool result names a denial by Claude Code's permission classifier, auto mode's included) → merge nothing further, and try no other route to merge: no switch between `gh` and the host's API, no retry in another form. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step block --root <run-root>`. Name the denial, and name the operator's mitigation: an allow rule for the merge command in the permission settings, or `/superdev:ship <scope>` run in a mode that prompts for it.

## 5. After the merge

**Find the merge commit.** Applies after ship's merge, an adopted hand merge, or a resumed run. Repeat the PR read by the ledger's `**PR:**` number, never a value read from anywhere else.

- **`merged` reads false** → refuse: the pull request no longer reads as merged on the host. Run `step block`, change nothing else, and write no stage.
- **Otherwise** → take `merge_commit_sha` and `head.sha`.

**The stage write.** Applies after the merge commit is found. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set shipped --root <run-root>` unless the stage already reads `shipped`.

**The deploy posture.** Applies after the stage write (INV-0098: only ship runs a target's command, only under `auto`, only after the merge, only in a tree detached at the merge commit). Read the posture and the anchor's `**Deploy:**` line fresh here, never reused from §3 or §4, at the merge commit, per `${CLAUDE_PLUGIN_ROOT}/references/shipped-run.md`'s `## Reading the posture at the merge commit`. Read through the scope checkout: `git -C <run-root>/scopetree fetch origin <base>` when the commit is missing, then `git -C <run-root>/scopetree show <merge-commit-sha>:docs/agents/deployment.md`.

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

**Hand off.** Applies when §5 sends the run here: every target deployed, none applicable, or `manual`. A failed or declined deploy stopped above and never reaches it. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step clear --root <run-root>` first, then pick the next command by `${CLAUDE_PLUGIN_ROOT}/references/shipped-run.md`'s `## Routing a shipped run`.

- The routing reads only choose the command: write no verdict and rewrite no anchor line from them.

- **It routes to re-verify** → print `/superdev:verify-ship <scope>`, with one line: a repair of this scope has closed since the `not met:` line was last observed, and verify-ship observes it again. Print `/superdev:plan` on an `Or:` line, for a repair that did not hold.
- **It routes to repair** → print `/superdev:plan`, with one line: a criterion reads `not met:`, and its repair choice plans the fix. Print the route's open-repair line for each open repair, and `/superdev:verify-ship <scope>` on an `Or:` line, for a transient observation.
- **It routes to wrap-up** → print `/superdev:wrap-up <scope>`, with one line: nothing is left to verify, and wrap-up closes the scope. A `dod.md` line unpaired on the anchor puts the hand-sync of the anchor's criterion text under `First:`.
- **It routes to verify-ship** → print `/superdev:verify-ship <scope>`, with one line: it observes the Definition-of-Done lines that are neither ticked nor accepted, and `/superdev:wrap-up <scope>` closes the scope afterwards.
- **The anchor cannot be read** → print `/superdev:verify-ship <scope>`; its reconcile reads the anchor again.

**The staged pages.** Applies to every route. Name the scope's staged pages per `${CLAUDE_PLUGIN_ROOT}/references/shipped-run.md`'s `## Staged pages at close`. A count above zero puts `/superdev:publish-kb <scope>` on an `Or:` line of the Next block when that block prints.

**Offer to continue.** Applies to every route and every refusal. A resume that prints `/superdev:ship <scope>` names the same-skill exception. Ship prints nothing after a started command returns: a started verify-ship starts wrap-up itself at its settled exit.
