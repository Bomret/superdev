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

Resolve `$ARGUMENTS` to one scope — a **run root**, per
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## A live scope run` section:

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

Read the ledger's `**Stage:**` line with
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get stage --root <run-root>` (`absent` means no line at
all):

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
- **Every slice in the ledger is `mechanical` or `docs`** (the fourth, `type` field of
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get slices --root <run-root>`, one tab-separated row per
  slice) → drop `/superdev:review` from that warning,
  whether it applies to this bullet or to `documented-unreviewed` above. Such a scope skips the
  whole-scope review by design — a scope reaches this stage only once `/superdev:implement`'s Final
  phase has run the full suite and found it green, found no test command configured, or recorded a denied
  test command and continued attended (ADR 0025) — so
  naming `/superdev:review` as missing
  would train the reader to dismiss the question. If that drop empties the warning (review was the only
  thing missing), there is nothing left to name. Proceed silently instead of asking about an empty list.

**Entries standing.** Read every bullet with
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get unresolved --root <run-root>` — one bullet per line,
never through cwd-dependent `status`, whose result depends on the current directory rather than
`<run-root>` — per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Unresolved defects` section.
**No output** → proceed silently; nothing here changes. **Output present** → name every bullet and
**ask once** whether to ship with it standing. Declined → stop, open no pull request, and write nothing.
Confirmed → proceed and record in the report that the scope shipped with the defect standing.
**`--unattended` → refuse**: name what stands, open no pull request, and stop.

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
run did not get — a denied dispatch, a knowledge-base pass the writer could not stage — per
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section;
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get degraded --root <run-root>` reports it for this scope,
one bullet per line. Copy every bullet into the pull request body under one fixed `## Degraded passes`
heading, so the reviewer reads what the run is short of before merging rather than assuming a whole chain
ran. **No output** → the body is exactly what it would have been; add no empty heading saying nothing
degraded.

**Carry a standing defect into that body too, under its own heading.** The ledger's `**Unresolved:**` line
lists every defect the run left standing, per
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Unresolved defects` section;
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get unresolved --root <run-root>` reports it for this
scope, one bullet per line, and §3 above already asked about it before this step ran. Copy every bullet
into the pull request body under its own `## Unresolved defects` heading, distinct from
`## Degraded passes` — the two answer different questions, so each keeps its own heading and its own
bullets. **No output** → add no empty heading.

Then move the **scope anchor** issue (the epic, or the lone slice on a single-slice plan) to done per
`docs/agents/issue-tracker.md`, and set the ledger's `**Stage:**` line to `shipped` with
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set shipped --root <run-root>`.

## 6. Clean up

**From the invoking checkout, not the scope worktree** — `git worktree remove` refuses to remove the tree
you are standing in:

- Remove this run's worktrees: `.superdev/scopes/<scope>/worktree` (lite) or every
  `.superdev/scopes/<scope>/worktrees/*` (full), then `git worktree prune`.
- Delete any leftover `slice/<scope>/*` branch (merged into the scope branch, so it only clutters).
- Remove `<run-root>/run.lock` to signal the run is done, if it exists. A `full` run never creates one
  (per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`), so there is nothing to remove there.
- **Return the invoking checkout to the base branch (per `docs/agents/code-management.md`, as in §5) —
  only when its HEAD is the scope branch** (resolved in §2, per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope branch` — you were given a slug, which
  does not name it). That is the state a `full` run leaves behind, and leaving it
  there hands the next run a checkout sitting on a branch with an open pull request. A `lite` run never
  switched this checkout, so its HEAD is wherever the maintainer put it and switching would move them off
  their own branch. **The base is already checked out in another worktree → `git switch` fails there; say
  so and leave this checkout alone.** **The checkout is dirty → leave it where it stands and say so in one
  line**, naming the branch it stayed on; if the uncommitted work includes `CONTEXT.md`, `docs/adr/`, or
  `.claude/rules/`, note that too — it is what will trip the next run's Phase 0 guard. Uncommitted work
  outweighs a tidy branch pointer.
- Keep the rest of `<run-root>` — the ledger and the ticked DoD are the git-ignored paper trail.
- **Keep `.superdev/kb-pending/<scope>/`.** It is outside the run root and holds this scope's staged
  knowledge-base pages, which outlive the run by design (ADR 0023).

**Never delete the scope branch.** The pull request is from it, and deleting it closes the request.

## 7. Point at the publish, when pages are waiting

`.superdev/kb-pending/<scope>/` holds staged pages → print `/superdev:publish-kb <scope>` with one line
on when to run it: **once the feature has reached its readers**, which is later than this pull request
and later than its merge. Superdev cannot detect that moment, which is why nothing here does it for you.

This is a pointer, not a chain handoff. `/superdev:ship` still ends the chain, and the publish is a step
the maintainer takes on their own clock. **No staged pages** → print nothing; add no line saying there is
nothing to publish.
