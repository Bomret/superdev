# Definition-of-Done ticks

A controller ticks from an implementer's report. Neither playbook's implementer writes a
tick itself — it reports, and the controller that dispatched it judges the report and writes the tick.

## The mapping gate

A dispatch hands the worker the `dod.md` path plus the exact criterion lines it must report on — the
**listed lines**. A controller ticks only a line its own dispatch listed; a report claiming any other
criterion is not ticked from: the controller records the claim as a note on the local `dod.md` copy
alone, and leaves it there for run handoff's own settling pass over every `scope`-tagged and
cross-slice criterion.

**Matching a tag to a slice.** A criterion's tag (`plan-contract.md`'s `### Criterion tags`) reads a slice
`id` before any issue exists, and the active store's own notation (`#<n>` on Forgejo/GitHub, `PROJ-<n>`
on Jira) once `/superdev:plan` rewrites it through `scope.js dod-tags` (`plan-contract.md`'s `## Definition of Done ticks`),
a tag naming several slices as bare references joined by `, ` (`#1388, #1396`, `PROJ-1, PROJ-2`). A
controller matches a tag to a slice through the ledger's `issue` column (`scope.js get slices`: `id` ↔
`issue`) — a tag already in `id` notation names the slice by `id` directly; a tag in the store's own
notation names the slice whose `issue` equals it. `scope` and `docs` never resolve through that column — each
stays as written, and a `docs` line is no slice's listed line (Review's case and Document's case below
settle it).

**No tags at all.** A `dod.md` carrying no tags anywhere, on a ledger listing exactly one slice, is that
single-slice feature's own DoD (`plan-contract.md`'s `### Criterion tags`: "a single-slice feature carries
no tags"): every line is a listed line of that lone slice, with no mapping to resolve. **An untagged line in a
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
differently — a review fix loop's dispatch lists whatever criteria that pass is judging, tied to no slice id; each such
surface states its own listed set where it wires the gate.

**Review's case:** `final-reviewer` judges every `dod.md` line, ticked or not, and returns its own verdict
for each — holds, broken, ceiling, accepted, or doc pass (`agents/final-reviewer.md`'s `### Criteria`
section). The review's
controller (`review-scope-mode.md`'s `### 4.5 The Definition-of-Done criteria` and `### 4.9 The re-tick`) unticks a line `final-reviewer` calls broken, with a note, and folds it into the fix loop's
findings; a fix cycle's dispatch then lists exactly the lines that cycle unticked or found broken. The fix
implementer's report on those listed lines is judged the same way as any other: `met` re-ticks the line
with that evidence, `not met`/`ceiling` leaves it unticked with that reason, and an omitted listed line is
sent back per the note rule below. A `ceiling` verdict is never listed — no fix cycle can close it. An
`accepted` verdict leaves the line exactly as it stood: only an attended operator writes `accepted:`.

**A `docs`-tagged line waits for the doc pass**. `final-reviewer` gives an unmet one the `doc
pass` verdict, and the review's controller writes nothing for it: no note, no untick of an unjudged line,
no fix-cycle listing, and no `**Unresolved:**` entry, so it never holds the stage at review.
A `holds` verdict ticks it as below. **A fix cycle that landed commits unticks every ticked `docs` line**,
with the note `not met: a fix cycle landed after the doc pass`, on the same trigger that clears the
inline doc-pass record: those commits may have made the `AGENTS.md` text stale, and the next doc pass
judges the line again. At a `documented` or `submitted` stage no doc pass follows in the chain, so that
untick also writes one `**Unresolved:**` entry per line, worded `docs criterion unmet after the doc pass:
<criterion>`, after the clean verdict's `unresolved clear`, and routes the run to `/superdev:document`.
At a `shipped` or `closed` stage the untick writes no entry, invalidates no suite record, and changes no
route; the review's report names each unticked line, and a shipped run's open lines reach
`/superdev:verify-ship` as `not met:` lines. A doc pass at that stage judges no `docs` line and routes as
any shipped or closed run does (Document's case below).

**A `holds` verdict can tick a line too.** A `holds` verdict on a line that stands unticked with `not
met:`, or carries no note at all, ticks that line — the review's controller writes the tick, with the
verdict's own evidence as the note; a joint criterion a slice under-reported, a `scope` line
judged too early, or an implementer that misjudged its own work all take this shape. A line unticked with
`ceiling:` takes a holds tick only when the verdict itself states the criterion needs no deploy or other
outward-facing change to verify and cites evidence observed on the branch — the ceiling claim was wrong,
and the line was never a ceiling criterion. A `holds` verdict never ticks a line that genuinely needs a
deploy to verify; post-deploy verification of such a line is a later feature's own concern. A
`holds` verdict on an already-ticked line changes nothing. Re-ticking after a fix cycle still follows the
fix implementer's report, once that cycle's re-review comes back clean.

**Document's case:** the doc pass's own controller judges, never a dispatched worker's report. Its listed
lines are the ticked `dod.md` lines its own doc commits could touch — a criterion naming a file, an
ADR, a glossary entry, or a fixture those commits changed — and every `docs`-tagged line neither ticked
nor `accepted:`. It
re-checks each ticked line against what its own commits just landed: a line the branch still satisfies is
left exactly as it stood, with no note added; a line its own change broke is unticked, with a one-line note
on what broke it. It judges each `docs` line neither ticked nor `accepted:` against the branch after its
pass: a true one is ticked with its evidence; a false one is unticked with a `not met:` note naming what
the `AGENTS.md` text still lacks. An `accepted:` `docs` line is left exactly as it stands: only
an attended operator writes or removes `accepted:`. At a `shipped` or `closed` stage the pass
judges no `docs` line: its report names each unticked one, and the shipped or closed route picks the next
command. No other line is a listed line for this pass, so an earlier tick outside that set
is never touched. Verifying a line observes; it changes no
system outside the repository.

**Verify-ship's case:** `/superdev:verify-ship`'s own controller judges, never a dispatched worker's
report. Its listed lines are exactly the `dod.md` lines that are neither ticked nor `accepted:` — at
`shipped`, the `ceiling:` lines and the `not met:` lines, its own earlier ones and any written before
merge. It observes each one
inline against the deployed system: observed true writes `met: <evidence>`, observed false writes
`not met: <the observation>` ending in the repair citation
(`shipped-run.md`'s `## Routing a shipped run`), and a line it cannot observe goes to the attended
operator. The answer *verified* writes `met:` with the answer as the evidence, *false* writes
`not met: <the answer>` ending in the repair citation, *accept as unverifiable* writes
`accepted: <the operator's reason>`, and *later* leaves the line unchanged. Verifying a line
observes; it changes no system outside the repository. A ticked or
`accepted:` line is never a listed line and is never rewritten. A `not met:` note written before merge
carries no repair citation, so the shipped-run routing rule sends a run whose `not met:` notes were all
written before merge to verify-ship before any repair is planned.

## The note rule

Every judged line carries a note, in `plan-contract.md`'s line format:

```
- [x] <criterion> — <ids|scope> — met: <evidence>
- [ ] <criterion> — <ids|scope> — not met: <reason>
- [ ] <criterion> — <ids|scope> — ceiling: <partial evidence>
- [ ] <criterion> — <ids|scope> — accepted: <reason>
```

A ticked line's note names the evidence. An unticked line's note names why the criterion is not met,
that only a deploy can verify it (`ceiling:`), or that an attended operator accepted it as unmet
(`accepted:`), with any partial evidence the report already gathered. A bare tick with no note
is invalid.

**`accepted` is written only by an attended operator, never by a report.** No mapping-gate dispatch —
implement's slice dispatch, a review fix cycle, run handoff's own settling pass — ever reports
`accepted`, and no controller writes it from a report the way it writes `met`/`not met`/`ceiling`: only
an attended operator's own decision, mid-conversation with the controller, does. No unattended run and
no subagent writes it; an unattended run meeting an unmet criterion behaves exactly as it does today.
The stage gate treats an `accepted:` line as settled — review does not raise it as a Critical
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

## Only a controller ticks

Writing a tick is the controller's own act, never a subagent's, and never `/superdev:submit-pr`'s or
`/superdev:ship`'s. `/superdev:verify-ship`'s own controller ticks from its own direct observation. The same
holds for an untick — document's case above writes one from its own direct check against the branch,
never from a dispatched report. One criterion is judged at a time, from one report or, on a pass with no
dispatched worker, that same direct check — never batched from an assumption about what several reports
together must have covered. Each write lands in `<run-root>/dod.md`, the run's own working copy:

- **Implement's case and run handoff's pass write `dod.md` alone.** They are the only writers that skip
  the anchor, so its checklist lacks their ticks until the anchor sync copies them.
- **Every other write also lands on the scope anchor**: review's, the doc pass's, and verify-ship's. The
  review runs the anchor sync at entry and again before each stage write (`## Pairing dod.md with the anchor`
  below).
- **The anchor write** goes through the active slice store's own `## Definition of Done ticks` section
  (every store document carries one), which runs `scope.js dod-line` (`plan-contract.md` → *Definition of
  Done ticks*) for the line edit itself through that store's gated **Edit an issue's body** rule (ADR
  0115) — best-effort, the same posture every other anchor write in the chain takes.

## Pairing dod.md with the anchor

`dod.md` is authoritative. Implement and run handoff write no anchor line, and a store's tick
write is best-effort, so the anchor can lag it. An anchor line **pairs** with a `dod.md` line by
criterion text, the match `scope.js dod-line` uses. A line's **verdict** is its note's verdict — `met:`,
`not met:`, `ceiling:`, `accepted:`, or no note — never the box alone: an unticked anchor line with no
note differs from an unticked `dod.md` line noted `not met:`. Every command that compares the two reads
them this way:

- **A paired line whose verdict on the anchor differs from `dod.md`** is a tick the anchor has not
  received yet. The **anchor sync** rewrites each such anchor line from `dod.md` through the store's
  `## Definition of Done ticks` section (`scope.js dod-line`), one line at a time, and leaves a paired line
  whose verdict agrees untouched. The scope review runs it at entry, before its first dispatch of
  `final-reviewer`, at every stage it accepts, whatever its verdict
  (`review-scope-mode.md`'s `### 4.1 The scope checkout and the base`), and again before each stage write
  (`### 4.10 The clean verdict and the handoff`). `/superdev:verify-ship` runs it before it observes anything.
  A failed anchor call is reported once and stops nothing.
- **A `dod.md` line with no text-matching line on the anchor** is unpaired. It is never counted as a
  verdict disagreement and is never retried by the anchor sync, because `dod-line` cannot rewrite a line
  the anchor lacks. It needs a hand-sync of the anchor's criterion text to `dod.md`'s; the anchor sync
  cannot reach it, and the scope review's report names it.

## Reading the report

The implementer's report carries one line per criterion its dispatch listed: met with evidence, not met
with a reason, or ceiling with whatever partial evidence it gathered (`agents/implementer.md`'s
per-criterion report section, INV-0006's verification-ceiling clause). The controller ticks a listed
line the report calls met, with that evidence as the note; leaves a listed line the report calls not met
or ceiling unticked, with that reason or partial evidence as the note; sends the report back for any
listed line it omits, per the note rule above; and applies the mapping gate above to anything else the
report claims.
