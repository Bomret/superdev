# 0270: Listed reference files are written as prompt concepts

**Status:** Accepted

**Amends:** [ADR 0190](0190-listed-skill-files-are-written-as-prompt-concepts.md), whose convention now also
governs the reference files the glossary lists, and
[ADR 0170](0170-prompt-concept-overlap-is-judged-by-rule-equivalence.md), whose dispatch-sentence test now
also pairs a relayed sentence with the reference sections the receiving agent reads.

## Context

ADR 0169 and ADR 0190 write every agent body and every skill file as prompt concepts. The runtime references
under `plugin/references/` hold more prompt prose than the skills and agents together. Skills and agents
read them in the middle of a task. Most of them state rationale and history inline, state conditions in the
middle of a paragraph, and join several rules in one sentence. Only `review-scope-mode.md` and its branch
files are governed.

The overlap lens pairs a listed skill's relayed dispatch sentence only with the agent body it reaches. The
glossary's No overlap invariant also covers the reference sections that agent body directs its reader to
read, so the lens and the glossary disagree on that case (triage #56).

## Decision

- **The convention governs listed reference files.** A reference file is written as prompt concepts when
  the glossary's **Prompt concept** entry lists it. A scope adds a reference file to the list when it
  rewrites that file. Backend seeds stay outside the list, because `/superdev:setup` offers a seed's new
  wording to every adopter's configuration document as a seed gap (ADR 0107).
- **Headings and steps are the frame.** A reference's prompt concepts live under its headings, and inside
  its numbered steps where it has them. A concept whose condition is its heading's or its step's condition
  takes that as its condition head. A heading, a step number, or a bold or italic anchor that another file
  cites keeps its exact text, or every citation to it moves in the same change.
- **Dispatch prose points.** As in ADR 0190, a dispatch in a listed reference names the agent concept that
  owns a rule, and it hands the data that rule needs. A rule the agent body lacks moves into the body
  before the dispatch drops it.
- **The overlap test decides extraction.** A rule two files state is kept once, in one owning section, where
  the overlap test forms a pair of the two copies. Where no reader reads both copies, the test forms no pair
  and each copy stays where its reader finds it.
- **Rationale leaves the prompt.** As in ADR 0190, a governed reference states what its reader does. The
  reason for a rule lives in the ADR its citation names.
- **A dispatch sentence also pairs with the agent's reference sections.** In a listed skill or reference
  file, a sentence the controller relays to an agent forms a pair with the agent body it reaches and with
  each reference section that body directs its reader to read.
- **The rollout runs in two scopes.** This scope rewrites the execution playbooks, the run basics, test
  selection, and the Definition-of-Done ticks. A later scope rewrites the plan, review-lens, and
  documentation-pass references.

## Considered options

- *Rewrite every reference in one scope.* Rejected: one pull request about twice the size of the skill
  rewrite, and its review-lens part would collide with a scope that edits `review-checklist.md` at the same
  time.
- *Extract every repeated rule to one shared reference.* Rejected: a subagent reads only the sections its
  dispatch hands it, so a pointer to a shared section costs it a read at runtime.
- *Govern the backend seeds too.* Rejected: a reworded seed reaches every adopter as a seed gap and changes
  no runtime behaviour.

## Consequences

Each rewritten reference keeps every rule of its old text, except where a paragraph below names a settled
conflict. A paragraph per rewritten file states what the rewrite added, removed, and settled.

**`test-selection.md`.** Added: a condition head and a bold label for each concept, and a numbered build loop
under `## The changed-path set`. Removed: the reasons for the fence reservation, the backtick-span rule, the
`{paths}` runner choice, and the empty-set fallback, which ADR 0025, ADR 0175, and ADR 0217 carry; and the
auto-invoke reasoning behind the missing-focused-command stop. Settled: `## Every run answers a question` named a
passing-test step per increment and a fail-to-pass control taken from the last one, while `## The changed-path set`,
`agents/implementer.md`'s `### Running tests`, and `implement-lite.md` named one test-path run per increment before
the code and one focused run as the last check. The second rule holds: an increment makes one run, and the focused
run over the changed-path set is the work unit's last check.

**`dod-ticks.md`.** Added: `### A docs line`, `### A holds tick`, and `### Document and verify-ship` under
`## The mapping gate`, so `scope.js section` still reads every rule of the gate's old span; the anchor sync named as
the step that copies implement's and run handoff's ticks onto the anchor. Removed: the reasons each case gives for
its rule, which ADR 0206, ADR 0247, and ADR 0256 carry. Settled: a `dod.md` with no tags at all on a ledger listing
more than one slice was stated only in `implement-lite.md`, while `run-handoff.md` credited it to this file. `**No
tags at all.**` now states both ledger cases: every line settles as if it read `scope` at run handoff's handoff pass.

**`scope-mode.md`.** Added: a `## Section map` heading whose list names the file that holds each mapped section, this
file included, and a reader table in place of the paragraph on the wider audience; `## The run lock` now owns writing
the lock with the absolute run-init path, leaving it in place at a playbook's end, and the playbook's **Resume** making
no lock read of its own. Removed: the reasons behind the slug charset, the range base's two candidates, the unattended
catch-all, and the sanctioned backwards stage move, which ADR 0016, ADR 0120, and ADR 0203 carry. Settled:
`implement/SKILL.md` said nothing in this file but `## Unattended` applied to implement, while both playbooks cite
`## The run lock`, `## The scope checkout`, and `## The scope's range base`. The skill now names those three sections.

**`scope-branch.md`.** Added: numbered sub-steps under step 4 of `## Bringing the scope branch to base`, and numbered
steps for the `resumed` cut. Removed: the numbering-collision, `merge --continue`, and abort-and-escalate rules of
step 4, which `merge-conflicts.md` owns and step 4 cites; the restated prepare stop at `## Cutting the scope branch`,
which `## Preparing a worktree` owns; the history of the taken-name case and the reasons for the forcing-flag rule,
which ADR 0082 and ADR 0167 carry. Settled: nothing.

**`merge-conflicts.md`.** Added: the conflicting-file listing and the stop after `merge --abort`, from
`scope-branch.md`'s step 4, so this file owns the whole escalation. Removed: nothing. Settled: nothing.

**`run-state.md`.** Added: **The run-state ref** under `## Publishing run state`, moved from `run-handoff.md`, because
the send rule governs every command's step end; **The step line**, **The step closer**, **The Minor queue**, **The
deploy record**, and **The suite record** concepts under `## The ledger`, so each header bullet names its line and its
concept holds the rules. Removed: the reasons for the PR record, the per-slice publish ban, and the machine-owned
section, which ADR 0042 and ADR 0236 carry. Settled: nothing.

**`scope-findings.md`.** Added: a condition head per concept. Removed: the sweep's re-review rule and its self-check
from `## Warm cycles`, which `implement-full-minor-sweep.md`'s `## Minor sweep` and `agents/slice-reviewer.md` own; the
restated read-before-write rule of `## Observations`, which points to `store-records.md`'s `## Triage record`; the
asymmetry argument for an uncertain match, which triage #505 records. Settled: `## Observations`
said the controller runs the scope review's suite runs, while ADR 0255 removed every suite run from the scope review.
The scope review runs no suite, and a failing test in red evidence the review reads is its Critical finding; the
drift comments that repeated the old claim read the same way.

**`shipped-run.md`.** Added: a condition head per concept. Removed: the reasons for the route verb and for the
adopt `--shipped` refusal, which ADR 0263 carries. Settled: nothing.

**`run-init.md`.** Added: eight numbered `###` steps under the one cited `##` heading, so `scope.js section` still
reads the whole procedure; **The shipped stop** and **The empty planned ledger** as named concepts, each stated once
and cited from both places that reach it. Removed: the second statements of the shipped-route stop and the empty
`planned` ledger case; the copies of "a `planned` run cuts nothing and runs no containment test", which
`scope-branch.md`'s `## Cutting the scope branch` owns; the step-closer copy, which points to `run-state.md`'s `## The
ledger`; and the reasons for the content-identity revert, the rotation, and the explicit entry stage, which ADR 0072, ADR 0079, and ADR 0022 carry. Settled: nothing.

**`run-handoff.md`.** Added: a condition head per concept. Removed: the run-state ref send rule, which `run-state.md`'s
`## Publishing run state` owns; the restated observation capture, which points to `scope-findings.md`'s `##
Observations`; the restated tick rules, which point to `dod-ticks.md`; and the verification-ceiling copy. Settled:
the handoff pass credited the multi-slice untagged case to `dod-ticks.md`, which did not state it; `dod-ticks.md`'s
`## The mapping gate` now states it, and the pass cites it.

**`implement-full.md`.** Added: **The implementer dispatch** and **The slice-reviewer dispatch** as named concepts in
DAG loop steps 2 and 3, each listing the values a dispatch hands and naming the `agents/implementer.md` and
`agents/slice-reviewer.md` sections that own the rest; the feature's change type in the implementer dispatch, read
from the ledger's recorded branch, with `agents/implementer.md`'s `## What the dispatch hands you` naming it; the
controller's own scopetree commits beside the rule that it builds no slice there. Removed: the restated test-run,
fail-to-pass, dependency, edit-tool, inherited-failure, self-check, and report contracts, which those agent sections
own; the restated lock write, prepare stop, and merge-conflict rules, which `scope-mode.md`, `scope-branch.md`, and
`merge-conflicts.md` own; the reason for the post-merge tick, which ADR 0091 carries; and the reasons for the pilot wave and the cap, which
this ADR records: a pilot surfaces a systemic problem on one slice before parallel slicetrees repeat it, and the cap
bounds cost and the merge queue without changing `depends-on` order. Settled: the dispatch never handed the change type, so a `fix` feature's slice skipped the diagnosis
loop the implementer's `### Defect repair` states for it (triage #39); the dispatch now hands it, and the controller's
own build of a tiny slice applies it.

**`implement-full-resume.md`.** Added: numbered steps, and the change type read from the recorded branch. Removed:
the restated lock-read rule, which `scope-mode.md`'s `## The run lock` owns, and the restated prepare stop. Settled:
a resumed run hands the change type from the ledger's `**Branch:**` line, never a reconstructed one.

**`implement-full-denied.md`.** Added: the `inline` verdict for a denied implementer or fix, which builds the work as a
tiny slice is built, diagnosis loop included. Removed: nothing. Settled: `implement/SKILL.md` blocked a denied
authoring dispatch under `--unattended` with no verdict call, while this file asked `scope.js denial`. Both now ask
`scope.js denial` and act on its verdict.

**`implement-full-fix-cycle.md`.** Added: **The fix dispatch** as a named concept listing the values a fix hands and
naming the `agents/implementer.md` sections that own the rest, and **The re-review** naming the
`agents/slice-reviewer.md` sections that judge a fix range. Removed: the restated cap, exits, RED-test rule,
sibling-surface duty, sibling check, and fix model, which `skills/implement/SKILL.md`'s `## Invariants (both playbooks)` and `## Model
selection` own; the restated deferral rules, which `scope-findings.md`'s `## Deferred findings` owns; and the
re-review's closing rules, which `agents/slice-reviewer.md`'s `## Re-review` owns. `## Deferring a finding` keeps the
two rules the slice loop adds. Settled: nothing.

**`implement-full-minor-sweep.md`.** Added: a step for the sweep's self-check and the rule that the sweep's re-review
is always a fresh `slice-reviewer`, both moved from `scope-findings.md`'s `## Warm cycles`, so `## Minor sweep` owns
them. Removed: the restated self-check items, which `agents/implementer.md`'s `## Self-check` owns. Settled: nothing.
