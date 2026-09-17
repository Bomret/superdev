# evals: superdev against plain plan-then-build

Every case here is one arm of a single question: **on the same task, in the
same repo, does the plugin produce a better plan, better code, and truer docs
than Claude Code with no plugin at all?**

`scripts/eval-run.js` runs each case twice on a Claude subscription instead of
a metered API key (`docs/adr/0024-the-eval-suite-runs-on-subscription-auth.md`).
The plugin arm loads the plugin. The baseline arm loads nothing. The baseline
arm is the control: same prompt, same scaffold, same graders, no superdev.

## Running it

```sh
bun run eval        # all cases, both arms — includes the expensive implement cases
bun run eval:plan   # the plan cases only, both arms — cheap iteration
```

Both need `CLAUDE_CODE_OAUTH_TOKEN`. Create it once with `claude setup-token`
and export it. The runner refuses to start without it and never falls back to
a billed `ANTHROPIC_API_KEY`.

These flags adjust a run. `--case <glob>` selects cases by name. `--runs <n>`
overrides a case's own run count. `--judge-model <model>` overrides the judge,
which defaults to `haiku`, because judging spends the same subscription window
as the arms. `--output-dir <dir>` overrides where transcripts, diffs, and the
result land. Results default to `evals/results/<timestamp>/`, which
`.gitignore` excludes.

`claude plugin eval` still reads the same `case.yaml` and `graders/*.md`
files, unchanged, so it stays available for a key-funded cross-check.

## Limits

- **A capture failure scores nothing, on purpose.** The runner refuses to
  score an arm whose work it cannot see, and reports a capture failure
  instead of a number. A leftover `.superdev/` worktree directory left
  untracked is one known cause: it lands in the captured diff as a gitlink
  and trips the runner's capture check even though the arm's work is fully
  captured. That worktree is created at run time, by a `full`-tier plugin
  arm's own `/superdev:implement`, not authored by the scaffold — a case
  whose plugin arm may reach that tier (`ab-implement-full`'s scaffold is the
  example) gitignores `.superdev/` wholesale for exactly this, since nothing
  the scaffold wrote pre-exists under it for `Grep` to need. A scaffold that
  builds a branch and then checks the base branch back out is a second known
  cause: the orphan guard cannot tell the scaffold's own setup commits from
  an agent's stray branch, so every arm fails capture and the case scores
  nothing while spending a full run. A scope-mode scaffold ends on the
  branch it built, and `drift-check.js`'s `scaffold-ledger` check catches the
  common form of the mistake. **A scaffold that pre-authors its own run
  root** (`.superdev/scopes/<scope>/`, `ab-review-ceiling`'s scaffold is the
  example) **must never gitignore it** — `Grep` is ripgrep-backed and skips
  an ignored path even when it exists on disk, so an arm told to find its
  specification there comes up empty. Commit that run root onto the base
  branch instead, before the scope branch is cut: tracked, so `Grep` finds
  it, and outside the range a review resolves, so it never shows up as an
  added file in the diff under test.
- **An arm with no superdev marker fails the run.** The broken-ablation check
  needs the plugin arm to show a superdev marker (a command, a subagent, or a
  hook) in at least one run of a case. An arm that only explores, and never
  invokes any of them, shows none. `bun run eval` then reports the case
  as a broken ablation and exits non-zero, even when `--plugin-dir` isolated
  the arms correctly.
- **The baseline arm's isolation is not a real sandbox.** The runner points
  the baseline arm at a throwaway `HOME`, which stops the `claude` binary
  from auto-loading the maintainer's installed copy of superdev as an active
  extension. It does not sandbox the filesystem: an agent using its ordinary
  `Read`/`Bash`/`Grep` tools can still browse and read the real `~/.claude`
  tree underneath the throwaway `HOME`, because there is no chroot or
  container. Filed as issue #403 for the actual fix, rather than solved here.

## The cases

| Case | What it costs | What it isolates |
|------|---------------|------------------|
| `ab-plan-edge-case` | cheap, plan only | Does the plan enumerate the failure cases the intent never names (missing widget, unreachable datastore) as acceptance criteria a test could check? |
| `ab-plan-primed` | cheap, plan only | The same feature and the same graders as `ab-plan-edge-case`, from a **primed** prompt. What does the plugin add on top of good prompting, rather than on top of a bare request? |
| `ab-plan-multi-slice` | cheap, plan only | Is a five-operation feature cut into vertical slices with an explicit dependency order, or into horizontal layers? Does every operation get a criterion? |
| `ab-plan-multi-slice-primed` | cheap, plan only | The same feature and the same graders as `ab-plan-multi-slice`, from a **primed** prompt. Does wording buy vertical slicing, the one gap a bare prompt never closed? |
| `ab-review-ceiling` | moderate–expensive, review only (same per-run timeout as an expensive case; a prose ablation runs it twice) | Given finished work that meets its specification and has no defects, what is a review worth? Does it find the recorded Definition of Done and check every criterion, does it name a concrete shallowness in correct code without relabelling it a defect, and does it stay read-only? **Primed**: its prompt names `/superdev:review`, because it doubles as the vehicle a prose ablation toggles the ceiling note across — see *Running a prose ablation*. |
| `ab-implement-lite` | expensive, full build | Shipped code, tests, and docs in a runnable repo: are the two unnamed failure cases handled, are they tested, does the README stay true, is the suite honestly green, and is the diff proportionate? |
| `ab-implement-full` | most expensive, full build | The same question over a five-operation feature with an auth rule, sized to invite more than three slices. Does every operation ship, get a test, and reach the README, does the auth split hold, does the work land in reviewable commits, and does the diff stay proportionate? The tier the plugin arm reaches is its own decision, so read the slice count before reading the result as a `full`-tier one. |

### The primed pairs

The pairs that run this way are `ab-plan-edge-case` with `ab-plan-primed`, and
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
only, never the case's facts**: no failure mode, no missing widget, no count
of slices, and no operation that needs the API key. Those are what the graders
check, and a prompt naming them would grade itself.

**The priming is written by someone who knows which disciplines are graded.**
That is the limit on how far a primed result generalises: it shows that *this*
wording closes a gap, not that any competent user would write it. A reader who
concludes "prompting is enough" from a primed tie is claiming the reader would
have written this prompt unprompted.

Read the two deltas together. The bare case's delta is the plugin against no
planning discipline at all. The primed case's delta is the plugin against a
user who already has it. A plugin advantage that survives the second is worth
the plugin. One that only appears in the first is worth a sentence of
prompting. Both readings are useful, and neither is the headline on its own.

## Reading a result honestly

- **The graders are format-agnostic on purpose.** None of them require a
  `NN-behavior-*.md` slice file or any other superdev shape. They judge the
  plan or the code wherever it lands and in whatever format. A grader that
  rewards the plugin's file naming would measure compliance, not quality.
- **Every grader scores `both` arms.** A `with-only` grader would inflate the
  plugin arm's total and turn the delta into noise.
- **The scaffold is biased toward the baseline.** `docs/agents/` states the
  repo's conventions (slice-file layout, verification command, documentation
  rule), and the no-plugin arm reads them as ordinary repo docs. That hands the
  control arm hints it would not have in a bare repo. This is deliberate: a
  delta that survives a generous baseline is a real delta.
- **The prompts name no slash command, except `ab-review-ceiling`.** Everywhere
  else the plugin arm has to reach for its own workflow the way a real user's
  prompt would, so discoverability is part of what is being measured. That case
  names `/superdev:review` because it is also the vehicle a prose ablation runs
  on, and the prose being ablated lives inside `final-reviewer`: an arm that
  reviews inline never loads it, so the toggle changes nothing and the two runs
  compare identical conditions. Observed on a real run — the arm made 17 Bash
  calls, no `Task` call, opened no plugin file, and produced a perfectly good
  review of its own. Both arms get the same wording, phrased so a baseline arm
  with no such command reviews by hand instead, which is what it would do
  anyway. The cost is that this case measures discoverability for nobody; the
  other cases still do.
- **One run is an anecdote.** Cases default to `runs: 3`. A per-grader delta
  smaller than the spread across those runs is not a result.
- **The implement cases split the tiers.** `ab-implement-lite` runs the
  `lite` tier (3 slices or fewer). `ab-implement-full` sizes its feature past
  that threshold, so the plugin arm reaches the `full` tier's parallel
  worktrees and its isolated implementer and reviewer subagents. The tier is
  the plugin arm's own decision, not a flag the case sets, so a plugin arm that
  cuts the same feature into three slices runs `lite` and measures `lite`. Read
  the transcript's slice count before reading the `full` case as a `full`-tier
  result.
- **A `focus: trace` grader can outgrow its judge.** The judge receives the whole transcript. A
  `full`-tier plugin arm produced 1.6 MB, roughly 430k tokens, against the baseline arm's 172 KB, and
  every `trace` grader on that arm came back as a grader error while the same graders judged the
  baseline fine. The score stays honest, because a grader that errored on either arm is dropped from
  both, so the two halves remain fractions over the same weight total. What is lost is the comparison
  itself: the `trace` axis goes unmeasured on the arm that most needed it. Prefer `focus: files` for
  anything the diff can show, and read a `—` in a `trace` row with no `!` line beside it as "the
  transcript outgrew the judge", not as "the arm did badly". A `—` that carries a `! grader` line
  names its own reason: that grader errored and scored in neither arm, and the run exits non-zero.
- **`ab-implement-full` and `ab-review-ceiling` allow `Task`.** The
  `full` tier cannot dispatch a subagent without it, and neither can
  `/superdev:review` reach `final-reviewer`. Both arms get it in both cases, so
  the baseline can dispatch its own subagents too and the ablation stays one
  variable.
- **`readme-stays-true` measures discoverability, not just documentation.**
  `/superdev:implement` stops once the slices are on the scope branch, so the
  doc reconcile is two commands further along the chain, in
  `/superdev:document` (ADR 0013). A plugin arm that stops at the handoff
  therefore scores lower on this grader than one that walks the rest of the
  chain. That gap is the measurement. **Do not "fix" the grader or loosen the
  prompt to close it.** The prompt names no slash command by design, and
  tuning either one fits the instrument to the result and hides the real
  cost the chain asks of a user.

## Running a prose ablation

Every case above measures superdev against no superdev. A **prose ablation**
measures superdev against itself: one edit to the plugin's own prose, to settle
whether a contested instruction earns its context (ADR 0038). No rule demands
one: reach for it when a line's cost justifies the subscription window.

The runner has no arm for this. `ARMS` is `plugin` and `baseline`, and the
plugin arm always loads the working tree. So the ablation is two ordinary runs
with a manual toggle between them:

```sh
git status --porcelain            # must be empty: see the warning below
bun run eval --case ab-review-ceiling     # run A, prose as it stands

git switch -c scratch/<what-you-cut>
# make the ONE prose edit, and nothing else
bun run eval --case ab-review-ceiling     # run B, prose removed

git switch -                      # the scratch branch is throwaway
```

Read run A's **plugin** arm against run B's **plugin** arm, per grader. The
baseline arm runs in both and is ignored: it loads no plugin, so it cannot
show the difference an edit to the plugin made. That is wasted subscription
window, and it is the price of leaving the runner alone.

**The tree must be clean before run A, and the toggle must be the only change
between the two.** The runner sees two ordinary invocations and cannot tell
whether anything else moved. A pair made across an unrelated plugin edit
measures two things at once and reports it as one number. This procedure is the
whole guard.

**Cut every document the instruction reaches, not just the one that explains
it.** A contract in an agent body also holds in the dispatch prose that reaches
it, and the dispatch wins a conflict (root `AGENTS.md`). The ceiling note lives
in `agents/final-reviewer.md` *and* in `skills/review/SKILL.md`'s report template:
removing only the agent leaves the controller still carrying a `### Ceiling`
section, so run B is a half-removal that measures nothing clean. A passing
cross-reference elsewhere is harmless; an instruction to emit the thing is not.

**Confirm the ablated code path actually ran.** The runner's marker check is a
bare `/superdev:[a-z-]+` match, which the plugin's own skills listing in the
system prompt satisfies on every run — so a plugin arm that reviewed inline and
dispatched nothing still reports as a healthy ablation. Before comparing, check
the plugin arm's transcript for a real `Task` call naming the subagent whose
prose was toggled. Prose that never loaded cannot differ between two runs.

Everything under *Reading a result honestly* still applies, and the first rule
applies hardest: one run is an anecdote. A per-grader difference smaller than
the spread across a case's own runs is not a result, and "no measurable
difference" is a real finding — it is what the rule predicts for a line the
model already obeys.

## Adding a case

A case is `case.yaml` and `graders/*.md`, plus a `scaffold_script` path relative
to the case directory (never an inline block). A grader is frontmatter plus
criteria prose. `bun run eval` grades two types: `llm` and `regex`.
`claude plugin eval` accepts more, and a grader written for it alone would
error here and score in neither arm, so `drift-check.js` refuses one
(ADR 0067). Every grader needs a positive `weight` and a `focus` or
`target`. `bun run eval` honours two `focus` values: `files`, which scores
the diff, and `trace`, which scores the whole transcript. A grader written
for another `focus` errors at grading time instead of scoring, even though
`claude plugin eval` accepts it. Prefer `regex` when the check is
mechanical: it is free and deterministic. `scripts/drift-check.js` checks
this shape, so a malformed grader fails `bun run test` instead of surfacing
part-way through a paid run. Keep new graders arm-neutral for the same reason
the existing ones are.
