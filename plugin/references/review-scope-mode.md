# Review in scope mode

Applies to a `/superdev:review` run whose `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` §1 found a live scope run. The skill reads this file at that point. It reads it before its first scope write (`step set review`) and before the entry run. No other review reads it (ADR 0190).

Each step below applies beside the skill's step of the same number. A departure from the skill names the departed skill rule.

- `<run-root>` and `<branch>`: the run root and scope branch §1 captured.
- `<base>`: the base branch §0 read.
- `<range-base>`: the scope's range base per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`. Before `submitted` it is the value §4.1's base concept resolves after the base step. At `submitted` no base step runs, and it is the value §1 resolved.

## 0. Config

**The test command.** Applies to the entry run and the exit run of §4.2. The entry run is the skill's focused run over the scope's range. The exit run runs the full command, the scope's one full-suite run (ADR 0025, ADR 0192).

**The triage section.** Applies when you read this reference and `docs/agents/issue-tracker.md` exists. Read its `## Triage record` section. §4.4's deferral branch needs the section's presence.

## 1. Range

**The acceptance.** Applies once the skill's §1 resolved the range.

- Take `<run-root>/dod.md` as the `acceptance` for `final-reviewer`, as a path and never as pasted text. The scope review takes no trailing description and runs no issue-ref discovery.
- **No `dod.md` in the run root** → say so in one line, take the acceptance by the skill's §1 rules, and follow this reference as well.

**The step record.** Applies after the skill states the range, before any other ledger or store write. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step set review --root <run-root>`.

- It replaces any standing step.
- It writes its own `step review` line, even when the step already reads `review`.

**The step's closers.** Applies to every exit after the `step set review` call. End the exit in one closer below.

- `step clear`.
- A stage write.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step block --root <run-root>`.
  - A blocked stop, a refusal, a `First:` wait, and a review exit without a clean verdict each run `step block` first.

## 2. Review

**The dispatch of `final-reviewer`.** Applies to every dispatch of `final-reviewer` in a scope review. `final-reviewer`'s `### What the dispatch hands you` and `### Run-trace findings` own each input's handling below. The dispatch hands these inputs. It restates none of those rules.

- **Summary**: the scope anchor's title, from `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get anchor --root <run-root>` (`${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## The ledger`). The verb prints `absent` → say so in one line and hand a diff-derived summary.
- **Acceptance**: the path `<run-root>/dod.md`, as §1 states.
- **Range**: the whole scope range `<range-base>..<branch>` on every dispatch, a re-review after a fix cycle included (ADR 0137, INV-0143).
- **Tier and run root**: the tier per `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes` (three or fewer slices is `lite`), and `<run-root>`.
- **Fix-cycle range**: a re-review hands the cycle's range `<cycle-base>..<cycle-tip>` as full commits. `<cycle-tip>` is the scope tip once you accept the cycle's report, before any merge of §4.1's **The moved base**.
- **Untraced writes**: the reviewer runs `scope.js untraced` over the range of each window `## Fail-to-pass run` gives the final reviewer, the `lite` slices with a recorded range and the scope's fix cycles with commits, and grades the listing, per `${CLAUDE_PLUGIN_ROOT}/references/review-checklist.md`'s `## Untraced writes` (ADR 0225). The dispatch hands the run root and the ranges above and no listing, because the verb reads git and the trace itself. A **Missing fail-to-pass run** finding counts the listed paths as change events, and a `run full` or `run whole` line inside an implementer window is a Minor **Implementer suite run** finding.
- **Suite result**: as the next concept states.

**The re-review after a warm cycle.** Applies to the re-review of a fix cycle whose list held only Minor findings (ADR 0174). Message the reviewer of the fixed verdict with SendMessage. Name the cycle's range as full commits, per the **Fix-cycle range** above. That range is its subject in place of the whole range.

- `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Warm cycles` owns when the reviewer resumes and when it dispatches fresh.
- The continued reviewer restates each unclosable **Pass-to-pass** finding of its last verdict, its mark re-judged against the cycle's range (ADR 0193). §3's combined verdict and §4.7's early escape read the restated findings.

**The suite result.** Applies to every dispatch of `final-reviewer` in a scope review. `final-reviewer`'s `### Suite run` owns the result's handling.

- The first dispatch hands §4.2's entry run labelled focused, or `not run: <reason>` (ADR 0192).
- A fix cycle's re-review hands no run, a cycle a red exit run opened included. `### Suite run` names what it reads in place of one (ADR 0182).

**The `simplicity-reviewer` dispatch.** Applies to the `simplicity-reviewer` dispatch of a scope review.

- **A `full`-tier scope whose every slice row in `scope.js get slices` reads `behavior`** → dispatch `final-reviewer` alone and skip `superdev:simplicity-reviewer`, reporting `` not dispatched — full tier, every slice `behavior` `` (ADR 0037, ADR 0138, ADR 0210).
- **A `full`-tier scope with a `mechanical` or `docs` row, or a row whose type cannot be read** → takes no skip from this concept. The skill's skip rules decide it, as they decide a `lite` scope, and the pass's findings go through the existing fix loop (ADR 0210).
- **A `lite` scope** takes no skip from this concept.
- The decision is the same on the entry review, on a fix cycle's re-review, on a warm re-review, and on a second `/superdev:review` invocation.
- **A ledger with no slice rows** leaves the tier unknown → dispatch.
- A denied `simplicity-reviewer` dispatch records no `**Degraded:**` entry (`${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes`).

**The slice reviewer for an Unreviewed slice.** Applies to §4.6's **Unreviewed slice** branch, which only a merged `behavior` slice reaches: a merged `mechanical` or `docs` slice, or one whose type cannot be read, draws no such finding and no `slice-reviewer` dispatch (`review-checklist.md`'s `## Review coverage`). Its `superdev:slice-reviewer` dispatch departs from the skill's exclusion of `slice-reviewer`.

**A denied `final-reviewer` dispatch.** Applies beside the skill's degraded-pass step, on a live run. Write the `**Degraded:**` entry per `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes` with `scope.js degraded add-denial -`. Pipe the classifier's refusal through a quoted heredoc and never a shell argument. Publish the snapshot per `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state`.

- **`--unattended`** → read `scope.js get denials` after writing the entry, and **block** once the count reaches the cap in that section, instead of reviewing inline again.

## 3. Report

**The sections a scope adds.** Applies to the report of a scope review. Insert these sections in the order below between `### Over-engineering cuts` and `### Assessment`.

```
### Ceiling
[final-reviewer's ceiling note, carried through verbatim when it wrote one; omit this section entirely
when it didn't]

### Fail-to-pass unknown [final-reviewer's notes, one per outcome, carried through verbatim; omit this section entirely when it wrote none]

### Deferred to a plan
[a finding whose remedy would add a capability the Definition of Done never named — §4.4's boundary (a guard-rail remedy is not one); one
line each, with the follow-up `/superdev:plan`. Omit this section when there is none]
```

**The combined verdict.** Applies to the `Ready to merge?` line of a scope review, which lands `Yes` in three cases instead of carrying `final-reviewer`'s raw `No`.

- A verdict whose only remaining findings are `### Deferred to a plan` entries: name the deferrals in the Reasoning line (§4.4).
- At the fix cap, a verdict whose only remaining Critical or Important findings are **Pass-to-pass** or **Missing fail-to-pass run** (§4.7): name each such finding in the Reasoning line with its slice, or a cycle's finding with its range.
- At any cycle, a verdict whose only remaining Critical or Important findings are unclosable **Pass-to-pass** findings, beside any deferred ones (§4.7, ADR 0193): name each unclosable finding in the Reasoning line with its slice or range, its case, and its reason.

**Fixes.** Applies to the findings of a scope review. Apply them through §4 after the ask-once of §4.6. This departs from the skill's apply-nothing rule. The reviewers stay read-only.

## 4. Fix loop and handoff

### 4.1 The scope checkout and the base

**The scope checkout.** Applies first, before any test run. Find the scope checkout per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope checkout`. Refresh the run lock per that file's `## The run lock`.

- **The scope checkout is not on `<type>/<scope>`** → report that and review read-only, writing nothing to the wrong branch.

**The anchor sync.** Applies on every route of the review (a clean verdict, the inline review after a denied dispatch, a second invocation) and at every stage it accepts, `submitted` included, after the scope checkout and the run lock and before the first dispatch of `final-reviewer`. §4.1's stage gates leave it unchanged, and no verdict gates it. Implement and run handoff tick `dod.md` alone, so the anchor's checklist can lack their ticks (ADR 0206). Read the anchor's Definition-of-Done lines per `docs/agents/issue-tracker.md`. Run the anchor sync of `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s `## Pairing dod.md with the anchor`.

- A failed anchor read or line write is reported once per run and never stops the review. `dod.md` stays authoritative.
- A `dod.md` line the sync cannot pair is named in the review's report with the instruction to hand-sync the anchor's criterion text to `dod.md`'s.
- §4.10's anchor re-sync runs the same operation again before each stage write.

**The base.** Applies at a stage before `submitted`, read with `scope.js get stage --root <run-root>`. Run `${CLAUDE_PLUGIN_ROOT}/references/scope-branch.md`'s `## Bringing the scope branch to base` after the scope checkout and the run lock. It runs before the entry run of §4.2 (ADR 0173). Its own rules apply unchanged.

- The unchanged rules: conflict, numbering-collision, citation, unattended-block, and degraded-fetch.
- A stop there ends the review with the scopetree clean.
- An unreachable remote records a degraded pass, and the review continues.
- It runs no suite. §4.2's exit run verifies its merge together with implement's (ADR 0192).
- The base step records the range base `final-reviewer` starts from. Resolve `<range-base>` with `scope.js base resolve --branch <branch> --base <base> --root <run-root>` after it, and hand every dispatch the range from that value.

**The preparation.** Applies at a stage before `submitted`, after the base step and before the entry run. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" prepare <run-root>/scopetree` in the controller's own Bash call, per `${CLAUDE_PLUGIN_ROOT}/references/scope-branch.md`'s `## Preparing a worktree`: a merged slice or the base step can add a dependency (ADR 0218). A failing preparation stops the review, naming the command and its exit. **`--unattended` → block**, per `scope-mode.md`'s `## Unattended`.

**The moved base.** Applies before every exit run of §4.2 and when each fix cycle ends, at every stage the review accepts, `submitted` included (ADR 0221). The base may move while the review runs. Fetch `<base>` per `scope-branch.md`'s `## Bringing the scope branch to base` (its fetch step) and read from git whether the scope branch holds the base tip: `git -C <run-root>/scopetree merge-base --is-ancestor <tip> <branch>`, `<tip>` being the fetched base tip as a full commit.

- **The branch holds the tip** → continue.
- **At `submitted`, the branch lacks the tip** → merge nothing and name the moved base in the report for `/superdev:ship`, which owns it there (ADR 0173).
- **At a stage before `submitted`, the branch lacks the tip** → you run the base step of **The base** yourself, with every rule it names, resolving a conflict per `${CLAUDE_PLUGIN_ROOT}/references/merge-conflicts.md`. Then run **The preparation** again, resolve `<range-base>` again with `scope.js base resolve`, and hand every later dispatch the range from that value. The exit run tests the merged tip, and no suite record from before the merge carries over.
- **A merge that resolved a conflict** → `final-reviewer` reviews the resolution before the exit run. The next re-review is a fresh whole-range dispatch per §2, never a warm resume. Before an exit run with no re-review due, dispatch one, handing the merge's range `<pre-merge-tip>..<merge-tip>` as full commits as its fix-cycle range. Its findings go through §4.6 and §4.7 as any re-review's do.
- **A merge with no conflict** → no re-review. The exit run verifies it.
- **A finding whose remedy is merging the base** is a finding the base step answers, whatever its wording. Remove it from the list of every fix dispatch, and name it in the report as answered by the base step.
- **Neither a base merge nor its re-review counts as a fix cycle** toward §4.7's cap.
- **A fetch that failed** → record the degraded pass **The base** names and continue.

### 4.2 The suite gate

**The suite record.** Applies before the entry run. Read `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get suite --root <run-root>`. It prints `<result> <sha>[ whole]`. It decides the exit run's command.

- **Red with `whole`, and a `## Whole-repo command` section configured** (ADR 0105, `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s `## Whole-repo command`) → the exit run runs the whole-repo command in place of the full command, through `scope.js test whole`. It skips the reuse check, records with `scope.js suite set <result> <sha> --whole --root <run-root>`, and the report names it the whole-repo run.
- **Any other record** → the exit run runs the full command.
- **The exit run follows this choice**, not a re-read of the record at the exit.

**The entry run.** Applies once per invocation, in the scope checkout, after §4.1 and before the first `final-reviewer` dispatch (ADR 0179, ADR 0192). Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test focused <paths>` once, `<paths>` being every path `git diff --name-only --no-renames <range-base> <branch>` lists that exists in the tree. Write no suite record. Hand the result and any failure output to §2's dispatch, labelled focused.

- A suite longer than the Bash tool's time limit runs through the runner in the background, and you wait for its end before acting on it.
- **The path set is empty** → run no test, and hand `not run: the scope changes no path`.
- **The focused fence of `docs/agents/verification.md` repeats the full fence** → run no test, and hand `not run: the focused command repeats the full command, so the exit run covers the scope`. A scope never pays the full suite twice.
- **No test command configured** → run no test, hand `not run: no test command`, and continue. This never blocks the review.
- **One fenced block, so no focused command** → record the degraded pass of `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s `## Stop on a missing focused command`, hand `not run: no focused command`, and continue to the dispatch. The exit run still runs the full command.
- **The run never finished** (killed, or `unknown` in the run trace) → it carries no verdict (INV-0009). Hand `not run: never finished`, and continue. The exit run still gates the stage.
- State the outcome in your own output: pass, fail, not run with its reason, or denied.

**A denied entry run.** Applies to an entry run the permission classifier denies. It takes the second shape of `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes`. Write the `**Degraded:**` entry, hand `denied`, and publish the snapshot before deciding the branch per `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state`.

- The branches below deviate locally from that section's record-and-continue default.
- **Attended** → continue.
- **Unattended** → **block**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Unattended`.

**A failing run.** Applies to a `fail` at the entry or the exit. It is a Critical finding. Fold it into the fix loop like a `final-reviewer` finding. The stage does not advance while it stands.

- The fold holds whether or not that dispatch returned findings of its own.
- **A failing test the scope did not cause** is this Critical finding too, and joins the fix list (INV-0157). A triage record for it may sit beside its fix, never in its place.
- **A red exit run opens a fix cycle**, after a clean first verdict included. It goes through the ask-once of §4.6 when attended, and its cycle counts toward the 3-cycle cap of §4.7 (ADR 0075). The cap bounds the exit runs a scope pays.
- **Its re-review re-judges every criterion ticked before the red run**: §2's whole-range dispatch hands the whole `dod.md`, and a line it calls broken is unticked per §4.5 before the stage advances.

**Inside a fix cycle.** Applies to every fix cycle. Run no test. The re-review reads the cycle implementer's recorded runs and its fail-to-pass outcome in the run trace (ADR 0182).

**The exit run.** Applies on every route that advances the stage, before §4.10's stage write (ADR 0192). The routes: a clean first verdict, a clean re-review, a re-review left with only Minor **Prompt-concept overlap** findings and no broken criterion, only Minor findings left at the cap, a declined ask-once with only Minor findings standing, and a ready combined verdict of §3 whose remaining findings are only deferred, or at any cycle only unclosable **Pass-to-pass** beside deferred ones, a warm re-review's restated ones included, or at the cap **Pass-to-pass** or **Missing fail-to-pass run**. Run it once in the scope checkout at the scope branch's tip, in this order.

1. **Reuse.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite reusable --branch <branch> --base <base> --root <run-root>`. Exit 0 → reused, running nothing (INV-0017): an exact tip match, a Markdown-only range since the record, needing no test run at the tip (ADR 0128, ADR 0189), a focused-selector carry, alone or followed by Markdown-only commits (ADR 0175, ADR 0189), a recorded rerun, alone or followed by Markdown-only commits (ADR 0172, ADR 0189), or a passing full run at the tip itself (ADR 0182).
2. **The carry.** Exit 1, or no record → take the carry per `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s `## The carry run`. A carried tip is reused, running and recording nothing. A failing carry run is a `fail`, recorded red at the tip.
3. **The full command.** A tip with no carry → run the full command from `docs/agents/verification.md` per `test-selection.md`, through `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test full`, or `test whole` per the suite-record concept above. A suite longer than the Bash tool's time limit runs through the runner in the background, and you wait for its end before acting on it.
4. **The recorded rerun.** A failed full run takes `test-selection.md`'s `## The recorded rerun` before it stands as the `fail`: the triage record quoting the failure first, then the rerun record, the file alone, and the focused run. An unattributable failure stays the `fail`.

**The exit record and outcome.** Applies to every exit run. A reused tip records nothing. Record every other outcome with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite set <green|red|denied|none> <tip> --root <run-root>` (ADR 0025), with `--whole` after the whole-repo choice: `green` for a pass, `red` for a fail or `pass on rerun`, and the bullets below name the rest. The run verifies the slices, implement's base merge, and this review's own base merge together.

- `<tip>` is the scope branch's tip after the last fix commit.
- The outcome is one of: reused, pass, `pass on rerun` (the gate passed on `## The recorded rerun` while the record stays `red`), fail, never finished, no command configured, or denied.
- **Reused, pass, or `pass on rerun`** → go to §4.10's stage write. That run is the gate the stage advances on.
- **Fail** → the failing-run concept above takes it.
- **Never finished** (killed, or `unknown` in the run trace) → it carries no verdict (INV-0009). Record `none` at the tip, leave the stage where it is, run `step block`, and say the next `/superdev:review` runs it again.
- **Denied** → record `denied`, write the `**Degraded:**` entry, and publish the snapshot per `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state`. The stage stays where it is. **Attended** → continue to the report, which names the denied exit run. **Unattended** → **block**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Unattended`.
- **No test command configured** → record `none` and go to §4.10's stage write. This never blocks the review.

### 4.3 Observations

**An observation.** Applies to a defect `final-reviewer`'s report surfaces, or a fix cycle meets, that no slice of this scope covers and the scope did not cause. Write its triage record at once per `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Observations` (INV-0010). It never joins the fix list. The loop carries on without it.

### 4.4 The fix boundary

**The boundary.** Applies to a finding whose remedy adds a capability the Definition of Done never named. `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Deferred findings` owns the boundary and the record. Report the finding under `### Deferred to a plan` with the follow-up command. Give it a durable home before any ledger write.

- `scope-findings.md`'s `## Deferred findings` states the guard-rail remedy, the failure-mode class, the absorbed record, and the severity rule.

**The deferral writes.** Applies to each deferred finding, in this order.

1. Read `scope.js get deferred` first, and skip a finding it already reports. That one read guards both writes below, across a later fix cycle and a second `/superdev:review` invocation on the same run.
2. **The store states no `## Triage record` section** (`docs/agents/issue-tracker.md`, per §0's **The triage section.**) → report that, and write only the ledger bullet, with `no triage record — store defines none` in the reference's place.
3. **The store defines one** → list the open records and follow `${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md`'s *Triage record* rule (ADR 0145). On a match the ledger bullet carries the matched record's reference.
4. **No record plainly matches** → create the triage record first, the way the store's `## Triage record` section states. Its body carries the finding, why no Definition of Done criterion covered it, the date, the feature label, the scope branch, the scope anchor's reference, and a copy-pasteable `/superdev:plan "<the finding>"` line, with no pull-request URL because none exists yet.
5. Capture the record's reference, and write the bullet with a quoted heredoc (`<<'SUPERDEV_TEXT_EOF'`) piped to `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" deferred add - --root <run-root>` (`${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`, triage #680). The bullet text carries that reference.
6. **The create fails** → the bullet names the failure in the reference's place: `no triage record — create failed`, or `no triage record — create denied` where a permission classifier refused the write. Then leave the scope as it is.

Report a failed create once per run and write the ledger bullet regardless (ADR 0035).

**A deferred finding's standing.** Applies to a deferred finding. It holds precedence over §4.6's `--unattended → fix every finding`.

- It enters no fix loop, holds no stage, and is no unresolved defect.
- A verdict whose only remaining findings are deferred counts as clean for the ask-once of §4.6, the 3-cycle cap of §4.7, and the stage advance of §4.10.

**Re-entry.** Applies to a deferred finding that `final-reviewer` names a guard-rail remedy for at the scope review (ADR 0121, ADR 0211, INV-0125), attended or unattended alike.

- **The remedy adds no capability** → the finding joins the next cycle's fix list. The dispatch asks the fix implementer for the fixing commit. Resolve the finding by `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Deferred findings` procedure, in its order, once that report names the commit and a later re-review no longer lists the finding.
- **The remedy still adds a capability** → the finding stays deferred.

### 4.5 The Definition-of-Done criteria

**The anchor sync.** Applies before any tick or untick below. §4.1's `**The anchor sync.**` ran at review entry, so the anchor's checklist already agrees with `dod.md`.

- Every tick and untick here writes `dod.md` and the anchor's checklist, as the concepts below state.

**A broken line.** Applies to a line `final-reviewer`'s `### Criteria` calls broken, ticked or not (`### Judge every criterion` owns the verdicts). It is a Critical finding. Untick it first. Fold it into the findings list beside `final-reviewer`'s `### Issues` after the untick.

- The untick carries a one-line note naming why (INV-0014).
- Untick `<run-root>/dod.md` and the anchor's checklist through the active store's `## Definition of Done ticks` section (`docs/agents/issue-tracker.md`, controller-only, INV-0015).

**A line left as it stood.** Applies to a line `final-reviewer` calls `ceiling`, `accepted`, or `doc pass`, unless the **holds** concept below turns it over. Leave such a line exactly as it stood.

- Write no note and no untick.
- Add no fix-cycle listing and no `**Unresolved:**` entry.
- Raise no finding for it.
- **ceiling** → §4.8's verification-ceiling case covers it.
- **accepted** → an attended operator's own decision (ADR 0095), which never holds the stage.
- **doc pass** → a `docs` line whose `AGENTS.md` text is not yet written. `/superdev:document` settles it after this review (ADR 0161, `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`).

**A `holds` verdict.** Applies to a line `final-reviewer` calls `holds`. You write every tick (INV-0015). The verdict's own evidence is the note.

- **Already ticked** → change nothing.
- **Unticked with `not met:`, or with no note** → tick it.
- **Unticked with `ceiling:`** → tick it only when the verdict states the criterion needs no deploy or other outward-facing change to verify and cites evidence observed on the branch.
- **Unticked with `accepted:`** → tick it only when the verdict cites evidence, observed on the branch, that the criterion is now met. Write no fresh `accepted:` note yourself.
- **A line that genuinely needs a deploy to verify** is never ticked on a `holds` verdict (INV-0006).

**The stage hold.** Applies to every stage write of this review. The stage does not advance while any `dod.md` criterion stands unmet (INV-0016).

- The exceptions: a `ceiling`, an `accepted`, or a `docs` criterion.

**A criterion missing from `dod.md`.** Applies to a criterion `final-reviewer` finds missing. Write no new line into `dod.md` (INV-0004).

- **A plan-coverage gap the code satisfies** → fix it in the loop with the guard-rail remedy that proves the behaviour (ADR 0097). A gap an existing test already proves is reported only.
- **A derived criterion the code fails** → a `### Deferred to a plan` finding, under §4.4 (ADR 0035).

### 4.6 The ask-once

**The ask.** Applies when `final-reviewer` returned any finding, a Minor-only verdict included, a criterion is broken, or a suite run of §4.2 came back `fail`, the exit run included. Report them per §3 first. Ask once with the three options below. §4.7 runs over the chosen option's set.

- **Fix every finding** (recommended), **fix only the Critical and Important findings**, or **fix none**.
- **An unclosable Pass-to-pass finding** (`${CLAUDE_PLUGIN_ROOT}/references/review-checklist.md`'s `## Fail-to-pass run`, ADR 0193) is never offered and never enters the chosen set. Its standing is §4.7's early escape. When the only Critical or Important findings left are unclosable or deferred, and no Minor, no criterion broken, and no red suite stands, ask nothing and take §4.7's early escape.
- **The findings include an unmet criterion** (a broken line, or one this cycle leaves unticked) → the same question also offers to accept it as unmet, with the operator's own reason. This is the one decision point where a fresh `accepted:` note gets written (ADR 0095).
- **`--unattended`** → never makes that offer and never writes `accepted:`. An unmet criterion there follows the ordinary fix-or-block path.

**The branches.** Applies to the answer, or to `--unattended`.

- **Declined, with only Minor findings standing, beside any unclosable or deferred ones** → take the clean-verdict path of §4.10 once the exit run of §4.2 is green, naming the standing Minors in the report and nowhere else: no `unresolved add`, no `deferred add`, no triage record (INV-0094). §3's combined verdict names each unclosable finding.
- **Declined, with a Critical or Important finding other than an unclosable or deferred one, a broken criterion, or a red suite standing** → stop and write the `**Unresolved:**` entry, per the standing-defect writes below. The findings stand and the stage does not advance.
- **Accepted** (the criterion's own reason, attended only) → write `accepted: <reason> (operator, <date>)` as that line's note, through `scope.js dod-line --match-file <path> --verdict accepted --note-file <path>` on `<run-root>/dod.md` and the anchor's checklist, through the store's `## Definition of Done ticks` section (controller-only, INV-0015, ADR 0095). That criterion drops out of the findings this cycle fixes, and any other finding still goes through the three options.
- **`--unattended`** → fix every finding, Minors included, without asking. Every finding here leaves out unclosable ones.
- **Fix only Critical and Important, with only unclosable or deferred ones among them** → the loop ends with no cycle and takes §4.7's early escape.
- **A Missing fail-to-pass run finding in the chosen set** → it joins the **Confirmed** fix of §4.7, whose implementer runs the verb over the finding's range (ADR 0182). A slice whose ledger row records no range first has its range recorded: read the slice's commits from the scope branch's log, run `scope.js slice <id> merged --range <base>..<tip> --root <run-root>`, and name that range in the fix dispatch.
- **An Unreviewed slice finding in the chosen set**, which names a merged `behavior` slice → answer it yourself, with no implementer cycle. Dispatch `superdev:slice-reviewer` with an explicit `model`, handing it the slice's `spec`, `acceptance`, range, and progress-log path `<run-root>/reports/<id>/progress.md`, and tell it to run no test and read the slice's recorded runs from the run trace (ADR 0178, ADR 0182). Before the dispatch, append the line `dispatch: slice-reviewer` to that progress log. Tell it the report contract of `slice-reviewer.md`'s `## Report`: it appends its full findings, with their remedies, to that progress log under the heading `Review — post-merge` and returns the summary that section lists, every item of it and no remedy. Read its entry under that heading below that line for any step that needs more than the summary. A review whose entry there is missing goes back to that same reviewer through SendMessage to append it before you act on the verdict. The progress log is input for it to check against the code, not a verdict to adopt (INV-0020). Leave the finding off the **Confirmed** list, dispatching no implementer when no finding remains on it. The run trace records that dispatch on the slice, which closes the finding at the re-review.

**The standing-defect writes.** Applies to a stop with a finding standing: the Declined branch above, and the cap of §4.7.

- Write the `**Unresolved:**` entry with a quoted heredoc (`<<'SUPERDEV_TEXT_EOF'`) piped to `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved add - --root <run-root>` (`${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`, triage #680).
- **At a `submitted` stage**, also invalidate the tip's suite record with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite set none <sha> --root <run-root>`, `<sha>` being the scope branch's current tip.
- Publish the snapshot before stopping, per `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state`, and leave the stage where it is.

### 4.7 Fix cycles

**The cycle's base.** Applies before each fix dispatch (ADR 0134, ADR 0182, INV-0138). Record the scope tip as the cycle's `<cycle-base>`. Name it in the dispatch. The implementer's `### Fail-to-pass run` owns the run over `<cycle-base>..HEAD` and its outcome line.

- The scope tip is `git -C <run-root>/scopetree rev-parse HEAD`.
- The outcome's trace line names `scope`.
- **A Pass-to-pass finding in the chosen set** → also name that finding's original base: the base of the range the finding's `pass-to-pass` line names, a lite slice's recorded range base or a fix cycle's own base. The finding closes on the implementer's `fail-to-pass` outcome from that base.
- **A Missing fail-to-pass run finding on a cycle** → name the cycle's range, `<cycle-base>..<cycle-tip>`.

**The fix dispatch.** Applies to the **Confirmed** branch: fix every finding, or fix only Critical and Important, when the chosen set holds a finding that is neither unclosable nor deferred. Dispatch **one** `superdev:implementer` with the **complete** list of the chosen option's findings, unclosable ones left out. The dispatch is the review fix dispatch of the implementer's own contract. It restates none of that contract beyond the sibling-surfaces and separate-calls bullets below (INV-0120, INV-0162).

- The implementer's contract owns the RED-test rule, the diagnosis loop, the test-run bound, and the report.
- One fixer takes the whole list and never one per finding.
- **Model**: `opus`. `haiku` only when every finding in the list is mechanical, one whose fix changes no stated rule or behaviour, and any other finding keeps the whole dispatch on `opus`.
- **Working directory**: the scope checkout, where its fix commits must land.
- **Findings**: the list, with `<cycle-base>` and the bases the previous concept names.
- **Definition of Done**: the `<run-root>/dod.md` path plus exactly the lines this cycle unticked or found broken, a listed-lines case of `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s mapping gate.
- **Sibling surfaces**: require the implementer to bring each sibling surface in its own checkout into agreement with the rule or behaviour its fix changes, and to report each place it checked and each it changed (INV-0120). It reports a place outside its checkout, the `AGENTS.md` hierarchy, and the knowledge base unedited (INV-0162).

**A warm cycle.** Applies to a cycle whose list holds only Minor findings. Run it per `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Warm cycles` (ADR 0174). The re-review's subject is §2's warm re-review range.

- `scope-findings.md`'s `## Warm cycles` owns when a resume gives way to a fresh dispatch, the wait, what each resume message carries, and the continued `final-reviewer`.

**The report check.** Applies to each fix implementer's report, before the re-review.

- **A report defect** → send the report back to the implementer in the same cycle. These are defects: no checked-and-changed list of sibling surfaces (INV-0120); a listed line with no met, not met, or ceiling line (`dod-ticks.md`'s note rule, INV-0014); a range that needs an outcome line and has none.
- **The grep.** Before the re-review, grep the checkout for the key phrase of the rule the fix changed, in its old wording and its new, and compare the hits with the report's checked list. A hit in a file the list does not name is a missed sibling surface: send the report back, naming the hit, in the same cycle.
- A hit in the `AGENTS.md` hierarchy or the knowledge base is named in your report instead. A hit in `CHANGELOG.md` is release history and needs no change.

**The re-review and the cap.** Applies after the implementer returns. Re-review per §2 after each cycle.

- The loop ends when the re-review lists no finding in the chosen set, when its only remaining Critical or Important findings are unclosable or deferred, or when the **3-strike cap** is reached.
- **The early escape: only unclosable Pass-to-pass findings remain among the Critical or Important ones, beside any deferred ones**, at any cycle the first verdict included → the scope proceeds under §3's combined verdict once the exit run of §4.2 is green, with no further cycle (ADR 0193). This holds attended and unattended, and neither blocks nor asks. Minors beside them still go through §4.6's ask-once first.
- The cap is **3 cycles in total, every cycle counting**, whichever findings drove it. §4.1's **The moved base** states what its merge counts.
- **A re-review whose only findings left are Minor Prompt-concept overlap findings** (`${CLAUDE_PLUGIN_ROOT}/references/review-checklist.md`'s `## Prompt-concept overlap`), with no criterion standing broken → the loop ends there, attended or `--unattended`. It takes the clean-verdict path of §4.10 as a Minor remainder at the cap does, after the same exit run.
- **At the cap, only Minor findings remain** → take the clean-verdict path of §4.10 once the exit run of §4.2 is green, naming the leftover Minors in the report and nowhere else (INV-0094). A red exit run at the cap is a remaining red suite.
- **At the cap, the only remaining Critical or Important findings are Pass-to-pass or Missing fail-to-pass run** → the scope proceeds under §3's combined verdict once the exit run of §4.2 is green (ADR 0125, ADR 0134, INV-0138). This holds attended and unattended. Any of them beside a Critical or Important finding of another kind blocks. An unclosable finding is never that other kind: beside it, cycles fix the others only, and at the cap the others alone decide.
- **At the cap, a Critical or Important finding, a broken criterion, or a red suite remains** → stop and say it is a wrong cut and no bug, and make the standing-defect writes of §4.6.
- **`--unattended`, at that cap** → **block** per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Unattended`, after the same writes.
- **A clean verdict** ends the loop, attended or unattended, and takes the exit run of §4.2. A finding it leaves standing outside the chosen set is a follow-up, never a fourth cycle.

### 4.8 Degraded fix dispatch and advisory notes

**A denied fix implementer.** Applies when the permission classifier denies the fix implementer's dispatch. Follow `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes`. Write the `**Degraded:**` entry either way with `scope.js degraded add`. Publish the snapshot per `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state`.

- The fix implementer is an authoring dispatch and none of the three the cap counts.
- **Attended** → apply the fix inline yourself and say so in §3's report.
- **Unattended** → **block there** instead of the `--unattended → fix` rule of §4.6.

**Advisory notes.** Applies to over-engineering findings and to `final-reviewer`'s `### Ceiling` section (ADR 0020). They gate nothing. Carry them into the report.

- They hold up no handoff, start no fix cycle, and change no stage.
- That holds attended and unattended alike.

**The verification-ceiling case.** Applies to a criterion only a deploy or another outward-facing change can verify (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Verification ceiling`). Carry it into §3's report as unmet with a one-line note on why. Never fold it into the fix loop.

### 4.9 The re-tick

**The re-tick.** Applies after a fix cycle's re-review comes back clean. Re-tick only the criteria met in that cycle's fix report. The report's evidence is the note.

- Tick `<run-root>/dod.md` and the anchor's checklist through the store's `## Definition of Done ticks` section (controller-only, INV-0015), per `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s `## Reading the report`.
- A listed line the report calls not met or ceiling stays unticked, with that reason or partial evidence as the note.
- Every other `dod.md` line keeps whatever state and note it already carried.

### 4.10 The clean verdict and the handoff

**The anchor re-sync.** Applies before each stage write of this review and on each leave-alone branch of the stage write below, and runs ahead of the `docs` untick's own writes. Read the anchor's Definition-of-Done lines again, per §4.1's `**The anchor sync.**`. Rewrite each paired line whose verdict, its note, differs from `dod.md`, by the note and never the box (`${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s `## Pairing dod.md with the anchor`).

- A line whose verdict already agrees stays unchanged, so a second review with nothing new to copy writes nothing.
- A failed read or write → §4.1's `**The anchor sync.**`.
- A line already reported as unpaired stays in the report's one hand-sync list.

**The stage write.** Applies on a clean verdict whose exit run's outcome goes to this stage write under §4.2's exit record and outcome concept, and only then. Clear any standing `**Unresolved:**` entry with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved clear --root <run-root>`. Read the stage with `scope.js get stage`. Write `**Stage:**` with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set <value> --root <run-root>` per the cases below.

- The clear changes nothing when no entry stands.
- A stage write never undoes completed work, and the verb refuses a write that breaks that.
- **`documented-unreviewed`, no fix cycle ran** → write `documented`.
- **`documented-unreviewed`, a fix cycle landed commits** → write `reviewed`.
- **`documented`, `submitted`, `shipped`, or `closed`** → leave the line alone and say so in one line.
- **Anything else** → write `reviewed`.

**The step clear.** Applies to every clean-verdict exit, after the stage write or the leave-alone. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step clear --root <run-root>`.

- The clear changes nothing when no step stands.

**The doc-pass record.** Applies when a fix cycle landed commits. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" docs clear --root <run-root>` (ADR 0031).

**The `docs` untick.** Applies to every ticked `docs` line when a fix cycle landed commits (ADR 0161). Untick it with the note `not met: a fix cycle landed after the doc pass` (`dod-ticks.md`). The untick runs after the `unresolved clear` above. The stage read before the stage write decides the untick's writes.

- Untick `<run-root>/dod.md` and the anchor's checklist through the store's `## Definition of Done ticks` section.
- **A stage before `documented`** (`documented-unreviewed` included) → no `**Unresolved:**` entry and no stage hold.
- **`documented` or `submitted`** → write one `**Unresolved:**` entry per unticked `docs` line, worded exactly `docs criterion unmet after the doc pass: <criterion>`, through a quoted heredoc piped to `scope.js unresolved add - --root <run-root>`. At `submitted`, also invalidate the tip's suite record as §4.6's standing-defect writes state.
- **`shipped` or `closed`** → write no `**Unresolved:**` entry, invalidate no suite record, and change no route. Name each unticked `docs` line in your report instead. The `/superdev:document` this block prints at that stage judges no `docs` line.

**The snapshot.** Applies after any write above: `unresolved clear`, the stage write, `docs clear`, `unresolved add`, and `suite set` alike. Publish it per `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state`.

**The integration bar.** Applies to this review's own steps only, and ends with the review. This review merges nothing, pushes nothing, and opens no pull request: `/superdev:submit-pr` and `/superdev:ship`, the chain's last steps, own those. The run-state ref send `scope.js` makes at a step end is no push of the scope branch, and this bar allows it (`run-handoff.md`, ADR 0202). A brief this review writes for the next command carries no part of this bar (INV-0184).

**The closing message.** Applies to the message this review ends on. The skill's closing-message concept requires the Next block. Call this conversation disposable first. Then an attended run reads `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The offer` section at this step, a read made earlier in the run included, and makes the offer for the command the cases below name when that section's conditions hold. The Next block, when this message prints one, comes last; a command the offer started leaves this review nothing to print. The block names the command by the cases below.

- **The `docs` untick wrote an `**Unresolved:**` entry** → print `/superdev:document <range>`, carrying the concrete range §1 resolved, and say in one line that it re-judges the unticked `docs` lines. `/superdev:submit-pr` and `/superdev:ship` wait for it.
- **The stage reads `submitted`** → print `/superdev:ship <scope>`, and say in one line that it merges the pull request `/superdev:submit-pr` opened (ADR 0096).
- **Otherwise** → print `/superdev:document <range>`, carrying the concrete range §1 resolved, and say in one line that it reconciles the in-repo docs and the knowledge base with the merged state.
