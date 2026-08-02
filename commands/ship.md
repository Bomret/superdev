---
description: Close out a superdev scope — tick the Definition of Done, close the scope anchor, open the PR, and clean up the run. The last step of the implement chain; run it after /superdev:review and /superdev:document.
argument-hint: "[<scope>  (empty = the only run in this repo)]  [--unattended]"
---

# superdev ship

End a run. Every slice is on the scope branch, the scope has been reviewed, and the docs have been
reconciled — this command turns that into a pull request and takes the run's scaffolding down. It
dispatches no subagents: everything here is yours.

## 1. Scope + run root

**`--unattended`, if present, comes out first** — per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
**Unattended** section, it is never part of the scope slug below.

Resolve `$ARGUMENTS` to one scope:

A **run root** is a `.superdev/scopes/*/` directory that holds a `ledger.md`.

- **A scope slug given** → use it. No run root by that name → say so and stop.
- **Empty, exactly one run root** → use it.
- **Empty, no run root** → report `No superdev run found in this repo.` and stop. Create nothing.
- **Empty, more than one run root** → list them with each one's stage and ask which to ship. Never guess.
  **`--unattended` → block** instead of asking, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
  **Unattended** section: picking a scope for someone is not a guess worth making unattended, and afk
  always names a slug so this bullet is unreachable from a sweep — the catch-all is what makes an
  otherwise-silent stop safe if that ever stops holding.

Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md` for how to capture `<run-root>` and how the run lock
behaves. Refresh `<run-root>/run.lock` now, per that file's rule.

## 2. Scope checkout

Find the scope checkout per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`. You need it for §5's git
commands. **§6 runs from the invoking checkout instead** — see there.

## 3. Stage gate (warn once, never block)

Read the ledger's `**Stage:**` line:

- **`shipped`** → this scope is already shipped. Report that, print the existing pull request if the code
  host still lists one, and stop. Never open a second.
- **`documented`** → the whole chain ran. Proceed silently.
- **`documented-unreviewed`** → `/superdev:document` ran, but the ledger's stage was earlier than
  `reviewed` when it did, so the review step never ran. Treat this exactly like the review-missing case
  below: name `/superdev:review` as missing and **ask once**.
- **Anything earlier** (`implementing`, `merged`, `reviewed`), or **no line at all** → name exactly what
  has not run (`/superdev:review`, `/superdev:document`, or both) and **ask once** whether to ship anyway.
  Declined → stop and print the missing command. Confirmed → proceed and record in the report that the
  scope shipped without it. **`--unattended` → refuse**: name what is missing, open no pull request, and stop.
  A caller that drove the whole chain never reaches this bullet, so reaching it unattended means a step
  really was skipped — and shipping unreviewed code is not a decision a token stands in for.
- **Every slice in the ledger is `mechanical` or `docs`** → drop `/superdev:review` from that warning,
  whether it applies to this bullet or to `documented-unreviewed` above. Such a scope skips the
  whole-scope review by design (the suite is the net), so naming it as missing would train the reader to
  dismiss the question. If that drop empties the warning (review was the only thing missing), there is
  nothing left to name. Proceed silently instead of asking about an empty list.

## 4. Definition of Done

Confirm every item in `<run-root>/dod.md` against the integrated scope branch, ticking each verified one
(`- [ ]` → `- [x]`). Leave an unmet item unchecked with a one-line note on why. Verify the items yourself:
a passing review earlier in the chain is evidence, not a substitute.

## 5. Pull request

Per `docs/agents/code-management.md`: push the scope branch, then open the pull request at the configured
posture, with a body built from the Definition of Done and the slice list. No host CLI or API access →
degrade exactly as that document says (push, then print the compare URL and the ready-to-run call) rather
than failing. **Report the pull-request URL.**

**Carry the run's degrade record into that body.** The ledger's `**Degraded:**` line lists every pass this
run did not get — a denied dispatch, a knowledge-base publish that never reached its backend — per
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section. Copy every bullet into the
pull request body under one fixed `## Degraded passes` heading, so the reviewer reads what the run is
short of before merging rather than assuming a whole chain ran. **No such line** → the body is exactly what
it would have been; add no empty heading saying nothing degraded.

Then move the **scope anchor** issue (the epic, or the lone slice on a single-slice plan) to done per
`docs/agents/issue-tracker.md`, and set the ledger's `**Stage:**` line to `shipped`.

## 6. Clean up

**From the invoking checkout, not the scope worktree** — `git worktree remove` refuses to remove the tree
you are standing in:

- Remove this run's worktrees: `.superdev/scopes/<scope>/worktree` (lite) or every
  `.superdev/scopes/<scope>/worktrees/*` (full), then `git worktree prune`.
- Delete any leftover `slice/<scope>/*` branch (merged into the scope branch, so it only clutters).
- Remove `<run-root>/run.lock` to signal the run is done, if it exists. A `full` run never creates one
  (per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`), so there is nothing to remove there.
- **Return the invoking checkout to the base branch (per `docs/agents/code-management.md`, as in §5) —
  only when its HEAD is `superdev/<scope>`.** That is the state a `full` run leaves behind, and leaving it
  there hands the next run a checkout sitting on a branch with an open pull request. A `lite` run never
  switched this checkout, so its HEAD is wherever the maintainer put it and switching would move them off
  their own branch. **The base is already checked out in another worktree → `git switch` fails there; say
  so and leave this checkout alone.** **The checkout is dirty → leave it where it stands and say so in one
  line**, naming the branch it stayed on; if the uncommitted work includes `CONTEXT.md`, `docs/adr/`, or
  `.claude/rules/`, note that too — it is what will trip the next run's Phase 0 guard. Uncommitted work
  outweighs a tidy branch pointer.
- Keep the rest of `<run-root>` — the ledger and the ticked DoD are the git-ignored paper trail.

**Never delete the scope branch.** The pull request is from it, and deleting it closes the request.

## Red flags

- **Opening a pull request from the wrong branch** — §2 refuses rather than guessing which tree is the
  scope checkout.
- **Ticking the DoD from the review's word** — confirm each item against the branch.
- **Blocking on the stage gate** — it warns and asks once. The maintainer decides.
- **Removing the scope branch or the run root** — the first closes the pull request, the second discards
  the trail.
