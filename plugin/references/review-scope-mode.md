# Review in scope mode

Applies to a `/superdev:review` run whose `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` §1 found a live scope run. The skill reads this file at that point. It reads it before its first scope write (`step set review`). No other review reads it.

Each step below applies beside the skill's step of the same number. A departure from the skill names the departed skill rule.

Rare branches live in files of their own, each read only when its branch fires: `${CLAUDE_PLUGIN_ROOT}/references/review-scope-holds.md` (an anchor check that refuses or cannot read, the standing-defect writes, the fix cap), `review-scope-denials.md` (a denied dispatch or test run), `review-scope-base.md` (a moved base), `review-scope-deferrals.md` (a deferred finding), and `review-scope-coverage.md` (an Unreviewed slice or Missing fail-to-pass run finding in the fix list).

- `<run-root>` and `<branch>`: the run root and scope branch §1 captured.
- `<base>`: the base branch §0 read.
- `<range-base>`: the scope's range base per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`. Before `submitted` it is the value §4.1's base concept resolves after the base step. At `submitted` no base step runs, and it is the value §1 resolved.

## 0. Config

**The test command.** Applies to every test run of a scope review. The review starts no full-suite or whole-repo run (ADR 0255, INV-0193). Its fix cycles run focused, path, and fail-to-pass runs, and the scope's full-suite evidence is taken at `/superdev:ship`, through the named checks or a local run. Before the first reviews, see §4.2's red evidence.

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

**The snapshot.** Applies to every exit after the `step set review` call. When this review made a ledger write `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state` lists, publish the snapshot once per that section, as the exit's last act: after its closer and after every ledger write the exit makes past it, such as §4.10's `docs clear` and `docs` untick entries. No other step of this review publishes.

## 2. Review

**The dispatch of `final-reviewer`.** Applies to every dispatch of `final-reviewer` in a scope review. `final-reviewer`'s `### What the dispatch hands you` and `### Run-trace findings` own each input's handling below. The dispatch hands these inputs. It restates none of those rules.

- **Summary**: the scope anchor's title, from the `anchor` field of the `scope.js state` call the skill's §1 made (`${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## The ledger`). The field reads `absent` → say so in one line and hand a diff-derived summary.
- **Acceptance**: the path `<run-root>/dod.md`, as §1 states.
- **Range**: the whole scope range `<range-base>..<branch>` on every dispatch, a re-review after a fix cycle included.
- **Tier and run root**: the tier per `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes` (3 or fewer `behavior` slices is `lite`), and `<run-root>`.
- **Fix-cycle range**: a re-review hands the cycle's range `<cycle-base>..<cycle-tip>` as full commits. `<cycle-tip>` is the scope tip once you accept the cycle's report, before any merge of §4.1's **The moved base**.
- **Untraced writes**: the reviewer runs `scope.js untraced` over the range of each window `fail-to-pass.md`'s `## Fail-to-pass run` gives the final reviewer, the `lite` slices with a recorded range and the scope's fix cycles with commits, and grades the listing, per `${CLAUDE_PLUGIN_ROOT}/references/untraced-writes.md`'s `## Untraced writes`. The dispatch hands the run root and the ranges above and no listing, because the verb reads git and the trace itself. A **Missing fail-to-pass run** finding counts the listed paths as change events, and a `run full` or `run whole` line inside an implementer window is a Minor **Implementer suite run** finding.
- **Suite result and red evidence**: as the next concept states.

**The re-review after a warm cycle.** Applies to the re-review of a fix cycle whose list held only Minor findings. Message the reviewer of the fixed verdict with SendMessage. Name the cycle's range as full commits, per the **Fix-cycle range** above. That range is its subject in place of the whole range.

- `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Warm cycles` owns when the reviewer resumes and when it dispatches fresh.
- The continued reviewer restates each unclosable **Pass-to-pass** finding of its last verdict, its mark re-judged against the cycle's range. §3's combined verdict and §4.7's early escape read the restated findings.

**The suite result.** Applies to every dispatch of `final-reviewer` in a scope review. `final-reviewer`'s `### Suite run` owns the result's handling.

- The first dispatch hands `not run: ship takes the full-suite evidence, from the named checks or a local run`, and each red-evidence finding §4.2 found, as Critical findings already in the fix list.
- A fix cycle's re-review hands no run, a cycle red evidence opened included. `### Suite run` names what it reads in place of one.

**The `simplicity-reviewer` dispatch.** Applies to the `simplicity-reviewer` dispatch of a scope review.

- **A `full`-tier scope whose every slice row in the `slices` field of the skill's `scope.js state` call reads `behavior`, with no `malformed` row** → dispatch `final-reviewer` alone and skip `superdev:simplicity-reviewer`, reporting `` not dispatched — full tier, every slice `behavior` ``.
- **A `full`-tier scope with a `mechanical` or `docs` row, or a row whose type cannot be read** → takes no skip from this concept. The skill's skip rules decide it, as they decide a `lite` scope, and the pass's findings go through the existing fix loop.
- **A `lite` scope** takes no skip from this concept.
- **Only the entry review dispatches it**, on every `/superdev:review` invocation. A fix cycle's re-review and a warm re-review get no over-engineering pass, so a cut never starts the next cycle.
- Each cut it recommends is warranted or declined by the skill's §2 warranted-cut concept. A warranted cut joins the findings as a Minor.
- **A ledger with no slice rows, or with a row whose type cannot be read,** leaves the tier unknown → dispatch.

**The slice reviewer for an Unreviewed slice.** Applies to §4.6's **Unreviewed slice** branch. Its `superdev:slice-reviewer` dispatch departs from the skill's exclusion of `slice-reviewer`, and `review-scope-coverage.md`'s `## An Unreviewed slice finding` states it and its report contract.

**A denied dispatch.** Applies beside the skill's degraded-pass step, on a live run, when the classifier denies a `final-reviewer` or `simplicity-reviewer` dispatch. Take the writes of `review-scope-denials.md`'s section for that dispatch.

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
- At any cycle, a verdict whose only remaining Critical or Important findings are unclosable **Pass-to-pass** findings, beside any deferred ones (§4.7): name each unclosable finding in the Reasoning line with its slice or range, its case, and its reason.

**Fixes.** Applies to the findings of a scope review. Apply them through §4 over §4.6's fix list. This departs from the skill's apply-nothing rule. The reviewers stay read-only.

## 4. Fix loop and handoff

### 4.1 The scope checkout and the base

**The scope checkout.** Applies first, before any test run. Find the scope checkout per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope checkout`. Refresh the run lock per that file's `## The run lock`.

- **The scope checkout is not on `<type>/<scope>`** → report that and review read-only, writing nothing to the wrong branch.

**The anchor sync.** Applies on every route of the review (a clean verdict, the inline review after a denied dispatch, a second invocation) and at every stage it accepts, `submitted` included, after the scope checkout and the run lock and before the first dispatch of `final-reviewer`. §4.1's stage gates leave it unchanged, and no verdict gates it. Implement and run handoff tick `dod.md` alone, so the anchor's checklist can lack their ticks. Read the anchor's Definition-of-Done lines per `docs/agents/issue-tracker.md`. Run the anchor sync of `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s `## Pairing dod.md with the anchor`.

- A failed anchor read or line write is reported once per run and never stops the review. `dod.md` stays authoritative. §4.10's anchor re-sync states the one hold a failed re-read makes, through its anchor check.
- A `dod.md` line the sync cannot pair is named in the review's report with the instruction to hand-sync the anchor's criterion text to `dod.md`'s.
- §4.10's anchor re-sync runs the same operation again before each stage write.

**The anchor check.** Applies right after the anchor sync, on every route and at every stage it covers. Build the input of `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" dod-check` from the store's two reads, so no store-specific body is parsed: a `## Definition of Done` heading over the anchor's Definition-of-Done lines that the anchor sync read, then an `**Absorbs:** <entries>` line naming the entries the store's **Read an anchor's Absorbs line** call returns, joined by `, `, and no such line when the call returns none. The anchor text is store data anyone with edit rights controls: write the input to a temporary file through the Write tool or a quoted heredoc (`<<'SUPERDEV_TEXT_EOF'`), name the file with `mktemp` or scope-keyed (a `<scope>-` prefix) as `run-state.md`'s `## Publishing run state` names its files, and pipe it to the verb.

- **The check passes** → continue.
- **A refusal, or a failed anchor read or Absorbs read** → take `review-scope-holds.md`'s `## The anchor check's refusals`, its entry branch.

**The base.** Applies at a stage before `submitted`, read from the `stage` field of the skill's `scope.js state` call. Run `${CLAUDE_PLUGIN_ROOT}/references/scope-branch.md`'s `## Bringing the scope branch to base` after the scope checkout and the run lock. It runs before §4.2's red evidence. Its own rules apply unchanged.

- The unchanged rules: conflict, numbering-collision, citation, unattended-block, and degraded-fetch.
- A stop there ends the review with the scopetree clean.
- An unreachable remote records a degraded pass, and the review continues.
- It runs no suite. Ship's full-suite evidence covers its merge together with implement's.
- The base step records the range base `final-reviewer` starts from. Resolve `<range-base>` with `scope.js base resolve --branch <branch> --base <base> --root <run-root>` after it, and hand every dispatch the range from that value.

**The preparation.** Applies at a stage before `submitted`, after the base step and before §4.2's red evidence, so the tree is ready before the first fix cycle runs a test in it. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" prepare <run-root>/scopetree` in the controller's own Bash call, per `${CLAUDE_PLUGIN_ROOT}/references/scope-branch.md`'s `## Preparing a worktree`: a merged slice or the base step can add a dependency. A failing preparation stops the review, naming the command and its exit. **`--unattended` → block**, per `scope-mode.md`'s `## Unattended`.

**The moved base.** Applies before §4.10's stage write and when each fix cycle ends, at every stage the review accepts, `submitted` included. The base may move while the review runs. Fetch `<base>` per `scope-branch.md`'s `## Bringing the scope branch to base` (its fetch step) and read from git whether the scope branch holds the base tip: `git -C <run-root>/scopetree merge-base --is-ancestor <tip> <branch>`, `<tip>` being the fetched base tip as a full commit.

- **The branch holds the tip** → continue.
- **At `submitted`, the branch lacks the tip** → merge nothing and name the moved base in the report for `/superdev:ship`, which owns it there.
- **At a stage before `submitted`, the branch lacks the tip** → bring it in per `review-scope-base.md`'s `## The base merge`.
- **A finding whose remedy is merging the base** → `review-scope-base.md`'s `## A finding answered by the base step`.
- **A fetch that failed** → record the degraded pass **The base** names and continue.

### 4.2 Red evidence

**The red evidence.** Applies once per invocation, in the scope checkout, after §4.1 and before the first `final-reviewer` dispatch. Run no test. Read both sources below. Each red the reading finds is a Critical finding in the fix list, even when `final-reviewer` returns none. §2's dispatches and the `simplicity-reviewer` dispatch go out at once after the reading.

- **The local suite record.** Read the `suite` and `failed` fields of the skill's `scope.js state` call. A record that reads `red` at the scope branch's tip, or at an ancestor of it (`git -C <run-root>/scopetree merge-base --is-ancestor <sha> <branch>` succeeds), is a red-evidence finding naming its commit and the test files the `failed` field prints. A red record on a commit that is no ancestor of the tip is ignored. Any other record finds nothing.
- **A red record a fix already closed.** Applies to a red record the bullet above would raise. A fix cycle's runs write no suite record, so the red record outlives its fix. Read the run trace with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" trace --root <run-root>`. Where it holds, at a later commit on the tip's ancestry (a commit other than the record's, where both `git -C <run-root>/scopetree merge-base --is-ancestor <record-sha> <commit>` and `git -C <run-root>/scopetree merge-base --is-ancestor <commit> <branch>` succeed), passing runs on a clean tree that cover the failure, the record raises no finding. A record whose `failed` field prints test files is covered by a passing `path` run of each of those files, or by a passing focused run whose recorded path set includes each of them. A record whose `failed` field prints no test file is covered by a passing focused run over the scope's whole range, its path set every path `git diff --name-only <range-base>..<commit>` prints. Where the focused fence of `docs/agents/verification.md` at `<commit>` repeats the full fence, that run is a full run, which a fix cycle never makes: there a record with no failed test file is covered by a fix cycle's own passing `path` run of every test file that cycle's range changed, made at the cycle's tip on a clean tree, or, where that cycle changed no test file, by the cycle's tip being clean, and the report says ship checks the evidence again, through the named checks or its local suite gate. Say once that a later run closed it, naming that run's commit.
- **The named CI checks.** Applies where the `## CI` section of `docs/agents/verification.md` at the tip names checks and holds no `none`, and the `pr` field records a pull request. Read that pull request per `docs/agents/code-management.md`'s `## Merge` section for its `head.sha`. Take that document's `## Check status` read for `head.sha`, its lines read into a file, and feed them to `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" ci --sha <head.sha> --root <run-root>/scopetree`. State the verdict for that SHA.
  - **`head.sha` is the tip or an ancestor of it, exit 4** (`git -C <run-root>/scopetree merge-base --is-ancestor <head.sha> <branch>` succeeds) → one red-evidence finding per check the verb names failed, naming the check, its link, and that SHA, unless **A red record a fix already closed** closes it, with `head.sha` for the record's commit. A failed check names no test file, so it closes as a red record with no failed file does. Report it for that head, never as the tip's state.
  - **Any other exit, or a `head.sha` that is no ancestor of the tip** → no finding. Report a non-ancestor head's verdict for that head, never as the tip's state.
- **A CI read that fails** (the pull request read, the check-status read, or a document with no `## Check status` section) → print `CI status unreadable: <reason>` once, and continue. It never holds the review.
- **A `## CI` section at the tip holding both `none` and a name** (a name being any backtick span outside a fenced block other than `none`, and a bare `none` line counting as `none`) → a configuration error that `scope.js ci` cannot judge and ship refuses. Print `CI section malformed: it holds both none and a check name; fix it through /superdev:setup` once, read no check status, and continue. It raises no finding.

**A red-evidence finding.** Applies to every finding the red evidence found. Fold it into the fix loop like a `final-reviewer` finding. The stage does not advance while it stands.

- **A failing test the scope did not cause** is this Critical finding too, and joins the fix list. A triage record for it may sit beside its fix, never in its place.
- **It joins §4.6's fix list**, and its cycle counts toward the 3-cycle cap of §4.7.
- **It closes on the fix cycle's own runs** at the cycle's tip, which the re-review reads in the run trace: runs that cover it as **A red record a fix already closed** states, a failed check included.
- **The report says ship takes the full-suite evidence again**, from the named checks or a local run.

**Inside a fix cycle.** Applies to every fix cycle. Run no test. The re-review reads the cycle implementer's recorded runs and its fail-to-pass outcome in the run trace.

### 4.3 Observations

**An observation.** Applies to a defect `final-reviewer`'s report surfaces, or a fix cycle meets, that no slice of this scope covers and the scope did not cause. Write its triage record at once per `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Observations`. It never joins the fix list. The loop carries on without it.

### 4.4 The fix boundary

**The boundary.** Applies to a finding whose remedy adds a capability the Definition of Done never named. `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Deferred findings` owns the boundary and the record, and states the guard-rail remedy, the failure-mode class, the absorbed record, and the severity rule. Report the finding under `### Deferred to a plan` with the follow-up command. Give it a durable home before any ledger write: make the writes of `review-scope-deferrals.md`.

**A deferred finding's standing.** Applies to a deferred finding. It holds precedence over §4.6's fix list.

- It enters no fix loop, holds no stage, and is no unresolved defect.
- A verdict whose only remaining findings are deferred counts as clean for §4.6's fix list, the 3-cycle cap of §4.7, and the stage advance of §4.10.

**Re-entry.** Applies to a deferred finding that `final-reviewer` names a guard-rail remedy for. Take `review-scope-deferrals.md`'s `## Re-entry`.

### 4.5 The Definition-of-Done criteria

**The anchor sync.** Applies before any tick or untick below. §4.1's `**The anchor sync.**` ran at review entry, so the anchor's checklist already agrees with `dod.md`.

- Every tick and untick here writes `dod.md` and the anchor's checklist, as the concepts below state.

**A broken line.** Applies to a line `final-reviewer`'s `### Criteria` calls broken, whatever its checkbox or note (`### Judge every criterion` owns the verdicts). It is a Critical finding. Untick it first. Fold it into the findings list beside `final-reviewer`'s `### Issues` after the untick.

- The untick carries a one-line note naming why.
- Untick `<run-root>/dod.md` and the anchor's checklist through the active store's `## Definition of Done ticks` section (`docs/agents/issue-tracker.md`, controller-only).

**A `ceiling` verdict.** Applies to a line `final-reviewer` calls `ceiling`. §4.8's verification-ceiling case covers it.

- **Noted `ceiling:`** → leave it exactly as it stood.
- **Noted `accepted:`** → leave it exactly as it stood. Only an attended operator writes or removes `accepted:`.
- **Any other line**: no note, a bare `[x]`, `met:`, or `not met:` → untick it with the note `ceiling: <the verdict's partial evidence>`, through the active store's `## Definition of Done ticks` section (`scope.js dod-line --verdict ceiling`), on `<run-root>/dod.md` and the anchor's checklist. The note makes it a line noted `ceiling:`, which **The stage hold** below exempts.
- Add no fix-cycle listing and no `**Unresolved:**` entry, and raise no finding for it.

**A line left as it stood.** Applies to a line `final-reviewer` calls `accepted` or `doc pass`, unless the **holds** concept below turns it over. Leave such a line exactly as it stood.

- Write no note and no untick.
- Add no fix-cycle listing and no `**Unresolved:**` entry.
- Raise no finding for it.
- **accepted** → an attended operator's own decision, which never holds the stage.
- **doc pass** → a `docs` line whose `AGENTS.md` text is not yet written. `/superdev:document` settles it after this review (`${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`).

**A `holds` verdict.** Applies to a line `final-reviewer` calls `holds`. You write every tick. The verdict's own evidence is the note. Each row keys on the line's note, whatever its checkbox shows (`${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s `## The note rule`).

- **Noted `met:`** → change nothing.
- **Noted `not met:`, or with no note, a bare `[x]` included** → tick it.
- **Noted `ceiling:`** → tick it only when the verdict states the criterion needs no deploy or other outward-facing change to verify and cites evidence observed on the branch.
- **Noted `accepted:`** → tick it only when the verdict cites evidence, observed on the branch, that the criterion is now met. Write no fresh `accepted:` note yourself.
- **A line that genuinely needs a deploy to verify** is never ticked on a `holds` verdict.

**The stage hold.** Applies to every stage write of this review. The stage does not advance while any `dod.md` line is an open line by `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s `## The note rule`.

- These lines hold no stage: a line noted `ceiling:`, a line noted `accepted:`, and a `docs` line. A `ceiling:` line stays an open line; it only holds no stage before the merge.

**A criterion missing from `dod.md`.** Applies to a criterion `final-reviewer` finds missing. Write no new line into `dod.md`.

- **A plan-coverage gap the code satisfies** → fix it in the loop with the guard-rail remedy that proves the behaviour. A gap an existing test already proves is reported only.
- **A derived criterion the code fails** → a `### Deferred to a plan` finding, under §4.4.

### 4.6 The fix list

**The fix list.** Applies when `final-reviewer` returned any finding, a Minor-only verdict included, the entry review warranted a cut, a set of warranted cuts alone included, a criterion is broken, or §4.2 found red evidence. Report them per §3 first. The fix list is every finding, attended and `--unattended` alike: Critical, Important, and Minor findings, warranted cuts, broken criteria, and red-evidence findings. §4.7 runs over it without asking whether to fix.

- **A warranted cut is a Minor here**, and joins the fix list. A declined cut never joins it: the report names it with the rule it would break.
- **A Minor-only fix list**, warranted cuts included, runs a fix cycle, a warm cycle by §4.7's **A warm cycle**, under the 3-cycle cap.
- **An unclosable Pass-to-pass finding** (`${CLAUDE_PLUGIN_ROOT}/references/fail-to-pass.md`'s `## Fail-to-pass run`) never enters the fix list. Its standing is §4.7's early escape. When the only Critical or Important findings left are unclosable or deferred, and no Minor, no criterion broken, and no red-evidence finding stands, ask nothing and take §4.7's early escape.
- **A Missing fail-to-pass run finding, or an Unreviewed slice finding, in the fix list** → take its section of `review-scope-coverage.md`.

**The criterion question.** Applies to an attended review whose fix list holds an unmet criterion (a broken line, or one a cycle leaves unticked), before the first fix dispatch that would list it. Ask one `AskUserQuestion` per such criterion: fix it, or accept it as unmet with the operator's own reason. This is the one decision point where a fresh `accepted:` note gets written.

- **Fix it** → the criterion stays in the fix list.
- **Accepted** (the criterion's own reason) → write `accepted: <reason> (operator, <date>)` as that line's note, through `scope.js dod-line --match-file <path> --verdict accepted --note-file <path>` on `<run-root>/dod.md` and the anchor's checklist, through the store's `## Definition of Done ticks` section (controller-only). That criterion drops out of the fix list. Every other finding stays in it.
- **A fix list the answers leave empty** → take the clean-verdict path of §4.10.
- **`--unattended`** → never ask it and never write `accepted:`. An unmet criterion there follows the ordinary fix-or-block path.

### 4.7 Fix cycles

**The cycle's base.** Applies before each fix dispatch. Record the scope tip as the cycle's `<cycle-base>`. Name it in the dispatch. The implementer's `### Fail-to-pass run` owns the run over `<cycle-base>..HEAD` and its outcome line.

- The scope tip is `git -C <run-root>/scopetree rev-parse HEAD`.
- The outcome's trace line names `scope`.
- **A Pass-to-pass finding in the fix list** → also name that finding's original base: the base of the range the finding's `pass-to-pass` line names, a lite slice's recorded range base or a fix cycle's own base. The finding closes on the implementer's `fail-to-pass` outcome from that base.
- **A Missing fail-to-pass run finding on a cycle** → name the cycle's range, `<cycle-base>..<cycle-tip>`.

**The fix dispatch.** Applies when §4.6's fix list holds a finding that is neither unclosable nor deferred. Dispatch **one** `superdev:implementer` with the **complete** fix list, unclosable ones left out. The dispatch is the review fix dispatch of the implementer's own contract. It restates none of that contract beyond the red-evidence, sibling-surfaces, and separate-calls bullets below.

- The implementer's contract owns the RED-test rule, the diagnosis loop, the test-run bound, and the report.
- One fixer takes the whole list and never one per finding.
- **Model**: `opus`. `haiku` only when every finding in the list is mechanical, one whose fix changes no stated rule or behaviour, and any other finding keeps the whole dispatch on `opus`.
- **Working directory**: the scope checkout, where its fix commits must land.
- **Findings**: the list, with `<cycle-base>` and the bases the previous concept names.
- **Range-base input**: `<base>`, handed as `<base-branch>` for the implementer's `scope.js base resolve`.
- **Red-evidence findings**: a red-evidence finding that names no failed test file, a failed named check or a red record whose `failed` field prints none, widens the cycle's final focused run to the scope's whole range, and where the focused fence repeats the full fence the cycle's final `path` run closes it instead. A red-evidence finding that names failed test files adds each of them to the cycle's final run, in either fence configuration. Both follow §4.2's **A red record a fix already closed** and `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s `## The changed-path set`. Name the finding as red evidence and hand the range-base input above.
- **Definition of Done**: the `<run-root>/dod.md` path plus exactly the lines this cycle unticked or found broken, a listed-lines case of `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s mapping gate.
- **Sibling surfaces**: require the implementer to bring each sibling surface in its own checkout into agreement with the rule or behaviour its fix changes, and to report each place it checked and each it changed. It reports a place outside its checkout, the `AGENTS.md` hierarchy, and the knowledge base unedited.
- **Same-defect instances**: require the implementer to fix every other instance of the defect a finding names within the files the scope changes, the paths changed over `<range-base>..HEAD`, and to name each in its report. It reports an instance outside those files as an observation, unfixed. The re-review reads each instance the report names.

**A warm cycle.** Applies to a cycle whose list holds only Minor findings, warranted cuts included. Run it per `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Warm cycles`. The re-review's subject is §2's warm re-review range.

- `scope-findings.md`'s `## Warm cycles` owns when a resume gives way to a fresh dispatch, the wait, what each resume message carries, and the continued `final-reviewer`.

**The report check.** Applies to each fix implementer's report, before the re-review.

- **A report defect** → send the report back to the implementer in the same cycle. These are defects: no checked-and-changed list of sibling surfaces; a listed line with no met, not met, or ceiling line (`dod-ticks.md`'s note rule); a range that needs an outcome line and has none.
- **The grep.** Before the re-review, grep the checkout for the key phrase of the rule the fix changed, in its old wording and its new, and compare the hits with the report's checked list. A hit in a file the list does not name is a missed sibling surface: send the report back, naming the hit, in the same cycle.
- A hit in the `AGENTS.md` hierarchy or the knowledge base is named in your report instead. A hit in `CHANGELOG.md` is release history and needs no change.

**The re-review and the cap.** Applies after the implementer returns. Re-review per §2 after each cycle.

- The loop ends when the re-review lists no finding in the fix list, when its only remaining Critical or Important findings are unclosable or deferred, or when the **3-strike cap** is reached.
- **The early escape: only unclosable Pass-to-pass findings remain among the Critical or Important ones, beside any deferred ones**, at any cycle the first verdict included → the scope proceeds under §3's combined verdict, with no further cycle. This holds attended and unattended, and neither blocks nor asks. Minors beside them are still fixed first, per §4.6.
- The cap is **3 cycles in total, every cycle counting**, whichever findings drove it, a cycle driven by warranted cuts alone included. §4.1's **The moved base** states what its merge counts.
- **A re-review whose only findings left are Minor Prompt-concept overlap findings** (`${CLAUDE_PLUGIN_ROOT}/references/prompt-concept-overlap.md`'s `## Prompt-concept overlap`), with no criterion standing broken → the loop ends there, attended or `--unattended`. It takes the clean-verdict path of §4.10 as a Minor remainder at the cap does.
- **At the cap, a finding in the fix list still stands** → take `review-scope-holds.md`'s `## At the cap`.
- **A clean verdict** ends the loop, attended or unattended, and takes §4.10. A finding it leaves standing outside the fix list is a follow-up, never a fourth cycle.

### 4.8 Degraded fix dispatch and advisory notes

**A denied fix implementer.** Applies when the permission classifier denies the fix implementer's dispatch. Take `review-scope-denials.md`'s `## A denied fix implementer`.

**Advisory notes.** Applies to `final-reviewer`'s `### Ceiling` section. It gates nothing. Carry it into the report. A warranted cut is no advisory note: it is a Minor finding of §4.6.

- It holds up no handoff, starts no fix cycle, and changes no stage.
- That holds attended and unattended alike.

**The verification-ceiling case.** Applies to a criterion only a deploy or another outward-facing change can verify (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Verification ceiling`). Carry it into §3's report as unmet with a one-line note on why. Its `dod.md` line carries a `ceiling:` note, written by §4.5's **A `ceiling` verdict** where the line lacked one, or keeps an operator's `accepted:` note. Never fold it into the fix loop.

### 4.9 The re-tick

**The re-tick.** Applies after a fix cycle's re-review comes back clean. Re-tick only the criteria met in that cycle's fix report. The report's evidence is the note.

- Tick `<run-root>/dod.md` and the anchor's checklist through the store's `## Definition of Done ticks` section (controller-only), per `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s `## Reading the report`.
- A listed line the report calls not met or ceiling stays unticked, with that reason or partial evidence as the note.
- Every other `dod.md` line keeps whatever state and note it already carried.

### 4.10 The clean verdict and the handoff

**The anchor re-sync.** Applies before each stage write of this review and on each leave-alone branch of the stage write below, and runs ahead of the `docs` untick's own writes. Read the anchor's Definition-of-Done lines again, per §4.1's `**The anchor sync.**`. Rewrite each paired line whose verdict, its note, differs from `dod.md`, by the note and never the box (`${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s `## Pairing dod.md with the anchor`).

- A line whose verdict already agrees stays unchanged, so a second review with nothing new to copy writes nothing.
- A failed read or write → §4.1's `**The anchor sync.**`.
- A line already reported as unpaired stays in the report's one hand-sync list.
- Run §4.1's `**The anchor check.**` again on the re-read lines before each stage write, so the stage write's `unresolved clear` never clears a hold the anchor still earns. A refusal or a failed read there takes `review-scope-holds.md`'s `## The anchor check's refusals`, its stage-write branch.

**The stage write.** Applies on every route that advances the stage, and only then: a clean first verdict, a clean re-review, a re-review left with only Minor **Prompt-concept overlap** findings and no broken criterion, only Minor findings left at the cap, and a ready combined verdict of §3 whose remaining findings are only deferred, or at any cycle only unclosable **Pass-to-pass** beside deferred ones, a warm re-review's restated ones included, or at the cap **Pass-to-pass** or **Missing fail-to-pass run**. No red-evidence finding stands on any of them. Clear any standing `**Unresolved:**` entry with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved clear --root <run-root>`. Read the stage with `scope.js get stage`. Write `**Stage:**` with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set <value> --root <run-root>` per the cases below.

- The clear changes nothing when no entry stands.
- A stage write never undoes completed work, and the verb refuses a write that breaks that.
- **`documented-unreviewed`, no fix cycle ran** → write `documented`.
- **`documented-unreviewed`, a fix cycle landed commits** → write `reviewed`.
- **`documented`, `submitted`, `shipped`, or `closed`** → leave the line alone and say so in one line.
- **Anything else** → write `reviewed`.

**The step clear.** Applies to every clean-verdict exit, after the stage write or the leave-alone. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step clear --root <run-root>`.

- The clear changes nothing when no step stands.

**The doc-pass record.** Applies when a fix cycle landed commits. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" docs clear --root <run-root>`.

**The `docs` untick.** Applies to every `docs` line noted `met:` when a fix cycle landed commits. Untick it with the note `not met: a fix cycle landed after the doc pass` (`dod-ticks.md`). The untick runs after the `unresolved clear` above. The stage read before the stage write decides the untick's writes.

- Untick `<run-root>/dod.md` and the anchor's checklist through the store's `## Definition of Done ticks` section.
- **A stage before `documented`** (`documented-unreviewed` included) → no `**Unresolved:**` entry and no stage hold.
- **`documented` or `submitted`** → write one `**Unresolved:**` entry per unticked `docs` line, worded exactly `docs criterion unmet after the doc pass: <criterion>`, through a quoted heredoc piped to `scope.js unresolved add - --root <run-root>`. At `submitted`, also invalidate the tip's suite record with `scope.js suite set none <sha> --root <run-root>`, `<sha>` being the scope branch's current tip.
- **`shipped` or `closed`** → write no `**Unresolved:**` entry, invalidate no suite record, and change no route. Name each unticked `docs` line in your report instead. The `/superdev:document` this block prints at that stage judges no `docs` line.

**The integration bar.** Applies to this review's own steps only, and ends with the review, at the document start included. This review merges nothing, pushes nothing, and opens no pull request: `/superdev:submit-pr` and `/superdev:ship`, the chain's last steps, own those. The run-state ref send `scope.js` makes at a step end is no push of the scope branch, and this bar allows it (`run-handoff.md`). A brief this review writes for the next command carries no part of this bar.

**The closing message.** Applies to the message this review ends on. The skill's closing-message concept requires the Next block. The Next block, when this message prints one, comes last, and names the command by the cases below. Only the **Otherwise** case starts its command, per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The chain start`; a started document leaves this review nothing to print. Every other case prints.

- **A stop that made the standing-defect writes of `review-scope-holds.md`**, the cap of §4.7, or the anchor check of the anchor re-sync at a stage before `shipped`, a failed re-read included → put `Blocked: <reason>` before the fence, and print `/superdev:review <scope-slug>` in it as the command that resumes the run.
- **The `docs` untick wrote an `**Unresolved:**` entry** → print `/superdev:document <range>`, carrying the concrete range §1 resolved, and say in one line that it re-judges the unticked `docs` lines. `/superdev:submit-pr` and `/superdev:ship` wait for it.
- **The stage reads `submitted`** → print `/superdev:ship <scope>`, and say in one line that it merges the pull request `/superdev:submit-pr` opened.
- **Otherwise** → start `/superdev:document <range>`, carrying the concrete range §1 resolved. Where the start is refused or fails, print it, and say in one line that it reconciles the in-repo docs and the knowledge base with the merged state.
