---
description: "Merge a superdev scope's pull request, pinned to the tested head, through the host's merge API — close the scope anchor and clean up the run. Only a human runs it, once `/superdev-submit-pr` has opened the pull request and it has been reviewed."
---

# superdev ship

Merge the pull request `/superdev-submit-pr` opened. It dispatches no subagents, and carries no
unattended mode of its own: only a human runs this command (ADR 0096). Calling it at all is the consent
to merge, so nothing here asks a second question once the gate below has passed.

## 1. Scope + run root

Resolve `$ARGUMENTS` to one scope — a **run root**, per `<plugin-root>/references/scope-mode.md`'s
`## A live scope run` section:

- **A scope slug given** → use it. No run root by that name → say so and stop.
- **Empty** → this command's own **candidate set** (CONTEXT.md) is every run root whose stage is
  `submitted`. Run `<plugin-root>/references/scope-mode.md`'s `## Resolving an empty argument`
  cascade over that set, restating no part of it here.

Read `<plugin-root>/references/scope-mode.md` for how to capture `<run-root>` and how the run lock
behaves. Refresh `<run-root>/run.lock` now, per that file's rule.

## 2. Scope checkout

Find the scope checkout per `<plugin-root>/references/scope-mode.md`. You need it for §4's git
commands.

## 3. Read the pull request, and gate

Read the ledger's `**Stage:**` line with
`node "<plugin-root>/scripts/scope.js" get stage --root <run-root>`:

- **Anything short of `submitted`** (`planned`, `implementing`, `merged`, `reviewed`, `documented`,
  `documented-unreviewed`, or no line at all) → refuse: name the missing step, print `/superdev-submit-pr`
  as what has not run yet, and merge nothing.
- **`shipped`, and the ledger carries a `**PR:**` header** (`scope.js get pr` below prints a number, never
  `absent`) → this run already shipped, finished by this version: report "already shipped" and stop.
  Nothing to merge, and nothing to refuse.
- **`shipped`, and the ledger carries no `**PR:**` header** (`scope.js get pr` prints `absent`) → a
  version before ADR 0096 wrote this stage the moment it opened the pull request, not once it merged —
  a legacy run. Treat it exactly like `submitted` below, reading the pull request from the host, except
  its own **None found** case reports differently (see below).
- **`submitted`** → proceed.

**Find the pull request.** Read the ledger's `**PR:**` line with
`node "<plugin-root>/scripts/scope.js" get pr --root <run-root>` — `/superdev-submit-pr` records it
the moment it opens the pull request (`<plugin-root>/references/scope-mode.md`'s `## The ledger`).

- **A number** → read that pull request directly, by index, per `docs/agents/code-management.md`'s
  `## Merge` section: its `state`, `merged`, `merge_commit_sha`, `head.sha`, and `mergeable`. That read
  finding nothing (a deleted pull request, a stale number) falls through to **None found** below, the
  same as the lookup finding none.
- **`absent`** (a ledger from before this header existed) → fall back to the code host's own
  find-open-pull-requests-by-head-branch call, per `docs/agents/code-management.md`'s `## Merge` section,
  filtered to **open** pull requests only — never closed or merged ones. A reused branch name
  (`<plugin-root>/references/scope-mode.md`'s `## The scope branch`) leaves old, merged pull
  requests on the host under the same head, and adopting one of those as this run's own would be
  INV-0092's exact failure — restricting the fallback to open pull requests is what keeps it from ever
  reaching one. **Exactly one** → read it the same way, by index, and record it right away with
  `node "<plugin-root>/scripts/scope.js" pr set <n> --root <run-root>`, so this run finishes with
  the ledger's own `**PR:**` header and a later `/superdev/ship` on it reads as finished — "already
  shipped" — rather than as a legacy run. **Two or more** → refuse: name how many
  the lookup found, and merge nothing — this is the one case the ledger's own number would have resolved
  outright. **Zero** → falls through to **None found** below, the same as the indexed read finding
  nothing.

Either way:

- **None found** → refuse, and name both cases the operator has to tell apart rather than guessing which
  applies: **no pull request was ever opened** (the `push-only` posture opens none) — print
  `/superdev-submit-pr`; or **one was opened and has since merged or closed by hand**, outside this
  command's own bookkeeping — find its number on the host, record it with
  `node "<plugin-root>/scripts/scope.js" pr set <n> --root <run-root>`, then run
  `/superdev/ship <scope>` again, which reads it by index and adopts or refuses as usual. Merge nothing
  either way. **Reached from a legacy `shipped` ledger rather than `submitted`** → skip the `pr set`
  recovery above: the run already shipped under the old meaning, so report that nothing is left to
  merge, change nothing, and refuse nothing.
- **Closed, and `merged` is false** → refuse: name that it was closed without merging, and merge nothing.
- **`merged` is true** → **adopt it, then skip straight to §5.** Its `head.sha` reusable off the ledger's
  last recorded green suite result — `node "<plugin-root>/scripts/scope.js" suite reusable
  --branch <head.sha> [--plan-files] --root <run-root>`, the same reuse `/superdev-review`'s own gate
  uses — exits 0 → the merged head is the tested commit, no `**Degraded:**` bullet. Exits 1, or no record
  at all → `node "<plugin-root>/scripts/scope.js" degraded add "the merge landed on <head.sha>,
  not the tested commit"`. Either way, set the stage to `shipped`
  (`scope.js stage set shipped --root <run-root>`) unless it already reads that, and publish the
  snapshot, per `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section.
- **Open** → continue below.

**The tip needs a reusable green result before anything else runs.**
`node "<plugin-root>/scripts/scope.js" suite reusable --branch <branch> [--plan-files]
--root <run-root>` — the same call, and the same `--plan-files` rule, `/superdev-review`'s own scope-mode
gate uses. Which checkout you run it from does not matter: every worktree of a repository shares the same
refs and objects, so `<branch>` resolves identically wherever `git` is invoked from inside it. Exit 1, or
no record at all → refuse: name that the tip carries no green full-suite result to reuse (INV-0017), and
merge nothing.

**Entries standing.** Read every bullet with
`node "<plugin-root>/scripts/scope.js" get unresolved --root <run-root>` — one bullet per line.
**No output** → proceed silently. **Output present** → name every bullet and **ask once** whether to
merge with it standing. Declined → stop, merge nothing, write nothing. Confirmed → proceed and record in
the report that the scope merged with the defect standing.

## 4. Base moved, then the merge

**Merge base into the scope branch, in the scope checkout, by its literal absolute path** —
`git -C <run-root>/scopetree merge <base>`, `<run-root>` spelled out as the real path in the command text
itself, never a shell variable: `hooks/green-gate.js` reads the command text alone, and cannot resolve
one. Base already an ancestor of the scope branch's tip → nothing moved, nothing to test: go straight to
the push below.

- **A conflict** — `git` leaves it unresolved (`MERGE_HEAD` still set) → list the conflicting files
  (`git -C <run-root>/scopetree diff --name-only --diff-filter=U`), then
  `git -C <run-root>/scopetree merge --abort`, and stop: merge nothing. Point at `/superdev-review <scope>`
  to resolve them — a resolution is new code nobody has reviewed, so it goes back through the gate rather
  than past it.
- **A clean merge** — `hooks/green-gate.js` fires on that `git merge` command itself and runs the command
  `<plugin-root>/references/test-selection.md` picks. **Its focused fence is textually identical to
  the full one** (`docs/agents/verification.md`) → the gate's own pass already is the full run: record it
  with `node "<plugin-root>/scripts/scope.js" suite set green <new-head> --root <run-root>` and run
  nothing more. **Otherwise, or the gate could not run** (denied, or no `verification.md`) → take the full
  command from `docs/agents/verification.md` yourself, run it over the merged scope branch, and record
  what happened the same way (`suite set <green|red|denied|none> <new-head> --root <run-root>`).
- **Red, or the run was denied** → merge nothing. Name the result and point at `/superdev-review <scope>`
  to fix it and record a new one — a review at stage `submitted` records its suite result and leaves the
  stage where it is.

**Push the tip, only once it carries a green record.** The pull request's own head has to be the commit a
full suite actually ran on, so compare the scope branch's own tip against the `head.sha` §3 read (`git -C
<run-root>/scopetree rev-parse <branch>` against that sha), whether or not base moved above — a review's
own fix loop, or an operator's own conflict resolution, can land commits at stage `submitted` with no base
merge involved, and those never reach the pull request either without this same push.

- **Identical** → nothing to push; the remote head is already the tip.
- **They differ** → the tip needs its own reusable green result before it goes anywhere:
  `node "<plugin-root>/scripts/scope.js" suite reusable --branch <branch> [--plan-files] --root
  <run-root>`, the same call §3 already ran on the pre-merge tip. **Refuses** → refuse the whole command,
  name that the tip carries no reusable green result, and point at `/superdev-review <scope>` — never push
  an untested tip. **Accepts** → print the range this push is about to add, `git -C <run-root>/scopetree
  log <head-sha-just-compared>..<branch> --oneline` — a `head-sha-just-compared` this checkout never
  fetched (someone pushed to the pull request from elsewhere since §3's read) fails that log with
  "unknown revision"; the push itself is the real gate either way, so move straight to it regardless —
  then `git push origin <scope-branch>` (per `docs/agents/code-management.md`) — a push of the **scope
  branch**, never of base (INV-0001, INV-0087) — before the merge below.
  - **Rejected, non-fast-forward** → the pull request's head carries commits this scope branch lacks.
    Refuse: name that gap, merge nothing, and point at fetching those commits into the scope branch and
    running `/superdev-review <scope>` — which tests and records the new tip — then `/superdev/ship
    <scope>` again.
  - **Accepted** → re-read the pull request (§3's own read), so its `head.sha` is the tip just pushed.

**One equality check, before anything merges.** The freshest `head.sha` — the re-read above when a push
ran, the one §3 already read when it did not — must equal the local scope-branch tip (`git -C
<run-root>/scopetree rev-parse <branch>`), the one `suite reusable` just accepted. **They differ** →
refuse: name both shas, and merge nothing. The push rejection above catches most of the ways a foreign
commit could still sit on the pull request's head; this check is what catches the rest — a push landing on
it from elsewhere between that comparison and this line — and is what actually guarantees the merge below
lands the commit a green full suite ran on, not the push rule alone.

**The merge, pinned.** Print what you are about to merge: the pull request, its head (the scope branch's
own tip, moved or not), the base, and the suite result. Then squash-merge it into the base branch through
the host's merge API, pinned to that tip, per `docs/agents/code-management.md`'s `## Merge` section — the
one write this plugin makes straight onto it (INV-0001), and the only merge this contract admits. **The
sha the merge call pins is the local scope-branch tip `suite reusable` just accepted, never a value read
from the host** — the equality check above is what makes sending it safe. Never send a force or bypass
option. **A host refusal** (an unmet approval, branch protection, or a head that moved since) → relay its
own message and merge nothing.

## 5. After the merge

Close the scope anchor on a remote store — per `docs/agents/issue-tracker.md`, right here; the local
plan-file store's own close already rode the pull request, as a commit `/superdev-submit-pr` made before
its push. Set the ledger's `**Stage:**` line to `shipped` with
`node "<plugin-root>/scripts/scope.js" stage set shipped --root <run-root>`, unless §3's adopt
branch already set it. Publish the snapshot afterwards, per
`<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section. Ship writes no tick
anywhere.

**From the invoking checkout, not the scopetree** — `git worktree remove` refuses to remove the tree you
are standing in:

- Remove this run's scopetree: `<run-root>/scopetree`, plus any leftover slicetrees at
  `<run-root>/slicetrees/*`, then `git worktree prune`.
- Delete any leftover `slice/<scope>/*` branch (merged into the scope branch, so it only clutters).
- Remove `<run-root>/run.lock`, if it exists.
- Keep the rest of `<run-root>` — the ledger and the ticked DoD are the git-ignored paper trail.
- **Keep `.superdev/kb-pending/<scope>/`.** It is outside the run root and holds this scope's staged
  knowledge-base pages, which outlive the run by design (ADR 0023).

**Never delete the scope branch.** `hooks/scope-prune.js` reaps it later, with the run root, once base
holds its content (ADR 0071).

**Point at the publish, when pages are waiting.** `.superdev/kb-pending/<scope>/` holds staged pages →
print `/superdev-publish-kb <scope>` with one line on when to run it: once the feature has reached its
readers, which is later than this merge. Superdev cannot detect that moment, which is why nothing here
does it for you. **No staged pages** → print nothing.
