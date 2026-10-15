---
name: review-tests
description: Audit what a test suite costs — sweep the whole test tree, measure it, rank the findings, and hand the survivors to /superdev:plan. Read-only.
argument-hint: "[path] [--chained]"
model: sonnet
---

# superdev review-tests

Price the test suite many scopes have grown. A **test audit** (CONTEXT.md) sweeps the whole test tree in
one pass, measures it where the repository says how, ranks what each test costs against what it proves,
and writes the survivors as an intent for `/superdev:plan` (ADR 0066).

**Read-only on the code and docs it audits.** The run applies nothing and fixes nothing, exactly as an
ad-hoc `/superdev:review` does. Its writes are the intent, under the git-ignored `.superdev/brainstorm/`,
and the one-line `.gitignore` entry that keeps that directory ignored.

**Outside the chain.** implement → review → document → ship never reaches this command. You run it when a suite has started to feel expensive.

It rests on two things a diff-scoped review structurally cannot do: measure a duration, and see both
halves of a redundant pair.

## 1. Derive the swept file set

**`--chained`, if present, comes out of `$ARGUMENTS` first** — never part of the path argument. It
signals that `/superdev:sweep` dispatched this run as its test leg, in the **chained posture** (CONTEXT.md,
ADR 0068): skip §5's agreement round and §6's intent write, and return the ranked findings to the caller
instead. Absent, this run keeps its own round and its own intent write, unchanged.

Read `docs/agents/verification.md` for the test command and `docs/agents/toolchain.md` for the runner,
and derive the test tree from them — the directories and glob the command itself runs (`tests/`,
`**/*_test.go`, `src/**/*.spec.ts`). Cross-check with the files on disk.

- **Either file absent** (the repo never ran `/superdev:setup`) → suggest **`/superdev:setup`**,
  non-blocking, and derive the test tree from the files on disk and whatever runner convention they show
  instead.

**State the swept set before any dispatch**, as a one-line verdict the user can override in a word:
the file count, the directories, and what you derived them from. A sweep over the wrong tree is a report
about nothing, and the operator is the cheapest check on it.

- **A path argument** narrows the sweep to that path, and the verdict says so.
- **A path that does not exist** is an error: name it and stop.
- **No test files at all** → say so. **`--chained`** → return an empty finding set to the caller
  instead of blocking the sweep; otherwise write no intent and print no handoff.
- **A tree too large for one `test-auditor` context** → say which part you can sweep and point at the
  path argument. One pass is what lets the audit see both halves of a redundant pair, so splitting the
  sweep across agents is not the remedy.

## 2. Measure

Read the **timing command** (`references/test-selection.md`'s `## Timing command` section, in
`docs/agents/verification.md`). **No such file or section** → the run is `unmeasured`. Say so, and rank
by the auditor's judgment instead.

- **A `## Timing command` fenced in a backtick block** is a hand-written mistake, not a configured
  command: report it, pointing at `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s rule that a
  fence is reserved for the full and focused commands alone, and that a fenced timing section lands in
  the focused slot every caller runs, in a repository that has not yet recorded a focused command.

**A timing run is a full suite run, and costs exactly what that suite costs in wall clock.** Say so, then
ask once with `AskUserQuestion` — proceed with the timing run, or skip straight to `unmeasured` —
with proceeding as the default answer. This command carries no `--unattended` mode of its own, so an operator
is always there to answer. Once you proceed, give the
run room to finish: pass the longest timeout your Bash tool allows, or launch it in the background and
wait for it, rather than accepting whatever default a shorter run would get. A suite this repo calls
expensive is exactly the one a short timeout kills.

Per-test durations where the runner prints them, total wall clock otherwise. Build a duration table keyed
by test.

- **Degrade to `unmeasured` on one condition alone: no parseable duration anywhere in the output.**
  Neither a non-zero exit nor the timeout degrades the run by itself — only the absence of a number does.
- **The command exits non-zero but still printed durations you can parse** (a red suite under
  `pytest --durations=0`, `go test -v`, or a verbose vitest run) → keep the table. A test audit ranks
  cost, not suite health.
- **The run hits the timeout before printing a parseable duration** → `unmeasured`, and say plainly that
  the budget ran out rather than that the output failed to parse — the operator then knows a longer
  budget might measure it, which a generic parse-failure message would hide.
- **The number is this machine's.** Say that once, where the table is printed: a duration does not hold
  across machines, and the ranking is what the audit is for.

## 3. Dispatch the auditor

Dispatch `superdev:test-auditor` **once, over the whole swept set**, with the duration table attached
(model: `sonnet`). One pass, because a redundant pair has two halves and a second agent would hold one
of them.

Hand it the swept file set, the duration table or the label `unmeasured`, and the repository's own test
command. It assesses the test files themselves; the duration table is input to check, not a verdict to adopt. Its lens set is its own: **the five categories are the whole set** — redundant coverage,
overweight fixture, tautological test, dead test, expensive test — and this dispatch asks for all five,
never a subset.

**A denied dispatch is a degraded pass.** Follow `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
`## Degraded passes` section: sweep inline yourself, say so in the report. This command has no run root,
so that section's own rule applies — report the degraded pass in this output and write no ledger entry.

- **The inline sweep still does not fit your own context** → same remedy as §1's too-large branch: say
  which part you swept and point at the path argument. Splitting the sweep further is still not the
  remedy, inline or dispatched.

**An observation is captured the moment you meet it.** Read
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Observations` section and follow it: a defect the
auditor's report surfaces, or one you meet yourself sweeping inline, that is no finding of this audit
gets a triage record from you, the controller, right here — never held until §4's report.

## 4. Report, ranked by cost

One table, highest cost first: location, category, measured duration or `unmeasured`, what it proves and
what already proves it, and the lighter form. Where the run is `unmeasured`, label the table and say the
ranking is the auditor's judgment.

**Every finding reads as a labelled judgment**, never a violation or a required change. The operator
disagrees with any of them at no cost, which is what §5 is for.

## 5. Put the judgments to the operator

**`--chained` present** — this run is `/superdev:sweep`'s test leg, in the **chained posture** (CONTEXT.md,
ADR 0068). Run no `AskUserQuestion`; there is no operator turn inside a sweep to run it against. Label every
dead-or-ignored-test finding `fact` and every remaining finding `judgment`, in §4's own most-cost-first
order, and carry that labelled ranking straight into §6 — the sweep's own agreement round asks about
judgments alone, so the fact/judgment split has to survive the handoff.

**`--chained` absent** — this run keeps its own round:

- **A dead or ignored test is a fact**, not a judgment: it reaches the intent with no question asked.
- **Every other finding enters one `AskUserQuestion` call, asked as a single multi-select question**,
  ranked highest cost first, where **a ticked box means the operator disagrees** with that finding. Say
  that in the question text.
- **Each ticked finding is then interviewed on its own**: ask what the test is there for. **The operator
  names what the test proves that nothing else does** → the finding is dropped. **The operator cannot
  name what the test proves that nothing else does** → the finding survives, labelled `disputed`,
  carrying whatever they did say.
- **Findings past that round's capacity** reach the intent labelled `unconfirmed`. `/superdev:plan`'s
  own interview is the second gate, so an unasked finding is deferred rather than lost.

## 6. Hand off to plan

**`--chained` present** — write no intent and print no handoff. Return §5's labelled, ranked findings to
the caller instead: this run's report **is** the return, and `/superdev:plan` sits past `/superdev:sweep`'s
own intent, not past this leg's.

**`--chained` absent** — write the survivors as a plan-ready intent under
`.superdev/brainstorm/test-audit-<date>-<swept-slug>.md`,
the git-ignored scratch location `/superdev:brainstorm` already uses (append `.superdev/` to `.gitignore`
when absent). `<swept-slug>` is §1's path argument with each `/` turned into `-`, charset-safe per
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope slug`; a whole-tree sweep (no path
argument) uses `all`. Two sweeps the same day then write two files instead of one silently overwriting the
other. Carry the problem statement, the findings that survived with their locations and durations, the
`unconfirmed` ones labelled as such, and the non-goals the operator's answers established.

Then print the copy-pasteable handoff, the same bare form `/superdev:brainstorm` prints for the same
`.superdev/brainstorm/` write target: `/superdev:plan` takes no path argument, so the intent this run
just wrote reaches it through its own glob instead of being named on the line:

```
/superdev:plan
```

**A run that finds nothing says so.** Unchained, it writes no file and prints no handoff. Chained, it
returns an empty finding set. A suite that earns its runtime is a result, and so is a sweep that finds no
fault.

## Red flags

- **Applying a finding.** This command reports. `/superdev:plan` is where one becomes work.
- **Splitting the sweep across agents.** Half a tree cannot see a redundant pair.
- **Estimating a duration the timing command never gave.** `unmeasured` is the honest label.
- **Ranking an unmeasured run as though it were measured.** Say which one this is.
- **Editing a tracked file the audit did not intend.** The intent under `.superdev/brainstorm/` and
  the one-line `.gitignore` entry that keeps that directory ignored are the run's only writes.
