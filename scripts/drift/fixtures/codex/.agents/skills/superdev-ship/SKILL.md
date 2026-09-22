---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-ship
description: "Close out a superdev scope — tick the Definition of Done, close the scope anchor, open the PR, and clean up the run. The last step of the implement chain; run it after $superdev-review and $superdev-document."
---

# superdev ship

End a run. Every slice is on the scope branch, the scope has been reviewed, and the docs have been
reconciled — this command turns that into a pull request and takes the run's scaffolding down. It
dispatches no subagents.

## 1. Scope + run root

**`--unattended`, if present, comes out first** — per `<plugin-root>/references/scope-mode.md`'s
**Unattended** section, it is never part of the scope slug.

Resolve the message that invoked this skill to one scope — a **run root**, per that file's `## A live scope run` section:

- **A scope slug given** → use it. No run root by that name → say so and stop.
- **Empty** → this command's own **candidate set** (CONTEXT.md) is every run root whose stage is not
  `shipped` — every other stage is shippable here, after §3's own question. Run
  `<plugin-root>/references/scope-mode.md`'s `## Resolving an empty argument` cascade over that
  set, restating no part of it here: nothing is created before the cascade resolves one run root.

Read `<plugin-root>/references/scope-mode.md` for how to capture `<run-root>` and how the run lock
behaves. Refresh `<run-root>/run.lock` now, per that file's rule.

## 2. Scope checkout

Find the scope checkout per `<plugin-root>/references/scope-mode.md`. You need it for §5's git
commands. **§6 runs from the invoking checkout instead** — see there.

## 3. Stage gate (ask once attended, refuse unattended)

Read the ledger's `**Stage:**` line with
`node "<plugin-root>/scripts/scope.js" get stage --root <run-root>` (`absent` means no line at
all):

- **`shipped`** → already shipped. Report that, print the existing pull request if the code host still
  lists one, and stop. Never open a second.
- **`documented`** → the whole chain ran. Proceed silently.
- **`documented-unreviewed`** → `$superdev-document` ran while the stage was earlier than `reviewed`, so
  the review step never ran. Treat it exactly like the review-missing case below: name `$superdev-review`
  as missing and **ask once**.
- **Anything earlier** (`implementing`, `merged`, `reviewed`), or **no line at all** → name exactly what
  has not run (`$superdev-review`, `$superdev-document`, or both) and **ask once** whether to ship anyway.
  Declined → stop and print the missing command. Confirmed → proceed and record in the report that the
  scope shipped without it. **`--unattended` → refuse**: name what is missing, open no pull request, and
  stop. A caller that drove the whole chain never reaches this bullet, so reaching it unattended means a
  step really was skipped — and shipping unreviewed code is not a decision a token stands in for.
- **Every slice in the ledger is `mechanical` or `docs`** (the fourth, `type` field of
  `node "<plugin-root>/scripts/scope.js" get slices --root <run-root>`, one tab-separated row per
  slice) → drop `$superdev-review` from that warning, whether it applies to this bullet or to
  `documented-unreviewed` above. Such a scope skips the whole-scope review by design — it reaches this
  stage only once `$superdev-implement`'s run handoff has run the full suite and found it green, found no
  test command configured, or recorded a denied test command and continued attended (ADR 0025) — so naming
  `$superdev-review` as missing would train the reader to dismiss the question. If that drop empties the
  warning, proceed silently instead of asking about an empty list.

**Entries standing.** Read every bullet with
`node "<plugin-root>/scripts/scope.js" get unresolved --root <run-root>` — one bullet per line,
never through cwd-dependent `status` — per `<plugin-root>/references/scope-mode.md`'s
`## Unresolved defects` section. **No output** → proceed silently. **Output present** → name every bullet
and **ask once** whether to ship with it standing. Declined → stop, open no pull request, write nothing.
Confirmed → proceed and record in the report that the scope shipped with the defect standing.
**`--unattended` → refuse**: name what stands, open no pull request, and stop.

## 4. Definition of Done

Confirm every item in `<run-root>/dod.md` against the integrated scope branch, ticking each verified one
(`- [ ]` → `- [x]`). Leave an unmet item unchecked with a one-line note on why. Verify the items yourself:
a passing review earlier in the chain is evidence, not a substitute. Verifying an item observes; it
changes no system outside the repository (ADR 0084, INV-0006). An item needing a deploy, a migration, or
any other outward-facing change to verify stays unticked, with a note, for the operator to verify after
merge.

**A criterion naming the test suite is ticked from the run's own recorded result, never by running it**
(ADR 0084). Read the ledger's stage with
`node "<plugin-root>/scripts/scope.js" get stage --root <run-root>` and its degrade record with
`node "<plugin-root>/scripts/scope.js" get degraded --root <run-root>`. `$superdev-review` does
not advance the stage while a red full suite stands, and `references/run-handoff.md` runs an
all-`mechanical`/`docs` scope's own full suite — in place of the review such a scope skips — before
writing the stage, so a stage of `reviewed`, `documented`, or `shipped` is a green full suite on this
scope branch, and so is `documented-unreviewed` where every ledger slice is `mechanical`/`docs`
(`node "<plugin-root>/scripts/scope.js" get slices --root <run-root>`) — that stand-in run's own
terminal stage. Any other stage leaves the criterion unticked, naming that stage as the note. Given one
of those stages: a degrade bullet naming that full-suite run as denied — the exit run's own denial, or
the stand-in run's — leaves the criterion unticked too, with that bullet as the note, and
`docs/agents/verification.md` naming no test command at all does the same, with `no test command
configured` as the note: **a scope whose recorded result is a denied or absent test command leaves such
a criterion unticked, with that record as its note.** Otherwise, tick it. Ship runs no test command
anywhere.

**Apply the same verdict to the anchor's own Definition of Done checklist**, through the sanctioned body
edit the active store's own `## Run state` section names (`docs/agents/issue-tracker.md`, or whichever
seed is active). Best-effort: a failed write is reported once and never stops the ship. Leave an unmet
item's one-line note on the local copy alone — the anchor carries tick state, and the pull-request body
already carries the reasons. A store whose `## Run state` section declares it snapshot-less has no anchor
body to edit: tick the local copy only and say so in one line.

## 5. Pull request

Per `docs/agents/code-management.md`: push the scope branch, then open the pull request at the configured
posture, with a body built from the Definition of Done and the slice list. No host CLI or API access →
degrade exactly as that document says (push, then print the compare URL and the ready-to-run call) rather
than failing. **Report the pull-request URL.**

**Carry the run's degrade record into that body.** The ledger's `**Degraded:**` line lists every pass this
run did not get — a denied dispatch, a knowledge-base pass the writer could not stage — per
`<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section;
`node "<plugin-root>/scripts/scope.js" get degraded --root <run-root>` reports it, one bullet per
line. Copy every bullet into the body under one fixed `## Degraded passes` heading, so the reviewer reads
what the run is short of before merging. **No output** → add no empty heading.

**Carry a standing defect into that body too, under its own heading.** The ledger's `**Unresolved:**` line
lists every defect the run left standing, per that file's `## Unresolved defects` section;
`node "<plugin-root>/scripts/scope.js" get unresolved --root <run-root>` reports it, one bullet
per line, and §3 already asked about it. Copy every bullet under its own `## Unresolved defects` heading,
distinct from `## Degraded passes` — the two answer different questions. **No output** → add no empty
heading.

**Carry a deferred finding into that body as well, under a third heading.** The ledger's `**Deferred:**`
line lists every finding `$superdev-review` handed to `$superdev-plan` rather than fixing, per that file's
`## Deferred findings` section; `node "<plugin-root>/scripts/scope.js" get deferred --root
<run-root>` reports it, one bullet per line. Copy every bullet under its own `## Deferred to a plan`
heading, distinct from both headings above — the three answer different questions: what the run did not
get, what is broken, and what nobody has planned yet (ADR 0035). The pull request is where a reader meets
it, and where it outlives the review that found it. **No output** → add no empty heading.

Then move the **scope anchor** issue (the epic, or the lone slice on a single-slice plan) to done per
`docs/agents/issue-tracker.md`, and set the ledger's `**Stage:**` line to `shipped` with
`node "<plugin-root>/scripts/scope.js" stage set shipped --root <run-root>`. Publish the snapshot
afterwards, per `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section.

## 6. Clean up

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

## 7. Point at the publish, when pages are waiting

`.superdev/kb-pending/<scope>/` holds staged pages → print `$superdev-publish-kb <scope>` with one line on
when to run it: **once the feature has reached its readers**, which is later than this pull request and
later than its merge. Superdev cannot detect that moment, which is why nothing here does it for you.

This is a pointer, not a chain handoff. `$superdev-ship` still ends the chain. **No staged pages** → print
nothing; add no line saying there is nothing to publish.
