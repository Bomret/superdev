---
description: "Sweep the backlog unattended: take every eligible scope anchor through the whole implement chain to an open pull request."
---

# superdev afk

Drain the planned backlog with nobody watching. You take each eligible **scope anchor** through
`/superdev-implement` → `/superdev-review` → `/superdev-document` → `/superdev-submit-pr`, one feature at
a time, until something stops you. `/superdev/ship` is a separate, human-only command: it merges the pull
request this chain opens, and you never invoke it.

**This is not a new loop.** What makes an unattended run possible is the set of **standing answers** in
`<plugin-root>/references/scope-mode.md`'s **Unattended** section, which every command you invoke
reads for itself. Your job is to select work, invoke the chain, and know when to stop.

**You invoke the real commands** with OpenCode's own `skill` tool, naming the rendered skill —
`superdev-implement`, `superdev-review`, `superdev-document`, `superdev-submit-pr` — the same commands a
maintainer types, carrying `--unattended` (ADR 0015). That tool takes a `name` and nothing else, so
state each step's arguments — the feature label, the commit range, and `--unattended` — in your own
message as you invoke it. You never re-implement what they do, and you never edit a file yourself.

**The operator starts this sweep from a shell**, not from a slash command in a live session:
`opencode run --auto --command superdev/afk`. `--auto` approves every permission not explicitly
denied, which is what keeps `doom_loop` and `external_directory` — both `ask` by default — from
stalling a run nobody is watching. A headless run denies the `question` tool outright, which is the
behaviour the standing answers already assume: a stop with no standing answer is a block, never a
question.

**You keep no queue.** Re-read the slice store at the top of every iteration. The tracker's labels are the
only state this command has, so a compaction costs you nothing and two afk runs cannot disagree about
what is left. The one number the tracker cannot record — the **consecutive-block count** (§4-§5) — lives
in `.superdev/afk-blocks`, a file holding that single integer. Read it from the file every time §4 or §5
needs it: a value you remember from earlier in the sweep is exactly what a compaction erases, and the
file is what keeps the halt-at-two guarantee across one.

## 1. Config

Read `docs/agents/issue-tracker.md` (slice store) and `docs/agents/code-management.md` (code host).
Either missing → say so, point at **`/superdev-setup`**, and stop. Do not run `/superdev-setup` yourself:
it is an interview.

Write `0` to `.superdev/afk-blocks`. The consecutive-block count is per-sweep, and this is the one write
that starts it over: from here on the file only ever moves through §4's increment and §4's submitted reset.

## 2. Select the next scope anchor

A **scope anchor** is the issue carrying a feature's scope-level signal: the root of the feature. A
multi-slice plan's root has slices beneath it; a single-slice plan's root is its own lone slice. One rule
covers both (ADR 0017).

**How this store expresses a root is not yours to know.** `docs/agents/issue-tracker.md` carries a
`## Scope anchor` section stating five things for this backend: how to recognise an anchor, how to list
the candidates, how to list the slices beneath one, how to tell that an anchor is itself a slice, and how
to read an anchor's own dependencies. Read it and follow it. Encoding any store's own mechanism here would
be right on one backend and wrong on every other.

**Read `<plugin-root>/references/scope-mode.md`'s scope-slug rule before you go on.** Both the
eligibility test and the skip below turn on it, and it is what stands between a feature label somebody
else wrote and a path you build out of it.

An anchor is **eligible** when all of these hold:

- It is **open**, and carries no `blocked` label.
- It is **released** (`plan-contract.md` → *Release*). `docs/agents/issue-tracker.md`'s `## Release`
  section states this backend's signal and how to read it. An unreleased feature is a plan nobody has
  agreed to build yet, and nobody is here to agree to it now, so it is skipped (below).
- **No open slice beneath it** carries `blocked`.
- Its feature label passes that scope-slug rule, **both segments** — its change type as well as its slug.
  A label that fails either is skipped (below), not blocked: it is not that feature's fault, and pathing
  `.superdev/scopes/<scope>/…` off unvalidated input is the mistake that rule exists to catch.
- Its scope has **no live run**. Check `.superdev/scopes/<scope>/run.lock` (`<scope>` is its feature label
  minus the change-type prefix, which `<plugin-root>/references/scope-mode.md`'s
  `## The change type` section owns): newer than an hour means another session owns that scope.
  **No lock present is not by itself eligibility**: fall back to
  `<run-root>/ledger.md`'s mtime (the stage itself comes from
  `node "<plugin-root>/scripts/scope.js" get stage --root <run-root>`, as everywhere in this
  command). Newer than an hour with the stage short of `shipped` is a weaker signal than a lock — the
  ledger is written when a step completes rather than refreshed at every step, so a long-running step can
  leave it stale for over an hour on a live run — but far better than treating that scope as eligible
  outright, which is what no-lock alone would do.
- Every **anchor dependency** it records is **satisfied** (`plan-contract.md` → *Scope anchor*). Read them
  the way `docs/agents/issue-tracker.md`'s `## Scope anchor` section states — resolving a recorded
  reference to the blocker's own record first, on a store that records one instead of a feature label
  directly — and hold each against the **blocker** anchor it names, not the candidate under test. **The
  blocker's own feature label passes the scope-slug rule first, both segments** — the same rule the label
  bullet above applies to the candidate's own label, because pathing `.superdev/scopes/<scope>/…` off it
  unvalidated is the identical mistake that rule exists to catch. A blocker label that fails **defers this
  anchor** (below), not the blocker itself, and is named in §6's report. Once it validates, derive the
  blocker's own run root — `.superdev/scopes/<blocker-scope>/` — from that label, and read `node
  "<plugin-root>/scripts/scope.js" get stage --root <run-root>` **there**, `<run-root>` now being
  the **blocker's**, not the candidate's: satisfied means the blocker anchor is **closed**, or that call
  reads `shipped`, or **no anchor of that name exists**. A read that fails for any other reason — the store
  is unreachable, or the call errors in a way that is not a confirmed absence (a `404` can mean "not
  visible" as easily as "not there") — **defers this anchor** too, exactly like an unsatisfied dependency:
  it is not evidence the blocker is gone, only that this attempt failed to confirm it. Closing an anchor is
  best-effort at ship time, so a closed state alone would strand a dependent on a feature that has in fact
  landed. **One such read failure is confirmable rather than ambiguous, and waits on a human:** the run
  root is confirmedly absent (`hooks/scope-prune.js` deletes it seven days after a `shipped` stage's
  scope branch is contained in base or gone, ADR 0007, ADR 0053) while the blocker's own anchor still
  reads open. Defer this anchor as usual, but name it in §6's report as needing a human — closing the
  blocker's anchor by hand — rather than as ordinary progress,
  because no ledger is left to ever confirm `shipped` again. An anchor carrying an unsatisfied dependency
  is **deferred** (below), not blocked: it is waiting its turn, which is a state that clears itself.

Take eligible anchors in **ascending issue number** — oldest first. The recorded dependencies above are
the only order this command honours; two features that merely collide on the same files produce a merge
conflict in the second, which blocks it correctly.

**Deferral is what carries the order, and it needs no graph.** You take one anchor at a time through the
whole chain and re-read the store at the top of every iteration, so a dependent anchor deferred now is
re-tested the moment its blocker ships and runs in this same sweep, one iteration later. That is the order
a topological sort would give a serial consumer.

Eligibility says nothing about the slices' own `ready` state, deliberately. A part-merged plan and a slice
still labelled `in-progress` from an interrupted run both resume, which §3 handles. The release signal is
the anchor's and survives those moves (`plan-contract.md` → *Release*), so a resumed run stays eligible.

**Skip, rather than block:**

- An **unreleased** anchor. The plan exists; the agreement to build it does not.
- An anchor that is **not itself a slice and has none beneath it**. The plan was never decomposed, and
  `/superdev-plan` is an interview, not yours to run. The store's contract says how to tell — this is the
  one skip that needs it, because a single-slice plan also has no slices beneath its anchor and is **not**
  skipped: there, the anchor is the work.
- An anchor whose **feature label fails the scope-slug rule**. There is no scope to path on.
- An anchor whose scope holds a **live run** (fresh lock, or — with none — a fresh, unshipped ledger).
- An anchor whose ledger's stage reads `submitted` or `shipped`. A pull request is already open, or
  already merged; only a human moves it further with `/superdev/ship`.
- An anchor carrying an **unsatisfied dependency** — this is the **deferral**, and it has its own paragraph
  below.

Every skip changes no label and does not touch the consecutive-block count. Two of the six are
**transient** — a live run ends, a submitted or shipped run has already had its own end — so they stay
silent.

Three **wait on a human**: a malformed label, a never-decomposed plan, and an unreleased plan are passed
over on every sweep until somebody acts, and nothing else in this command would surface any of them.
**Name each one in §6's report** with what it needs — a label that matches the scope-slug rule,
`/superdev-plan` to decompose the anchor, or the release signal `docs/agents/issue-tracker.md` names. The
sixth is the unsatisfied dependency — the **deferral**, with its own paragraph below.

**A third condition is reported the same way.** A feature label whose candidates are `Ambiguous` — the
active `docs/agents/issue-tracker.md`'s own `## Scope anchor` section names the shape, among **open**
roots only — is a malformed plan: there is no single Definition of Done to build against, so there is
nothing to select and nothing to label. Skip it and name it in §6's report. It needs a human, exactly
like the three above.

**A deferred anchor is reported too, and names what it waits on.** It clears itself, so it is not one of
the three above — but three shapes of a deferral wait on a human just as they do, and the row is the only
place any of them becomes visible: a dependency on an anchor this sweep itself skips, a **cycle**, where
each anchor in it waits on another that is waiting back, and a blocker whose anchor is still open while its
run root no longer exists (above). Report every deferral with the anchor it waits on (§6), which reads as
progress on the ordinary shape and as a diagnosis — closing the blocker's anchor by hand, on the third — on
those three.

**No eligible anchor** → say so in one line and stop. The ordinary end of a sweep, not a failure. An
iteration whose every remaining candidate is deferred **is** this case: nothing is selectable, so the
sweep ends there rather than re-testing the same candidates. That is what keeps a cycle from spinning.

## 3. Take it through the chain

Read the scope's stage — `node "<plugin-root>/scripts/scope.js" get stage --root <run-root>`
(`<run-root>` is `node "<plugin-root>/scripts/scope.js" root <scope>`'s printed absolute path,
per `<plugin-root>/references/scope-mode.md`'s `<run-root>` capture) — and start at the step that
stage has not reached. Resume rather than restart: a merged slice is never rebuilt.

Each "Start at" cell below still reads as a slash command. On OpenCode, invoke it with the `skill`
tool instead — `name: superdev-<name>` for the command named `/superdev-<name>` — and state the
rest of the cell's text as your own message's arguments, exactly as the chain driver above already
does.

| Stage | Start at |
|---|---|
| no run root, `planned`, or `implementing` | `/superdev-implement <feature-label> --unattended` |
| `merged` | `/superdev-review <BASE>..<feature-label> --unattended` |
| `reviewed`, no standing `**Unresolved:**` entry | `/superdev-document <BASE>..<feature-label> --unattended` |
| `reviewed`, with a standing `**Unresolved:**` entry | `/superdev-review <BASE>..<feature-label> --unattended` |
| `documented-unreviewed` | `/superdev-review <BASE>..<feature-label> --unattended` |
| `documented` | `/superdev-submit-pr <scope> --unattended` |
| `submitted` | skip — §2's submitted skip already caught this anchor; only a human moves it further |
| `shipped` | skip — §2's shipped skip already caught this anchor; the run is done |

A `reviewed` stage carrying a standing `**Unresolved:**` entry is an earlier pass's untick still
unresolved (`references/dod-ticks.md`'s Document's case, INV-0016): dispatching `/superdev-document`
over it risks nothing on its own — document's own standing-entry check holds the stage rather than
advancing it — but routes straight to the review the criterion actually needs instead of a doc pass with
nothing new to reconcile.

Then run each remaining step in order — **except after `/superdev-document` runs, re-read the stage
before continuing to the next one.** Its own re-check (`references/dod-ticks.md`'s Document's case,
INV-0016) can leave the stage at `reviewed` and write a `**Unresolved:**` entry rather than advancing it,
when its own commits broke a criterion. A `reviewed` stage still carrying that entry after
`/superdev-document` ran routes to `/superdev-review <BASE>..<feature-label> --unattended` next, naming
the broken criterion in §6's report — never straight to `/superdev-submit-pr`, which would refuse the scope
anyway and name `/superdev-document` as the missing step, not the review the criterion actually needs.

**Count this anchor's own send-backs, in your own working memory alone, and write none of it to disk.**
Both the table's own reviewed-with-a-standing-entry route above and the after-`/superdev-document`
re-check's route below send this same anchor back to review over the same unresolved criterion, so either
counts as this anchor's first send-back in the sweep. A second one for the same anchor, in the same sweep,
blocks it instead, through §4's ordinary block path — the block comment names the unresolved criteria the
ledger's `**Unresolved:**` line carries, and the block adds to the consecutive-block count exactly as any
other block does. This count needs no reset rule: you drive one anchor through the whole chain before you
take the next (§2), so no later anchor ever inherits it.

`BASE` is `git merge-base <base> <feature-label>`, with the base
branch from `docs/agents/code-management.md`.

`<feature-label>` is the anchor's own label, in the shape `docs/agents/issue-tracker.md` states — a change
type in front of a slug, in whatever notation that store writes it (ADR 0019, ADR 0021). It is also the
scope branch, which is why the ranges read off it. Pass what the store gave you and add no prefix of your
own: a label this command invented is one `/superdev-implement` cannot resolve, and that stop is an error
rather than a question, which §4 turns into a block.

`documented-unreviewed` routes to the review, not to `submit-pr`, because `/superdev-submit-pr
--unattended` refuses a scope whose review never ran. The review is what clears that state — whatever produced the stage: a
hand-run `/superdev-document` invoked before a `reviewed` stage lands there too, and this table sends it
back to the review exactly like any other `documented-unreviewed` anchor.

Every scope passes review, whatever its slice types: the stage table above
routes every scope through `/superdev-review`, with no special case for an all-`mechanical`/`docs`
ledger (ADR 0091) — `/superdev-implement`'s run handoff runs its own full-suite pass for every scope, but
that pass is never a stand-in for the review.

A feature reaches one of two ends: **submitted** (a pull request is open) or **blocked**. A command can also
stop with an **error** rather than a question — `/superdev-implement`'s "No DoD → don't proceed",
`<plugin-root>/references/scope-mode.md`'s wrong-checkout stop — and write no label at all. §4's
closing rule treats that as a block, so it is never a third end. The one stop that is neither is
`/superdev-submit-pr` failing to reach the code host, which §5 governs: it ends the sweep, not the feature.

## 4. When a feature blocks

A command you invoked blocked instead of finishing
(`<plugin-root>/references/scope-mode.md`'s **Unattended** section says when, and does the
labelling and the comment). Then:

- **Leave the scope standing.** Its branch, scopetree, run root and lock all stay, so a maintainer resolves
  the decision and finishes that scope by hand. **Record `<feature-label>` in the block comment** (append
  it to what the invoked command wrote, or — for the error-stop case below — include it in the comment
  you write yourself) and **name it in §6's report row**, so resuming by hand is one `cd` into the
  scopetree (`<run-root>/scopetree`) away.
- **Add one to the consecutive-block count** — read `.superdev/afk-blocks`, write it back incremented —
  and go back to §2 for the next anchor.

**A command that stops without either submitting or blocking counts as a block — except
`/superdev-submit-pr` failing to push or open the pull request, which §5 governs and which labels
nothing.** That file's
catch-all covers a question with no standing answer; it says nothing about a command that stops with an
**error** instead (`/superdev-implement`'s "No DoD → don't proceed", the wrong-checkout stop). No label
gets written there, so a re-read of the tracker finds the anchor still eligible and FIFO re-selects it
first, forever. Treat that stop as a block yourself: label the scope anchor `blocked`, comment on it
naming which command stopped and why, and add one to the consecutive-block count. Do this from what the
tracker and the ledger show now — never from memory of features you already tried this sweep, which a
compaction would erase.

A submitted feature **resets that count to zero**: write `0` to `.superdev/afk-blocks`, then **go back to
§2 for the next anchor**, exactly as a block does. A pull request is one feature's end, not the sweep's:
selection runs again, over a store whose ledger now reads this anchor's scope `submitted`, which is what
releases anything deferred on it.

## 5. When to stop

- **Two consecutive blocked features** (`.superdev/afk-blocks` reads `2` — read the file, not your
  memory) → stop. Two independent features failing back to back is a
  systemic cause — a red base, a broken toolchain, an expired token — and every further one would block
  the same way. Leave every remaining anchor untouched: open, unlabelled, with no run root.
- **`/superdev-submit-pr` failed** (the push or the pull request did not succeed) → stop at once. Label
  **nothing**: the feature is complete and the fault is the code host's. Its run stays at stage
  `documented`, so a maintainer runs `/superdev-submit-pr <scope>` once the host is reachable. This is not a
  block, and it stops the sweep immediately rather than after two, because a second feature would pay for
  a whole chain before failing the same way.
- **No eligible anchor** → stop (§2).
- **The maintainer interrupts** → stop wherever you are. Each command writes the ledger's `**Stage:**`
  line as it completes its own step, so the scope resumes from the right place with no cleanup.

## 6. Report

Print one table, and nothing else:

```
anchor         outcome    where
#128 afk       submitted  <pull-request URL>
#134 metrics   blocked    slice #137 — merge conflict on integration (fix/metrics)
reports        skipped    2 roots, no single anchor — needs a human
Cache_Sweep!   skipped    label fails the scope-slug rule — rename it
#163 exports   skipped    never decomposed — run /superdev-plan
#171 search    deferred   waits on #163, which is skipped — needs a human
#178 indexer   deferred   waits on #185, which waits back — dependency cycle
#185 crawler   deferred   waits on #178, which waits back — dependency cycle
#190 payments  deferred   waits on #142, whose run root is pruned — close #142 by hand
#141 cache     untouched  halted before it
```

A `skipped` row appears for the three permanent conditions of §2: a feature label whose candidates are
`Ambiguous`, a label that fails the scope-slug rule, and an anchor that was never decomposed. Each row
names what the condition needs. The transient skips — a live run, a submitted or shipped run — stay out
of the table.

A `deferred` row names the anchor waited on and what became of it — the three shapes that need a human are
§2's, and the third (a still-open anchor behind a pruned run root) names what it needs — closing that
anchor by hand — since nothing will become of it on its own. An anchor deferred early and taken later in
the same sweep earns the row its own outcome gives it — `submitted` or `blocked` — and no `deferred` row at
all.

The durable record already exists where a maintainer would act on it: a comment on each blocked anchor, a
pull request for each submitted one. Write no summary issue and no file.

## Red flags

- **Selecting by a store's own mechanism.** §2 reads the store's `## Scope anchor` contract. A command
  that tests for an `epic` label is right on one backend and blind on the rest — which is how every
  single-slice plan went unseen before ADR 0017.
- **Re-implementing a chain step.** Invoke the command; it is the only copy of that procedure.
- **Submitting a partial scope.** A blocked slice abandons its whole feature.
- **Merging a pull request.** You open one and stop.
