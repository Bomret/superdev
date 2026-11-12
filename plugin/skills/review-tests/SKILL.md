---
name: review-tests
description: Audit test cost and test gaps — sweep the test tree and the source, measure the suite, rank the findings, and hand the survivors to /superdev:plan as an intent record. Read-only.
argument-hint: "[path] [--chained]"
model: sonnet
---

# superdev review-tests

## Role and terms

Applies to every start. You run a **test audit** (CONTEXT.md, ADR 0066, ADR 0162) on operator invocation, directly or as `/superdev:sweep`'s test leg, outside the implement chain. You hand the surviving findings to `/superdev:plan` as an intent.

- **The cost audit**: one sweep of the test set that ranks what each test costs against what it proves.
- **The gap audit**: a read of the source set that ranks each symbol no test reaches and each case its tests leave out.
- **The test set**: the cost audit's input, the test tree §1 derives.
- **The source set**: the gap audit's input, the paths `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" source-set [<path>]` prints.
- **The test-file list**: every file `git ls-files` lists that the test-path rule classes as a test. The rule is the configured `## Test paths` of `docs/agents/verification.md`, or the defaults in `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s `## Test paths`. It is the complement of the `source-set` verb's test-path filter, and a path argument never narrows it.
- **The chained posture**: a run with `--chained`, dispatched by `/superdev:sweep` as its test leg (CONTEXT.md, ADR 0068).
- **`unmeasured`**: the label of a run with no duration table.

## The closing message

Applies to every message an unchained run ends on. Close it with the Next block per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` section (INV-0111). An attended run first makes the offer in that file's `## The offer` section (ADR 0157). A run under `--chained` prints no Next block.

## Read-only

Applies to the whole run. Apply no finding, fix nothing, write no test, and run no coverage tool, as an ad-hoc `/superdev:review` does outside its inline fix. Under `--chained` the run writes nothing. Unchained, its only writes are an observation's triage record, the intent record in the slice store, the intent file under the git-ignored `.superdev/brainstorm/` that the record replaces, and the one-line `.gitignore` entry that keeps that directory ignored.

## 1. Derive the test set and the source set

**`--chained`.** Applies before anything else in this file. Take it out of `$ARGUMENTS` first. It is never part of the path argument.

**The test set.** Applies to every start. Read `docs/agents/verification.md` and `docs/agents/toolchain.md` for the runner, and derive the test tree from the directories and glob the configured command runs (`tests/`, `**/*_test.go`, `src/**/*.spec.ts`). Cross-check it with the files on disk.

**The source set.** Applies to every start. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" source-set [<path>]`. Its output is one repository-relative path per line: every tracked file outside the test paths, minus docs, configuration (dot-prefixed files among it), lockfiles, binary assets such as images, fonts, archives, media, and native binaries, vendored or generated directories, and index entries that are no regular file on disk (a submodule, a file deleted from the working tree).

**The arguments and config.** Applies to every start.

| Case | Action |
|---|---|
| `verification.md` or `toolchain.md` absent | Suggest `/superdev:setup`, non-blocking. Derive the test tree from the files on disk and the runner convention they show. The source set still comes from the verb, which applies the default test paths. |
| A path argument | Narrow the test set to the test tree under it, and the source set to `source-set <path>`. The gap audit still judges reach against the whole test-file list, so `src/billing` still meets the tests under `tests/`. |
| A path that does not exist | Name it and stop. |

**The batches.** Applies to every source set. A source set that fits one `test-gap-auditor` context is one batch. A larger one splits into **directory batches**, each a directory subtree that fits one context, so each symbol's file sits whole in one batch (INV-0163).

**The verdict line.** Applies before any dispatch. State both sets as a one-line verdict the user can override in a word: for each set, the file count, the directories, and what you derived it from, and the gap audit's batches.

**The empty sets.** Applies once the sets are derived. "No test files" means the whole test-file list is empty, never a path-narrowed test set.

| Case | Action |
|---|---|
| No test files and no source files | Take §6's **An empty result**. |
| No test files | Say so. Skip §2 and the cost dispatch, and run the gap audit alone. Every symbol reads as `untested`, one finding per file. |
| A path-narrowed test set that is empty, in a repository with tests | Say so. Skip §2 and the cost dispatch, and run the gap audit alone against the whole test-file list. |
| No source files | Say so, and run the cost audit alone. |
| A test tree too large for one `test-auditor` context | Say which part you can sweep, and point at the path argument. Never split the cost audit across agents. |

## 2. Measure

**The timing command.** Applies when the cost audit runs. Read `docs/agents/verification.md`'s `## Timing command` section (`${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s `## Timing command`).

- **No such file or section** → the run is `unmeasured`. Say so, and rank by the auditor's judgment.
- **The section is fenced in a backtick block** → it is a hand-written mistake, not a configured command. Report it, pointing at `test-selection.md`'s rule. That rule reserves a fence for the full and focused commands, and a fenced timing section lands in the focused slot every caller runs where no focused command is recorded yet.

**The chained skip.** Applies under `--chained` when a timing command exists. Ask nothing and run no timing run: the run is `unmeasured`. Say so.

**The ask.** Applies without `--chained` when a timing command exists. Say that a timing run is a full suite run and costs that suite's wall clock. Ask once with `AskUserQuestion`: proceed with the timing run (the default), or skip to `unmeasured`. This command has no `--unattended` mode.

**The timing run.** Applies once the operator proceeds. Run it in the foreground with Bash's `timeout` at its ceiling, 600000 ms unless `BASH_MAX_TIMEOUT_MS` raises it. Launch it in the background, and wait for its end, only when the timing run can outlast the ceiling. Build a duration table keyed by test, from per-test durations where the runner prints them and from total wall clock otherwise. Give no duration the timing run did not print.

| Case | Action |
|---|---|
| The output holds a parseable duration, whatever the exit code and whether the run hit the timeout (a red suite under `pytest --durations=0`, `go test -v`, a verbose vitest run) | Keep the table. |
| No parseable duration, and the run did not hit the timeout | `unmeasured`. Say so. |
| The run hit the timeout before printing a parseable duration | `unmeasured`. Say that the budget ran out, rather than that the output failed to parse. |

**The machine.** Applies where the duration table is printed. Say once that the numbers are this machine's and do not hold across machines.

## 3. Dispatch the auditors

**The dispatch message.** Applies when both audits run. Dispatch both audits in one message, so they run in parallel.

**The cost dispatch.** Applies when the cost audit runs. Dispatch `superdev:test-auditor` once over the whole test set (model: `sonnet`, INV-0163). Hand it the test set and the duration table or the label `unmeasured`, and ask for all five of its categories: redundant coverage, overweight fixture, tautological test, dead test, expensive test. Tell it to assess the test files themselves and to check the duration table rather than adopt it.

**The gap dispatch.** Applies when the gap audit runs. Dispatch `superdev:test-gap-auditor` once per batch, all batches in parallel (model: `sonnet`). Hand each dispatch its batch of source paths, the directories the batch was derived from, and the whole test-file list, and ask for both of its categories: `untested` and `missing case`.

**A denied dispatch.** Applies when a dispatch is denied. Follow `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes` section: do that audit, or that batch, inline, and say so in the report. This command has no run root, so report the degraded pass in this output and write no ledger entry.

- **The inline cost sweep does not fit your own context** → say which part you swept, and point at the path argument, as §1's too-large row does.
- **A gap batch denied, failed, or never returned** → name it in §4's report, and judge it inline where it fits your own context. A batch you cannot judge inline stays named as unreached, with its directories.

**An observation.** Applies to a defect an auditor's report surfaces, or one you meet sweeping inline, that is no finding of this audit. Follow `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Observations` section. Unchained, file its triage record yourself right away, never held until §4's report. Under `--chained`, file none and return it to the caller with the findings.

## 4. Report, two tables

**The cost table.** Applies when the cost audit ran. Rank it highest cost first, with the columns location, category, measured duration or `unmeasured`, what it proves and what already proves it, and the lighter form. An `unmeasured` table carries that label and says the ranking is the auditor's judgment.

**The gap table.** Applies when the gap audit ran. Rank it by risk: a trust boundary first, then exported symbols, then internal ones, with ties broken by the number of untested branches. Each row carries location, category, symbol, the missing case, a one-line risk reason, and the label `static`, and below the table, name every degraded or unreached gap batch.

**An empty audit.** Applies to an audit that found nothing. Say "The suite earns its runtime." for the cost audit and "No test gaps found." for the gap audit. A run where both found nothing says so once.

**The wording.** Applies to every finding. A dead-test finding states a fact. Every other finding, a gap finding included, reads as a labelled judgment, never a violation or a required change.

## 5. Put the judgments to the operator

**The chained labels.** Applies under `--chained`. Run no `AskUserQuestion`. Label every dead-or-ignored-test finding `fact` and every other cost finding `judgment`, in §4's order. Label every gap finding `judgment`, in §4's order and marked as a gap finding, and carry both rankings into §6.

**The round.** Applies without `--chained` (INV-0071).

- **A dead or ignored test** → a fact. It reaches the intent with no question asked.
- **Every other finding** → one `AskUserQuestion` call, with one multi-select question per audit that has judgments: cost findings ranked highest cost first, gap findings ranked by risk. Each question offers the highest-ranked findings it can hold and says in its text that a ticked box means the operator disagrees. No judgments in either audit → ask nothing.
- **A ticked cost finding** → ask on its own what the test is there for. The operator names what it proves that nothing else does → drop it. Otherwise it survives, labelled `disputed`, carrying what they said.
- **A ticked gap finding** → ask on its own where the case is covered, or why it needs no test. The operator names either → drop it. Otherwise it survives, labelled `disputed`, carrying what they said.
- **Findings past either question's capacity** → they reach the intent labelled `unconfirmed`.

## 6. Hand off to plan

**The chained return.** Applies under `--chained`. Write no intent and print no handoff. Return §5's labelled, ranked findings to the caller, cost findings, gap findings, and §3's observations each under their own heading.

**The intent file.** Applies without `--chained`, when a finding survives §5. Write the survivors to `.superdev/brainstorm/test-audit-<date>-<swept-slug>.md`, and append `.superdev/` to `.gitignore` when absent. The file opens with YAML frontmatter `status: ready`, and gives every finding its id by `${CLAUDE_PLUGIN_ROOT}/references/intent-handoff.md`'s `## Finding ids`. Then hand it off as an intent record by `${CLAUDE_PLUGIN_ROOT}/references/intent-handoff.md`.

- **`<swept-slug>`**: §1's path argument with each `/` turned into `-`, charset-safe per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope slug`. A run with no path argument uses `all`. A taken name gets a `-2` or `-3` suffix.
- **The content**: the problem statement; the surviving findings of both audits with their locations and labels (durations for cost findings, the missing case and `static` for gap findings); the `unconfirmed` and `disputed` ones labelled as such; and the non-goals the operator's answers established.

**The Next block.** Applies after the handoff. Name the intent record by its store reference:

```
/superdev:plan <record reference>
```

On the handoff's fallback, print the bare `/superdev:plan`, and the report names the file and says the intent exists only in this checkout.

**An empty result.** Applies when neither audit has a finding, or when §5 dropped every finding. Say so. Unchained, write no file, and the Next block says no command follows. Chained, return an empty finding set, with §3's observations under their own heading. A run where one audit finds nothing says which, and hands off the other's survivors.
