# evals — does superdev beat plain plan-then-build?

Every case here is one arm of a single question: **on the same task, in the
same repo, does the plugin produce a better plan, better code, and truer docs
than Claude Code with no plugin at all?**

`scripts/eval-run.js` runs each case twice on a Claude subscription instead of
a metered API key (`docs/adr/0024-the-eval-suite-runs-on-subscription-auth.md`).
The plugin arm loads the plugin. The baseline arm loads nothing. The baseline
arm is the control: same prompt, same scaffold, same graders, no superdev.

## Running it

```sh
bun run eval        # all cases, both arms — includes the expensive implement case
bun run eval:plan   # the two plan cases only, both arms — cheap iteration
```

Both need `CLAUDE_CODE_OAUTH_TOKEN`. Create it once with `claude setup-token`
and export it. The runner refuses to start without it and never falls back to
a billed `ANTHROPIC_API_KEY`.

Flags: `--case <glob>` selects cases by name, `--runs <n>` overrides a case's
own run count, `--judge-model <model>` overrides the judge (it defaults to
`haiku`, because judging spends the same subscription window as the arms),
and `--output-dir <dir>` overrides where transcripts, diffs, and the result
land. Results default to `evals/results/<timestamp>/`, which `.gitignore`
excludes.

`claude plugin eval` still reads the same `case.yaml` and `graders/*.md`
files, unchanged, so it stays available for a key-funded cross-check.

## Limits

- **A capture failure scores nothing, on purpose.** The runner refuses to
  score an arm whose work it cannot see, and reports a capture failure
  instead of a number. A leftover `.superdev/` worktree directory is one
  known cause. A case scaffold that does not ignore `.superdev/` leaves it
  tracked as a gitlink. That trips the check even though the arm's work is
  fully captured. A `.gitignore` line for `.superdev/` in the case's
  scaffold avoids it. This matters most for a full-tier plugin arm, which
  creates that worktree.
- **An arm with no superdev marker fails the run.** The broken-ablation check
  needs the plugin arm to show a superdev marker (a command, a subagent, or a
  hook) in at least one run of a case. An arm that only explores, and never
  invokes any of the three, shows none. `bun run eval` then reports the case
  as a broken ablation and exits non-zero, even when `--plugin-dir` isolated
  the arms correctly.

## The cases

| Case | What it costs | What it isolates |
|------|---------------|------------------|
| `ab-plan-edge-case` | cheap, plan only | Does the plan enumerate the failure cases the intent never names — missing widget, unreachable datastore — as acceptance criteria a test could check? |
| `ab-plan-primed` | cheap, plan only | The same feature and the same graders as `ab-plan-edge-case`, from a **primed** prompt. What does the plugin add on top of good prompting, rather than on top of a bare request? |
| `ab-plan-multi-slice` | cheap, plan only | Is a five-operation feature cut into vertical slices with an explicit dependency order, or into horizontal layers? Does every operation get a criterion? |
| `ab-plan-multi-slice-primed` | cheap, plan only | The same feature and the same graders as `ab-plan-multi-slice`, from a **primed** prompt. Does wording buy vertical slicing, the one gap a bare prompt never closed? |
| `ab-implement-lite` | expensive, full build | Shipped code, tests, and docs in a runnable repo: are the two unnamed failure cases handled, are they tested, does the README stay true, is the suite honestly green, and is the diff proportionate? |

### The primed pairs

Two pairs run this way: `ab-plan-edge-case` with `ab-plan-primed`, and
`ab-plan-multi-slice` with `ab-plan-multi-slice-primed`. Each pair is one
experiment in two halves, so the halves share their scaffold and their graders
rather than copying either. The primed case names the bare case's `scaffold.sh`
by relative path, and its `graders/` is a symbolic link. A copy of either could
drift, and two cases that differ by more than their prompt answer no question at
all.

The bare case asks a plain user's question. The primed case supplies the
planning discipline a skilled user supplies by hand: derive the failure cases
the request leaves unsaid, state every criterion as observable behaviour, and
cut the work into units that each ship on their own. It names **discipline
only, never the case's facts** — no failure mode, no missing widget, no count
of slices, no operation that needs the API key, because those are what the
graders check and a prompt naming them would grade itself.

**The priming is written by someone who knows which disciplines are graded.**
That is the limit on how far a primed result generalises: it shows that *this*
wording closes a gap, not that any competent user would write it. A reader who
concludes "prompting is enough" from a primed tie is claiming the reader would
have written this prompt unprompted.

Read the two deltas together. The bare case's delta is the plugin against no
planning discipline at all. The primed case's delta is the plugin against a
user who already has it. A plugin advantage that survives the second is worth
the plugin; one that only appears in the first is worth a sentence of
prompting. Both readings are useful, and neither is the headline on its own.

## Reading a result honestly

- **The graders are format-agnostic on purpose.** None of them require a
  `NN-behavior-*.md` slice file or any other superdev shape — they judge the
  plan or the code wherever it lands and in whatever format. A grader that
  rewards the plugin's file naming would measure compliance, not quality.
- **Every grader scores `both` arms.** A `with-only` grader would inflate the
  plugin arm's total and turn the delta into noise.
- **The scaffold is biased toward the baseline.** `docs/agents/` states the
  repo's conventions — slice-file layout, verification command, documentation
  rule — and the no-plugin arm reads them as ordinary repo docs. That hands the
  control arm hints it would not have in a bare repo. Deliberate: a delta that
  survives a generous baseline is a real delta.
- **The prompts name no slash command.** The plugin arm has to reach for its
  own workflow the way a real user's prompt would, so discoverability is part
  of what is being measured.
- **One run is an anecdote.** Cases default to `runs: 3`; a per-grader delta
  smaller than the spread across those runs is not a result.
- **`ab-implement-lite` runs the `lite` tier** (≤3 slices). The `full` tier's
  parallel worktrees and independent reviewer subagents are not covered by any
  case here — that is the largest unmeasured claim the plugin makes.
- **`readme-stays-true` measures discoverability, not just documentation.**
  `/superdev:implement` stops once the slices are on the scope branch, so the
  doc reconcile is two commands further along the chain, in
  `/superdev:document` (ADR 0013). A plugin arm that stops at the handoff
  therefore scores lower on this grader than one that walks the rest of the
  chain. That gap is the measurement. **Do not "fix" the grader or loosen the
  prompt to close it** — the prompt names no slash command by design, and
  tuning either one would fit the instrument to the result and hide the real
  cost the chain asks of a user.

## Adding a case

A case is `case.yaml` + `graders/*.md`, plus a `scaffold_script` path relative
to the case directory (never an inline block). A grader is frontmatter plus
criteria prose. The harness accepts six grader types: `llm`, `regex`,
`file_exists`, `tool_order`, `tool_used`, `baseline`. Every grader needs a
positive `weight`. An `llm` or `regex` grader also needs a `focus` or
`target`. The graders here use `files`, which scores the diff, and `trace`,
which scores the whole transcript. The harness accepts more values than those
two. It is early access and carries no public schema, so read the values off
the harness rather than from a list here. Prefer `regex` when the check is
mechanical: it is free and deterministic. `scripts/drift-check.js` checks
this shape, so a malformed grader fails `bun run test` instead of surfacing
part-way through a paid run. Keep new graders arm-neutral for the same reason
the existing ones are.
