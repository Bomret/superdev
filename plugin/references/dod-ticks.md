# Definition-of-Done ticks

A controller ticks from an implementer's report (ADR 0091). Neither playbook's implementer writes a
tick itself — it reports, and the controller that dispatched it judges the report and writes the tick.

## The mapping gate

A dispatch hands the worker the `dod.md` path plus the exact criterion lines it must report on — the
**listed lines**. A controller ticks only a line its own dispatch listed; a report claiming any other
criterion is not ticked from: the controller records the claim as a note on the local `dod.md` copy
alone, and leaves it there for run handoff's own settling pass over every `scope`-tagged and
cross-slice criterion.

**Matching a tag to a slice.** A criterion's tag (`plan-contract.md`'s `### Criterion tags`) reads a slice
`id` before any issue exists, and the active store's own notation (`#<n>` on Forgejo/GitHub, `PROJ-<n>`
on Jira) once `/superdev:plan` rewrites it (`plan-contract.md`'s `## Definition of Done ticks`). A
controller matches a tag to a slice through the ledger's `issue` column (`scope.js get slices`: `id` ↔
`issue`) — a tag already in `id` notation names the slice by `id` directly; a tag in the store's own
notation names the slice whose `issue` equals it. `scope` never resolves through that column — it stays
`scope`.

**No tags at all.** A `dod.md` carrying no tags anywhere, on a ledger listing exactly one slice, is that
single-slice feature's own DoD (`plan-contract.md`'s `### Criterion tags`: "a single-slice feature carries
no tags"): every line is a listed line of that lone slice, with no mapping to resolve. **A `dod.md`
carrying no tags anywhere on a ledger listing more than one slice** — a run begun under a superdev version
that predates tagging — resolves no line to any slice either: every line is treated as if it read `scope`,
settled by run handoff's handoff pass the same way an untagged line below is. **An untagged line in a
`dod.md` that also carries tags** — a pre-existing or appended epic line no tagging pass reached — is not
a listed line for any slice; run handoff's handoff pass settles it as if it read `scope`
(`references/run-handoff.md`, `references/implement-lite.md`).

**Implement's case:** in a slice dispatch, the listed lines are exactly the `dod.md` lines the mapping
above matches to that slice's own `id`. A criterion tagged with
several slices is still a listed line for each — the report on it is whatever this slice's own delivery
warrants (met, not met, or ceiling), naming no sibling slice: the implementer cannot see which of them
have merged, so it never judges the joint line as a whole. **A line tagged with several slices never
ticks while any other slice in its tag stands unmerged, per the ledger** (`scope.js get slices`) — the
controller reads that, the implementer does not. A `met` report on such a line, with another tagged slice
still unmerged, is recorded as `not met: <the report's evidence>; remaining: <the unmerged ids>`, never
ticked. Only the report from the **last** tagged slice to merge can tick the line, and only when that
report itself says `met` **and no earlier tagged slice's recorded note on that line is a real `not
met:`** — a `not met: <evidence>; remaining: <unmerged ids>` note this same rule recorded because a
sibling stood unmerged names no defect in the work itself, so it is not a real not-met. A genuine `not
met:`/`ceiling:` note from an earlier tagged slice leaves the line unticked even after the last slice
reports `met`, carrying both notes' gist, for run handoff's handoff pass to settle. Other dispatches list
differently — a review fix loop's dispatch, or run
handoff's red-suite loop, lists whatever criteria that pass is judging, tied to no slice id; each such
surface states its own listed set where it wires the gate.

**Review's case:** `final-reviewer` judges every `dod.md` line, ticked or not, and returns its own verdict
for each — holds, broken, or ceiling (`agents/final-reviewer.md`'s `### Criteria` section). The review's
controller unticks a line `final-reviewer` calls broken, with a note, and folds it into the fix loop's
findings; a fix cycle's dispatch then lists exactly the lines that cycle unticked or found broken. The fix
implementer's report on those listed lines is judged the same way as any other: `met` re-ticks the line
with that evidence, `not met`/`ceiling` leaves it unticked with that reason, and an omitted listed line is
sent back per the note rule below. A `ceiling` verdict is never listed — no fix cycle can close it.

**A `holds` verdict can tick a line too.** A `holds` verdict on a line that stands unticked with `not
met:`, or carries no note at all, ticks that line — the review's controller writes the tick, with the
verdict's own evidence as the note (INV-0015); a joint criterion a slice under-reported, a `scope` line
judged too early, or an implementer that misjudged its own work all take this shape. A line unticked with
`ceiling:` takes a holds tick only when the verdict itself states the criterion needs no deploy or other
outward-facing change to verify and cites evidence observed on the branch — the ceiling claim was wrong,
and the line was never a ceiling criterion. A `holds` verdict never ticks a line that genuinely needs a
deploy to verify (INV-0006); post-deploy verification of such a line is a later feature's own concern. A
`holds` verdict on an already-ticked line changes nothing. Re-ticking after a fix cycle still follows the
fix implementer's report, once that cycle's re-review comes back clean.

**Document's case:** the doc pass's own controller judges, never a dispatched worker's report. Its listed
lines are exactly the ticked `dod.md` lines its own doc commits could touch — a criterion naming a file, an
ADR, a glossary entry, or a fixture those commits changed. It re-checks each against what its own commits
just landed: a line the branch still satisfies is left exactly as it stood, with no note added; a line its
own change broke is unticked, with a one-line note on what broke it. No other line is a listed line for
this pass, so an earlier tick outside that set is never touched. Verifying a line observes; it changes no
system outside the repository (ADR 0084, INV-0006).

**Verify-ship's case:** `/superdev:verify-ship`'s own controller judges, never a dispatched worker's
report. Its listed lines are exactly the `dod.md` lines that are neither ticked nor `accepted:` — at
`shipped`, the `ceiling:` lines and its own earlier `not met:` lines (INV-0016). It observes each one
inline against the deployed system: observed true writes `met: <evidence>`, observed false writes
`not met: <the observation>`, and a line it cannot observe goes to the attended operator, whose answer
writes `met:`, `not met:`, or `accepted:` (ADR 0095), or leaves the line unchanged. Verifying a line
observes; it changes no system outside the repository (ADR 0084, INV-0006, ADR 0106). A ticked or
`accepted:` line is never a listed line and is never rewritten.

**Wrap-up's case:** on the local plan-file store only, `/superdev:wrap-up`'s own controller writes an
attended operator's `accepted:` into `<run-root>/dod.md` through `scope.js dod-line`, for a `ceiling:` line
the operator accepts as unverifiable. That store has no verify-ship, so this is the one post-merge
`dod.md` writer besides verify-ship. It is attended only (ADR 0095); an unattended run writes nothing
there.

## The note rule (INV-0014)

Every judged line carries a note, in `plan-contract.md`'s line format:

```
- [x] <criterion> — <ids|scope> — met: <evidence>
- [ ] <criterion> — <ids|scope> — not met: <reason>
- [ ] <criterion> — <ids|scope> — ceiling: <partial evidence>
- [ ] <criterion> — <ids|scope> — accepted: <reason>
```

A ticked line's note names the evidence. An unticked line's note names why the criterion is not met,
that only a deploy can verify it (`ceiling:`), or that an attended operator accepted it as unmet
(`accepted:`, ADR 0095), with any partial evidence the report already gathered. A bare tick with no note
is invalid.

**`accepted` is written only by an attended operator, never by a report.** No mapping-gate dispatch —
implement's slice dispatch, a review fix cycle, run handoff's own settling pass — ever reports
`accepted`, and no controller writes it from a report the way it writes `met`/`not met`/`ceiling`: only
an attended operator's own decision, mid-conversation with the controller, does. No unattended run and
no subagent writes it; an unattended run meeting an unmet criterion behaves exactly as it does today.
The stage gate (INV-0016) treats an `accepted:` line as settled — review does not raise it as a Critical
finding and does not hold the stage on it, and run handoff, document's re-check, and ship's gate all read
it the same way. Review still challenges the line's own facts: a `holds` verdict on an `accepted:` line
whose criterion the branch has since come to meet ticks it `met:`, the same re-tick a `holds` verdict
already gives a plain `not met:` line above — review never turns an unmet criterion into `accepted:` on
its own.

**A listed line the report never touches is a report defect, not an unjudged line.** Every criterion the
dispatch listed gets exactly one line, in one of the three shapes above — the worker either found the
evidence a criterion is met, or says why it could not meet it. The controller never ticks an omitted
listed line, and sends the report back for that line before merging or ticking anything else from it
(the same re-ask a NEEDS_CONTEXT status gets). "A line the report never touches carries no note at all"
stays true only for a line the dispatch never listed — one tagged to another slice, or to `scope`.

## Only a controller ticks (INV-0015)

Writing a tick is the controller's own act, never a subagent's, and never `/superdev:submit-pr`'s or
`/superdev:ship`'s. `/superdev:verify-ship`'s own controller ticks from its own direct observation. The same
holds for an untick — document's case above writes one from its own direct check against the branch,
never from a dispatched report. One criterion is judged at a time, from one report or, on a pass with no
dispatched worker, that same direct check — never batched from an assumption about what several reports
together must have covered. Each write lands in two places:

- **`<run-root>/dod.md`**, the run's own working copy.
- **The scope anchor**, through the active slice store's own `## Definition of Done ticks` section
  (every store document carries one), which fetches the checklist text and pipes it through
  `scope.js dod-line` (`plan-contract.md` → *Definition of Done ticks*) for the line edit itself —
  best-effort, the same posture every other anchor write in the chain takes.

## Pairing dod.md with the anchor

`dod.md` is authoritative (INV-0016), and a store's tick write is best-effort, so the anchor can lag it.
An anchor line **pairs** with a `dod.md` line by criterion text, the match `scope.js dod-line` uses.
Every command that compares the two reads them this way:

- **A paired line whose verdict on the anchor differs from `dod.md`** is a failed tick write.
  `/superdev:verify-ship` reconciles it by rewriting the anchor line from `dod.md` through the store's
  `## Definition of Done ticks` section (`scope.js dod-line`), before it observes anything.
- **A `dod.md` line with no text-matching line on the anchor** is unpaired. It is never counted as a
  verdict disagreement and is never retried by the reconcile, because `dod-line` cannot rewrite a line
  the anchor lacks. It needs a hand-sync of the anchor's criterion text to `dod.md`'s; verify-ship cannot
  reconcile it.

## Reading the report

The implementer's report carries one line per criterion its dispatch listed: met with evidence, not met
with a reason, or ceiling with whatever partial evidence it gathered (`agents/implementer.md`'s
per-criterion report section, INV-0006's verification-ceiling clause). The controller ticks a listed
line the report calls met, with that evidence as the note; leaves a listed line the report calls not met
or ceiling unticked, with that reason or partial evidence as the note; sends the report back for any
listed line it omits, per the note rule above; and applies the mapping gate above to anything else the
report claims.
