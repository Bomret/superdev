---
description: Sweep the backlog unattended — take every eligible scope anchor through the whole implement chain to an open pull request. Stops on an interrupt, on two consecutive blocked features, or when no eligible anchor is left.
disable-model-invocation: true
---

# superdev afk

Drain the planned backlog with nobody watching. You take each eligible **scope anchor** through
`/superdev:implement` → `/superdev:review` → `/superdev:document` → `/superdev:ship`, one feature at a time,
until something stops you.

**This is not a new loop.** The loop below is a dozen lines. What makes an unattended run possible is the
set of **standing answers** in `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section,
which every command you invoke reads for itself. Your job is to select work, invoke the chain, and know
when to stop.

**You invoke the real commands** with the Skill tool — the same commands a maintainer types, carrying
`--unattended` (ADR 0015). You never re-implement what they do, and you never edit a file yourself.

**You keep no queue.** Re-read the slice store at the top of every iteration. The tracker's labels are the
only state this command has, so a compaction costs you nothing and two afk runs cannot disagree about
what is left — **except the consecutive-block count** (§4-§5): nothing in the tracker records it, so it
lives in your own memory alone, and a compaction mid-sweep resets it to zero, silently loosening the
halt-at-two guarantee for the rest of that run.

## 1. Config

Read `docs/agents/issue-tracker.md` (slice store) and `docs/agents/code-management.md` (code host). Either
one missing → say so, point at **`/superdev:setup`**, and stop. Do not run `/superdev:setup` yourself: it
is an interview.

## 2. Select the next scope anchor

A **scope anchor** is the issue that carries a feature's scope-level signal: the root of the feature. A
multi-slice plan's root has slices beneath it; a single-slice plan's root is its own lone slice. One rule
covers both, so neither is a special case (ADR 0017).

**How this store expresses a root is not yours to know.** `docs/agents/issue-tracker.md` carries a
`## Scope anchor` section stating four things for this backend: how to recognise an anchor, how to list
the candidates, how to list the slices beneath a given anchor, and how to tell that an anchor is itself a
slice. Read it and follow it. Encoding any store's own mechanism here would be right on one backend and
wrong on every other.

**Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s scope-slug rule before you go on.** Both the
eligibility test and the skip below turn on it, and it is what stands between a feature label somebody
else wrote and a path you build out of it.

An anchor is **eligible** when all of these hold:

- It is **open**, and carries no `blocked` label.
- **No open slice beneath it** carries `blocked`.
- Its feature label matches that scope-slug rule. A label that fails it is skipped (below),
  not blocked — it is not that feature's fault, and pathing `.superdev/scopes/<slug>/…` off unvalidated
  input is exactly the mistake that rule exists to catch.
- Its scope has **no live run**. Check `.superdev/scopes/<slug>/run.lock` (`<slug>` is its feature label
  minus the prefix the store doc names): newer than an hour means another session owns that scope. A run
  lock only ever exists for a `lite`-tier scope
  (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`) — a plan with more than 3 slices runs
  `full` and never gets one, so **no lock present is not by itself eligibility**: fall back to
  `<run-root>/ledger.md`'s mtime instead. Newer than an hour, with the stage short of `shipped`, is a
  weaker signal than a lock — the ledger is written only when a step completes rather than refreshed at
  every step, so a long-running step (a full-tier review grinding to its 3-strike cap, one large slice)
  can leave it stale for over an hour on a run that is still alive. It is still far better than treating
  that scope as eligible outright, which is what no-lock alone would do.

Take eligible anchors in **ascending issue number** — oldest first. Nothing models dependencies between
features, so this is the order, and two features that collide on the same files simply produce a merge
conflict in the second, which blocks it correctly.

Eligibility says nothing about `ready`, deliberately. A part-merged plan and a slice still labelled
`in-progress` from an interrupted run both resume, which §3 handles.

**Skip, rather than block:**

- An anchor that is **not itself a slice and has none beneath it**. The plan was never decomposed;
  `/superdev:plan` is an interview and not yours to run. The store's contract says how to tell — this is
  the one skip that needs it, because a single-slice plan also has no slices beneath its anchor and is
  **not** skipped: there, the anchor is the work.
- An anchor whose **feature label fails the scope-slug rule** in
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`. There is no scope to path on.
- An anchor whose scope holds a **live run** (fresh lock, or — with none — a fresh, unshipped ledger).
  Someone else is working, and nothing is wrong.
- An anchor whose ledger reads `**Stage:** shipped`. The run is done.

Every skip changes no label and does not touch the consecutive-block count. Two of the four are
**transient** — a live run ends, and a shipped run is done — so they stay silent: nothing needs doing and
a maintainer acts on neither.

The other two are **permanent**. A malformed label and a never-decomposed plan are both passed over on
every sweep, forever, until somebody fixes them, and nothing else in this command would ever surface
either. **Name each one in §6's report** with what it needs — a label that matches the scope-slug rule,
or `/superdev:plan` to decompose the anchor.

**A third condition is reported the same way.** A feature label presenting **two or more roots** is a
malformed plan: there is no single Definition of Done to build against, so there is nothing to select and
nothing to label either. Skip it and name it in §6's report. It needs a human, exactly like the two above.

**No eligible anchor** → say so in one line and stop. This is the ordinary end of a sweep, not a failure.

## 3. Take it through the chain

Read `<run-root>/ledger.md` for the scope (`.superdev/scopes/<slug>/`) and start at the step its
`**Stage:**` line has not reached. Resume rather than restart: a merged slice is never rebuilt.

| Stage | Start at |
|---|---|
| no run root, or `implementing` | `/superdev:implement feat/<label> --unattended` |
| `merged` | `/superdev:review <BASE>..superdev/<slug> --unattended` |
| `reviewed` | `/superdev:document <BASE>..superdev/<slug> --unattended` |
| `documented-unreviewed` | `/superdev:review <BASE>..superdev/<slug> --unattended` |
| `documented` | `/superdev:ship <slug> --unattended` |

Then run each remaining step in order. `BASE` is `git merge-base <base> superdev/<slug>`, with the base
branch from `docs/agents/code-management.md`.

`documented-unreviewed` routes to the review, not the ship, because `/superdev:ship --unattended` refuses
a scope whose review never ran. The review is what clears that state.

A feature reaches one of two ends: **shipped** (a pull request is open) or **blocked**. A command can also
stop with an **error** rather than a question — `/superdev:implement`'s "No DoD → don't proceed",
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s wrong-checkout stop — and write no label at all.
§4's closing rule treats that as a
block, so it is never a third end. The one stop that is neither is `/superdev:ship` failing to reach the
code host, which §5 governs: it ends the sweep rather than the feature.

## 4. When a feature blocks

A command you invoked blocked instead of finishing
(`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section says when, and does the
labelling and the comment). Then:

- **Leave the scope standing.** Its branch, worktree, run root and lock all stay. A maintainer resolves
  the decision and finishes that scope by hand — except a `full`-tier scope leaves its branch checked out
  in the one invoking checkout there is (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
  scope-checkout rule), and the next eligible
  feature's chain switches that checkout to its own branch, so "leave it standing" alone no longer tells a
  maintainer where to look. **Record `superdev/<slug>` in the block comment** (append it to what the
  invoked command already wrote, or — for the error-stop case below — include it in the comment you write
  yourself) and **name it in §6's report row**, so resuming by hand is one `git checkout` away.
- **Add one to the consecutive-block count**, and go back to §2 for the next anchor.

**A command that stops without either shipping or blocking counts as a block — except `/superdev:ship`
failing to push or open the pull request, which §5 governs and which labels nothing.**
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s catch-all covers a question with no standing answer;
it says nothing about a command that stops with an **error** instead (`/superdev:implement`'s "No DoD →
don't proceed", that same file's wrong-checkout stop) — no label gets written there, so a re-read of the
tracker finds the anchor still eligible and FIFO re-selects it first, forever. Treat that stop as a block
yourself: label the scope anchor `blocked`, comment on it naming which command stopped and why, and add
one to the consecutive-block count exactly as
above. Do this from what the tracker and the ledger show now — never from memory of features you already
tried this sweep, which a compaction would erase.

A shipped feature **resets that count to zero**.

## 5. When to stop

- **Two consecutive blocked features** → stop. Two independent features failing back to back is a
  systemic cause — a red base, a broken toolchain, an expired token — and every further one would block
  for the same reason. Leave every remaining anchor untouched: open, unlabelled, with no run root.
- **`/superdev:ship` failed** (the push or the pull request did not succeed) → stop at once. Label
  **nothing**: the feature is complete and the fault is the code host's. Its run stays at stage `documented`,
  so a maintainer runs `/superdev:ship <slug>` once the host is reachable. This does not count as a block,
  and it stops the sweep immediately rather than after two, because a second feature would pay for a whole
  chain before failing the same way.
- **No eligible anchor** → stop (§2).
- **The maintainer interrupts** → stop wherever you are. Each command writes the ledger's `**Stage:**`
  line as it completes its own step, so the scope resumes from the right place with no cleanup.

## 6. Report

Print one table, and nothing else:

```
anchor         outcome    where
#128 afk       shipped    <pull-request URL>
#134 metrics   blocked    slice #137 — merge conflict on integration (superdev/metrics)
reports        skipped    2 roots, no single anchor — needs a human
Cache_Sweep!   skipped    label fails the scope-slug rule — rename it
#163 exports   skipped    never decomposed — run /superdev:plan
#141 cache     untouched  halted before it
```

A `skipped` row appears for the three permanent conditions of §2: a feature label with two or more roots,
a feature label that fails the scope-slug rule, and an anchor that was never decomposed. Each row names
what the condition needs. The transient skips — a live run, a shipped run — stay out of the table,
because a maintainer needs no report to act on them.

The durable record already exists where a maintainer would act on it: a comment on each blocked anchor, a
pull request for each shipped one. Write no summary issue and no file.

## Red flags

- **Asking anything.** Nobody is there. Every question has a standing answer, and a stop that has none is
  a block (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`).
- **Running `/superdev:plan`.** It is an interview. An undecomposed plan is skipped, not planned.
- **Selecting by a store's own mechanism.** §2 reads the store's `## Scope anchor` contract. A command
  that tests for an `epic` label is right on one backend and blind on the rest — which is how every
  single-slice plan went unseen before ADR 0017.
- **Re-implementing a chain step.** Invoke the command; it is the only copy of that procedure.
- **Building a queue.** Re-read the tracker each iteration instead.
- **Shipping a partial scope.** A blocked slice abandons its whole feature.
- **Merging a pull request.** You open one and stop.
