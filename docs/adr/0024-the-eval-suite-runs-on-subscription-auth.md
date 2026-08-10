# 0024 — The eval suite runs on subscription auth

**Status:** Accepted

## Context

`evals/` holds the instrument that answers superdev's central claim: on the same task, in the same repo,
does the plugin produce a better plan, better code, and truer docs than Claude Code with no plugin at
all? Each case is one arm of that A/B.

The instrument costs money to read. `claude plugin eval` runs every case in a sandbox with a throwaway
`HOME` and strips `CLAUDE_CODE_OAUTH_TOKEN` from the child environment. A subscription login inside that
sandbox authenticates as `Not logged in`, and every grader scores 0 against an empty workspace. Only an
`ANTHROPIC_API_KEY` survives the strip, and it is billed twice over: once for the agent under test, once
for every LLM grader. A suite that costs real money per read is a suite that goes unread, and the claim
goes unmeasured between releases.

The two properties the suite needs are in tension in the official harness, and only there:

- **Isolation.** The baseline arm must not load superdev. The plugin is installed in the maintainer's
  own `~/.claude` beside several other plugins and a global `CLAUDE.md`, so an inherited `HOME` hands
  the control arm the plugin it is the control for — and the delta reads zero for the wrong reason.
- **Subscription auth.** Credentials do not survive a throwaway `HOME`.

`claude setup-token` resolves the tension. It issues a long-lived token from a Claude subscription,
carried in an environment variable, which authenticates a child process that has no `HOME` of its own.
Isolation and auth stop competing.

The following were established against Claude Code 2.1.226 before this decision:

- `claude -p` under a throwaway `HOME` returns `Not logged in · Please run /login`.
- `--plugin-dir <path>` loads a plugin's `hooks/hooks.json`. A probe plugin's `SessionStart` hook fired
  and wrote its marker, so a spawned run gets hooks, not only prose.
- `claude plugin eval` fails identically with a fake `CLAUDE_CODE_OAUTH_TOKEN` set and with none set —
  no invalid-token error either way — so it strips the variable rather than merely ignoring an absent
  one.
- The workspace trust dialog is skipped under `-p`, so a fresh `HOME` cannot stall a run.

## Decision

The suite runs on a standalone runner, `scripts/eval-run.js`, that spawns `claude -p` once per arm with
a throwaway `HOME` and a `CLAUDE_CODE_OAUTH_TOKEN` forwarded from the environment. The plugin arm passes
`--plugin-dir` at this repository; the baseline arm passes nothing. `ANTHROPIC_API_KEY` is scrubbed from
every child environment, so no request can be billed even when the maintainer's shell carries a key.
Graders run the same way: `regex` graders in-process and free, `llm` graders as a judge dispatch that
defaults to haiku.

`bun run eval` and `bun run eval:plan` point at this runner. `evals/*/case.yaml` and
`evals/*/graders/*.md` are unchanged and remain the single source both runners read, so
`claude plugin eval` stays available for a key-funded cross-check.

The cost does not vanish; it changes currency. A full run draws on the subscription usage window instead
of a metered balance. That trade is deliberate.

## Considered options

- **Adopt Vally** (`microsoft.github.io/vally`) and write a `claude-cli` executor for it. Vally is an
  extensible eval platform with a pipeline that fits — stimulus, executor, trajectory, graders, score —
  and executors are a documented plugin point (`registerExecutors`, `--executor-plugin`). It loses on
  the problem this decision is about: its LLM judges run on the Copilot / Azure / OpenAI chain, so it
  relocates metered spend rather than removing it. It also costs a TypeScript package with a
  `@microsoft/vally` peer dependency, a stream-json to `Trajectory` mapping, and a port of every case
  and grader — for a reporting layer this repo has not needed. No `claude-cli` executor is published:
  the name appears only in a warning string inside `@microsoft/vally@0.13.0`, and the repository is not
  public. Reconsider if the pain becomes an inability to compare runs rather than a bill.
- **Keep `claude plugin eval` and cut the run down** with `--runs 1`, `--case 'ab-plan-*'`, and
  `--max-cost-usd`. No work at all, and it does lower the bill. The expensive case is the one that
  measures shipped code, so the cheap subset measures the least, and metering never reaches zero.
- **Keep `claude plugin eval` and feed it a `setup-token`.** The smallest possible fix if it worked. It
  does not: the harness strips the variable, confirmed by probe.
- **Run against the real `HOME`.** Subscription auth works today with no token step. It destroys the
  measurement, because the baseline arm silently runs with superdev loaded.
- **Drive the Claude Agent SDK** instead of spawning the CLI. Spawning is what loads commands,
  subagents, and hooks the way a real user gets them; an SDK harness would have to reproduce that.

## Consequences

- Reading the instrument is free in money, so the suite can gate a release rather than being saved for
  one.
- A full run draws down the maintainer's subscription usage window. `ab-implement-lite` is two arms of a
  full build per run.
- The runner is maintained here. When the Claude Code CLI changes its flags or its stream-json shape,
  this repo absorbs the change; the official harness would have absorbed it upstream.
- A one-time manual step joins the workflow: `claude setup-token`, and the token exported where the
  runner can read it. Without it the runner refuses to start, which is the intended failure — the
  alternative is spending an API key by accident.
- The judge is Claude grading Claude. The official harness has the same property, so this is not a
  regression, but it is not independent verification either.
