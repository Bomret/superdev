# Definition-of-Done ticks

Applies to every controller that judges a Definition-of-Done line. An implementer reports on a line and never
ticks it. The controller that dispatched it judges the report and writes the tick.

## The mapping gate

**The listed lines.** Applies to every dispatch that asks a worker to report on criteria. Hand the worker the
`dod.md` path and the exact criterion lines it reports on, the **listed lines**. Tick only a line your own dispatch
listed. Record a report's claim about any other criterion as a note on the local `dod.md` copy alone, and leave it
for run handoff's settling pass over every `scope`-tagged and cross-slice criterion.

**Matching a tag to a slice.** Applies to every tagged criterion. A tag (`plan-contract.md`'s `### Criterion tags`)
reads a slice `id` before any issue exists, and the active store's own notation (`#<n>` on Forgejo/GitHub,
`PROJ-<n>` on Jira) once `/superdev:plan` rewrites it through `scope.js dod-tags` (`plan-contract.md`'s
`## Definition of Done ticks`). Match it through the ledger's `issue` column (`scope.js get slices`: `id` ↔
`issue`): an `id` tag names that slice, and a store-notation tag names the slice whose `issue` equals it.

- A tag naming several slices joins bare references with `, ` (`#1388, #1396`, `PROJ-1, PROJ-2`).
- `scope` and `docs` never resolve through the column, and each stays as written.
- A `docs` line is no slice's listed line: the review and the doc pass settle it (`### A docs line`, *Document's
  case*).

**No tags at all.** Applies to a `dod.md` that carries no tag on any line.

- **The ledger lists exactly one slice** → `dod.md` is that single-slice feature's own DoD (`plan-contract.md`'s
  `### Criterion tags`). Every line is a listed line of that slice, with no mapping to resolve.
- **The ledger lists more than one slice** → no line is any slice's listed line. Run handoff's handoff pass settles
  every line as if it read `scope`.

**An untagged line.** Applies to an untagged line in a `dod.md` that also carries tags, such as an appended epic line
no tagging pass reached. It is no slice's listed line. Run handoff's handoff pass settles it as if it read `scope`.

**Implement's case:** Applies to a slice dispatch. The listed lines are exactly the `dod.md` lines the mapping gate
matches to that slice's own `id`. A line tagged with several slices is a listed line for each, and the report on it
judges this slice's own delivery (met, not met, or ceiling), naming no sibling slice.

**A joint line.** Applies to a line tagged with several slices, at the controller. Never tick it while any other
slice in its tag stands unmerged per the ledger (`scope.js get slices`). Record a `met` report on it, with another
tagged slice unmerged, as `not met: <the report's evidence>; remaining: <the unmerged ids>`.

- Only the report from the **last** tagged slice to merge can tick the line, and only when that report says `met`
  and no earlier tagged slice's note on the line is a real `not met:`.
- A `not met: <evidence>; remaining: <unmerged ids>` note this rule recorded names no defect, so it is no real
  `not met:`.
- A genuine `not met:` or `ceiling:` note from an earlier tagged slice leaves the line unticked after the last slice
  reports `met`, carrying both notes' gist, for run handoff's handoff pass to settle.

**Other dispatches.** Applies to every dispatch that is not a slice dispatch. Its surface states its own listed set
where it wires the gate. A review fix loop's dispatch lists the criteria that pass is judging, tied to no slice id.

**Review's case:** Applies to the scope review. `final-reviewer` judges every `dod.md` line, ticked or not, and
returns a verdict for each: holds, broken, ceiling, accepted, or doc pass (`agents/final-reviewer.md`'s `### Output
and verdict` section, its `### Criteria` block). The review's controller acts on each verdict per
`review-scope-mode.md`'s `### 4.5 The Definition-of-Done criteria` and `### 4.9 The re-tick`.

- **Broken** → untick the line with a note, and fold it into the fix loop's findings. A fix cycle's dispatch lists
  exactly the lines that cycle unticked or found broken.
- **The fix implementer's report** on a listed line is judged as `## Reading the report` states.
- **Ceiling** → never listed. On a line noted neither `ceiling:` nor `accepted:`, untick it with the note
  `ceiling: <the verdict's partial evidence>`. A line already noted `ceiling:` or `accepted:` stays as it stood.
- **Accepted** → leave the line exactly as it stood. Only an attended operator writes `accepted:`.
- **Holds** → `### A holds tick`.
- **Doc pass** → `### A docs line`.

### A docs line

**A `docs`-tagged line waits for the doc pass.** Applies to a `docs` line at the scope review. `final-reviewer` gives
an unmet one the `doc pass` verdict, and the review's controller writes nothing for it. It gets no note, no untick
of an unjudged line, no fix-cycle listing, and no `**Unresolved:**` entry, and it never holds the stage at review. A
`holds` verdict ticks it (`### A holds tick`).

**A fix cycle that landed commits unticks every `docs` line noted `met:`.** Applies to the trigger that clears the
inline doc-pass record. Untick each such line with the note `not met: a fix cycle landed after the doc pass`, and the
next doc pass judges it again. The untick makes no suite-record write at any stage.

- **At `documented` or `submitted`** → also write one `**Unresolved:**` entry per line, worded `docs criterion unmet
  after the doc pass: <criterion>`, after the clean verdict's `unresolved clear`, and route the run to
  `/superdev:document`.
- **At `shipped` or `closed`** → write no entry and change no route. The review's report names each unticked line,
  and a shipped run's open lines reach `/superdev:verify-ship` as `not met:` lines.

### A holds tick

**A `holds` verdict can tick a line.** Applies to a `holds` verdict at the scope review. It keys on the line's note,
whatever its checkbox shows (`## The note rule`). On a line noted `not met:`, or carrying no note, a bare `[x]`
included, the review's controller ticks it with the verdict's own evidence as the note.

- **A line noted `ceiling:`** takes a holds tick only when the verdict states the criterion needs no deploy or other
  outward-facing change to verify, and cites evidence observed on the branch.
- **A line noted `accepted:`** takes a holds tick only when the verdict cites evidence, observed on the branch, that
  the criterion is now met.
- **A line noted `met:`** → nothing changes.
- A `holds` verdict never ticks a line that genuinely needs a deploy to verify.
- A re-tick after a fix cycle follows the fix implementer's report, once that cycle's re-review comes back clean.

### Document and verify-ship

**Document's case:** Applies to the doc pass. Its own controller judges from its own direct check against the branch,
never from a dispatched worker's report. Its listed lines are the `dod.md` lines noted `met:` that its own doc
commits could touch, and every open `docs`-tagged line (`## The note rule`), a `[x]` line noted `not met:` included.
No other line is a listed line for this pass, so it touches no other tick.

- **A `met:` line** its commits could touch: one the branch still satisfies stays exactly as it stood, with no note
  added; one its own change broke is unticked, with a one-line note on what broke it.
- **An open `docs` line** is judged against the branch after the pass: a true one is ticked with its evidence; a
  false one is unticked with a `not met:` note naming what the `AGENTS.md` text still lacks.
- **An `accepted:` `docs` line** stays exactly as it stands. Only an attended operator writes or removes
  `accepted:`.
- **At `shipped` or `closed`** → the pass judges no `docs` line. Its report names each open one, and the shipped or
  closed route picks the next command.

**Verify-ship's case:** Applies to `/superdev:verify-ship`. Its own controller judges from its own direct
observation, never from a dispatched worker's report. Its listed lines are exactly the open lines of `dod.md`
(`## The note rule`): at `shipped`, the `ceiling:` lines, the `not met:` lines whenever written, and the lines with no
note, whatever box each shows.

- **Observed true** → `met: <evidence>`.
- **Observed false** → `not met: <the observation>`, ending in the repair citation (`shipped-run.md`'s `## Routing a
  shipped run`).
- **Not observable** → ask the attended operator. *verified* writes `met:` with the answer as the evidence, *false*
  writes `not met: <the answer>` ending in the repair citation, *accept as unverifiable* writes `accepted: <the
  operator's reason>`, and *later* leaves the line unchanged.
- Each verdict goes through `scope.js dod-line`, which redraws the line's box from the verdict. A settled line is
  never a listed line and is never rewritten.
- A `not met:` note written before merge carries no repair citation, so the shipped-run routing rule sends a run whose
  `not met:` notes were all written before merge to verify-ship before any repair is planned.

**Verifying observes.** Applies to the doc pass and verify-ship. Verifying a line changes no system outside the
repository.

## The note rule

**The line format.** Applies to every judged line. It carries a note, in `plan-contract.md`'s line format:

```
- [x] <criterion> — <ids|scope> — met: <evidence>
- [ ] <criterion> — <ids|scope> — not met: <reason>
- [ ] <criterion> — <ids|scope> — ceiling: <partial evidence>
- [ ] <criterion> — <ids|scope> — accepted: <reason>
```

A ticked line's note names the evidence. An unticked line's note names why the criterion is not met, that only a
deploy can verify it (`ceiling:`), or that an attended operator accepted it as unmet (`accepted:`), with any partial
evidence the report gathered. A bare tick with no note is invalid, and a writer never writes one.

**A line's state is read from its note, never from its checkbox** (ADR 0247, INV-0190). Applies to every command that
judges a line open or settled, from `dod.md` or from the scope anchor's lines. The note's label is the text right
after the line's leftmost ` — [<tag> — ]` boundary, taking whichever of the tagged and untagged boundaries leaves the
shorter criterion, as `lib/dod-line.js`'s parser reads it, matched as a whole label and never as a substring.

- **Settled line**: a line whose note's label is `met:` or `accepted:`, whatever its checkbox shows. A `[ ] … met:`
  line is settled.
- **Open line**: every other line: a note labelled `not met:` or `ceiling:`, or no note at all. A bare `[x]` carries
  no note, so it is open.

**The listing verb.** Applies to a caller that reads `dod.md`. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js"
dod-open --root <run-root>` and take each line's state from it. The caller keeps the judgment of what an open line
needs.

- It prints one tab-separated line per criterion: `open` or `settled`, the label (`met`, `not-met`, `ceiling`,
  `accepted`, or `none` for a line with no note), the tag (`-` for none), `repair-citation` or `-`, and the criterion
  text.
- The fourth field reads `repair-citation` for a `not met:` note that ends in the observed citation
  (`shipped-run.md`'s `## Routing a shipped run`).
- A last `stage-hold: yes|no` line answers whether any open line other than a `ceiling:` line, an `accepted:` line,
  or a `docs` line holds the scope review's stage write.
- `--tag docs` prints the open `docs` lines alone.
- A missing, unreadable, or fence-broken `dod.md` is refused. One with no criterion line prints `no criteria` and exits
  non-zero. Neither reads as every line settled.

**`accepted` is written only by an attended operator, never by a report.** Applies to every writer of a verdict. No
mapping-gate dispatch reports `accepted`, and no controller writes it from a report: only an attended operator's own
decision, mid-conversation with the controller, writes it. No unattended run and no subagent writes it.

- **`/superdev:abandon`'s confirm is such a decision.** Its note reads `accepted: abandoned in <component> via
  /superdev:abandon`. On a shared anchor it ticks only the lines `scope.js dod-own` gives this repository. These ticks
  are the one exception to `## Only a controller ticks`: abandon has no run left to hold `dod.md`, so it writes each
  line straight to the anchor through the store document's `## Definition of Done ticks` call, which is what a
  sibling's wrap-up reads.
- The stage gate treats an `accepted:` line as settled: review raises no Critical finding and holds no stage on it,
  and run handoff, document's re-check, and ship's gate read it the same way.
- Review still challenges the line's facts through a holds tick (`### A holds tick`). Review never turns an unmet
  criterion into `accepted:` on its own.

**A listed line the report never touches is a report defect, not an unjudged line.** Applies to every report on
listed lines. Every listed criterion gets exactly one line in one of the note shapes. Never tick an omitted listed
line: send the report back for it before merging or ticking anything else from that report, the same re-ask a
`NEEDS_CONTEXT` status gets. Only a line the dispatch never listed, tagged to another slice or to `scope`, carries no
note from the report.

## Only a controller ticks

**The writer.** Applies to every tick and untick. Writing one is the controller's own act, never a subagent's, and
never `/superdev:submit-pr`'s or `/superdev:ship`'s. Judge one criterion at a time, from one report or from one direct
check on a pass with no dispatched worker, never batched from an assumption about what several reports covered. Each
write lands in `<run-root>/dod.md`, the run's own working copy.

- **Implement's case and run handoff's pass write `dod.md` alone.** The scope review copies their ticks onto the
  scope anchor through the anchor sync (`## Pairing dod.md with the anchor`).
- **Every other write also lands on the scope anchor**: review's, the doc pass's, and verify-ship's.
- **The anchor write** goes through the active slice store's own `## Definition of Done ticks` section, which runs
  `scope.js dod-line` (`plan-contract.md` → *Definition of Done ticks*) through that store's gated **Edit an issue's
  body** rule. It is best-effort. With a Repository component configured it matches the anchor line by criterion
  text and tag (`## Pairing dod.md with the anchor`).

## Pairing dod.md with the anchor

**Pairing and verdicts.** Applies to every command that compares `dod.md` with the scope anchor. `dod.md` is
authoritative. An anchor line **pairs** with a `dod.md` line by criterion text, the match `scope.js dod-line` uses.
A line's **verdict** is its note's verdict (`met:`, `not met:`, `ceiling:`, `accepted:`, or no note), never the box
alone.

**A shared anchor.** Applies to every pairing, anchor sync, and anchor tick when `docs/agents/issue-tracker.md`
configures a Repository component (`plan-contract.md` → *A shared anchor*). A line pairs by criterion text and tag:
`dod-line`'s `--tag-file` with the `dod.md` line's tag and `--component` with the run's component. A plain `scope` or
`docs` tag in `dod.md` pairs with its own `scope (<component>)` or `docs (<component>)` line on the anchor. A
sibling repository's line is no `dod.md` line's pair, so it is never paired, synced, or reported unpaired, and it
stays exactly as it was, its note included (INV-0004, INV-0015).

**The anchor sync.** Applies to a paired line whose verdict on the anchor differs from `dod.md`. Rewrite each such
anchor line from `dod.md` through the store's `## Definition of Done ticks` section (`scope.js dod-line`), one line at
a time, and leave a paired line whose verdict agrees untouched. A failed anchor call is reported once and stops
nothing.

- **The scope review** runs it at entry, before its first dispatch of `final-reviewer`, at every stage it accepts,
  whatever its verdict (`review-scope-mode.md`'s `### 4.1 The scope checkout and the base`), and again before each
  stage write (`### 4.10 The clean verdict and the handoff`).
- **`/superdev:verify-ship`** runs it before it observes anything.

**An unpaired line.** Applies to a `dod.md` line with no text-matching line on the anchor. It is never counted as a
verdict disagreement and never retried by the anchor sync. It needs a hand-sync of the anchor's criterion text to
`dod.md`'s, and the scope review's report names it.

## Reading the report

**Ticking from a report.** Applies to an implementer's report, which carries one line per listed criterion
(`agents/implementer.md`'s per-criterion report section and its verification-ceiling clause).

- **Met** → tick the listed line, with that evidence as the note.
- **Not met or ceiling** → leave the listed line unticked, with that reason or partial evidence as the note.
- **A listed line omitted** → send the report back for it (`## The note rule`).
- **Any other claim** → apply the mapping gate (`## The mapping gate`).
