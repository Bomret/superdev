# Review in scope mode: denials

Applies to a scope-mode `/superdev:review` when the permission classifier denies one of its dispatches. `${CLAUDE_PLUGIN_ROOT}/references/review-scope-mode.md` sends it here. Read the section for the denied call. `<run-root>` is the value `review-scope-mode.md` names, and a `§` number names that file's step. Each section departs locally from the record-and-continue default of `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes` only where it says so.

## A denied final-reviewer dispatch

**The entry.** Applies beside the skill's degraded-pass step, on a live run. Write the `**Degraded:**` entry per `## Degraded passes` with `scope.js degraded add-denial -`. Pipe the classifier's refusal through a quoted heredoc and never a shell argument.

- Ask `scope.js denial final-reviewer [--unattended]` for the verdict, per that section's `**The verdict**`: `inline` → review inline as §3's report says, and a `block …` verdict blocks instead of reviewing inline again.

## A denied simplicity-reviewer dispatch

**No entry.** Applies to a denied `simplicity-reviewer` dispatch. It records no `**Degraded:**` entry.

## A denied fix implementer

**The entry.** Applies when the classifier denies §4.7's fix implementer dispatch. Follow `## Degraded passes`. Write the `**Degraded:**` entry either way with `scope.js degraded add`.

- The fix implementer is an authoring dispatch and none of the three the cap counts.
- **Attended** → apply the fix inline yourself and say so in §3's report.
- **Unattended** → `scope.js denial fix --unattended` prints `block implementer`: **block there** instead of the `--unattended → fix` rule of §4.6.
