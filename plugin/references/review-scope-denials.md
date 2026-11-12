# Review in scope mode: denials

Applies to a scope-mode `/superdev:review` when the permission classifier denies one of its dispatches or test runs. `${CLAUDE_PLUGIN_ROOT}/references/review-scope-mode.md` sends it here. Read the section for the denied call. `<run-root>` is the value `review-scope-mode.md` names, and a `§` number names that file's step. Each section departs locally from the record-and-continue default of `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes` only where it says so.

## A denied final-reviewer dispatch

**The entry.** Applies beside the skill's degraded-pass step, on a live run. Write the `**Degraded:**` entry per `## Degraded passes` with `scope.js degraded add-denial -`. Pipe the classifier's refusal through a quoted heredoc and never a shell argument.

- **`--unattended`** → read `scope.js get denials` after writing the entry, and **block** once the count reaches the cap in that section, instead of reviewing inline again.

## A denied simplicity-reviewer dispatch

**No entry.** Applies to a denied `simplicity-reviewer` dispatch. It records no `**Degraded:**` entry.

## A denied entry run

**The entry.** Applies to §4.2's entry run when the classifier denies it. It takes the second shape of `## Degraded passes`. Write the `**Degraded:**` entry and hand `denied` to the first `final-reviewer` dispatch.

- **Attended** → continue.
- **Unattended** → **block**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Unattended`.

## A denied exit run

**The record.** Applies to §4.2's exit run when the classifier denies it. Record `denied` with `scope.js suite set denied <tip> --root <run-root>` and write the `**Degraded:**` entry. The stage stays where it is.

- **Attended** → continue to the report, which names the denied exit run.
- **Unattended** → **block**, per `scope-mode.md`'s `## Unattended`.

## A denied fix implementer

**The entry.** Applies when the classifier denies §4.7's fix implementer dispatch. Follow `## Degraded passes`. Write the `**Degraded:**` entry either way with `scope.js degraded add`.

- The fix implementer is an authoring dispatch and none of the three the cap counts.
- **Attended** → apply the fix inline yourself and say so in §3's report.
- **Unattended** → **block there** instead of the `--unattended → fix` rule of §4.6.
