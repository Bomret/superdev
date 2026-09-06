# Ceiling-note prose ablation — verdict: KEEP, no measurable difference

**Case:** `ab-review-ceiling`
**Toggle:** the ceiling note removed from `plugin/agents/final-reviewer.md` (the
`## The ceiling note` section, its `### Ceiling` block in the `## Output`
template, and the closing paragraph) **and** from `plugin/skills/review/SKILL.md`
(the `### Ceiling` block in §3's report template, and §4's "never gates" bullet).
Nothing else — the passing cross-reference in §4's deferred-finding bullet
("the same non-gating shape the over-engineering and ceiling notes below use")
was left in place, per the rule that a passing cross-reference is harmless and
only an instruction to emit the thing is not.

**Precondition, confirmed first.** A single run against the corrected fixture
(commit `ec6d093`, which fixed the `README.md`/DoD overclaim the previous
attempt's void run found) scored the plugin arm 1.00 across every grader,
confirming the "nothing Critical, nothing Important" gate is now legitimately
satisfiable.

**Run A:** ceiling note present. 3 runs, n=3.
**Run B:** ceiling note removed. 3 runs, n=3.

**Verdict: keep the note.** Every grader's delta sits inside its own spread —
not one row clears the bar `evals/README.md` sets: "a delta smaller than the
spread across runs is not a result." The prose is unchanged.

## The numbers, plugin arm against plugin arm

```
GRADER                       A (present)   B (removed)   DELTA    SPREAD
names-the-shallowness        0.67±1.00     1.00±0.00     +0.33    1.00
no-invented-defects          0.67±1.00     0.33±1.00     -0.33    1.00
reviews-against-the-dod      0.67±1.00     0.33±1.00     -0.33    1.00
stayed-read-only             1.00±0.00     1.00±0.00      0.00    0.00
```

Every non-zero delta is smaller than its own spread. No row is a result.

## This confirms the earlier void run's structural finding

The void run from the previous attempt (fixture defect notwithstanding) already
predicted this: at `runs: 3` with binary graders, a grader that is not
unanimous has spread 1.00 by construction, so a delta below 1.00 can never
register as a result. This valid attempt reproduces exactly that shape — the
instrument can only detect a total, unanimous change at this run count, and
the ceiling note's effect (if any) is not one.

**Widening the run count or moving to a graded (non-binary) grader** is what a
future attempt would need to resolve this further. Out of scope here: this
slice's job was to run the comparison and act on the verdict, not redesign the
instrument.

## A second, unrelated finding surfaced during this run

The runner's baseline-arm isolation (a throwaway `HOME`, meant to stop the
no-plugin arm from loading the maintainer's real installed copy of superdev)
does not fully hold on every machine. The baseline arm's transcript
occasionally showed real paths under `~/.claude/plugins/cache/superdev/...`,
including once after the maintainer's global `enabledPlugins` flag was turned
off for the duration of both runs. The throwaway `HOME` stops the `claude`
binary from auto-loading the plugin as an active extension, but it does not
sandbox the filesystem: an agent using its ordinary `Read`/`Bash`/`Grep` tools
can still browse and read the real `~/.claude` tree, because there is no
chroot or container underneath the throwaway-`HOME` trick.

This did not block reading this ablation's answer, because a prose ablation
compares the plugin arm against itself across two runs and never reads the
baseline arm. It would block the runner's other purpose — the ordinary
with/without-plugin A/B elsewhere in `evals/`, where the baseline arm's
cleanliness is exactly what is being measured. Filed as a follow-up rather
than fixed here: this slice's DoD is the ceiling-note verdict, not the
runner's sandboxing.
