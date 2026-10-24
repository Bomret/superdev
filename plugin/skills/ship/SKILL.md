---
name: ship
description: Start only when the operator typed it, asked for it, or agreed to an offer: merge a superdev scope's pull request, pinned to the tested head, through the host's merge API — apply the repository's deploy posture to the merge, then hand off to `/superdev:verify-ship`, to `/superdev:wrap-up` when nothing is left to verify, or to `/superdev:plan` when a criterion needs a repair, offering to start verify-ship or wrap-up. Run it once `/superdev:submit-pr` has opened the pull request and it has been reviewed.
argument-hint: "[<scope>  (empty = the only run in this repo)]"
---

# superdev ship

Merge the pull request `/superdev:submit-pr` opened, and apply the deploy posture. It closes no anchor and
removes nothing. `/superdev:wrap-up` follows, after `/superdev:verify-ship` when anything is left to verify
(ADR 0106, ADR 0116, INV-0099), and §5 offers to start the next one (ADR 0157). It dispatches no subagents,
and carries no unattended mode of its own: it starts only when the operator typed it, asked for it, or
agreed to `/superdev:submit-pr`'s offer (ADR 0096, ADR 0157, INV-0093). Calling it at all is the consent to
merge, so nothing here asks a second question once the gate below has passed, except these: a new session
an offer started asks first (below), under `auto`, §5 asks before it deploys a `docs/agents/deployment.md`
nobody was shown (ADR 0104), and §5's hand-off asks once whether to start the next skill (ADR 0157).

Every message this command ends on closes with the Next block, per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` section (INV-0111). An attended run first makes the offer in `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The offer` section (ADR 0157), under the conditions §5 adds.

**A new session an offer started asks first** (ADR 0176, INV-0093). When the message that started this command
is an offer's new-session prompt, this command's text followed by the marker line
`${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The offer` section defines, this command's first act is one `AskUserQuestion` that asks the operator to confirm `/superdev:ship`
with its arguments, before any `step set`, ledger write, store write, or host call. A yes runs the command
as typed. Any other answer writes nothing and ends on the Next block, with the same command in its fence.
A command the operator typed, or one an offer's Start option started in the conversation that offered it,
asks no extra question.

## 1. Scope + run root

Resolve `$ARGUMENTS` to one scope — a **run root**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
`## A live scope run` section:

- **An `--unattended` argument** → this command refuses an `--unattended` argument: say that every
  unattended run ends at `/superdev:submit-pr` (INV-0093), print `/superdev:ship <scope>` as the command an
  operator runs, and stop before anything else in this file. `<scope>` is the scope slug the arguments
  carry beside `--unattended`; with none, print the bare `/superdev:ship`.
- **A scope slug given** → use it. No run root by that name → say so and stop.
- **Empty** → this command's own **candidate set** (CONTEXT.md) is every run root whose stage is
  `submitted`, plus every run root at `shipped` carrying a `**PR:**` header whose posture at the merge
  commit is `auto` and whose deploy record (`scope.js deploy get`) leaves a listed target not recorded `deployed` — an
  `auto` deploy this command's own §5 stopped mid-way (the definition §3 applies).
  Run `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Resolving an empty argument`
  cascade over that set, restating no part of it here.

Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md` for how to capture `<run-root>` and how the run lock
behaves. Refresh `<run-root>/run.lock` now, per that file's rule.

## 2. Scope checkout

Read the stage first (`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get stage --root <run-root>`). **`closed`**
→ say the scope is already closed, and change nothing: no checkout is recreated, since nothing removes
what a recreate would leave behind. Otherwise find the scope checkout per
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`, recreating it when it is absent, at `submitted`. You
need it for §4's git commands. At `shipped`, recreate nothing here: §3 decides whether the run needs a
checkout at all.

## 3. Read the pull request, and gate

Read the ledger's `**Stage:**` line with
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get stage --root <run-root>`. The first bullet's refusal records no step; every other stage records the step with
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step set ship --root <run-root>`, before any other ledger or store write. Every exit after that call ends in a `step clear`, a stage write, or `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step block --root <run-root>`: a blocked stop, a refusal, and a `First:` wait each run `step block` first. The run then takes its bullet:

- **Anything short of `submitted`** (`planned`, `implementing`, `merged`, `reviewed`, `documented`,
  `documented-unreviewed`, or no line at all) → refuse: name the missing step, print `/superdev:submit-pr`
  as what has not run yet, and merge nothing.
- **`shipped`, and the ledger carries a `**PR:**` header** (`scope.js get pr` below prints a number, never
  `absent`) → read the deploy record with
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" deploy get --root <run-root>`; the listed targets are
  the anchor's `**Deploy:**` line, per `docs/agents/issue-tracker.md`. **Every listed target reads
  `deployed`, or no target is listed** → this run finished, merge and deploy alike: report "already
  shipped", run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step clear --root <run-root>`, print the next command §5's **Hand off** picks, and stop, whether or not the scope checkout is present. An
  "already shipped" report needs no scope checkout, so recreate none. **Otherwise** read the posture at
  the merge commit, with no scope checkout, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
  `## Reading the posture at the merge commit`: from the invoking checkout, reading the pull request by the
  ledger's `**PR:**` number first (per **Find the pull request** below). **The posture is `auto`, and a listed target reads
  `pending`, `failed`, or carries no record** (a declined unshown config left it `pending`, ADR 0104; a
  session that ended between §5's stage write and its first `deploy set` left no record) → an earlier `auto`
  deploy stopped mid-way. Skip straight to **§5's "Find the merge
  commit"** below: nothing merges again. Recreate the absent scope checkout only when the posture is `auto`
  and a target is undeployed, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`, since §5's detach runs
  through it. **The posture is not
  `auto`** → this run finished too: report "already shipped", run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step clear --root <run-root>`, print the next command §5's **Hand off** picks, and stop,
  recreating nothing. Nothing to merge, and nothing to refuse.
- **`shipped`, and the ledger carries no `**PR:**` header** (`scope.js get pr` prints `absent`) → a
  version before ADR 0096 wrote this stage the moment it opened the pull request, not once it merged —
  a legacy run. Treat it exactly like `submitted` below, recreating an absent scope checkout and reading the pull request from the host, except
  its own **None found** case reports differently (see below).
- **`submitted`** → proceed.

**Find the pull request.** Read the ledger's `**PR:**` line with
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get pr --root <run-root>` — `/superdev:submit-pr` records it
the moment it opens the pull request (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The ledger`).

- **A number** → read that pull request directly, by index, per `docs/agents/code-management.md`'s
  `## Merge` section: its `state`, `merged`, `merge_commit_sha`, `head.sha`, and `mergeable`. That read
  finding nothing (a deleted pull request, a stale number) falls through to **None found** below, the
  same as the lookup finding none.
- **`absent`** (a ledger from before this header existed) → fall back to the code host's own
  find-open-pull-requests-by-head-branch call, per `docs/agents/code-management.md`'s `## Merge` section,
  filtered to **open** pull requests only — never closed or merged ones. A reused branch name
  (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope branch`) leaves old, merged pull
  requests on the host under the same head, and adopting one of those as this run's own would be
  INV-0092's exact failure — restricting the fallback to open pull requests is what keeps it from ever
  reaching one. **Exactly one** → read it the same way, by index, and record it right away with
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" pr set <n> --root <run-root>`, so this run finishes with
  the ledger's own `**PR:**` header and a later `/superdev:ship` on it reads as finished — "already
  shipped" — rather than as a legacy run. **Two or more** → refuse: name how many
  the lookup found, and merge nothing — this is the one case the ledger's own number would have resolved
  outright. **Zero** → falls through to **None found** below, the same as the indexed read finding
  nothing.

Either way:

- **None found** → refuse, and name both cases the operator has to tell apart rather than guessing which
  applies: **no pull request was ever opened** (the `push-only` posture opens none) — print
  `/superdev:submit-pr`; or **one was opened and has since merged or closed by hand**, outside this
  command's own bookkeeping — find its number on the host, record it with
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" pr set <n> --root <run-root>`, then run
  `/superdev:ship <scope>` again, which reads it by index and adopts or refuses as usual. Merge nothing
  either way. **Reached from a legacy `shipped` ledger rather than `submitted`** → skip the `pr set`
  recovery above: the run already shipped under the old meaning, so report that nothing is left to
  merge, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step clear --root <run-root>`, change nothing else, and refuse nothing.
- **Closed, and `merged` is false** → refuse: name that it was closed without merging, and merge nothing.
- **`merged` is true** → **adopt it, then skip straight to §5.** Its `head.sha` reusable off the ledger's
  last recorded green suite result — `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite reusable
  --branch <head.sha> --base <base> --root <run-root>` (plain, never `--whole`: an adopted hand merge is
  not a merge superdev makes, INV-0092), the same reuse `/superdev:review`'s own gate
  uses — exits 0 → the merged head is a commit the suite record covers (INV-0017 states every way it does: an exact match, a
  Markdown-only range, a focused-selector carry, or a recorded rerun), no `**Degraded:**` bullet. Exits 1, or no record
  at all → `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" degraded add "the merge landed on <head.sha>,
  not a commit the green suite record covers"`. Either way, set the stage to `shipped`
  (`scope.js stage set shipped --root <run-root>`) unless it already reads that, and publish the
  snapshot, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section.
- **Open** → continue below.

**Deploy gate, before anything merges.** Read `docs/agents/deployment.md` from the scope branch's own tip
(`git -C <run-root>/scopetree show <branch>:docs/agents/deployment.md` — no such file → posture `none`).
Read the posture from that document's own `Posture:` line, in its `## Posture`
section — a document carrying no such line reads as posture `none`, the same as no document at all. Read
the anchor's `**Deploy:**` line, per `docs/agents/issue-tracker.md`. **A listed
target the `## Targets` table lacks** → refuse: name it, and merge nothing. **The pull request's diff
touches `docs/agents/deployment.md`** (`git -C <run-root>/scopetree diff <range-base>..<branch> --
docs/agents/deployment.md` finds anything; `<range-base>` per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`) → print the changed posture and target lines right here, before
anything merges — calling ship is the consent to exactly the commands it is about to run. **§4 re-runs
this same gate at the merged tip whenever its own merge moves it** — that later tip's tree, not this one,
is what the pinned squash lands and what §5's deploy step reads fresh at the merge commit.

**The tip needs a reusable green result before anything else runs.**
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite reusable --branch <branch> --base <base>
--root <run-root>` — the same call `/superdev:review`'s own scope-mode gate uses. Which checkout you run it from does not matter: every worktree of a repository shares the same
refs and objects, so `<branch>` resolves identically wherever `git` is invoked from inside it. Exit 1, or
no record at all → refuse: name that the tip carries no green full-suite result to reuse (INV-0017), and
merge nothing.

**A whole-repo command extends that gate** (ADR 0105, INV-0092). Read `docs/agents/verification.md` from
the scope branch's own tip (`git -C <run-root>/scopetree show <branch>:docs/agents/verification.md`) for a
`## Whole-repo command` section, per `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s section of that
name. **The section is present** → add `--whole` to the `suite reusable` call above and to every later
`suite reusable` call in §4. **Exit 1, or no record at all** → the tip carries no green whole-repo result.
**Check first for a standing finding:** `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get suite --root
<run-root>` prints `none <sha>` with no trailing `whole`, whatever `<sha>` is (the record
`/superdev:review` left when it invalidated a tip) and `scope.js get unresolved` prints any bullet →
refuse: name every standing bullet, merge nothing, and point at `/superdev:review <scope>`. A run here
would overwrite that invalidation with a result the finding does not earn. Ship's own killed run records
`none <sha> whole`, which is not this record: it carries the kind. **Any other tip** → run the whole-repo command yourself on it: take the command from that
section, run it in the scope checkout over that tip through `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test whole`, and record what happened with
`suite set <green|red|denied|none> <tip> --whole --root <run-root>`. **Green** → proceed. **Red, denied, or
killed or never started (no verdict, INV-0009; recorded as `none`)** → merge nothing. Name the result and
point at `/superdev:review <scope>` to fix it and record a new one. §4 applies this same rule to the
merged tip of a moved base. **No such section** → the call stays as written, so the gate is unchanged.

**Entries standing.** Read every bullet with
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get unresolved --root <run-root>` — one bullet per line.
**No output** → proceed silently. **Output present** → name every bullet and **ask once** whether to
merge with it standing. Declined → stop, merge nothing, write nothing further. Confirmed → proceed and record in
the report that the scope merged with the defect standing.

## 4. Base moved, then the merge

**Capture the tip before merging** — `git -C <run-root>/scopetree rev-parse <branch>` — as
`<pre-merge-tip>`; §3's gate just read `docs/agents/deployment.md` at this commit. **Check numbering
collisions before the merge** (ADR 0126, INV-0134): run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js"
collisions --base <base> --branch <branch> --range-base <range-base>`, `<range-base>` per
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`, and one `--also <ref>`
for each other live plan run's scope branch whose ref resolves, as that file's base step chooses them
(`## Bringing the scope branch to base`, step 4). Exit 0 → continue. Exit 1
→ merge nothing and change nothing on the scope branch: print each line, which names the colliding ADR
number or invariant id and the number it should take, and point at renumbering it on the scope branch,
then `/superdev:review <scope>`, then `/superdev:ship <scope>` — the recovery a conflict below takes too,
because a renumber is a change nobody has reviewed. Exit 2 → the check could not run: name its message,
merge nothing, and never read it as no collision. **Merge base into the
scope branch, in the scope checkout, by its literal absolute path** —
`git -C <run-root>/scopetree merge <base>`, `<run-root>` spelled out as the real path in the command text
itself, never a shell variable: `hooks/run-trace.js` and `hooks/merge-guard.js` read the command text
alone, and cannot resolve one. Base already an ancestor of the scope branch's tip → nothing moved, nothing to test: go straight to
the push below.

- **A conflict** — `git` leaves it unresolved (`MERGE_HEAD` still set) → list the conflicting files
  (`git -C <run-root>/scopetree diff --name-only --diff-filter=U`), then
  `git -C <run-root>/scopetree merge --abort`, and stop: merge nothing. Point at `/superdev:review <scope>`
  to resolve them — a resolution is new code nobody has reviewed, so it goes back through the gate rather
  than past it.
- **A clean merge** → take the carry first, per `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s
  `## The carry run`: a carried merged tip runs no full command and writes no record, and a failing carry run
  is the red result below, recorded `red` at the merged tip. A failed full run takes `## The recorded rerun` of the same
  file before it stands as the red result: the triage record quoting the failure first, then the rerun record, the file
  alone, and the focused run; an unattributable failure stays red. Only a tip with no carry takes the full command
  from `docs/agents/verification.md`, run once over the merged scope branch through `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test full` (in the background when the
  suite outlasts the Bash tool's time limit, waiting for its end before acting on it), and record what
  happened with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite set <green|red|denied|none> <new-head>
  --root <run-root>` (ADR 0155).
  **With a `## Whole-repo command` section configured (§3)**, the whole-repo run §3 states applies to the
  merged tip instead: the merged tip carries no green whole-repo record, and that whole-repo run replaces
  the full-command run on the merged tip, never adding a second run beside it, recorded with
  `suite set <green|red|denied|none> <new-head> --whole --root <run-root>`. **No
  `docs/agents/verification.md`, or one carrying zero fenced blocks** → nothing runs and no record is
  written.
- **Red, denied, or a killed or never-started run (a `none` result)** → merge nothing. Name the result and point at `/superdev:review <scope>`
  to fix it and record a new one — a review at stage `submitted` records its suite result and leaves the
  stage where it is.

**Re-run the deploy gate, at the merged tip.** This merge just moved `<branch>` past `<pre-merge-tip>`, so
§3's read is stale. Read `docs/agents/deployment.md` from the scope branch's own tip again (`git -C
<run-root>/scopetree show <branch>:docs/agents/deployment.md` — no such file → posture `none`), and the
posture from its own `Posture:` line, the same reading rule §3 used. Read the anchor's `**Deploy:**` line
again, per `docs/agents/issue-tracker.md`. **A listed target the `## Targets` table now lacks** → refuse:
name it, and merge nothing. **`docs/agents/deployment.md` differs between `<pre-merge-tip>` and the
now-merged tip** (`git -C <run-root>/scopetree diff <pre-merge-tip> <branch> -- docs/agents/deployment.md`
finds anything) → print the changed posture and target lines, sourced from base's own document, right
here, before anything merges on the host — the same consent §3 already asked, now against what the merge
actually carries.

**Push the tip, only once it carries a green record.** The pull request's own head has to be the commit a
reusable green suite record covers (INV-0017), so compare the scope branch's own tip against the `head.sha` §3 read (`git -C
<run-root>/scopetree rev-parse <branch>` against that sha), whether or not base moved above — a review's
own fix loop, or an operator's own conflict resolution, can land commits at stage `submitted` with no base
merge involved, and those never reach the pull request either without this same push.

- **Identical** → nothing to push; the remote head is already the tip.
- **They differ** → the tip needs its own reusable green result before it goes anywhere:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite reusable --branch <branch> --base <base> [--whole]
  --root <run-root>`, the same call §3 already ran on the pre-merge tip. **Refuses** → refuse the whole command,
  name that the tip carries no reusable green result, and point at `/superdev:review <scope>` — never push
  an untested tip. **Accepts** → print the range this push is about to add, `git -C <run-root>/scopetree
  log <head-sha-just-compared>..<branch> --oneline` — a `head-sha-just-compared` this checkout never
  fetched (someone pushed to the pull request from elsewhere since §3's read) fails that log with
  "unknown revision"; the push itself is the real gate either way, so move straight to it regardless —
  then `git push origin <scope-branch>` (per `docs/agents/code-management.md`) — a push of the **scope
  branch**, never of base (INV-0001, INV-0087) — before the merge below.
  - **Rejected, non-fast-forward** → the pull request's head carries commits this scope branch lacks.
    Refuse: name that gap, merge nothing, and point at fetching those commits into the scope branch and
    running `/superdev:review <scope>` — which tests and records the new tip — then `/superdev:ship
    <scope>` again.
  - **Rejected for any other reason** — authentication, a pre-receive hook, the network — relay git's
    own error and merge nothing. Ship stops here; the equality check below never runs on a stale head.
  - **Accepted** → re-read the pull request (§3's own read) until its `head.sha` equals the tip just
    pushed, at most 3 times with a short pause — the same bound
    `plugin/references/code-management-github.md` uses for a `null` `mergeable`. Still different after
    the last read → the equality check below is what refuses, naming both shas and merging nothing.

**One equality check, before anything merges.** The freshest `head.sha` — the re-read above when a push
ran, the one §3 already read when it did not — must equal the local scope-branch tip (`git -C
<run-root>/scopetree rev-parse <branch>`), the one `suite reusable` just accepted. **They differ** →
refuse: name both shas, and merge nothing. The push rejection above catches most of the ways a foreign
commit could still sit on the pull request's head; this check is what catches the rest — a push landing on
it from elsewhere between that comparison and this line — and is what actually guarantees the merge below
lands the commit a reusable green suite record covers, not the push rule alone.

**The merge, pinned.** Print what you are about to merge: the pull request, its head (the scope branch's
own tip, moved or not), the base, and the suite result. Then squash-merge it into the base branch through
the host's merge API, pinned to that tip, per `docs/agents/code-management.md`'s `## Merge` section — the
one write this plugin makes straight onto it (INV-0001), and the only merge this contract admits. **The
sha the merge call pins is the local scope-branch tip `suite reusable` just accepted, never a value read
from the host** — the equality check above is what makes sending it safe. Never send a force or bypass
option. **A host refusal** (an unmet approval, branch protection, or a head that moved since) → relay its
own message and merge nothing.

## 5. After the merge

**Find the merge commit.** Read the pull request once more, by the ledger's `**PR:**` number (§3's own
read) — never a value read from anywhere else, so the deploy below runs exactly what the host merged.
**`merged` reads false** → refuse: the pull request no longer reads as merged on the host, and change
nothing — the stage write below never runs. **Otherwise** → take `merge_commit_sha` and `head.sha`.

Set the ledger's `**Stage:**` line to `shipped` with
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set shipped --root <run-root>`, unless it already
reads `shipped` (§3's adopt branch, or a resumed run reached straight from §3's `shipped`-with-open-deploy
branch). Publish the snapshot afterwards, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
`## Publishing run state` section.

**Deploy** (ADR 0101; INV-0098 — only ship ever runs a target's command, only under `auto`, only after the
merge, only in a tree detached at the merge commit). Read the posture and the anchor's `**Deploy:**` line
fresh here, for ship's own merge, an adopted hand merge, or a resumed run alike — never reused from §3's
or §4's earlier, pre-merge read — at the merge commit just found, never the working tree or the invoking
checkout, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Reading the posture at the merge commit`.
This step holds the scope checkout, so it reads through it: `git -C <run-root>/scopetree fetch origin <base>`
when the commit is missing, then
`git -C <run-root>/scopetree show <merge-commit-sha>:docs/agents/deployment.md`.

- **`none`, a `**Deploy:** none` line, or no `**Deploy:**` line** → deploy nothing. Say so in one line and
  go straight to the hand-off below.
- **`manual`** → print each listed target's command not already recorded `deployed`, in listed order, and
  record each
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" deploy set <target> pending --root <run-root>`. Go
  straight to the hand-off below.
- **`auto`** → fetch the base branch and detach the scopetree at the merge commit —
  `git -C <run-root>/scopetree fetch origin <base>` then
  `git -C <run-root>/scopetree checkout --detach <merge-commit-sha>` — the invoking checkout is never
  switched or pulled (ADR 0045).

  **Before any target runs, show what nobody was shown** (ADR 0104, INV-0104). Compare the merge commit's
  document with the tested head's — `git -C <run-root>/scopetree diff <tested-head> <merge-commit-sha> --
  docs/agents/deployment.md`, `<tested-head>` being the `head.sha` just read. A base change that lands on
  the host between §4's gate and the squash reaches the merge commit this way, unprinted. A document present
  on one side only reads as posture `none` on the other, and counts as a difference. **A diff that fails to
  run at all** — an unknown revision, such as a `<tested-head>` this scopetree never fetched — counts as
  non-empty too: the comparison could not run, so ask, saying so, rather than read the silence as nothing
  changed. **This invocation ran no §3/§4 gate of its own** — an adopted hand merge, or a resumed deploy
  reached from §3's `shipped` branch → take the pull request's own change to the document too, diffed from
  the fork point rather than the merge commit's lone parent, since a rebase or fast-forward merge carries an
  earlier commit's own change to the document that `<merge-commit-sha>^` alone would miss. Find the fork
  point as its own step, `git -C <run-root>/scopetree merge-base <tested-head> <merge-commit-sha>`: a
  non-zero exit or empty output counts as non-empty, because an empty `<fork-point>` turns the diff below
  into one against the working tree, which reads as nothing changed. Then diff `git -C <run-root>/scopetree diff <fork-point> <merge-commit-sha> --
  docs/agents/deployment.md`: no gate printed it. A failure here counts as non-empty for the same reason.

  - **Either diff non-empty** → print the changed posture and target lines, or the diff itself when no
    posture or target line changed, and ask once whether to deploy under them. **Confirmed** → run the
    targets below. **Declined** → deploy nothing: record
    `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" deploy set <target> pending --root <run-root>` for every
    listed target the deploy record (`scope.js deploy get`) does not yet name, so the run stays in §1's
    candidate set, and print `/superdev:ship <scope>` as the resume, which asks again. Stop.
  - **Both diffs empty** → ask nothing, and run the targets below.

  Run every listed target's command not already recorded `deployed`, in
  listed order, right there, in the foreground, relaying its output to the operator as it runs:
  - **A listed target the `## Targets` table lacks** (reachable only here — ship's own merge already
    refused this in §3, or in §4's re-run when base moved the tip, before anything merged) → stop exactly
    as a failed target does below: name it and stop.
  - **Exit 0** → record `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" deploy set <target> deployed --root
    <run-root>` and run the next target.
  - **A non-zero exit** → record `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" deploy set <target> failed
    --exit <n> --root <run-root>`, name every target not yet deployed, and print `/superdev:ship <scope>` as the resume — it re-reads the merge
    commit above and starts again at the first target this run left undeployed. Stop.
  - **Every listed target now `deployed`** → go on to the hand-off below.

**Hand off.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step clear --root <run-root>` first: every target is deployed or none applies, and a run that wrote no stage has no other clear. A failed or declined deploy stopped above and runs no clear here; on a resumed run its step stays standing. Ship writes no tick anywhere, closes no anchor, and removes no checkout, slice checkout, or
lock: the anchor stays open and the run stays standing until `/superdev:wrap-up` (ADR 0106, INV-0099). Pick
the next command by `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
`## Routing a shipped run` (ADR 0116, INV-0116). Its reads only choose the command: ship writes no verdict
and rewrites no anchor line from them.

- **It routes to re-verify** → print `/superdev:verify-ship <scope>` as the next command, with one line: a
  repair of this scope has closed since the `not met:` line was last observed, and verify-ship observes
  the line again. Print
  `/superdev:plan` on an `Or:` line, for a repair that did not hold.
- **It routes to repair** → print `/superdev:plan` as the next command, with one line: a criterion reads
  `not met:`, and its repair choice plans the fix. Print the route's open-repair line for each open repair. Print `/superdev:verify-ship <scope>` on an `Or:` line,
  for an observation that was transient.
- **It routes to wrap-up** → print `/superdev:wrap-up <scope>` as the next command, with one line: nothing
  is left to verify, and wrap-up closes the scope. A `dod.md` line unpaired on the anchor puts the hand-sync
  of the anchor's criterion text under `First:`.
- **It routes to verify-ship** → print `/superdev:verify-ship <scope>` as the next command, with one line on
  what it does: it observes the Definition-of-Done lines that are neither ticked nor accepted, and
  `/superdev:wrap-up <scope>` closes the scope afterwards.
- **The anchor cannot be read** → print `/superdev:verify-ship <scope>`, as above: its own reconcile reads
  the anchor again.

On every route above, name the scope's staged pages per
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Staged pages at close` (ADR 0119, INV-0123), with
`/superdev:publish-kb <scope>` on an `Or:` line of the Next block when the count is above zero.

**Offer to continue** (ADR 0157, INV-0093). Make the offer in `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The offer` section, with ship's own conditions added:
the merge landed, every listed deploy target is recorded `deployed`
or none is listed, and the route is **It routes to verify-ship**, **It routes to wrap-up** with no `dod.md`
line unpaired on the anchor, or **The anchor cannot be read**. A target recorded `pending` or `failed`, or
carrying no record, gives no offer.

**No offer** is made for a run that routes to repair or to re-verify, a run with a hand-sync pending, a
refused ship, or a ship stopped by a failed or declined deploy: print the route above and stop.

The message that asks also names the scope's staged pages per `## Staged pages at close`. When the count is above
zero, `/superdev:publish-kb <scope>` goes on the Next block's `Or:` line when that block prints. A yes
starts the routed skill exactly as the operator would type it, with the scope slug as its only
argument. Ship starts no wrap-up after a started verify-ship returns: verify-ship's own hand-off makes its
own offer.
