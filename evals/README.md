# evals — does superdev beat plain plan-then-build?

Every case here is one arm of a single question: **on the same task, in the
same repo, does the plugin produce a better plan, better code, and truer docs
than Claude Code with no plugin at all?**

`claude plugin eval --ablation with-without` runs each case twice — once with
the plugin loaded, once without — and reports the per-grader delta. The
baseline arm is the control: same prompt, same scaffold, same graders, no
superdev.

## Running it

```sh
bun run eval        # all cases, both arms — includes the expensive implement case
bun run eval:plan   # the two plan cases only, both arms — cheap iteration
```

Both need `CLAUDE_CODE_WALNUT_SPIRE=1` (the eval command is early-access) and
`ANTHROPIC_API_KEY`. The harness runs each case in a sandbox with a throwaway
`HOME` and strips `CLAUDE_CODE_OAUTH_TOKEN` from the child environment, so a
subscription-only login authenticates as `Not logged in` and every grader
scores 0 against an empty workspace. An API key survives the strip.

Useful flags: `--runs 1` to cut cost while iterating, `--report out.html` for a
readable side-by-side, `--keep-temp` to inspect (or re-run `npm test` in) the
scaffold dirs afterwards, `--max-cost-usd` for a hard ceiling.

The target is `.` — the working tree, not the installed 0.x release. Point it
at `superdev@superdev` to score the released plugin instead.

## The cases

| Case | What it costs | What it isolates |
|------|---------------|------------------|
| `ab-plan-edge-case` | cheap, plan only | Does the plan enumerate the failure cases the intent never names — missing widget, unreachable datastore — as acceptance criteria a test could check? |
| `ab-plan-multi-slice` | cheap, plan only | Is a five-operation feature cut into vertical slices with an explicit dependency order, or into horizontal layers? Does every operation get a criterion? |
| `ab-implement-lite` | expensive, full build | Shipped code, tests, and docs in a runnable repo: are the two unnamed failure cases handled, are they tested, does the README stay true, is the suite honestly green, and is the diff proportionate? |

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
