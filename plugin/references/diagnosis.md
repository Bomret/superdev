<!--
  Attribution: the diagnosis loop below is distilled from the diagnosing-bugs skill,
  by Matt Pocock (https://github.com/mattpocock). Credit to its author.
-->

# Diagnosis discipline

A defect's fix starts at its cause, never at its symptom. `/superdev:plan` applies this when the
feature's change type is `fix`; the `implementer` applies it on a dispatch that repairs a defect;
`/superdev:review`'s fix loop applies it to a finding whose cause is not yet established. A defect whose
cause is already proven — a RED test in hand that reproduces it — skips straight to the fix.

## The red-capable command (the gate)

No hypothesis until one command exists that reproduces the defect — a test invocation, a script, a curl —
deterministic, fast, agent-runnable, and **already run at least once, red**, with the invocation and its
output (redacted) shown. Reading code to build a theory before this command exists is the exact failure
this discipline prevents: stop and build the command first. At plan time the command becomes the first
acceptance criterion of the feature's first slice, so the Definition of Done is falsifiable before
anything is built.

## Minimise the repro

Shrink the reproduction to the smallest scenario that still goes red: cut inputs, callers, config, data,
and steps one at a time, re-running the command after each cut. Done when every remaining element is
load-bearing.

## Ranked hypotheses, before testing any

Write **3–5 ranked hypotheses** for the cause before testing any one of them — a single hypothesis
anchors on the first plausible idea. Show the ranked list to the user, and proceed with your own ranking
without blocking on a reply; unattended, proceed the same way. Test in rank order, cheapest evidence
first.

## Tagged instrumentation

Every debug print, log line, or probe added while testing hypotheses carries one run-specific tag (e.g.
`[DEBUG-a4f2]`), so cleanup is one grep. Untagged instrumentation survives into the diff; tagged
instrumentation dies before the fix commits.

## Fix, then lock it down

The proven cause becomes a RED test at the correct seam, and the fix makes it green — the ordinary TDD
loop from there. **No correct seam exists for the test → that itself is the finding**: the architecture
is preventing the defect from being locked down. Report it rather than force a test at a wrong seam; on
a live scope run it is an unresolved defect (`scope-mode.md` → `## Unresolved defects`).

## Redact

Redact every secret before quoting a captured artifact or command output: write `<REDACTED>` in its
place, build the repro loop against env vars so the credential stays in the environment, and quote only
the lines that carry the signal.
