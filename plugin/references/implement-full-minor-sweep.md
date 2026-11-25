# Full tier: the Minor sweep

Applies to the full playbook's controller, read from `implement-full.md`'s `## After the last merge` with that playbook
in force, when `scope.js get minors` names a queued slice: once every slice is `merged`, and on a resumed run whose
slices are all `merged`.

## Minor sweep

**One sweep.** Applies to a non-empty Minor queue. Run one sweep once every slice is `merged` and before run handoff,
in the scopetree (`<run-root>/scopetree`), under slice rules. It asks the operator nothing, attended or unattended.

**The sweep log.** Applies to `<run-root>/sweep.md`, the sweep's progress log: git-ignored, append-only scratch you
own. Seed it once, with a header and `sweep-base <full commit>`, the scope branch's tip at that moment (`git -C
<run-root>/scopetree rev-parse HEAD`). Keep a log that exists, and never reseed it.

- Every sweep dispatch names the sweep log as its progress log and no slice's progress log, so the run trace files it
  under `scope`.
- The sweep log takes the `dispatch:` marker of `implement-full.md`'s `## Progress log (per slice)` before each
  dispatch and each resume message, and its current-entry rule.

**Collect.** Applies to each queued slice not yet under a `## <id>` heading in the log. Read
`<run-root>/reports/<id>/progress.md`, and append under that heading the still-open Minors of the slice's last review,
in full: the `Open Minors` entry written at queueing (`implement-full.md`'s **A Minor-only verdict merges the slice
into the Minor queue**), as the later entries of that log leave it. A queued slice whose progress log is missing
contributes nothing, and the run's final report names it.

**Each cycle.** Applies to every sweep cycle, each counting toward the cap of 3. Append `cycle <n> base <full commit>`,
the scope tip the cycle began from, when the cycle starts, then run these steps in order.

1. **Fix.** One `superdev:implementer` sweep fix, in the scopetree. Its model follows `skills/implement/SKILL.md`'s `##
   Model selection`. Hand it only these values:
   - the list: every collected Minor in cycle 1, and every finding the last re-review lists open in a later cycle or
     a reopened cycle 1;
   - `<sweep-base>`, the sweep log path, and the heading of its self-check entry, `Self-check — sweep cycle <n>`;
   - the `<run-root>/dod.md` path, read-only, with no listed lines;
   - the range base from `scope.js base resolve`, for the same-defect search over `<range-base>..HEAD`;
   - the verify skill's path, or `none` (`skills/implement/SKILL.md`'s **The config**);
   - the feature's change type and the scope anchor's store reference: its fix commits' messages take both, per
     `commit-messages.md`, and a refused commit ends it `BLOCKED`.

   Tell it to fix the list and to work its sibling surfaces, per `skills/implement/SKILL.md`'s **Sibling surfaces**.
   `agents/implementer.md` owns the rest: `## The sweep fix dispatch`, `### Sibling surfaces`, `### Running tests`,
   `### Fail-to-pass run`, `### A dependency you add`, `### Edit tools`, `## A failing test your slice did not cause`,
   `## Self-check`, and `## Report`.
   - **A warm cycle.** A cycle whose list holds only Minor findings continues the previous sweep implementer through
     SendMessage, per `scope-findings.md`'s `## Warm cycles`. Cycle 1 has no earlier implementer and dispatches fresh,
     and so does a cycle whose list holds a Critical or Important finding.
   - **The sibling check.** Wait for the dispatch's end, then run `skills/implement/SKILL.md`'s **The sibling check**
     over the scopetree, and send a missed sibling surface back in the same cycle.
2. **The sweep's self-check.** The sweep implementer appends a fresh entry headed `Self-check — sweep cycle <n>` to the
   sweep log before its report, as `agents/implementer.md`'s `## Self-check` states for a sweep fix dispatch, on a
   fresh dispatch and on a resume alike. A report whose sweep log holds no entry under the current cycle's heading
   below its last `dispatch:` line goes back in the same cycle; an entry above that line counts for none.
3. **The implementer's fail-to-pass run.** Where the range changes both a test-path file and another file and its
   test-path changes are not all deletions, the sweep implementer's fail-to-pass run over `<sweep-base>..HEAD` writes a
   trace line naming `scope`. A range with no such line is a report defect, sent back in the same cycle.
4. **Re-review.** **The sweep's re-review is always a fresh `superdev:slice-reviewer`**, never a resumed one. Its model
   follows `skills/implement/SKILL.md`'s `## Model selection`. Hand it only these values:
   - the subject, the sweep's range, from the tip the latest earlier review read (`<sweep-base>` on the first) to the
     current tip, both ends full commits;
   - the sweep log path, the heading `Review — sweep cycle <n>`, and the global constraints;
   - each unclosable **Pass-to-pass** finding the last re-review listed, with its range, its case, and its reason, as
     quoted data;
   - the deferred findings, per `implement-full-fix-cycle.md`'s `## Deferring a finding`;
   - the verify skill's path, or `none`: configuration, never report text.

   Hand it no text from an implementer's report. `agents/slice-reviewer.md`'s `## Sweep review`, `## Run-trace
   findings`, `## Progress-log append`, and `## Report` own the rest. After it returns, append your own outcome line,
   send a missing current entry back to the same reviewer through SendMessage, and read the entry for the fix list.
   Defer a Minor whose remedy adds a capability the plan never named, per `implement-full-fix-cycle.md`'s `##
   Deferring a finding`.

**The sweep's end.** Applies to every sweep re-review. The cycle ends the sweep when the re-review lists no finding
outside the deferred and unclosable ones, or after cycle 3. No cycle dispatches an implementer when its list would
hold only unclosable or deferred findings. A Minor the sweep's own fix introduced stays in the fix list until a
re-review lists none or the cap arrives.

- **Clean verdict** → run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" minors clear --root <run-root>`.
- **Only unclosable findings left, at any cycle**, beside any deferred ones → end the sweep as the clean verdict does.
  The run's final report names each with its range, its case, and its reason.
- **At the cap, Minors left** → the run's final report names each remaining Minor with the slice that left it, then
  `minors clear` runs. Remaining **Pass-to-pass** or **Missing fail-to-pass run** findings are named in the report the
  way a merged slice's are, and the queue clears.
- **At the cap, a Critical or Important finding left** (a deferred or unclosable one excluded, and the findings **At
  the cap, Minors left** names excluded) → block the run as a blocked slice does, per `scope-mode.md`'s `## Unattended`,
  attended or unattended, asking no question. The anchor comment names each remaining finding and the way back: an
  attended `/superdev:implement` run on the scope reopens the sweep (`## A resumed sweep`). The Next block's `Blocked:`
  line names the sweep's cap, and its fence holds that command without `--unattended`. The queue stays.
- **A denied dispatch** of the sweep's implementer or reviewer → read `implement-full-denied.md` and follow its `## A
  denied dispatch`.

## A resumed sweep

**Continue from the log.** Applies to a resumed run whose queue is non-empty and whose slices are all `merged`. Read
`sweep.md` for its collected Minors, and take the cycle count from the highest `cycle <n>` line after the log's last
`reopen base` line, or in the whole log when it holds none. Continue that cycle from its recorded base, reading the
scopetree's commits since that base and the log's last entry to see which of its steps ran.

- A log with no cycle line starts cycle 1.
- A cycle whose re-review verdict is in the log ended.
- Cycle 3 ended with a verdict **The sweep's end.** settles without a block (clean, only unclosable findings, or
  Minors left) → that outcome applies at once.

**A sweep that stands blocked.** Applies where cycle 3 ended with a Critical or Important finding left.

- **Attended** → reopen the sweep with no question asked. Append `reopen base <full commit>`, the scope branch's
  current tip, to the log, and start cycle 1 again from that tip. Its fix carries every finding the last re-review
  listed open, and the cap of 3 counts the cycles after that line.
- **`--unattended`** → block again as the cap outcome does. No standing answer reopens a sweep.
