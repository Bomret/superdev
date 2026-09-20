# 0041: The unattended run caps its own denials at two

**Status:** Accepted

**Amended by:** [ADR 0044](0044-a-denial-reset-returns-the-budget-and-keeps-the-record.md), which gives a
capped run a way back: a reset marker returns the budget and leaves every recorded denial standing.

## Context

ADR 0039 lets an unattended run survive a denied verification dispatch: where the controller did not
author what the pass verifies, the controller performs the pass inline, records a `**Degraded:**` bullet,
and the chain continues. Nothing counts how many times that happens.

Claude Code's auto mode counts them regardless. Verified 2026-08-23, against
[Anthropic's auto-mode engineering post](https://www.anthropic.com/engineering/claude-code-auto-mode):
three consecutive denials, or twenty in a session, stop the model and escalate to the human, and headless
`claude -p` terminates instead of escalating.

Termination is the shape that matters, because `/superdev:afk` is what runs unattended and it runs
headless. The platform's stop is not superdev's block: no `blocked` label reaches the scope anchor, no
comment names the stop, the ledger stage stays where the chain left it, and the run lock and
scopetree stay standing. A maintainer finds a sweep that ended without saying why, and the tracker still
shows the feature in progress.

An environmental cause makes a run of denials likely rather than freakish. A prompt-rewriting plugin
installed alongside superdev sends every dispatch to the classifier carrying text the controller never
wrote, so one denial predicts the next.

## Decision

**An unattended run blocks on its second denied verification dispatch.** The first still runs its pass
inline and records the degraded entry, exactly as ADR 0039 has it. The second writes its entry and then
blocks through `references/scope-mode.md`'s `## Unattended` procedure — the anchor and any slice in play
move to `blocked`, a comment names the stop, and the scope branch stays standing.

The cap is two because the platform stops at three. Blocking on the second keeps the stop inside
superdev, where it produces a tracker record a human can act on.

**The count is per scope run, read from that run's ledger.** A denied verification dispatch records its
bullet with `scope.js degraded add-denial`, which prefixes the bullet `denied: `, and the controller reads
the running total with `scope.js get denials`. A run root carrying no `**Degraded:**` line, or one whose
bullets are all the other degraded shape, counts zero.

**Attended runs carry no cap.** A human is present, and the platform's own stop escalates to that human
rather than terminating.

## Why

The ledger already holds the record. Every denied dispatch writes a bullet before the chain continues, so
counting those bullets needs no second store to keep in sync, and a run resumed by a later invocation —
which `scope-mode.md` expects after a denial — counts what the earlier invocation saw.

Per scope rather than per sweep, because `/superdev:afk` already escalates: a blocked feature increments
`.superdev/afk-blocks`, and two consecutive blocked features stop the sweep. An environmental denial
storm therefore costs two features and ends the night through a path that already exists, instead of a
second sweep-wide counter with its own reset rule.

The prefix makes the guard honest about itself. A denial bullet and a could-not-complete bullet share one
`**Degraded:**` line and answer different questions; a count that told them apart by matching prose would
drift the first time a caller reworded its entry.

## Consequences

- An unattended run absorbing two denials ends as a blocked feature with a comment, rather than as a
  terminated session with a stranded run root.
- `/superdev:status` and the pull-request body show a denial bullet with its `denied: ` prefix, which
  distinguishes the two degraded shapes for a human reader at no extra cost.
- A run that absorbs exactly one denial behaves as it does under ADR 0039 alone.
- **Ceiling.** The cap counts verification dispatches only. A denied `implementer` still blocks on the
  first one under ADR 0001, and a denial in a command free to skip that pass records nothing and so counts
  nothing.
- The cap does not see denials spread thinly across a sweep — three features taking one denial each pass
  it untouched. That is the intended trade: each of those runs got its pass, inline and recorded.

## Considered options

- *A sweep-wide counter beside `.superdev/afk-blocks`.* Rejected: it needs its own reset rule and a second
  sweep-stop path, to catch a drip that afk's two-consecutive-blocks rule already ends.
- *Cap at three, matching the platform.* Rejected: the third denial is the one the platform stops on, so a
  cap there races it and loses on ties.
- *Count in the controller's own context, with no ledger record.* Rejected: `scope-mode.md` expects a
  second `/superdev:review` invocation after a denial, and an in-context count does not survive it.
- *Match denial bullets by their prose instead of a prefix.* Rejected: the bullet text is written by three
  separate callers, so the match breaks silently the first time one is reworded.
