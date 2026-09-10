---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-review
description: "Review a change — a commit range, a branch, a path, or the working tree — for correctness, architecture, security, and over-engineering. Read-only on an ad-hoc range; on a live superdev scope it reviews against the DoD and can drive the fix loop."
---

# superdev review

Review a change end to end. Two modes, and §1 decides which:

- **Ad-hoc** — a spot-check, a pre-PR pass, a second opinion on someone else's branch. No plan behind it,
  and **read-only end to end** (§3).
- **Scope** — the range is a live superdev scope branch, so this is the whole-scope review gate in the
  implement chain (ADR 0013). It reviews against that run's Definition of Done, may drive the fix loop
  after asking once, and hands off to `/superdev-document`. **§4 owns everything that differs.**

Either way the reviewers themselves are the same read-only subagents.

## 0. Config (optional)

- Read `docs/agents/code-management.md`, if present, for the **base branch** to diff against (default
  `main`).
- Read `docs/agents/verification.md`, if present, for the **test command** — pass it to the
  final-reviewer so it can re-run the suite over the range and confirm green, not just read the diff.
  **In scope mode, §4 instead runs the full command itself before dispatch and hands the result, not
  just the command, to `final-reviewer`** (ADR 0025).
- Read `docs/agents/issue-tracker.md`, if present, for its `## Triage record` section — §4's deferral
  branch creates a triage record there when a finding is deferred, and needs to know whether that section
  exists before it reaches that branch.
- **None of the three files is required.** This command works in any repo, including one never set up
  for superdev — it just loses the corresponding hint.

## 1. Range

**`--unattended`, if present, comes out first** — per `<plugin-root>/references/scope-mode.md`'s
**Unattended** section, it is never part of the range or the trailing description.

Parse the message that invoked this skill into a **range** and an optional trailing description of what the change should do:

- **Trailing description** — everything after a ` -- ` separator, or (no `--` present) a clear trailing
  natural-language sentence. This is handed to `final-reviewer` as its `acceptance`.
- **Scope mode wins over both.** Read `<plugin-root>/references/scope-mode.md` for what makes the
  resolved range a live superdev run. When it is, capture `<run-root>` and take `<run-root>/dod.md` as
  the `acceptance` for `final-reviewer` — **as a path, never as text you read and paste into the
  dispatch**. That is the run's own verification plan, so no trailing description and no issue-ref
  discovery is wanted. **No `dod.md` in the run root** → say so in one line and fall back to the rules
  below. Then follow **§4** as well as §2 and §3.
- **No description given → try issue-ref discovery.** If `docs/agents/issue-tracker.md` is configured,
  grep the resolved range's `git log` for issue references — keyword-qualified
  (`Close[sd]?`/`Fix(e[sd])?`/`Resolve[sd]?\s+#<n>`, case-insensitive), falling back to a bare `#<n>`.
  Dedupe the numbers, fetch each via the tracker's configured read-issue step, and concatenate their
  titles + bodies into `acceptance`. No tracker configured, or no ref found → acceptance = "no formal
  specification — general correctness, security, and quality". Never runs when an explicit description
  was given — discovery is a fallback, not an override.
- **Range** — whatever remains, resolved to a concrete git range:
  - **`BASE..HEAD`** (or `BASE...HEAD`, contains `..`) → use verbatim.
  - **A branch** (no `..`; resolves via `git rev-parse --verify --quiet <name>`) → range is
    `merge-base(base, branch)..branch`.
  - **A path/area** (exists on disk, isn't a ref) → the diff of the current branch vs base, scoped to
    that path (`git diff <merge-base>..HEAD -- <path>`, or `git diff HEAD -- <path>` if there are
    uncommitted changes there).
  - **Empty** → the working tree: `git diff HEAD` if it's non-empty, else the current branch vs base
    (`merge-base(base, HEAD)..HEAD`).

**Include untracked files.** `git diff HEAD` shows modified/staged files but **not new untracked files**,
so "review what I just wrote" could miss the whole subject. Before diffing the working tree, run
`git add -N .` (intent-to-add) so brand-new files appear, or check `git status --porcelain` and, if you
can't include them, **say so** in the range announcement.

**State the concrete range/target** (e.g. "Reviewing `a1b2c3..d4e5f6`" or "Reviewing working tree changes
incl. untracked") before dispatching.

**Size caution (qualitative, non-blocking).** Glance at `git diff --stat`. If the change spans enough
files or churn that one review pass would likely miss things — a judgment call, not a line count — say so
alongside the range announcement (e.g. "large, multi-concern diff; consider splitting it via
`/superdev-plan`") and proceed anyway. Never block on it.

## 2. Review (parallel, read-only)

Dispatch both reviewers in parallel, each with an **explicit `model`** (a hook blocks any dispatch to a
superdev subagent that omits one):

- **`final-reviewer`** (`model: opus`) — correctness, consistency, whole-scope brevity,
  security, performance, applied adversarially per axis. Give it: a one-line summary of what changed
  (derive it from the diff if the trailing description didn't supply one), the `acceptance` from §1, and
  the git range (it reads the review checklist itself via `<plugin-root>`).
  **In scope mode both of those change shape**, so the reviewer can write its own criteria before it sees
  the answer key (ADR 0020):
  - The summary is **the scope anchor's title**, read with
    `node "<plugin-root>/scripts/scope.js" get anchor --root <run-root>` — the ledger's
    `**Anchor:**` line (run init writes it, per
    `<plugin-root>/references/scope-mode.md`'s `## The ledger` section), not derived from the
    diff: a diff-derived summary is the artifact describing itself. **The verb prints `absent`** (a run
    implemented before this rule existed) → say so in one line and fall back to a diff-derived summary.
  - The `acceptance` is the **path** `<run-root>/dod.md`. Never read that file and paste its text into
    the dispatch: a prompt arrives all at once, so inlined DoD text is already read by the time the
    reviewer's own instruction asks it to derive first, and no instruction can undo that. The reviewer
    also reads `<run-root>/ledger.md`'s slice list for step 1 of its derivation — `<run-root>` is
    `dod.md`'s own directory, so no separate path needs passing.

  **Ad-hoc mode**, if a test command is configured (`docs/agents/verification.md`), tell it it may re-run
  the suite over the range rather than trust the diff alone. **Scope mode** — §4 already ran the full
  suite; hand it that result and tell it to review against that result, running no suite of its own.
- **`simplicity-reviewer`** (`model: haiku`) — over-engineering only (unnecessary complexity,
  what stdlib/native replaces, what to delete). Give it the same git range.

Both subagents are **read-only** (`Read`, `Grep`, `Bash` — a hook blocks `git merge`/`push`/`rebase` and
`gh`/`tea pr merge` from any subagent). Scale the dispatch to the diff:

- **A `full`-tier scope** → `final-reviewer` alone; skip `simplicity-reviewer` (ADR 0037),
  reporting `` not dispatched — full tier, covered per `behavior` slice ``. That tier dispatched it per
  `behavior` slice and applied the warranted cuts before each slice merged, so a whole-scope pass re-reads
  cut-down code for cuts. What only the integrated view reveals — the same logic in two slices, an
  abstraction each half-builds — is `final-reviewer`'s **Brevity (whole-scope)** axis, which is carved for
  exactly that. A `mechanical`/`docs` slice gets no per-slice pass either way, and this skip does not claim
  otherwise. Derive the tier per `<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section,
  which already states it: `scope.js get slices`, three or fewer is `lite`. A **`lite`** scope keeps the
  dispatch — that tier holds no per-slice review, so this is its only over-engineering pass. A ledger with
  no slice rows leaves the tier unknown: dispatch, the same way an unknown tier blocks rather than assumes
  there. The skip holds on a re-review after a fix cycle too; ADR 0037 records why that gap is accepted
  rather than closed with a second condition. **An ad-hoc range has no tier** — the rules below decide
  alone. This rule is evaluated first: a `full`-tier scope never reaches the tiny-diff or
  nothing-to-cut bullets below — both are about `simplicity-reviewer`, which this rule already decided.
- **Tiny diff** (a handful of lines) → `final-reviewer` alone; skip `simplicity-reviewer`.
- **Nothing plausible to cut** (docs-only, or already lean) → skip `simplicity-reviewer`.
- **Never skip `final-reviewer`** — correctness is always in scope.

**Exclude `slice-reviewer`.** It verifies one slice's diff against that slice's own
`spec`/`acceptance` from a plan; standalone review has no per-slice specification to check against.

**A dispatch of `final-reviewer` that the permission classifier denies is a degraded pass.** Read
`<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section and follow it: review
inline yourself, say so in §3's report, and — on a live scope run — write the `**Degraded:**` entry that
section defines with `scope.js degraded add-denial`, quoting the classifier's refusal, then publish the
snapshot, per that file's `## Publishing run state` section — since either block branch below reaches no
later write in this run.
**`--unattended`** → that section's authorship rule
decides: **block** where the controller authored what the review verifies, which the tier answers, and
otherwise review inline as above — up to the cap: read `scope.js get denials` after writing the entry,
and **block** once the count reaches that cap rather than reviewing inline again. That section's own
carve-out already covers a denied `simplicity-reviewer` here.

## 3. Report

Consolidate both verdicts into **one** report — don't relay them side by side:

```
### Strengths
[merged from both reviewers, deduped]

### Issues
#### Critical (must fix)
#### Important (should fix)
#### Minor (nice to have)
file:line · what's wrong · why it matters · how to fix (if not obvious)

### Over-engineering cuts
[simplicity-reviewer's findings, if dispatched; omit this section if it wasn't]
net: -<N> lines possible   (or "Lean already" if nothing to cut)

### Ceiling
[final-reviewer's ceiling note, carried through verbatim when it wrote one; omit this section entirely
when it didn't]

### Deferred to a plan
[a finding whose remedy would add a capability the Definition of Done never named — §4's boundary; one
line each, with the follow-up `/superdev-plan`. Omit this section when there is none]

### Assessment
Full-suite run: [pass | fail | not run | denied — degraded pass]
Correctness: [ready | not ready]. Simplicity: [N cuts recommended, non-blocking | Lean already | not dispatched — <reason>].
Ready to merge? [Yes | No | With fixes]
Reasoning: [1–2 sentences]
```

The per-axis line is additive, sourced from each reviewer's own verdict — final-reviewer's `Ready to
merge?` line for Correctness, simplicity-reviewer's `net: -N lines possible` / `Lean already` for
Simplicity (or "not dispatched — <reason>" per §2's skip rules, naming which one applied — e.g. "not
dispatched — full tier, covered per `behavior` slice"). It doesn't replace the combined `Ready to merge?`
verdict: over-engineering findings stay non-blocking, never gating merge on their own. `final-reviewer`
has no notion of deferral and lands its own line at the finding's actual severity, so a verdict whose only
remaining findings are `### Deferred to a plan` entries — §4's exit clause already treats that verdict as
clean — lands the combined `Ready to merge?` as `Yes`, naming the deferrals in the Reasoning line, rather
than carrying `final-reviewer`'s raw `No` into a report for a scope the run went on to advance.

**Apply nothing — on an ad-hoc range.** Never edit, commit, or merge, however small the fix looks. To act
on findings, run `/superdev-plan` to slice the fix, then `/superdev-implement`. **Scope mode is the one
exception**, per §4: there the findings belong to a run already in flight, and fixing them is the point
of the gate. Even then you ask first, and the reviewers stay read-only.

## 4. Scope mode — fix loop and handoff

Only when §1 found a live run. Everything above still applies; this adds the run's own steps.

- **Find the scope checkout, and refresh the run lock.** Per
  `<plugin-root>/references/scope-mode.md`. **The scope checkout not on `<type>/<scope>`** →
  report that and review read-only rather than writing to the wrong branch.
- **Run the full suite yourself, before dispatching `final-reviewer`.** Take the full command from
  `docs/agents/verification.md` per `<plugin-root>/references/test-selection.md` and run it **in
  the scope checkout above**, over the scope branch. This happens whether or not the dispatch below
  succeeds, so a denied dispatch is a
  degraded review, not a missing verification (ADR 0025). **No test command configured** → say so and
  continue; this never blocks the review. **State the outcome** — pass, fail, no command configured, or
  denied — in your own output, the same way §1 states the range, **independent of whether the
  `final-reviewer` dispatch succeeds**. **Denied** → `## Degraded passes`'s second shape: the pass ran and
  could not reach what it needed. Its default is record and continue regardless of attendance; **local
  deviation**, because this is the chain's only full-suite verification gate and unattended would reach
  `/superdev-ship` with none behind it. Write the `**Degraded:**` entry either way, then publish the
  snapshot before deciding which branch applies — per
  `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section — since the block
  branch reaches no later write in this run. **Attended** → continue.
  **Unattended** → **block**, per `<plugin-root>/references/scope-mode.md`'s `## Unattended`
  section. Carry the result (pass/fail, and any failure output) into §2's dispatch when you continue.
  **A `fail` here is itself a Critical finding** — fold it into the fix loop exactly like a
  `final-reviewer` finding, whether or not that dispatch returned findings of its own. The stage does
  **not** advance while it stands. After any fix cycle that touches it, **re-run the full suite yourself
  again** before treating the verdict as clean — this run is the scope's verification, and `final-reviewer`
  reviews against the result you hand it.
- **The fix loop changes how the code meets the Definition of Done.** A finding whose remedy **adds a
  capability the Definition of Done never named** is recorded and handed to **`/superdev-plan`**: report it
  under §3's `### Deferred to a plan` heading, name the follow-up command, and give the finding a home
  that outlives this run before you write anything to the ledger.
  **Read `scope.js get deferred` first, and skip a finding it already reports** — that one read guards both
  writes below, so a finding the line already carries creates no second triage record and gets no second
  ledger bullet either. `deferred add` carries no `clear` counterpart, so every duplicate is permanent, and
  two paths reach it — a later fix cycle whose re-review returns the same still-deferred finding, and a
  second `/superdev-review` invocation on the same run, which remembers nothing of the first. "Only on the
  first cycle" covers one of those paths; this read covers both.
  **The active store document (`docs/agents/issue-tracker.md`) states no `## Triage record` section** —
  every repo set up before that section existed, and every "Other (GitLab Issues, Linear, …)" backend
  `skills/setup/SKILL.md` never seeded one for — has nowhere to create a record. Report that, and write only
  the ledger bullet below, with `no triage record — store defines none` in the reference's place: on a
  backend `/superdev-setup` seeds a section for, re-running it is what adds one; on an "Other" backend the
  section is what the store document owes, and the operator writes it by hand, from one of the shipped
  `references/issue-tracker-*.md` seeds. This folds into the best-effort posture the rest of this bullet
  already states.
  **Otherwise, create the triage record first**, in the configured slice store, the way that store's own
  `## Triage record` section states. Its body carries the finding, why no
  Definition of Done criterion covered it, the date, the feature label, the scope branch, the scope
  anchor's reference, and a copy-pasteable `/superdev-plan "<the finding>"` line — and **no pull-request
  URL**, because this command runs before `/superdev-ship` opens
  one and none exists yet. Capture the record's reference, then write it to the run with
  `node "<plugin-root>/scripts/scope.js" deferred add "<text>" --root <run-root>` — **the bullet
  text carries that reference**, which is what leads a reader of the ledger, the pull-request body, or
  `/superdev-status` to the record. **The create fails** → the bullet names the failure in the
  reference's place instead — `no triage record — create failed`, or, when a permission classifier is what
  refused the write, `no triage record — create denied` — so either reads apart from a bullet whose
  record exists, the way a degraded pass records its own denial in the ledger rather than only in this
  conversation. Then leave the
  scope as it is. **The store write is best-effort**, exactly as every status write in the chain is: a
  create that fails is reported once per run, the ledger bullet is written regardless, and
  the review carries on — the run's own record is the one that gates nothing on a store being reachable.
  The report is this conversation and the ledger outlives it, which is what
  carries the finding to the pull request `/superdev-ship` opens (ADR 0035). An ad-hoc range has no run
  root: report it and write nothing — no ledger bullet, and no triage record, since the record's body names
  a feature label, a scope branch, and a scope anchor an ad-hoc range does not have.
  Repairing a defect in what the Definition of Done *does* name stays in this loop, and such a repair is
  often behavioural — a missing guard, an unhandled failure mode, a wrong branch. That is the line: not
  "behaviour", but whether the plan asked for it (ADR 0035). A remedy the review builds here is one the
  interview never weighed, arriving at the point in a run where scope questions get the least attention.
  **That boundary needs an exit.** A deferred finding enters no fix loop, holds no stage, and is not an
  unresolved defect — the same non-gating shape the over-engineering and ceiling notes below use for their
  own findings. This holds precedence over `--unattended → fix, without asking` just below: that rule fixes
  a real defect without asking, and a deferred finding is not one, so it never reaches that rule. A verdict
  whose only remaining findings are deferred counts as clean, for the ask-once gate right after this bullet,
  the 3-strike cap, and the clean-verdict stage advance alike.
- **Ask once before fixing.** `final-reviewer` returned **Critical or Important** findings, or the full
  suite came back `fail` → report them per §3 first, then ask whether to fix them now.
  - **Declined** → stop. The findings stand: write the `**Unresolved:**` entry with
    `node "<plugin-root>/scripts/scope.js" unresolved add "<text>" --root <run-root>`, publish the
    snapshot before stopping — per `<plugin-root>/references/scope-mode.md`'s `## Publishing run
    state` section, since no later write in this run will do it — and the stage does **not** advance.
  - **`--unattended` → fix**, without asking: the fix loop is the point of this gate, and a review that
    found real defects and left them is worth less than no review.
  - **Confirmed** → dispatch **one** `implementer` (`model: sonnet`; `haiku` only for a
    mechanical fix) with the **complete** findings list, not one fixer per finding. Hand it the scope
    checkout as its working directory: this is where its fix commits must land. Every fix opens with a
    RED test that reproduces the defect; a finding whose cause is not yet established runs the diagnosis
    loop first (`<plugin-root>/references/diagnosis.md` — the implementer reads it on any
    defect-repair dispatch). Re-review after it returns, and repeat until the verdict is clean
    or the **3-strike cap** is reached — three cycles each exposing a new defect elsewhere means a wrong
    cut, not a bug: stop, say so, write the `**Unresolved:**` entry, leave the stage where it is, and
    publish the snapshot before stopping — per
    `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section — since no later
    stage write in this run will do it.
    **`--unattended` → block** at that cap, per that file's **Unattended** section, writing the same entry,
    publishing the same way, and leaving the stage where it is.
- **The fix implementer's own dispatch is a degraded pass too, if the permission classifier denies it.**
  Follow `<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section. Write the
  `**Degraded:**` entry either way, with `scope.js degraded add` — the fix implementer is an authoring
  dispatch, not one of the three the cap counts — then publish the snapshot, per that file's `## Publishing
  run state` section, since an unattended block below reaches no later write in this run. **Attended** →
  apply the fix inline yourself and say so in §3's report. **Unattended** → **block there instead**, in
  place of the `--unattended → fix` rule above, since nobody is there to review a fix the controller wrote
  itself.
- **Over-engineering findings stay advisory here, exactly as in §3.** They hold up no handoff and trigger
  no fix loop.
- **A ceiling note never gates either.** `final-reviewer`'s `### Ceiling` section (ADR 0020) is an
  observation about work that is already correct: it holds up no handoff, starts no fix cycle, and
  changes no stage, attended or unattended. Carry it into the report and move on.
- **On a clean verdict**, and only then: clear any standing `**Unresolved:**` entry — the run has just
  re-verified clean — with `node "<plugin-root>/scripts/scope.js" unresolved clear --root
  <run-root>`, which succeeds and changes nothing when there is none. Then write the ledger's
  `**Stage:**` line with `node "<plugin-root>/scripts/scope.js" stage set <value> --root
  <run-root>`, per that file's rule that a stage write never undoes completed work — the verb enforces it
  and refuses a write that breaks it. Read the current stage first (`scope.js get stage`).
  - `documented-unreviewed`, **no fix cycle ran** → write `documented`. The review it was missing has now
    run, and the doc pass still describes this code.
  - `documented-unreviewed`, **a fix cycle landed commits** → write `reviewed`. Those commits arrived
    after the doc pass, so the docs are stale by exactly them, and `reviewed` is what makes
    `/superdev-ship` ask for the doc pass again.
  - `documented` or `shipped` → leave the line alone and say so in one line; the run has moved past this
    gate.
  - Anything else → write `reviewed`.

  **A fix cycle that landed commits also clears the inline-doc-pass record**, with
  `node "<plugin-root>/scripts/scope.js" docs clear --root <run-root>`. A `lite` run wrote that
  record when it documented itself, before this review existed; commits landed since make what it recorded
  stale, so the next `/superdev-document` must run the full `doc-writer` rather than the reader alone (ADR
  0031). It is the same judgment the `documented-unreviewed` row above makes, on the same trigger. **No fix
  cycle, or none that committed** → leave the record alone: the docs still describe this code. The verb
  succeeds and changes nothing when there is no record, so a `full` run needs no separate branch here.

  Publish the snapshot after any of the writes above — `unresolved clear`, the stage write, and `docs
  clear` alike — per `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section.

  Then print the next command with the range already resolved — `/superdev-document <range>`, carrying
  the concrete range §1 resolved — and say in one line what it will do (reconcile the in-repo docs and
  the knowledge base with the merged state). Add that this conversation is disposable: the ledger's
  stage and the scope branch carry everything `/superdev-document` reads, so a `/clear` first costs
  nothing.
- **Never merge, push, or open a pull request.** `/superdev-ship` ends the chain.
