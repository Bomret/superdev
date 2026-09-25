---
name: ship
description: Close out a superdev scope — close the scope anchor, open the PR, and clean up the run. The last step of the implement chain; run it after /superdev:review and /superdev:document.
argument-hint: "[<scope>  (empty = the only run in this repo)]  [--unattended]"
---

# superdev ship

End a run. Every slice is on the scope branch, the scope has been reviewed, and the docs have been
reconciled — this command turns that into a pull request and takes the run's scaffolding down. It
dispatches no subagents.

## 1. Scope + run root

**`--unattended`, if present, comes out first** — per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
**Unattended** section, it is never part of the scope slug.

Resolve `$ARGUMENTS` to one scope — a **run root**, per that file's `## A live scope run` section:

- **A scope slug given** → use it. No run root by that name → say so and stop.
- **Empty** → this command's own **candidate set** (CONTEXT.md) is every run root whose stage is not
  `shipped` — every other stage is shippable here, after §3's own question. Run
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Resolving an empty argument` cascade over that
  set, restating no part of it here: nothing is created before the cascade resolves one run root.

Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md` for how to capture `<run-root>` and how the run lock
behaves. Refresh `<run-root>/run.lock` now, per that file's rule.

## 2. Scope checkout

Find the scope checkout per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`. You need it for §4's git
commands. **§5 runs from the invoking checkout instead** — see there.

## 3. Stage gate (ask once attended, refuse unattended)

Read the ledger's `**Stage:**` line with
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get stage --root <run-root>` (`absent` means no line at
all):

- **`shipped`** → already shipped. Report that, print the existing pull request if the code host still
  lists one, and stop. Never open a second.
- **`documented`** → the whole chain ran. Proceed silently.
- **`documented-unreviewed`** → `/superdev:document` ran while the stage was earlier than `reviewed`, so
  the review step never ran. Treat it exactly like the review-missing case below: name `/superdev:review`
  as missing and **ask once**.
- **Anything earlier** (`implementing`, `merged`, `reviewed`), or **no line at all** → name exactly what
  has not run (`/superdev:review`, `/superdev:document`, or both) and **ask once** whether to ship anyway.
  Declined → stop and print the missing command. Confirmed → proceed and record in the report that the
  scope shipped without it. **`--unattended` → refuse**: name what is missing, open no pull request, and
  stop. A caller that drove the whole chain never reaches this bullet, so reaching it unattended means a
  step really was skipped — and shipping unreviewed code is not a decision a token stands in for.

**Entries standing.** Read every bullet with
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get unresolved --root <run-root>` — one bullet per line,
never through cwd-dependent `status` — per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
`## Unresolved defects` section. **No output** → proceed silently. **Output present** → name every bullet
and **ask once** whether to ship with it standing. Declined → stop, open no pull request, write nothing.
Confirmed → proceed and record in the report that the scope shipped with the defect standing.
**`--unattended` → refuse**: name what stands, open no pull request, and stop. A `dod.md` criterion noted
`accepted:` — an attended operator's own decision that it stands accepted as unmet (ADR 0095) — is
settled, not a defect: it writes no `**Unresolved:**` bullet and never reaches this gate, the same way a
`ceiling:` line does not.

## 4. Pull request

**A scope-branch-commit anchor close happens first.** Per `docs/agents/issue-tracker.md`, a store whose
anchor close is a commit on the scope branch commits that close now, before this push, so it reaches base
exactly when the pull request merges — never as a commit straight to base (INV-0001). A store whose close
is an API call skips this and closes below instead, after the pull request opens.

Per `docs/agents/code-management.md`: push the scope branch, then open the pull request at the configured
posture, with a body built from the Definition of Done and the slice list. No host CLI or API access →
degrade exactly as that document says (push, then print the compare URL and the ready-to-run call) rather
than failing. **Report the pull-request URL.**

**Carry the run's degrade record into that body.** The ledger's `**Degraded:**` line lists every pass this
run did not get — a denied dispatch, a knowledge-base pass the writer could not stage — per
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section;
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get degraded --root <run-root>` reports it, one bullet per
line. Copy every bullet into the body under one fixed `## Degraded passes` heading, so the reviewer reads
what the run is short of before merging. **No output** → add no empty heading.

**Carry a standing defect into that body too, under its own heading.** The ledger's `**Unresolved:**` line
lists every defect the run left standing, per that file's `## Unresolved defects` section;
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get unresolved --root <run-root>` reports it, one bullet
per line, and §3 already asked about it. Copy every bullet under its own `## Unresolved defects` heading,
distinct from `## Degraded passes` — the two answer different questions. **No output** → add no empty
heading.

**Carry a deferred finding into that body as well, under a third heading.** The ledger's `**Deferred:**`
line lists every finding `/superdev:review` handed to `/superdev:plan` rather than fixing, per that file's
`## Deferred findings` section; `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get deferred --root
<run-root>` reports it, one bullet per line. Copy every bullet under its own `## Deferred to a plan`
heading, distinct from both headings above — the three answer different questions: what the run did not
get, what is broken, and what nobody has planned yet (ADR 0035). The pull request is where a reader meets
it, and where it outlives the review that found it. **No output** → add no empty heading.

**Carry every ceiling criterion into that body too, as a post-merge checklist.** Copy every `dod.md`
line carrying `— ceiling: <partial evidence>` — its note format is
`${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s note rule — under its own `## Post-merge checklist`
heading, as a checkbox, distinct from the three headings above. Ship writes no tick anywhere: this step
only copies what an earlier step already recorded. **No such criterion** → add no empty heading.

Then move the **scope anchor** issue (the epic, or the lone slice on a single-slice plan) to done — per
`docs/agents/issue-tracker.md`, right here for a store whose close is an API call; a store whose close is a
scope-branch commit already carries it, committed before the push above — and set the ledger's
`**Stage:**` line to `shipped` with
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set shipped --root <run-root>`. Publish the snapshot
afterwards, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section.

## 5. Clean up

**From the invoking checkout, not the scopetree** — `git worktree remove` refuses to remove the tree
you are standing in:

- Remove this run's scopetree: `<run-root>/scopetree`, plus any leftover slicetrees at
  `<run-root>/slicetrees/*`, then `git worktree prune`.
- Delete any leftover `slice/<scope>/*` branch (merged into the scope branch, so it only clutters).
- Remove `<run-root>/run.lock` to signal the run is done, if it exists.
- Keep the rest of `<run-root>` — the ledger and the ticked DoD are the git-ignored paper trail.
- **Keep `.superdev/kb-pending/<scope>/`.** It is outside the run root and holds this scope's staged
  knowledge-base pages, which outlive the run by design (ADR 0023).

**Never delete the scope branch.** The pull request is from it, and deleting it closes the request.
`hooks/scope-prune.js` reaps it later, with the run root, once base holds its content (ADR 0071).

## 6. Point at the publish, when pages are waiting

`.superdev/kb-pending/<scope>/` holds staged pages → print `/superdev:publish-kb <scope>` with one line on
when to run it: **once the feature has reached its readers**, which is later than this pull request and
later than its merge. Superdev cannot detect that moment, which is why nothing here does it for you.

This is a pointer, not a chain handoff. `/superdev:ship` still ends the chain. **No staged pages** → print
nothing; add no line saying there is nothing to publish.
