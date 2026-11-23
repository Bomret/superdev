# 0275: superdev sends no operator alert

**Status:** Accepted

**Supersedes:** [ADR 0272](0272-a-hook-makes-the-model-alert-the-operator-at-a-blocking-stop.md).

## Context

ADR 0272 shipped `hooks/operator-alert.js`. It denied an attended superdev session's first `AskUserQuestion` per
wait, and blocked a Stop on a `Blocked:` or `First:` Next block, so that the model called `PushNotification`. It was
meant to reach an operator who had walked away during a long review loop.

Measured on 2026-11-23 over the 13 superdev sessions of this repository active on 2026-11-22 and 2026-11-23:

- The hook prompted 67 `PushNotification` calls. The tool sent 30 to the phone and skipped 37, because the
  terminal was active.
- It denied 50 `AskUserQuestion` calls. The Stop path never fired.
- 64 of the 67 alerts came from `/superdev:plan` interview questions, about one per question.
- Of the 30 sent alerts, 18 were answered within 2 minutes. The operator was at the desk in a parallel session,
  which the tool does not count as present.
- Each alert cost about two extra model round trips: the deny and the push call.

The hook cannot raise a notification itself. Whether a push is sent depends on the tool's own test of whether the
terminal is active, and that test does not tell an absent operator from one working in another session.

## Decision

- **superdev sends no operator alert.** `hooks/operator-alert.js`, its registrations, and its suite are removed.
  Nothing replaces it.
- **The platform gap stays recorded.** Claude Code raises no alert on a pending `AskUserQuestion`.
  `docs/known-issues.md` records the gap with no mitigation shipped.

## Considered options

- *Narrow the alert to a wait that follows a long stretch of machine work.* Rejected: each alert still costs a deny
  round trip, and delivery still depends on the same terminal-active test.

## Consequences

An attended superdev session asks its questions and ends its blocked stops with no deny and no extra round trip. An
operator who walks away learns of a wait only through Claude Code's own alerts and the app's session list.
