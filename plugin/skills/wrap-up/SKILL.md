---
name: wrap-up
description: Wrap up a shipped superdev scope — check the pull request is merged, every Definition-of-Done line is settled, and every deploy target is deployed, then close the scope anchor and its slice records and take the run down. Only a human runs it, after `/superdev:ship` and, where criteria stayed open, `/superdev:verify-ship`.
disable-model-invocation: true
argument-hint: "[<scope>  (empty = the only shipped run in this repo)]"
---

# superdev wrap-up

Check that a shipped scope is fully settled, then close its anchor and take the run down (ADR 0106,
INV-0099). It dispatches no subagents and carries no unattended mode of its own: only a human runs this
command (INV-0066, INV-0093). It commits nothing to base (INV-0001).

## 1. Scope + run root

Resolve `$ARGUMENTS` to one scope — a **run root**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
`## A live scope run` section:

- **A scope slug given** → use it. No run root by that name → say so and stop.
- **Empty** → this command's own **candidate set** (CONTEXT.md) is every run root whose stage is
  `shipped`. Run `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Resolving an empty argument`
  cascade over that set, restating no part of it here.

Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md` for how to capture `<run-root>` and how the run lock
behaves. Refresh `<run-root>/run.lock` now, per that file's rule.

## 2. Stage and store

Read the stage with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get stage --root <run-root>`:

- **`closed`** → say the scope is already closed, and change nothing.
- **Below `shipped`** (`planned`, `implementing`, `merged`, `reviewed`, `documented`,
  `documented-unreviewed`, `submitted`, or no line at all) → refuse: name the command that comes first
  (`/superdev:submit-pr` for a scope short of `submitted`, `/superdev:ship` for `submitted`), and change
  nothing.
- **`shipped`** → continue.

## 3. Gate

Collect every reason that holds, then name all of them in one refusal. Change nothing while any reason
holds.

- **The pull request is not merged.** `scope.js get pr` prints a number → read that pull request by
  index, per `docs/agents/code-management.md`'s `## Merge` section, and take its `merged` field. `absent`
  (a legacy run) → test the scope branch's containment in base with `scope.js`'s exported
  `testContainment` (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Containment`; it has no CLI
  verb): `node -e "console.log(require(process.argv[1]).testContainment(process.cwd(), process.argv[2], process.argv[3]))" "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" <base> <scope-branch>`, the scope branch read with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get branch --root <run-root>` and `<base>` the base branch `docs/agents/code-management.md` names.
  Only `contained` counts as merged. Unknown counts as not merged: a failed host read, or any other
  containment verdict.
- **A Definition-of-Done line is unsettled.** Judge settledness from `<run-root>/dod.md` (INV-0016), which
  is authoritative because a store's tick write is best-effort. Read the anchor's Definition-of-Done lines,
  per `docs/agents/issue-tracker.md`, only when `dod.md` is missing. A line that is neither ticked nor
  `accepted:` holds this reason. The note's verdict (`met:`, `accepted:`) decides whether a line is settled,
  never the box: a `[x]` whose note is `ceiling:` or `not met:` counts as unsettled. Name each such line and
  `/superdev:verify-ship <scope>`. Wrap-up never offers acceptance itself: verify-ship settles the line.
- **The anchor disagrees with a settled `dod.md`.** With `dod.md` present, also read the anchor's lines.
  Pair the lines per `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s `## Pairing dod.md with the anchor`.
  A paired line whose verdict differs from `dod.md` (a failed tick write) holds this reason too: name the
  line and `/superdev:verify-ship <scope>` as the reconciler. A `dod.md` line with no text-matching line on
  the anchor holds this reason too: name the line, and say to hand-sync the anchor's criterion text to `dod.md`'s, then rerun `/superdev:wrap-up`. Name no verify-ship,
  since it cannot reconcile that line. An anchor is never closed with its criterion text out of sync.
- **A deploy target is not `deployed`.** The pull request must be merged to have a merge commit; without one
  the first reason stands alone and this read is skipped. Read the posture, the anchor's `**Deploy:**`
  line, and the deploy record per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Reading the
  posture at the merge commit`. Posture `none`, a `**Deploy:** none` or missing line, a ledger with no
  `**PR:**` header (a legacy run older than the posture), or an anchor an older version already closed →
  no such reason. Otherwise count every listed target not recorded `deployed` as a reason. Name each
  target not `deployed`, with
  `/superdev:verify-ship` for a `manual` posture and `/superdev:ship` for `auto`.

## 4. Standing unresolved defects

The gate passed. Read `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get unresolved --root <run-root>`.
Ask once per entry: close with it standing, or keep open.

- **Keep open** → refuse, and change nothing.
- **Close with it standing** → proceed. Nothing new goes to the ledger: the published Run state snapshot
  (§7) shows the entry.

## 5. Close

Close every open slice record under the anchor,
then the anchor itself, per `docs/agents/issue-tracker.md`'s own close call. Any failed store call stops the
command: report it, leave the stage and the scaffolding unchanged, and say running
`/superdev:wrap-up <scope>` again retries. Slice records already closed stay closed, so a rerun converges on
a closed anchor.

## 6. Clean up

Clean up only after a successful close, from the invoking checkout. Not from the scopetree: `git worktree
remove` refuses to remove the tree you are standing in. Each removal tolerates an item that is already
gone (a legacy run may hold no scope checkout):

- Remove this run's scopetree: `<run-root>/scopetree`, plus any slicetrees at `<run-root>/slicetrees/*`,
  then `git worktree prune`. `git worktree remove` refuses a tree holding untracked, non-ignored files (build
  output from an `auto` deploy, say). The anchor is already closed by then: report the refusal, name the
  path, leave the stage at `shipped`, so a rerun retries the cleanup (the close is idempotent), and stop.
  Never force-remove.
- Delete any leftover `slice/<scope>/*` branch.
- Remove `<run-root>/run.lock`, if it exists.
- Keep the rest of `<run-root>` — the ledger and the ticked DoD are the git-ignored paper trail.
- **Keep `.superdev/kb-pending/<scope>/`.** It holds this scope's staged knowledge-base pages, which
  outlive the run by design (ADR 0023).

**Never delete the scope branch.** `hooks/scope-prune.js` reaps it later, with the run root, once base
holds its content (ADR 0071).

## 7. Finish

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set closed --root <run-root>`, then publish the
snapshot per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section.

`.superdev/kb-pending/<scope>/` holds staged pages → print `/superdev:publish-kb <scope>` with one line on
when to run it: once the feature has reached its readers, which is later than this close. **No staged
pages** → print nothing.
