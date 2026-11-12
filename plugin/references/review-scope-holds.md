# Review in scope mode: holds

Applies to a scope-mode `/superdev:review` at the moment `${CLAUDE_PLUGIN_ROOT}/references/review-scope-mode.md` sends it here: an anchor check that refuses or cannot read, a stop with a finding standing, or the fix cap. Read the section that fired. `<run-root>`, `<branch>`, and `<base>` are the values `review-scope-mode.md` names, and a `§` number names that file's step.

## The anchor check's refusals

**At review entry.** Applies to §4.1's anchor check when it does not pass.

- **A refusal at a stage before `shipped`** → a standing defect. Make the standing-defect writes below, one `**Unresolved:**` entry per problem line, worded `anchor Definition-of-Done check: <problem>`, for each problem line no entry `scope.js get unresolved --root <run-root>` prints already names. The stage stays where it is, and the review continues with its other steps.
- **A refusal at `shipped` or `closed`** → name each problem in the report, and write no entry.
- **A failed anchor read or Absorbs read** → skip the check and say so in one line of the report. It never blocks here. The re-sync's check below holds the stage write on a failed re-read while a standing `anchor Definition-of-Done check:` entry stands.
- **The hand fix.** The anchor text is the operator's to change, so the review dispatches no implementer for a refusal. The report names the fix: add the `(triage <reference>)` citation to the delivering criterion in both the anchor and `dod.md`, or drop the entry from the Absorbs line, then run `/superdev:review` again.

**Before a stage write.** Applies to the anchor check §4.10's anchor re-sync runs on the re-read lines, when it does not pass.

- **A refusal at a stage before `shipped`** → stop the stage write, make the standing-defect writes below, and end the review.
- **A failed anchor read or Absorbs read at a stage before `shipped`, while an entry worded `anchor Definition-of-Done check:` stands** (`scope.js get unresolved --root <run-root>`) → stop the stage write and end the review the same way, leaving the entries standing. With no such entry, the entry branch's failed-read skip applies.
- **A refusal at `shipped` or `closed`** → name each problem in the report, as the entry branch states, and continue.

## The standing-defect writes

**The writes.** Applies to a stop with a finding standing: §4.6's Declined branch, the cap below, and each anchor-check refusal above.

- Write the `**Unresolved:**` entry with a quoted heredoc (`<<'SUPERDEV_TEXT_EOF'`) piped to `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved add - --root <run-root>` (`${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`).
- **At a `submitted` stage**, also invalidate the tip's suite record with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite set none <sha> --root <run-root>`, `<sha>` being the scope branch's current tip.
- Leave the stage where it is.

## At the cap

**The cap's branches.** Applies when §4.7's re-review comes back after the third fix cycle with a finding in the chosen set still standing.

- **Only Minor findings remain**, warranted cuts included → take the clean-verdict path of §4.10 once the exit run of §4.2 is green, naming the leftover Minors in the report and nowhere else. A red exit run at the cap is a remaining red suite.
- **The only remaining Critical or Important findings are Pass-to-pass or Missing fail-to-pass run** → the scope proceeds under §3's combined verdict once the exit run of §4.2 is green. This holds attended and unattended. Any of them beside a Critical or Important finding of another kind blocks. An unclosable finding is never that other kind: beside it, cycles fix the others only, and at the cap the others alone decide.
- **A Critical or Important finding, a broken criterion, or a red suite remains** → stop and say it is a wrong cut and no bug, and make the standing-defect writes above.
- **`--unattended`, at that stop** → **block** per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Unattended`, after the same writes.
