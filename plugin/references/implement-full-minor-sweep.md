# Full tier: the Minor sweep

The full playbook's controller reads this from `implement-full.md`'s `## After the last merge`, with that
playbook still in force, when `scope.js get minors` names a queued slice: once every slice is `merged`, and on a
resumed run whose slices are all `merged`.

## Minor sweep

A non-empty Minor queue gets one sweep, once every slice is `merged` and before run handoff, in the scopetree
(`<run-root>/scopetree`), under slice rules and without asking the operator, attended or unattended.

**The sweep log** is `<run-root>/sweep.md`: git-ignored, append-only scratch the controller owns, and the sweep's
progress log. Seed it once, with a header and `sweep-base <full commit>`, the scope branch's tip at that moment
(`git -C <run-root>/scopetree rev-parse HEAD`). A log that exists is kept, never reseeded.

**Collect.** For each queued slice not yet under a `## <id>` heading in the log, read
`<run-root>/reports/<id>/progress.md` and append under that heading the still-open Minors of the slice's last
review, in full: the `Open Minors` entry written at queueing (`implement-full.md`'s DAG loop step 3, **A Minor-only verdict merges the slice into the
Minor queue**), as the later
entries of that log leave it. A queued slice whose progress log is missing contributes nothing, and the run's final
report names it.

**Every sweep dispatch names the sweep log as its progress log, and no slice's progress log**, so the run trace
files each sweep dispatch under `scope`. Each hands the same contracts the slice dispatches carry: the
dependency record, the run-trace and test-runner instructions, and the inherited-failure rule (`implement-full.md`'s DAG loop step 2).

**Each cycle** counts toward the cap of 3, and the log records each by one line, `cycle <n> base <full commit>`, the
scope tip the cycle began from, appended when the cycle starts:

1. **Fix.** One `superdev:implementer` sweep fix, in the scopetree, carries every collected Minor in cycle 1 and, in
   a later cycle or a reopened cycle 1, every finding the last re-review lists open. It names `<sweep-base>` and the
   log, and hands the `<run-root>/dod.md` path read-only with no listed lines, so the implementer can tell a
   capability the Definition of Done never named. The implementer closes a
   Minor a later slice already resolved with no change made for it, fixes a duplicated Minor once, and reports each
   as its sweep fix dispatch states. The fix takes `haiku` only when every finding in its list is mechanical, as in
   a slice's fix cycle, and any other finding puts the dispatch on `sonnet`. A cycle whose list holds only Minor findings
   continues the previous sweep implementer through SendMessage, as `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s
   `## Warm cycles` states: cycle 1 has no earlier implementer and dispatches fresh. A cycle whose list holds a
   Critical or Important finding dispatches fresh. Wait for the dispatch's end, then run the implement skill's **The sibling check** over the
   scopetree for the key phrase of each rule the fix changed, and send a missed sibling surface back in the same
   cycle.
   The sweep implementer appends its self-check entry to the sweep log before its report, headed `Self-check — sweep cycle <n>` with the current cycle's number, as its `## Self-check` states: each finding's claim quoted beside what the work now does, an item that names a set walked member by member, one mark per member and `covered` only when every member is, a demand from a reference artifact the dispatch cites quoted from that artifact itself, for each finding whose fix changes behaviour one plausible wrong implementation its test rejects, an item no tool the repository offers can observe marked `not observable` with its reason and named in its concerns, and no file, test, or commit pointer standing alone as evidence. The sweep log takes the `dispatch:` marker of `implement-full.md`'s `## Progress log (per slice)` before each dispatch and each resume message. A report whose sweep log holds no entry under the current cycle's heading below its last `dispatch:` line goes back to it in the same cycle: an entry above that line counts for none.
2. **The implementer's fail-to-pass run.** The sweep implementer runs its fail-to-pass run over `<sweep-base>..HEAD`
   before its report, where its range changes both a test-path file and another file and its test-path changes are not
   all deletions. The trace line names
   `scope`. A range with no such line is a report defect, sent back to the implementer in the same cycle.
3. **Re-review.** Always a fresh `superdev:slice-reviewer`, never a resumed one, so its blind pass stays blind. It takes `sonnet` when every finding of the cycle's fix list was mechanical, and `opus` otherwise, per the implement skill's model table. Its subject is the sweep's range, from the tip the latest earlier review read (`<sweep-base>`
   on the first) to the current tip. Hand it the range with both ends full commits, the sweep log path, the
   global constraints, and no text from an implementer's report, and tell it to run no test. Hand it, as quoted data,
   each unclosable **Pass-to-pass** finding the last re-review listed, with its range, its case, and its reason: it
   restates each with its mark re-judged against the range from that finding's base to the current tip,
   so the outcomes below read the findings it restates. It closes or keeps each collected Minor against
   the current code, a copy a later slice made included, and collapses duplicates. After it returns, append your own
   outcome line to the log. Its report is a summary and its full findings are its entry in the sweep log, headed `Review — sweep cycle <n>` with the current cycle's number, so a review whose current entry is missing goes back to that same reviewer through SendMessage to append it, as `implement-full.md`'s `## Progress log (per slice)` states, before you act on its verdict. Tell it the report contract that `implement-full.md`'s DAG loop step 3 gives a slice-reviewer dispatch (`slice-reviewer.md`'s `## Report`), and read its current entry in the sweep log for the fix list. Carry the deferred findings and the dedup rule of
   `${CLAUDE_PLUGIN_ROOT}/references/implement-full-fix-cycle.md`'s `## Deferring a finding` into this dispatch, and
   defer a Minor whose remedy adds a capability the plan never named, as that section states.

**The cycle ends the sweep** when the re-review lists no finding outside the deferred and unclosable ones, or after cycle 3.
No sweep cycle dispatches an implementer when its list would hold only unclosable or deferred findings. A
Minor the sweep's own fix introduced is a finding like any other: it stays in the fix list until a re-review lists
none or the cap arrives.

- **Clean verdict.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" minors clear --root <run-root>`.
- **At the cap, Minors left.** The run's final report names each remaining Minor with the slice that left it, then
  `minors clear` runs. The queue loses them with no record outside the report.
  Remaining **Pass-to-pass** or **Missing fail-to-pass run** findings are named in the report the way a merged slice's
  are, and the queue clears.
- **Only unclosable findings left, at any cycle.** A re-review whose only remaining findings are unclosable
  Pass-to-pass findings, beside any deferred ones, ends the sweep as the clean verdict does. The run's final
  report names each with its range, its case, and its reason.
- **At the cap, a Critical or Important finding left** (a deferred or unclosable one excluded, and the Pass-to-pass and
  Missing fail-to-pass run findings that the item **At the cap, Minors left** names excluded) blocks the run the way a blocked slice does: block per `scope-mode.md`'s **Unattended** section,
  attended or unattended, asking no question. The anchor comment names each remaining finding and the way back:
  an attended `/superdev:implement` run on the scope reopens the sweep, as `## A resumed sweep` states. The Next
  block's `Blocked:` line names the sweep's cap, and its fence holds that command without `--unattended`. The queue
  stays.
- **A denied dispatch** of the sweep's implementer or reviewer → read
  `${CLAUDE_PLUGIN_ROOT}/references/implement-full-denied.md` and follow its `## A denied dispatch`.

## A resumed sweep

**A resumed run** whose queue is non-empty and whose slices are all `merged` runs the sweep from here: it reads
`sweep.md` for its collected Minors, takes the cycle count from the highest `cycle <n>` line after the log's last
`reopen base` line, or in the whole log when it holds none, and continues that cycle from its recorded base, reading
the scopetree's commits since that base and the log's last entry to see which of its steps ran. A log with no such
cycle line starts cycle 1. A cycle whose re-review verdict is in the log ended. Where cycle 3 ended with only the
findings the cap's first two outcomes name, the matching outcome applies at once. Where cycle 3 ended with a
Critical or Important finding left, the sweep stands blocked:

- **Attended** → reopen the sweep with no question asked: the operator who typed the command made that decision.
  Append `reopen base <full commit>`, the scope branch's current tip, to the log, and start cycle 1 again from that
  tip. Its fix carries every finding the last re-review listed open, and the cap of 3 counts the cycles after that
  line.
- **`--unattended`** → block again as the cap outcome does. No standing answer reopens a sweep.
