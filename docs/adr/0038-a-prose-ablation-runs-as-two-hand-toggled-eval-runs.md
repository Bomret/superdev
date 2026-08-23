# 0038: A prose ablation runs as two hand-toggled eval runs, not a third arm

**Status:** Accepted

## Context

The prompt-architecture rules hold that a contested line gets an eval arm rather than an argument: an
instruction the model already obeys by default is pure context load, whether a line is such a no-op is
model-relative, and `bun run eval` settles it by running the document.

The eval suite cannot currently answer that question. `scripts/eval-run.js` declares
`const ARMS = ['plugin', 'baseline']`, and the plugin arm always loads the repository working tree through
`--plugin-dir`. Every case measures superdev against no superdev. A contested line inside superdev is a
different comparison: superdev with the line against superdev without it. That comparison has no baseline
arm at all, and `ARMS` runs through the scoring fold, the marker check, the broken-ablation guard, and
their selftests.

The first line to need it is `agents/final-reviewer.md`'s ceiling note (ADR 0020): one advisory
observation, gating nothing, that by its own text names nothing to fix, and that may still be the most
useful sentence in a review report.

## Decision

**An internal prose ablation is a pair of whole eval runs of the same case, whose plugin arms differ by one
edit to the plugin's own prose, compared plugin arm against plugin arm. The runner is unchanged and the
toggle is a manual step.**

The procedure: run the case on the working tree, make the one prose edit on a throwaway branch, run the
case again, and read the two plugin arms against each other. `evals/README.md` carries it, beside the rules
for reading a result honestly.

The baseline arm runs in both and is ignored. It is wasted subscription window, and that is the price of
leaving the runner alone.

`CONTEXT.md` calls this a **prose ablation** and not an arm. An arm is one of the two runs a single case
produces, and the glossary already warns against "variant" for the same reason: a third name inside the
arm vocabulary would make the two-arm invariant read as negotiable when it is the thing every case's delta
depends on.

## Considered options

- **Teach the runner a variant arm.** A third entry in `ARMS`, or a `--variant <path>` flag and a
  `plugin_variant` key in `case.yaml`, so one invocation runs both prose versions and prints the delta
  directly. It is repeatable, it removes the manual step, and it would serve every future contested line.
  It loses on cost against evidence: `ARMS` is threaded through scoring, markers, the broken-ablation
  guard, and the selftests, and no prose ablation has run yet. Building the mechanism before the first
  measurement is the speculative-abstraction case the plugin's own review discipline flags.
- **Read the delta from the existing plugin-versus-baseline arms.** The baseline arm has no ceiling note,
  so a grader for surfaced-but-shallow work would show a delta. It costs nothing new. It loses because it
  answers the wrong question: that delta measures whether superdev's review beats no review, not whether
  this section is pulling weight inside a review that has every other axis too.

## Consequences

A prose ablation costs two full runs of a case and answers one question. That is expensive enough to
ration, which suits the rule it serves — a contested line, not every line.

The comparison is only as isolated as the toggle. A run pair made across an unrelated edit to the plugin
tree measures two things at once, and nothing checks for it: the runner sees two ordinary invocations. The
procedure in `evals/README.md` is the whole guard, so a prose ablation is run from a clean tree with one
edit and nothing else.

Should a second and third prose ablation follow, the runner change above becomes the cheaper option and
this decision is the record of why it was not taken first.
