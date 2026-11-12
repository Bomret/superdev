---
name: implement
description: Execute a superdev plan — drive its vertical slices to merge as a dependency-ordered DAG, with an execution tier sized to its `behavior` slices, then hand off to the next command in the chain. Use when a plan exists in the slice store; run /superdev:plan first if not.
argument-hint: "[<feature-label>  (empty = the only plan in the store)]  [--unattended]"
---

# superdev implement

## Role and terms

Applies to every start. You are the **controller**: you drive a plan's slices to merge, and you alone integrate. You stop when the code is on the scope branch, and you hand review, docs, and the pull request to the next three commands of the chain.

- **The tier**: `full` for more than 3 loaded `behavior` slices, `lite` otherwise, whatever the number of `mechanical` and `docs` slices. It is derived fresh every run, never configured or persisted.
- **The playbook**: `${CLAUDE_PLUGIN_ROOT}/references/implement-full.md` for `full`, `${CLAUDE_PLUGIN_ROOT}/references/implement-lite.md` for `lite`. Each ends by reading `${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md`.
- **The scope anchor**: the epic, or the lone slice on a single-slice plan, per the store's `## Scope anchor` contract (`docs/agents/issue-tracker.md`).
- **The publish**: the snapshot publish, per `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state` section. It runs twice: right after the entry's write of `**Stage:** implementing` (`init` or `stage set`), and as the last act of the exit that ends the run, after run handoff's `merged` stage write, or after the `step clear` or `step block` of an earlier exit. No other write site publishes.
- **A block**: a stop under `--unattended`, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section.

## The closing message

Applies to every message this command ends on, the next command run handoff prints included (`${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md`). Close it per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` and `## The offer`.

## The inline doc pass

Applies to the `lite` tier. Its playbook runs the documentation pass in the same scopetree before run handoff. No other step of review, docs, or the pull request runs here.

## Dispatches and the log

**Who dispatches.** Applies to every run. `full` dispatches `superdev:implementer` and `superdev:slice-reviewer` with per-slice specifics, never the whole plan. A `full` run's **tiny slice**, a `docs` slice or a `mechanical` slice whose `spec` names a single file, gets no dispatch: you build it yourself in its slicetree, and its merge, ledger, and trace steps stay the same (`implement-full.md`'s DAG loop step 2). `lite` dispatches none, and you carry the TDD discipline yourself.

**The `dispatch:` line.** Applies before each dispatch. Mark the log with a `dispatch:` line. Only an entry below the last such line is current (`${CLAUDE_PLUGIN_ROOT}/references/implement-full.md`'s `## Progress log (per slice)`).

**A slice-reviewer's entry.** Applies to every `superdev:slice-reviewer` report. It appends its full findings, with their remedies, to the log its dispatch names, under the heading the dispatch names, and returns a summary (`${CLAUDE_PLUGIN_ROOT}/agents/slice-reviewer.md`'s `## Report`). Read its current entry for any step that needs more than the summary. A missing current entry goes back to that same reviewer through SendMessage first.

**An implementer's entry.** Applies to a `superdev:implementer` that builds a slice, fixes a slice, or fixes a Minor sweep. Before it reports, it appends a self-check entry to its log, headed with its dispatch kind and cycle, marking an item `covered` only where the entry quotes what the item demands beside what the work does and naming each `not observable` item in its concerns, and returns its required report (`${CLAUDE_PLUGIN_ROOT}/agents/implementer.md`'s `## Self-check` and `## Report`). A report whose log holds no current entry under the dispatch's heading goes back to it before the review, and no slice-review dispatch carries the entry.

**Narration.** Applies between dispatches. Narrate at most one line.

## Invariants (both playbooks)

**The fix loop's cap.** Applies to every slice's fix loop. Run at most 3 cycles, each counting whichever findings drove it, and never a fourth. After 3 cycles with a Critical or Important finding left that no exit below lets through, move the slice → `blocked` and escalate (re-slice, or hand to the human).

**Exits from the loop.** Applies to every review verdict in the loop, attended and unattended. A finding the loop leaves outside its fix list is a follow-up.

- **Clean** → the loop ends.
- **`full`, only Minor findings left, warranted cuts included** → the loop ends at once. The slice merges and its Minors join the Minor queue, which one sweep fixes before run handoff. `lite` runs no queue.
- **The only Critical or Important findings left are Pass-to-pass or Missing fail-to-pass run** → the slice proceeds, and the final report names each finding with its slice. Any of them beside a Critical or Important finding of another kind blocks.
- **An unclosable Pass-to-pass finding** (`fail-to-pass.md`'s `## Fail-to-pass run`) → it takes that escape at once, before the cap. It enters no fix list, and no fix cycle runs when no other finding is left. The final report names it with its slice or range, its case, and its reason.

**The RED test.** Applies to every fix. A fix for a finding that names failing behaviour opens with a RED test reproducing it. A fix for a finding that names none (style, naming, doc polish) takes no RED test, and the re-review verifies it by reading. The implementer's report names the rule it applied to each finding.

**Sibling surfaces.** Applies to every fix dispatch. Tell the implementer to search its own checkout for every other place that states the rule or behaviour the fix changes, bring each into agreement, and report each place it checked and each it changed. A place outside its checkout, the `AGENTS.md` hierarchy, and the knowledge base are reported unedited.

**The sibling check.** Applies to every fix report, before the next step.

- **No checked-and-changed list** → a report defect: send it back to the implementer.
- **Otherwise** → grep the checkout for the key phrase of the changed rule, in its old wording and its new, and compare the hits with the checked list.
- **A hit in a file the list does not name** → a missed sibling surface: send it back with the hit named, in the same cycle.
- **A hit in the `AGENTS.md` hierarchy or the knowledge base** → name it in your report. A hit in `CHANGELOG.md` needs no change.

**An observation.** Applies to a defect a dispatched agent's report surfaces, or one you meet, that no slice of this scope covers and the scope did not cause. Follow `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Observations` section. File the triage record yourself, at once.

**Recovery.** Applies after compaction. Trust the ledger and `git log` over memory. Re-dispatch no slice marked `merged`.

**Hook-enforced.** Applies to every dispatch and integration. Only the controller merges and pushes (`merge-guard`), and every dispatch sets an explicit `model` (`run-trace`).

**A denied dispatch.** Applies when a dispatch is denied. It is a degraded pass: follow `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes` section. Work inline, say so, and write the `**Degraded:**` entry.

- **An authoring dispatch** (implementer, fix) → `scope.js degraded add`. Under `--unattended` it blocks.
- **A verification dispatch** → `scope.js degraded add-denial -`, the refusal piped through a quoted heredoc rather than a shell argument. Under `--unattended`, follow that section's authorship rule: block where the controller authored what the pass verifies, and otherwise do the pass inline up to its cap. Read `scope.js get denials` after the entry and block once the count reaches it.

**Agents carry their own discipline.** Applies to every dispatch. Pass specifics, not lectures. A `mechanical` or `docs` slice invents no tests: the loop's runs and the scope review's exit run, the scope's one full-suite run (a full run, or the carry or recorded rerun `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` admits), are the net.

## Config + input

**`--unattended`.** Applies before anything else. Take it out of `$ARGUMENTS`, wherever it sits. Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section and follow it wherever this command or its playbook asks a question or starts an interview command (`/superdev:setup`, `/superdev:plan`). Nothing else in that file applies here.

**The config.** Applies to every start. Read `docs/agents/issue-tracker.md` (slice store), `docs/agents/code-management.md` (code host), `docs/agents/documentation.md` (documentation convention), `docs/agents/knowledge-base.md` (optional KB), and `docs/agents/verification.md` (test command).

- **Slice store or code host missing** → call the Skill tool with `superdev:setup` (no argument: the full setup), then continue. Under `--unattended`, block.
- **`docs/agents/verification.md` carrying one fenced block** → the focused command was never recorded. Call the Skill tool with `superdev:setup` (no argument), then continue. Under `--unattended`, block. No file, or zero fenced blocks, needs no such command.
- **`docs/agents/toolchain.md` absent while the repo has build manifests** (`package.json`, `*.csproj`/`*.sln`, `pom.xml`/`build.gradle*`, `pyproject.toml`, `Cargo.toml`, `go.mod`, …) → suggest **`/superdev:setup`** and continue.

**The feature label.** Applies to a given argument. It is the feature's slice-store label per `docs/agents/issue-tracker.md`, in that store's shape, carrying a **change type** and a slug (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The change type`). Both segments pass `scope-mode.md`'s scope-slug rule, because the whole label becomes the branch.

- `fix/lite-perf` gives scope `lite-perf`, branch `fix/lite-perf`, and run root `.superdev/scopes/lite-perf/`. Run init skips its scope-naming step.
- **A segment fails** → say which, stop, create no run root, and cut no branch.

**A label given.** Applies to a label that passes. Load the scope anchor carrying it and every slice carrying it. On a single-slice plan the anchor is the slice: load that one issue once.

- **Label unknown to the store** → say so and stop, creating no run root.
- **An epic carrying no slices** → say so, point at **`/superdev:plan`**, and stop. Under `--unattended`, block.

**Empty.** Applies to an empty argument. This command's **candidate set** (CONTEXT.md) is the features whose slices are ready, computed over the store's own calls. Hand it to `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Resolving an empty argument` cascade.

- **No candidate** → instead of the cascade's report-and-stop, call the Skill tool with `superdev:plan` and stop once plan ends. Under `--unattended`, block.

**The slices.** Applies once a feature resolves. Load each slice's `id`, `depends-on`, `test-applicability`, `spec`, and `acceptance`, and the global DoD.

- **No slices** → call the Skill tool with `superdev:plan` and stop once plan ends. Under `--unattended`, block.
- **One slice, no epic** → the DoD is that slice's `acceptance` (`plan-contract.md`).

**An outward criterion.** Applies to an `acceptance` criterion that needs a deploy, a migration, or any other outward-facing change to verify. Give it no increment, and report it as needing verification after merge, naming that change. Verifying a criterion changes no system outside the repository.

**The release.** Applies once the slices load. Read the signal off the scope anchor, through `docs/agents/issue-tracker.md`'s `## Release` section (`plan-contract.md` → *Release*).

- **Released** → continue silently.
- **Unreleased** → stop with no run root and no branch. Name the feature and the missing signal, and ask whether to implement it anyway. A yes runs the feature unchanged and applies no signal.
- **Unreleased, `--unattended`** → block.

**Pre-flight scan.** Applies once the release check passes. Read all slices once for contradictions: slice against slice, slice against DoD, and a specification mandating something a review would flag. Batch the findings to the user, or proceed silently when clean. Under `--unattended`, block, naming them.

**The playbook.** Applies after the scan. Compute the tier, `Read` its playbook, and follow it start to finish. `/superdev:plan` derives the tier the same way.

## Issue status

**The slice status.** Applies to every slice. Move the issue to the status `docs/agents/issue-tracker.md`'s **status map** gives for each point below. A failed status write is logged, and the run continues.

| Point | Status |
|---|---|
| dispatch | `in-progress` |
| entering per-slice review (behavior only; `lite` has none) | `in-review` |
| BLOCKED | `blocked` |
| merged | `merged`/done |

**The anchor status.** Applies to the scope anchor. Move it to `in-progress` when the run starts, and close it nowhere in this command: `/superdev:wrap-up` closes it. On a single-slice plan this rule wins over the slice status, and the issue stays `in-progress` through the merge.

## Model selection

Applies to every `full` dispatch; `lite` dispatches none, and the reviews later in the chain carry their own models. Set the model explicitly, per the table.

| Dispatch | Model | When |
|---|---|---|
| implementer / fix | `haiku` | mechanical slice (move, rename, format change), transcription from a complete specification, or a fix list in which every finding is a mechanical finding |
| implementer / fix | `sonnet` | design / multi-file / judgment slice, or a fix list with any other finding |
| slice-reviewer | `opus` | a slice's review and re-review, and a Minor sweep re-review after a fix list with any other finding |
| slice-reviewer | `sonnet` | a Minor sweep re-review after a fix list in which every finding is a mechanical finding |

**A mechanical finding.** Applies to the fix rows and the Minor sweep's re-review rows. A mechanical finding's fix changes no stated rule or behaviour (a rename, a rewrap, a typo). A fix that changes a rule or behaviour any surface states stays off `haiku`. An implementer working from a prose specification takes at least `sonnet`.

## Red flags

Applies to every run.

- **Inventing tests for non-behavior slices**: a rename's net is the existing suite.
- **Inferring dependencies**: use the plan's `depends-on`, never file overlap.
- **Stalling for routine approval**: stop only for a real blocker, a genuine ambiguity, a plan contradiction, an unreleased feature, or completion.
