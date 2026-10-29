---
name: review-tests
description: Audit test cost and test gaps — sweep the test tree and the source, measure the suite, rank the findings, and hand the survivors to /superdev:plan as an intent record. Read-only.
argument-hint: "[path] [--chained]"
model: sonnet
---

# superdev review-tests

Audit the test suite many scopes have grown, and the code it leaves untested. A **test audit**
(CONTEXT.md) runs two audits on every run (ADR 0066, ADR 0162). The **cost audit** sweeps the whole test
tree in one pass, measures it where the repository says how, and ranks what each test costs against what
it proves. The **gap audit** reads the source outside the test paths and ranks each symbol no test reaches
and each case its tests leave out. The survivors of both become an intent for `/superdev:plan`.

Every message this command ends on closes with the Next block, per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` section (INV-0111). An attended run first makes the offer in `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The offer` section (ADR 0157).

**Read-only on the code and docs it audits.** The run applies nothing and fixes nothing, exactly as an
ad-hoc `/superdev:review` does. It writes no test and runs no coverage tool. Its writes are the intent
record in the slice store, the intent file under the git-ignored `.superdev/brainstorm/` that the record
replaces, and the one-line `.gitignore` entry that keeps that directory ignored.

**Outside the chain.** implement → review → document → ship never reaches this command. You run it when a suite has started to feel expensive, or when you want to know what standing code no test proves.

The cost audit rests on two things a diff-scoped review structurally cannot do: measure a duration, and
see both halves of a redundant pair. The gap audit rests on a third: a map from every standing symbol to
the tests that reach it, which no diff holds.

## 1. Derive the test set and the source set

**`--chained`, if present, comes out of `$ARGUMENTS` first** — never part of the path argument. It
signals that `/superdev:sweep` dispatched this run as its test leg, in the **chained posture** (CONTEXT.md,
ADR 0068): skip §5's agreement round and §6's intent write, and return the ranked findings to the caller
instead. Absent, this run keeps its own round and its own intent write, unchanged.

**The test set** is the cost audit's input. Read `docs/agents/verification.md` and
`docs/agents/toolchain.md` for the runner, and derive the test tree from them — the directories and glob
the configured command runs (`tests/`, `**/*_test.go`, `src/**/*.spec.ts`). Cross-check with the files on
disk.

**The source set** is the gap audit's input. Run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" source-set [<path>]`: one repository-relative path per line,
every tracked file outside the test paths (the configured `## Test paths`, or their defaults), minus docs,
configuration (dot-prefixed files among it), lockfiles, binary assets such as images, fonts, archives, media,
and native binaries, and vendored
or generated directories. An index entry that is no regular file on disk (a submodule, a file deleted
from the working tree) is outside it.

**The test-file list** is the gap audit's other input: every file `git ls-files` lists that the test-path
rule classes as a test — the configured `## Test paths` of `docs/agents/verification.md`, or their defaults
(`${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s `## Test paths`). It is the complement of the
verb's test-path filter, so no file sits in both lists. A path argument never narrows it.

- **Either file absent** (the repo never ran `/superdev:setup`) → suggest **`/superdev:setup`**,
  non-blocking, and derive the test tree from the files on disk and whatever runner convention they show
  instead. The source set still comes from the verb, which applies the default test paths.
- **A path argument** narrows the cost audit's test set to the test tree under it, and the gap audit's
  source set to `source-set <path>`. The gap audit judges reach against the repository's **whole** test-file
  list on every run, so a source path such as `src/billing` still meets the tests under `tests/`.
- **A path that does not exist** is an error: name it and stop.

**Batch the source set.** A source set that fits one `test-gap-auditor` context is one batch. A larger
one is split into **directory batches**, each a directory subtree that fits one context, so every
symbol's file sits whole in one batch. A gap belongs to one symbol, so a split loses nothing (INV-0163).

**State both sets before any dispatch**, as a one-line verdict the user can override in a word: for each
set, the file count, the directories, and what you derived it from, and the gap audit's batches. A sweep
over the wrong tree is a report about nothing, and the operator is the cheapest check on it.

The two branches below that name test files decide on the repository's whole test-file list, never on
a path-narrowed test set.

- **No test files and no source files** → say so. **`--chained`** → return an empty finding set to the
  caller instead of blocking the sweep; otherwise write no intent and print no handoff.
- **No test files** → the cost audit has nothing to price: say so, skip §2 and the cost dispatch, and run
  the gap audit alone. Every symbol then reads as `untested`, one finding per file.
- **A path-narrowed test set that is empty, in a repository that has tests** → the cost audit has
  nothing to price under that path: say so, skip §2 and the cost dispatch, and run the gap audit alone,
  against the whole test-file list.
- **No source files** → the gap audit has nothing to read: say so, and run the cost audit alone.
- **A test tree too large for one `test-auditor` context** → say which part you can sweep and point at
  the path argument. One pass is what lets the cost audit see both halves of a redundant pair, so
  splitting the cost audit across agents is not the remedy.

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
by test. The gap audit needs no measurement.

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

## 3. Dispatch the auditors

Dispatch both audits in one message, so they run in parallel.

**The cost audit: `superdev:test-auditor` once, over the whole test set**, with the duration table
attached (model: `sonnet`). One pass, because a redundant pair has two halves and a second agent would
hold one of them (INV-0163).

Hand it the test set and the duration table or the label `unmeasured`. It assesses the test files themselves; the duration table is input to check, not a verdict to adopt. Its lens set is its own: **the five categories are the whole set** — redundant coverage,
overweight fixture, tautological test, dead test, expensive test — and this dispatch asks for all five,
never a subset.

**The gap audit: `superdev:test-gap-auditor` once per batch, all batches in parallel** (model: `sonnet`).
Hand each dispatch its batch of source paths and the repository's whole test-file list, which a path
argument never narrows. Its two categories are its
whole set — `untested` and `missing case` — and this dispatch asks for both.

**A denied dispatch is a degraded pass.** Follow `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
`## Degraded passes` section: do that audit, or that batch, inline yourself, and say so in the report.
This command has no run root, so that section's own rule applies — report the degraded pass in this
output and write no ledger entry.

- **The inline cost sweep still does not fit your own context** → same remedy as §1's too-large branch:
  say which part you swept and point at the path argument. Splitting the cost sweep is still not the
  remedy, inline or dispatched.
- **A gap batch that was denied, failed, or never returned a report** → name it in §4's report, then
  judge it inline where it fits your own context. A batch you cannot judge inline stays named as
  unreached, with its directories, so the operator can re-run on that path.

**An observation is captured the moment you meet it.** Read
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Observations` section and follow it: a defect an
auditor's report surfaces, or one you meet yourself sweeping inline, that is no finding of this audit
gets a triage record from you, the controller, right here — never held until §4's report.

## 4. Report, two tables

**The cost table**, highest cost first: location, category, measured duration or `unmeasured`, what it
proves and what already proves it, and the lighter form. Where the run is `unmeasured`, label the table
and say the ranking is the auditor's judgment.

**The gap table**, ranked by risk: a trust boundary first, then exported symbols, then internal ones,
ties broken by the number of untested branches. Each row carries its location, category, symbol, the
missing case, a one-line risk reason, and the label `static`. Below it, name every gap batch that was
degraded or unreached.

**An audit that found nothing says so in its own place**: "The suite earns its runtime." for the cost
audit, "No test gaps found." for the gap audit. A run where both found nothing says so once.

**Every finding except a dead test reads as a labelled judgment**, never a violation or a required
change. A dead-test finding states a fact. The operator disagrees with any judgment at no cost, which is
what §5 is for.

## 5. Put the judgments to the operator

**`--chained` present** — this run is `/superdev:sweep`'s test leg, in the **chained posture** (CONTEXT.md,
ADR 0068). Run no `AskUserQuestion`; there is no operator turn inside a sweep to run it against. Label every
dead-or-ignored-test finding `fact` and every remaining cost finding `judgment`, in §4's own most-cost-first
order. Label every gap finding `judgment`, in §4's own risk order, and keep it marked as a gap finding.
Carry both labelled rankings straight into §6 — the sweep's own agreement round asks about judgments
alone, so the fact/judgment split has to survive the handoff.

**`--chained` absent** — this run keeps its own round:

- **A dead or ignored test is a fact**, not a judgment: it reaches the intent with no question asked.
- **Every other finding enters one `AskUserQuestion` call**, holding **one multi-select question per
  audit that has judgments**: one for cost findings, ranked highest cost first, and one for gap findings,
  ranked by risk. Each question offers the highest-ranked findings it can hold. **A ticked box means the
  operator disagrees** with that finding; say that in each question's text. **No judgments in either
  audit** → ask nothing.
- **Each ticked cost finding is then interviewed on its own**: ask what the test is there for. **The
  operator names what the test proves that nothing else does** → the finding is dropped. **The operator
  cannot name it** → the finding survives, labelled `disputed`, carrying whatever they did say.
- **Each ticked gap finding is then interviewed on its own**: ask where the case is covered, or why it
  needs no test. **The operator names either** → the finding is dropped. **Any other answer** → the
  finding survives, labelled `disputed`, carrying whatever they did say.
- **Findings past either question's capacity** reach the intent labelled `unconfirmed`. `/superdev:plan`'s
  own interview is the second gate, so an unasked finding is deferred rather than lost.

## 6. Hand off to plan

**`--chained` present** — write no intent and print no handoff. Return §5's labelled, ranked findings to
the caller instead, cost findings and gap findings each under their own heading: this run's report **is**
the return, and `/superdev:plan` sits past `/superdev:sweep`'s own intent, not past this leg's.

**`--chained` absent** — write the survivors as a plan-ready intent under
`.superdev/brainstorm/test-audit-<date>-<swept-slug>.md`,
the git-ignored scratch location `/superdev:brainstorm` already uses (append `.superdev/` to `.gitignore`
when absent). `<swept-slug>` is §1's path argument with each `/` turned into `-`, charset-safe per
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope slug`; a whole-tree sweep (no path
argument) uses `all`. A name already taken gets a `-2` or `-3` suffix, so no run overwrites another's
file. The file opens with YAML frontmatter, `status: ready`. Carry the problem statement, the surviving findings of both audits with their locations and labels
(durations for cost findings, the missing case and `static` for gap findings), the `unconfirmed` and
`disputed` ones labelled as such, and the non-goals the operator's answers established. Then hand it off
as an intent record by `${CLAUDE_PLUGIN_ROOT}/references/intent-handoff.md`.

Then print the next command in the Next block, naming the intent record just written by its store
reference:

```
/superdev:plan <record reference>
```

On the handoff's fallback, the Next block prints the bare `/superdev:plan`, which offers the local file
through its own glob, and the report names the file and says the intent exists only in this checkout.

**A run where neither audit finds anything says so.** Unchained, it writes no file, and its Next block says no command follows. Chained, it
returns an empty finding set. A suite that earns its runtime is a result, and so is code with no gap.
**A run where one audit finds nothing** says which, and hands off the other's survivors.

## Red flags

- **Applying a finding.** This command reports. `/superdev:plan` is where one becomes work.
- **Splitting the cost audit across agents.** Half a tree cannot see a redundant pair. The gap audit
  splits by directory; the cost audit never does.
- **Estimating a duration the timing command never gave.** `unmeasured` is the honest label.
- **Ranking an unmeasured run as though it were measured.** Say which one this is.
- **Reporting a gap as a fact.** No coverage tool ran; every gap finding is a `static` judgment.
- **Editing a tracked file the audit did not intend.** The intent record, the intent file under
  `.superdev/brainstorm/` it replaces, and the one-line `.gitignore` entry that keeps that directory
  ignored are the run's only writes.
