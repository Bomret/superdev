---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-submit-pr
description: "Submit a pull request for a superdev scope — the stage gate, the Unresolved ask-once, and the pull request body. The last step of the implement chain; run it after $superdev-review and $superdev-document."
---

# superdev submit-pr

Open a pull request for a run. Every slice is on the scope branch, the scope has been reviewed, and the
docs have been reconciled — this command turns that into a pull request. It leaves the run standing:
the scopetree, the slicetrees, and the run lock stay, and `ship` is what takes them down, after
the pull request merges. It dispatches no subagents.

## 1. Scope + run root

**`--unattended`, if present, comes out first** — per `<plugin-root>/references/scope-mode.md`'s
**Unattended** section, it is never part of the scope slug.

Resolve the message that invoked this skill to one scope — a **run root**, per that file's `## A live scope run` section:

- **A scope slug given** → use it. No run root by that name → say so and stop.
- **Empty** → this command's own **candidate set** (CONTEXT.md) is every run root whose stage is not
  `shipped` — every other stage is submittable here, after §3's own question. Run
  `<plugin-root>/references/scope-mode.md`'s `## Resolving an empty argument` cascade over that
  set, restating no part of it here: nothing is created before the cascade resolves one run root.

Read `<plugin-root>/references/scope-mode.md` for how to capture `<run-root>` and how the run lock
behaves. Refresh `<run-root>/run.lock` now, per that file's rule.

## 2. Scope checkout

Find the scope checkout per `<plugin-root>/references/scope-mode.md`. You need it for §4's git
commands.

## 3. Stage gate (ask once attended, refuse unattended)

Read the ledger's `**Stage:**` line with
`node "<plugin-root>/scripts/scope.js" get stage --root <run-root>` (`absent` means no line at
all):

- **`shipped`** → already shipped. Report that and stop. Never open a pull request over a merged scope.
- **`submitted`** → already submitted. Report that. Read the ledger's `**PR:**` line with
  `node "<plugin-root>/scripts/scope.js" get pr --root <run-root>` and print that pull request; a
  ledger predating that header (`absent`) falls back to printing the existing pull request if the code
  host still lists one. Stop. Never open a second.
- **`documented`** → the whole chain ran. Proceed silently.
- **`documented-unreviewed`** → `$superdev-document` ran while the stage was earlier than `reviewed`, so
  the review step never ran. Treat it exactly like the review-missing case below: name `$superdev-review`
  as missing and **ask once**.
- **Anything earlier** (`implementing`, `merged`, `reviewed`), or **no line at all** → name exactly what
  has not run (`$superdev-review`, `$superdev-document`, or both) and **ask once** whether to submit
  anyway. Declined → stop and print the missing command. Confirmed → proceed and record in the report
  that the scope was submitted without it. **`--unattended` → refuse**: name what is missing, open no
  pull request, and stop. A caller that drove the whole chain never reaches this bullet, so reaching it
  unattended means a step really was skipped — and submitting unreviewed code is not a decision a token
  stands in for.

**Entries standing.** Read every bullet with
`node "<plugin-root>/scripts/scope.js" get unresolved --root <run-root>` — one bullet per line,
never through cwd-dependent `status` — per `<plugin-root>/references/scope-mode.md`'s
`## Unresolved defects` section. **No output** → proceed silently. **Output present** → name every bullet
and **ask once** whether to submit with it standing. Declined → stop, open no pull request, write nothing.
Confirmed → proceed and record in the report that the scope was submitted with the defect standing.
**`--unattended` → refuse**: name what stands, open no pull request, and stop. A `dod.md` criterion noted
`accepted:` — an attended operator's own decision that it stands accepted as unmet (ADR 0095) — is
settled, not a defect: it writes no `**Unresolved:**` bullet and never reaches this gate, the same way a
`ceiling:` line does not.

## 4. Pull request

**A scope-branch-commit anchor close happens first.** Per `docs/agents/issue-tracker.md`, a store whose
anchor close is a commit on the scope branch commits that close now, before this push, so it reaches base
exactly when the pull request merges — never as a commit straight to base (INV-0001). A store whose close
is an API call skips this: it closes the anchor after the merge instead, which is `ship`'s job,
not this command's.

Per `docs/agents/code-management.md`: push the scope branch, then open the pull request at the configured
posture, with a body built from the Definition of Done and the slice list. No host CLI or API access →
degrade exactly as that document says (push, then print the compare URL and the ready-to-run call) rather
than failing. **Report the pull-request URL.**

**Record the pull request's number the moment it opens** —
`node "<plugin-root>/scripts/scope.js" pr set <n> --root <run-root>`, `<n>` the number the host's
own open call returned. This is what lets `ship` read the pull request back by number instead of
looking it up by head branch, which a reused branch name (`## The scope branch`) could get wrong
(INV-0092). **Degraded to the compare-URL fallback above** → no number exists yet; record nothing here,
and `pr clear` need not run either — the header simply stays absent, the same case a ledger from before
this header existed already leaves it in.

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

**Carry every ceiling criterion into that body too, as a post-merge checklist.** Copy every `dod.md`
line carrying `— ceiling: <partial evidence>` — its note format is
`<plugin-root>/references/dod-ticks.md`'s note rule — under its own `## Post-merge checklist`
heading, as a checkbox, distinct from the three headings above. This command writes no tick anywhere:
this step only copies what an earlier step already recorded. **No such criterion** → add no empty
heading.

Set the ledger's `**Stage:**` line to `submitted` with
`node "<plugin-root>/scripts/scope.js" stage set submitted --root <run-root>`. Publish the
snapshot afterwards, per `<plugin-root>/references/scope-mode.md`'s `## Publishing run state`
section. The run stands: the scopetree, the slicetrees, and the run lock stay in place, and the scope
anchor on a remote store stays open. `ship` closes it, on the merge, and takes the run's
scaffolding down.

**Print `ship <scope>` as the next command.** One line on what it does: it merges the pull
request once an operator has reviewed it, closes the scope anchor, and cleans up the run — printing
`$superdev-publish-kb <scope>` itself once the merge lands, when pages are staged.

This is the chain's own end. `$superdev-submit-pr` hands off to `ship`, and only a human runs
that.
