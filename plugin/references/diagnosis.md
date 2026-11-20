<!--
  Attribution: the diagnosis loop below is distilled from the diagnosing-bugs skill,
  by Matt Pocock (https://github.com/mattpocock). Credit to its author.
-->

# Diagnosis discipline

A defect's fix starts at its cause, never at its symptom. These readers apply it:

- **`/superdev:plan`** → when the feature's change type is `fix`.
- **The `implementer`** → on a dispatch that repairs a defect.
- **`/superdev:review`'s fix loop** (`review-scope-mode.md`'s `### 4.7 Fix cycles`) → to a finding whose cause is not
  yet established.

**A proven cause skips the loop.** Applies to a defect whose cause is already proven, a RED test in hand that
reproduces it. Go straight to the fix.

## The red-capable command (the gate)

**No hypothesis before the command.** Applies to every defect this discipline covers. Form no hypothesis until one
command exists that reproduces the defect: a test invocation, a script, a curl. The command is deterministic, fast,
agent-runnable, and **already run at least once, red**, with the invocation and its redacted output shown. With no
such command, stop reading code for a theory and build the command first.

**At plan time.** Applies to `/superdev:plan` on a `fix` feature. Place the command per `plan-authoring.md`'s
`### A fix feature's reproduction`.

## Minimise the repro

**Shrink it.** Applies once the command goes red. Shrink the reproduction to the smallest scenario that still goes
red: cut inputs, callers, config, data, and steps one at a time, re-running the command after each cut. It is done
when every remaining element is load-bearing.

## Ranked hypotheses, before testing any

**Rank first.** Applies once the repro is minimal. Write **3–5 ranked hypotheses** for the cause before testing any
one of them. Show the ranked list to the user, and proceed with your own ranking without blocking on a reply.

- **Testing** → in rank order, cheapest evidence first.
- **Unattended** → proceed the same way.

## Tagged instrumentation

**Tag every probe.** Applies to every debug print, log line, or probe added while testing hypotheses. Give it one
run-specific tag, such as `[DEBUG-a4f2]`, so cleanup is one grep. Remove every tagged line before the fix commits.

## Fix, then lock it down

**RED at the seam.** Applies to the proven cause. Make it a RED test at the correct seam, and make the fix turn it
green, the ordinary TDD loop from there.

- **No correct seam exists for the test** → that is the finding: report it, and force no test at a wrong seam. On a
  live scope run it is an unresolved defect (`scope-findings.md` → `## Unresolved defects`).

## Redact

**Redact every secret.** Applies to every captured artifact or command output you quote. Write `<REDACTED>` in each
secret's place, and quote only the lines that carry the signal.

- **The repro loop** → build it against environment variables, so the credential stays in the environment.
