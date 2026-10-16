# 0020: The final-reviewer derives its own criteria

**Status:** Accepted

**Amended by:** [ADR 0158](0158-the-derive-dispatch-runs-in-the-background-and-reads-no-definition-of-done.md),
whose plan-time derive mode takes no Definition of Done at all, path or text.

## Context

Every quality bar superdev applies to code is a floor. The Definition of Done is written by `/superdev:plan`'s
interview and `final-reviewer` then checks the work against that same list, so a criterion the interview never
thought to write is one no gate can miss. `references/review-checklist.md` is external to that loop but every
lens in it names an absence of bad: anti-patterns, vulnerability classes, duplicate implementations,
convention drift. `references/controlled-prose.md` and `references/content-types.md` are the only positive
standard in the plugin, and they govern documentation alone. A scope can therefore go green, tick every DoD
box, clear every lens, and still be work that stopped at the first thing that passed.

`/superdev:review` handed `final-reviewer` the DoD as **text** in its dispatch prompt. A prompt arrives at
once, so no instruction to the agent could have made it write its own criteria before seeing the plan's.

## Decision

`final-reviewer` writes its own acceptance criteria from the feature's intent, which is the scope anchor's title and
`<run-root>/ledger.md`'s slice list. It does that before it reads the diff or the Definition of Done, then
reports the diff between its list and the DoD's. `/superdev:review` hands it `<run-root>/dod.md`'s **path** rather than
its text, which is what makes that ordering real.

On a review that finds nothing Critical or Important, the reviewer may add one **ceiling note**: a DoD
criterion this review found satisfied but met shallowly. It is admissible only if it names that
criterion, names a concrete consequence, and is the single largest such gap. It never gates a merge and never
triggers the fix loop.

Both are scope mode only. An ad-hoc range's `acceptance` *is* its intent, so deriving criteria from it and
diffing against it is circular, and a ceiling note has no criterion the review found satisfied to name.

## Considered options

- **A blind A/B critic against a reference artifact**, the source method's own mechanism. It needs two
  artifacts to compare, and superdev builds once. Building each slice twice to discard one buys nothing outside
  taste-domains.
- **An exemplar field on the epic.** One inspectable comp the reviewer measures against. Most features have
  no honest comp, and a field whose usual answer is "none" becomes ceremony everyone types past.
- **Dropping the 3-strike fix-loop cap and looping until the work wins.** The cap is what lets
  `/superdev:afk` terminate. The source method relies on a human watching and stopping the run. A sweep has
  nobody there, and any budget stop added to make it safe is the cap wearing a hat.
- **A separate dispatch that never receives the DoD.** True fresh context, and the strongest form of the
  independence this ADR is after. It loses on cost: a round trip per run plus an agent file and its checks,
  to harden an ordering that passing a path already makes honest.
- **An always-fires gap note.** Rejected as an infinite backlog generator: every run ends with a paper cut
  and readers learn to skip reviewer output, which is worse than no note. The four gates exist to answer it.
- **Admitting a note when it is "valuable."** The threshold is an adjective, so an agent clears it every
  time. Replaced by gates a reader can catch the reviewer violating.

## Consequences

`/superdev:review`'s scope-mode dispatch now carries a path where it carried text, and `drift-check.js`
asserts both halves: the dispatch that hands the path, and the agent instruction that reads it late. Without
that pair the derivation degrades silently into theater: references still resolve, the suite stays green, and
the reviewer reads the DoD first, as before.

The cost is a reviewer that can report a criterion the plan never wrote, which is a finding about the plan
rather than the code, at a gate whose fix loop only knows how to change code. `final-reviewer` already
carries the instruction for this ("if the problem is with the plan rather than the code, say so"), and the
maintainer decides. Whether the ceiling note's four gates leave it firing at a useful rate is not knowable
before it runs. If it never fires, the prose is dead and comes out.
