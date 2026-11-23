# 0280: Ship waits for the named checks through one bounded verb

**Status:** Accepted

**Amends:** [ADR 0255](0255-ship-owns-the-full-suite-evidence-and-ci-can-carry-it.md), decision 4: ship waits on CI.
Decisions 1–3, 5, and 6 stand.
[ADR 0268](0268-the-repair-loop-after-a-ship-refusal-chains-to-ship.md), decision 5: a started ship on the CI path
waits on the head it pushed.

**Context.** ADR 0255 let named CI checks carry ship's full-suite evidence and kept ship from waiting on them. On the
CI path a pending check refused, and so did every push ship made, so the operator ran `/superdev:ship` again by hand
once CI reported. On the CI path, submit-pr asked no ship question at all.

**Decision.** `scope.js ci --wait --read <script>` re-runs a code-host read script every 30 s and judges each read
against the named checks. It ends on the first green, failed, or cannot-judge verdict, or as soon as no named check can still change. After a 60-minute deadline it
makes one final read and ends not green, naming the checks still pending. Three failed or hung reads in a row end it with the
last read's error. Each code-host seed's `## Check status` carries the read script, so shipped code names no host CLI.
Ship runs the verb through the Bash tool's `run_in_background`, which re-invokes the session when the command exits
(Claude Code's Bash tool description, checked 2026-11-23), and the agent itself
never re-reads on a timer. A code-management document without the read script keeps the single read and its pending
refusal. On the CI path submit-pr asks its ship question too. superdev still triggers, re-runs, and cancels no CI
run.

**Considered options.**

- **The host CLI's own watch (`gh pr checks --watch`).** Rejected: GitHub only. `tea` 0.16.0 has no command that
  waits on a commit's check status; `tea actions runs logs --follow` follows one job's log (`--help`, checked
  2026-11-23).
- **gh and tea calls inside `lib/ci.js`.** Rejected: it hardcodes backends into shipped code, against pluggable
  backends.
- **A wait loop in ship's prose.** Rejected: no suite can test it, and the `no-ci-wait` drift check keeps prose free of
  wait loops.
- **The read script composed by the agent from the seed's prose.** Rejected: the script would differ between runs.
- **A configurable deadline in `## CI`.** Rejected: it needs a parser change and a setup step. Running ship again
  waits once more.
- **Stop on the first failed read.** Rejected: one transient network error would throw away a long wait.
