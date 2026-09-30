---
name: review
description: Review a change — a commit range, a branch, a path, or the working tree — for correctness, architecture, security, and over-engineering. Read-only on an ad-hoc range; on a live superdev scope it reviews against the DoD and can drive the fix loop.
argument-hint: "[BASE..HEAD | branch | path | scope-slug | (empty = working tree)]  [--unattended]  [--chained]  [-- what it should do]"
---

# superdev review

Review a change end to end. Two modes, and §1 decides which:

- **Ad-hoc** — a spot-check, a pre-PR pass, a second opinion on someone else's branch, or
  `/superdev:sweep`'s code leg under `--chained` (§1). No plan behind it, and **read-only end to end** (§3).
- **Scope** — the range is a live superdev scope branch, so this is the whole-scope review gate in the
  implement chain (ADR 0013). It reviews against that run's Definition of Done, may drive the fix loop
  after asking once, and hands off to `/superdev:document`. **§4 owns everything that differs.**

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
- **None of the files above is required.** This command works in any repo, including one never set up
  for superdev — it just loses the corresponding hint.

## 1. Range

**`--unattended`, if present, comes out first** — per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
**Unattended** section, it is never part of the range or the trailing description.

**`--chained`, if present, comes out the same way** — never part of the range or the trailing description
either. It signals that `/superdev:sweep` dispatched this run as its code leg, in the **chained posture**
(CONTEXT.md, ADR 0068): run no `git add -N :/` below, and never enter scope mode, whatever the invoking
checkout's `HEAD` is — both are covered where they apply, further down.

Parse `$ARGUMENTS` into a **range** and an optional trailing description of what the change should do:

- **Trailing description** — everything after a ` -- ` separator, or (no `--` present) a clear trailing
  natural-language sentence. This is handed to `final-reviewer` as its `acceptance`.
- **`--chained` wins over scope mode.** Skip the bullet below entirely: the range resolves ad-hoc, whatever
  the invoking checkout's `HEAD` is. This is what forecloses, by construction rather than by a guard the
  caller must remember to check, the write paths scope mode opens — the run-lock refresh, the
  `**Degraded:**` ledger entries, publishing the run-state snapshot to the remote anchor issue, and the fix
  loop's commits.
- **Scope mode wins over both, otherwise.** Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md` for what
  makes the resolved range a live superdev run. When it is, capture `<run-root>` and take
  `<run-root>/dod.md` as the `acceptance` for `final-reviewer` — **as a path, never as text you read and
  paste into the dispatch**. That is the run's own verification plan, so no trailing description and no
  issue-ref discovery is wanted. **No `dod.md` in the run root** → say so in one line and fall back to the
  rules below. Then follow **§4** as well as §2 and §3.
- **No description given → try issue-ref discovery.** If `docs/agents/issue-tracker.md` is configured,
  grep the resolved range's `git log` for issue references — keyword-qualified
  (`Close[sd]?`/`Fix(e[sd])?`/`Resolve[sd]?\s+#<n>`, case-insensitive), falling back to a bare `#<n>`.
  Dedupe the numbers, fetch each via the tracker's configured read-issue step, and concatenate their
  titles + bodies into `acceptance`. No tracker configured, or no ref found → acceptance = "no formal
  specification — general correctness, security, and quality". Never runs when an explicit description
  was given — discovery is a fallback, not an override.

**Include untracked files before resolving the range below.** `git diff HEAD` shows modified/staged files
but **not new untracked files**, so a path scope diffed against `HEAD`, or a working-tree review, could
miss the whole subject. Run `git add -N :/` (intent-to-add, repo-root
pathspec — a plain `.` only covers the current working directory, missing an untracked file outside it) so
brand-new files appear, or check `git status --porcelain` and, if you can't include them, **say so** in the
range announcement. **`--chained`** → run no `git add -N :/`: standing code reads files at `HEAD`, where an
untracked file never appears, so staging it would write the index for no gain a chained run can use — and
would retarget a path scope onto that intent-to-add entry as an "uncommitted change" instead of the
standing tree `/superdev:sweep` asked this leg to read.

- **Range** — whatever remains, resolved to a concrete git range:
  - **`BASE..HEAD`** (or `BASE...HEAD`, contains `..`) → use verbatim.
  - **A branch** (no `..`; resolves via `git rev-parse --verify --quiet <name>`) → range is
    `merge-base(base, branch)..branch`.
  - **A path/area** (exists on disk, isn't a ref) → the diff of the current branch vs base, scoped to
    that path (`git diff <merge-base>..HEAD -- <path>`, or `git diff HEAD -- <path>` if there are
    uncommitted changes there).
  - **Standing code** — that same path, where the scoped diff above comes back **empty** → the files
    under it at `HEAD`, reviewed as they are rather than as a change. This is what makes "review this
    existing area" work: on a clean checkout a path has no diff, so the diff shapes above review nothing.
    A **fallback, never a replacement** — a path with a non-empty scoped diff resolves to that diff
    exactly as it does above, so no existing invocation changes meaning. **The path exists and holds no
    files** → say there is nothing to review and dispatch nobody. Read-only like every other ad-hoc
    range: nothing is edited, committed, or merged.
  - **Empty** → a three-step cascade:
    1. **The working tree carries uncommitted changes** (`git diff HEAD` non-empty) → review those,
       exactly as before. A dirty working tree is reviewed as it always was, and the command says in one
       line which eligible scope it passed over, when one exists — the single run root step 3 below would
       have found, named with a quick, best-effort scan; several or none, say nothing extra.
    2. **Otherwise `merge-base(base, HEAD)..HEAD` is non-empty** → review that, exactly as before.
    3. **Otherwise** → run `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Resolving an empty
       argument` cascade over the run roots at stage `merged` or `documented-unreviewed` — the same two
       stages the chain hands to this review, so the attended and unattended paths select
       the same scopes. Its resolved candidate is a scope slug: take that scope's `**Branch:**` line
       (`## The scope branch`) as `<branch>`. **No such line, or the named branch does not verify** —
       take `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope branch` shape-scan fallback
       and say which route was taken. The range becomes `merge-base(base, branch)..branch`,
       which the **Scope mode wins** bullet above then recognizes as a live run.
       **No candidate at all** — cite `## Resolving an empty argument`'s own **No candidate** wording,
       adding a `/superdev:review <scope-slug>` line for the operator to type directly, and dispatch
       nobody.
  - **A scope slug** — reached only once the four shapes above all fail: no `..`, no ref
    (`git rev-parse --verify --quiet <name>` fails), and no path on disk. **Validate it against
    `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope slug` charset
    (`[a-zA-Z0-9][a-zA-Z0-9_-]*`) before addressing `.superdev/scopes/<arg>/` with it** — the same test
    `scope.js`'s `SLUG_RE` applies to a label's slug segment. A shape that fails it (a `../`-shaped
    argument among them) refuses with that charset named, rather than reading whatever path the
    argument resolves to. **It passes** — a run root exists for it
    (a `<run-root>/ledger.md` per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## A live scope
    run`). Resolve the branch with
    `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get branch --root <run-root>` and verify it
    (`git rev-parse --verify <branch>`); the range becomes `merge-base(base, branch)..branch`, which the
    **Scope mode wins** bullet above then recognizes as a live run. **No such line, or the named branch
    does not verify** → take `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope branch`
    shape-scan fallback and say which route was taken. **No run root names the argument** → fall through
    to the **Empty** shape above, exactly as an unresolved argument does today.

**State the concrete range/target** (e.g. "Reviewing `a1b2c3..d4e5f6`" or "Reviewing working tree changes
incl. untracked") before dispatching.

**Size caution (qualitative, non-blocking).** Glance at `git diff --stat`. If the change spans enough
files or churn that one review pass would likely miss things — a judgment call, not a line count — say so
alongside the range announcement (e.g. "large, multi-concern diff; consider splitting it via
`/superdev:plan`") and proceed anyway. Never block on it.

## 2. Review (parallel, read-only)

Dispatch both reviewers in parallel, each with an **explicit `model`** (a hook blocks any dispatch to a
superdev subagent that omits one):

- **`superdev:final-reviewer`** (`model: opus`) — correctness, consistency, whole-scope brevity,
  security, performance, applied adversarially per axis. Give it: a one-line summary of what changed
  (derive it from the diff if the trailing description didn't supply one), the `acceptance` from §1, and
  the git range — **on a standing-code target (§1's fourth shape), the path and its file set at `HEAD` in
  place of a range, with the summary derived from that file set instead of a diff** (it reads the review
  checklist itself via `${CLAUDE_PLUGIN_ROOT}`).
  **In scope mode both of those change shape**, so the reviewer can write its own criteria before it sees
  the answer key (ADR 0020):
  - The summary is **the scope anchor's title**, read with
    `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get anchor --root <run-root>` — the ledger's
    `**Anchor:**` line (run init writes it, per
    `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The ledger` section), not derived from the
    diff: a diff-derived summary is the artifact describing itself. **The verb prints `absent`** (a run
    implemented before this rule existed) → say so in one line and fall back to a diff-derived summary.
  - The `acceptance` is the **path** `<run-root>/dod.md`. Never read that file and paste its text into
    the dispatch: a prompt arrives all at once, so inlined DoD text is already read by the time the
    reviewer's own instruction asks it to derive first, and no instruction can undo that. The reviewer
    also reads `<run-root>/ledger.md`'s slice list for step 1 of its derivation — `<run-root>` is
    `dod.md`'s own directory, so no separate path needs passing.
  - **Also tell it to judge every `dod.md` line, ticked or not.** `final-reviewer` returns a verdict for
    each — holds, broken, or ceiling — in its own `### Criteria` section (`agents/final-reviewer.md`'s
    `## Judge every criterion`). §4 below unticks and re-ticks from that list; the axes above (Correctness,
    Consistency, whole-scope Brevity, Security, Performance) are what it judges the *code* on, and this is
    the DoD gate the same dispatch also carries.

  **Ad-hoc mode**, if a test command is configured (`docs/agents/verification.md`), tell it it may re-run
  the suite over the range rather than trust the diff alone. **Scope mode** — §4 already ran a suite for
  this dispatch; hand it that result and tell it to review against that result, running no suite of its
  own. Say which run it is: `final-reviewer` reviews against whichever result you hand it, full or
  focused (ADR 0075). The entry and exit dispatches hand a full-suite result, and a fix cycle's
  re-review hands that cycle's focused run. Confirming a `dod.md` criterion observes; it changes no
  system outside the repository (ADR 0084, INV-0006). A criterion needing a deploy, a migration, or any
  other outward-facing change to confirm gets reported as unverifiable on the branch, needing
  verification after merge, naming the outward-facing change it needs.
- **`superdev:simplicity-reviewer`** (`model: haiku`) — over-engineering only (unnecessary complexity,
  what stdlib/native replaces, what to delete). Give it the same git range.

Both subagents are **read-only** (`Read`, `Grep`, `Bash` — a hook blocks `git merge`/`push`/`rebase` and
`gh`/`tea pr merge` from any subagent). Scale the dispatch to the diff:

- **A `full`-tier scope** → `final-reviewer` alone; skip `superdev:simplicity-reviewer` (ADR 0037),
  reporting `` not dispatched — full tier, covered per `behavior` slice ``. That tier dispatched it per
  `behavior` slice and applied the warranted cuts before each slice merged, so a whole-scope pass re-reads
  cut-down code for cuts. What only the integrated view reveals — the same logic in two slices, an
  abstraction each half-builds — is `final-reviewer`'s **Brevity (whole-scope)** axis, which is carved for
  exactly that. A `mechanical`/`docs` slice gets no per-slice pass either way, and this skip does not claim
  otherwise. Derive the tier per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section,
  which already states it: `scope.js get slices`, three or fewer is `lite`. A **`lite`** scope keeps the
  dispatch — that tier holds no per-slice review, so this is its only over-engineering pass. A ledger with
  no slice rows leaves the tier unknown: dispatch, the same way an unknown tier blocks rather than assumes
  there. The skip holds on a re-review after a fix cycle too; ADR 0037 records why that gap is accepted
  rather than closed with a second condition. **An ad-hoc range has no tier** — the rules below decide
  alone. This rule is evaluated first: a `full`-tier scope never reaches the tiny-diff or
  nothing-to-cut bullets below — both are about `simplicity-reviewer`, which this rule already decided.
- **A standing-code target** (§1's fourth shape) → `final-reviewer` alone; skip `simplicity-reviewer`,
  reporting `` not dispatched — standing code, no diff to review ``. It is diff-only by its core
  contract and its tags target the production lines a change introduced, so a file set at `HEAD` gives it
  nothing to work from. The checklist's own over-engineering lenses still reach this target, through
  `final-reviewer`.
- **Tiny diff** (a handful of lines) → `final-reviewer` alone; skip `simplicity-reviewer`.
- **Nothing plausible to cut** (docs-only, or already lean) → skip `simplicity-reviewer`.
- **Never skip `final-reviewer`** — correctness is always in scope.

**Exclude `superdev:slice-reviewer`.** It verifies one slice's diff against that slice's own
`spec`/`acceptance` from a plan; standalone review has no per-slice specification to check against.

**A dispatch of `final-reviewer` that the permission classifier denies is a degraded pass.** Read
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section and follow it: review
inline yourself, say so in §3's report, and — on a live scope run — write the `**Degraded:**` entry that
section defines with `scope.js degraded add-denial -`, piping the classifier's refusal through a quoted
heredoc rather than a shell argument, then publish the
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
line each, with the follow-up `/superdev:plan`. Omit this section when there is none]

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
on findings, run `/superdev:plan` to slice the fix, then `/superdev:implement`. **Scope mode is the one
exception**, per §4: there the findings belong to a run already in flight, and fixing them is the point
of the gate. Even then you ask first, and the reviewers stay read-only.

## 4. Scope mode — fix loop and handoff

Only when §1 found a live run. Everything above still applies; this adds the run's own steps.

- **Find the scope checkout, and refresh the run lock.** Per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`. **The scope checkout not on `<type>/<scope>`** →
  report that and review read-only rather than writing to the wrong branch.
- **Reuse a green suite record the tip still earns; otherwise run the full suite yourself, before
  dispatching `final-reviewer`.**
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite reusable --branch <branch> [--plan-files]
  --root <run-root>` **in the scope checkout above** — `--plan-files` declares that the active store
  commits plan files on the scope branch (the local plan-file store's own tick commits land there);
  `scope.js` derives the directory itself from the ledger's own `**Branch:**` value, never from a path
  this dispatch supplies. A store committing nothing on the scope branch passes no `--plan-files`. Exit
  0 → reused,
  running nothing (INV-0017: an exact tip match, or a diff confined to that directory since the recorded
  commit). Exit 1, or no record at all, means: take the full command from
  `docs/agents/verification.md` per `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` and run it **in
  the scope checkout above**, over the scope branch, then record what happened with
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite set <green|red|denied|none> <sha> --root <run-root>`
  (`<sha>` = the scope branch's own current tip). This happens whether or not the dispatch below
  succeeds, so a denied dispatch is a
  degraded review, not a missing verification (ADR 0025). **No test command configured** → say so, record
  `none`, and
  continue; this never blocks the review. **State the outcome** — reused, pass, fail, no command
  configured, or
  denied — in your own output, the same way §1 states the range, **independent of whether the
  `final-reviewer` dispatch succeeds**. **Denied** → `## Degraded passes`'s second shape: the pass ran and
  could not reach what it needed, recorded `denied`. Its default is record and continue regardless of attendance; **local
  deviation**, because this is the chain's only full-suite verification gate and unattended would reach
  `/superdev:submit-pr` with none behind it. Write the `**Degraded:**` entry either way, then publish the
  snapshot before deciding which branch applies — per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section — since the block
  branch reaches no later write in this run. **Attended** → continue.
  **Unattended** → **block**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Unattended`
  section. Carry the result (reused/pass/fail, and any failure output) into §2's dispatch when you
  continue.
  **A `fail` here is itself a Critical finding** — fold it into the fix loop exactly like a
  `final-reviewer` finding, whether or not that dispatch returned findings of its own. The stage does
  **not** advance while it stands. **Inside each fix cycle, run the focused command over the fix diff**
  — per `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`, over the commits that cycle's implementer
  just landed — and **hand that result to the re-review**, saying it is the focused run: fix cycles never
  run the full suite. **When a fix cycle's re-review verdict first comes back clean, run the full suite
  once more** in the scope checkout, and record it the same way
  (`scope.js suite set <result> <sha> --root <run-root>`, `<sha>` = the tip after the fix commits):
  that run is the gate the stage advances on. A scope whose first verdict is already clean runs none of
  this — the entry check above already reused a green record or ran and recorded that gate, so the full
  suite is paid at most once. A **red result
  there is itself a Critical finding** too — it re-enters the fix loop and **counts toward the 3-strike
  cap** below, the same shape as a cycle exposing a defect elsewhere, so the loop needs no bound of its
  own (ADR 0075). **A denied exit run takes the entry run's
  own local deviation**, not `## Degraded passes`'s record-and-continue default: this run is the gate the
  stage advances on, and an unattended run left on the default would advance it on the entry run's suite
  alone — taken before this cycle's fix commits existed. Write the `**Degraded:**` entry either way, then
  publish the snapshot before deciding which branch applies, per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section. **Attended** →
  continue. **Unattended** → **block**, per that file's `## Unattended` section.
- **An observation is captured the moment you meet it.** Read
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Observations` section and follow it: a defect the
  full suite or `final-reviewer`'s own report surfaces, that no slice of this scope covers and the scope
  did not cause, gets a triage record from you, the controller, right here — never folded into the fix
  loop below and never held until the handoff.
- **The fix loop changes how the code meets the Definition of Done.** A finding whose remedy **adds a
  capability the Definition of Done never named** is recorded and handed to **`/superdev:plan`**: report it
  under §3's `### Deferred to a plan` heading, name the follow-up command, and give the finding a home
  that outlives this run before you write anything to the ledger.
  **Read `scope.js get deferred` first, and skip a finding it already reports** — that one read guards both
  writes below, so a finding the line already carries creates no second triage record and gets no second
  ledger bullet either. `deferred add` carries no `clear` counterpart, so every duplicate is permanent, and
  two paths reach it — a later fix cycle whose re-review returns the same still-deferred finding, and a
  second `/superdev:review` invocation on the same run, which remembers nothing of the first. "Only on the
  first cycle" covers one of those paths; this read covers both.
  **The active store document (`docs/agents/issue-tracker.md`) states no `## Triage record` section** —
  every repo set up before that section existed, and every "Other (GitLab Issues, Linear, …)" backend
  `skills/setup/SKILL.md` never seeded one for — has nowhere to create a record. Report that, and write only
  the ledger bullet below, with `no triage record — store defines none` in the reference's place: on a
  backend `/superdev:setup` seeds a section for, re-running it is what adds one; on an "Other" backend the
  section is what the store document owes, and the operator writes it by hand, from one of the shipped
  `references/issue-tracker-*.md` seeds. This folds into the best-effort posture the rest of this bullet
  already states.
  **Otherwise, create the triage record first**, in the configured slice store, the way that store's own
  `## Triage record` section states. Its body carries the finding, why no
  Definition of Done criterion covered it, the date, the feature label, the scope branch, the scope
  anchor's reference, and a copy-pasteable `/superdev:plan "<the finding>"` line — and **no pull-request
  URL**, because this command runs before `/superdev:submit-pr` opens
  one and none exists yet. Capture the record's reference, then write it to the run with a quoted
  heredoc (`<<'SUPERDEV_TEXT_EOF'`) piped to
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" deferred add - --root <run-root>` — the sole word `-`
  reads the bullet text from stdin rather than a shell-interpolated argument
  (`references/dod-ticks.md`, triage #680) — **the bullet
  text carries that reference**, which is what leads a reader of the ledger, the pull-request body, or
  `/superdev:status` to the record. **The create fails** → the bullet names the failure in the
  reference's place instead — `no triage record — create failed`, or, when a permission classifier is what
  refused the write, `no triage record — create denied` — so either reads apart from a bullet whose
  record exists, the way a degraded pass records its own denial in the ledger rather than only in this
  conversation. Then leave the
  scope as it is. **The store write is best-effort**, exactly as every status write in the chain is: a
  create that fails is reported once per run, the ledger bullet is written regardless, and
  the review carries on — the run's own record is the one that gates nothing on a store being reachable.
  The report is this conversation and the ledger outlives it, which is what
  carries the finding to the pull request `/superdev:submit-pr` opens (ADR 0035). An ad-hoc range has no run
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
- **A line `final-reviewer`'s `### Criteria` calls broken is a Critical finding, and you untick it
  first.** Read the `<run-root>/dod.md`, ticked or not — a ticked line the branch no longer satisfies, or
  an already-unticked line the branch still fails, both count. Untick it, with a one-line note naming why
  (INV-0014), on `<run-root>/dod.md` and the anchor's checklist, through the active store's own
  `## Definition of Done ticks` section (`docs/agents/issue-tracker.md`) (controller-only, INV-0015), then
  fold it into the findings list below alongside whatever
  `final-reviewer`'s Issues section returned. This is a listed-lines case of
  `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s mapping gate: the fix cycle's dispatch below hands the
  fix implementer the `dod.md` path plus exactly the lines this cycle unticked or found broken, and its
  report carries one line per listed line (met/not met/ceiling), per `dod-ticks.md`. A line called
  **ceiling** is left exactly as it stood — the verification-ceiling bullet below covers it, never this
  one, unless the **holds** clause just below turns it over. A line called **accepted** is likewise left
  exactly as it stood: an `accepted:` note is an attended operator's own decision (ADR 0095), never a
  Critical finding and never a reason to hold the stage, unless the **holds** clause below turns it over.
  A **holds** verdict on an already-ticked
  line changes nothing. **A `holds` verdict on a line unticked with `not met:`, or carrying no note at
  all, ticks that line** — you, the controller, write the tick, with the verdict's own evidence as the
  note (INV-0015): a joint criterion a slice under-reported, a `scope` line judged too early, or an
  implementer that misjudged its own work all take this shape. A line unticked with `ceiling:` takes a
  holds tick only when the verdict itself states the criterion needs no deploy or other outward-facing
  change to verify and cites evidence observed on the branch — the ceiling claim was wrong, and the line
  was never a ceiling criterion. A line unticked with `accepted:` takes a holds tick only when the
  verdict itself cites evidence, observed on the branch, that the criterion is now met — the operator's
  earlier decision no longer describes this branch; you never write a fresh `accepted:` note yourself,
  only an attended operator does. A `holds` verdict never ticks a line that genuinely needs a deploy to
  verify (INV-0006). Re-ticking after a fix cycle still follows the fix implementer's report, once that
  cycle's re-review comes back clean. The stage does **not** advance while any `dod.md`
  criterion stands unmet, except a `ceiling` one or an `accepted` one (INV-0016) — the same non-advance
  rule the full-suite fail and Critical-finding rows above already apply.
- **A criterion `final-reviewer` finds missing from `dod.md` is not a tick to add.** It is a `### Deferred
  to a plan` finding like any other, under the fix-loop boundary above (ADR 0035, INV-0004) — review writes
  no new line into `dod.md`.
- **Ask once before fixing.** `final-reviewer` returned **Critical or Important** findings, a broken
  criterion, or the full
  suite came back `fail` → report them per §3 first, then ask whether to fix them now. **When the
  findings include an unmet criterion** (a broken line, or one this cycle leaves unticked), **the same
  question also offers to accept it as unmet instead**, with the operator's own reason — this is the one
  decision point where a fresh `accepted:` note gets written (ADR 0095). **`--unattended`** never makes
  this offer, and never writes `accepted:`; an unmet criterion there follows the ordinary fix-or-block path
  below.
  - **Declined** → stop. The findings stand: write the `**Unresolved:**` entry with a quoted heredoc
    (`<<'SUPERDEV_TEXT_EOF'`) piped to
    `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved add - --root <run-root>` — the sole word
    `-` reads the bullet text from stdin rather than a shell-interpolated argument
    (`references/dod-ticks.md`, triage #680). **At a `submitted` stage**, also invalidate the tip's
    suite record — `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite set none <sha> --root <run-root>`
    (`<sha>` = the scope branch's current tip) — a standing finding leaves this tip a suite record
    `suite reusable` would otherwise still accept, and `/superdev:ship` reads that record back — publish
    the snapshot before stopping — per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing
    run state` section, since no later write in this run will do it — and the stage does **not** advance.
    At `submitted` the stage never moves back, so it cannot hold this verdict: the suite record at the tip
    is `/superdev:ship`'s only gate, and a standing finding leaves none behind.
  - **Accepted** (the criterion's own reason, attended only) → write `accepted: <reason> (operator,
    <date>)` as that line's note, through `scope.js dod-line --match-file <path> --verdict accepted
    --note-file <path>` on `<run-root>/dod.md` and the anchor's checklist, through the active store's own
    `## Definition of Done ticks` section (controller-only, INV-0015, ADR 0095). That criterion drops out
    of the findings this cycle fixes; any other Critical or Important finding still goes through the
    ordinary confirm-or-decline choice below.
  - **`--unattended` → fix**, without asking: the fix loop is the point of this gate, and a review that
    found real defects and left them is worth less than no review.
  - **Confirmed** → dispatch **one** `superdev:implementer` (`model: sonnet`; `haiku` only for a
    mechanical fix) with the **complete** findings list, not one fixer per finding. Hand it the scope
    checkout as its working directory: this is where its fix commits must land. Every fix opens with a
    RED test that reproduces the defect; a finding whose cause is not yet established runs the diagnosis
    loop first (`${CLAUDE_PLUGIN_ROOT}/references/diagnosis.md` — the implementer reads it on any
    defect-repair dispatch). Re-review after it returns, and repeat until the verdict is clean
    or the **3-strike cap** is reached — three cycles each exposing a new defect elsewhere means a wrong
    cut, not a bug: stop, say so, write the `**Unresolved:**` entry — at a `submitted` stage, also
    invalidate the tip's suite record the same way the Declined branch above does — leave the stage where
    it is, and
    publish the snapshot before stopping — per
    `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section — since no later
    stage write in this run will do it.
    **`--unattended` → block** at that cap, per that file's **Unattended** section, writing the same entry
    (and, at a `submitted` stage, invalidating the suite record the same way),
    publishing the same way, and leaving the stage where it is.
    **A clean verdict ends the loop here too, attended or unattended** — a finding it leaves standing is a
    follow-up, never a fourth cycle.
- **The fix implementer's own dispatch is a degraded pass too, if the permission classifier denies it.**
  Follow `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section. Write the
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
- **The verification-ceiling case is the one reported and not chased**
  (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Verification ceiling`): no work on this branch
  can close it, so carry it into §3's report as unmet with a one-line note on why, and never fold it into
  the fix loop.
- **After a fix cycle's re-review comes back clean, re-tick only the criteria that cycle's fix
  implementer reported met** — with that evidence as the note, on `<run-root>/dod.md` and the anchor's
  checklist, through the active store's own `## Definition of Done ticks` section
  (`docs/agents/issue-tracker.md`) (controller-only, INV-0015), per
  `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s `## Reading the report`. A listed line the fix
  implementer's report calls not met or ceiling stays unticked, with that reason or partial evidence as
  the note; a listed line its report omits is a report defect, sent back rather than ticked around
  (`dod-ticks.md`'s note rule, INV-0014). Every other `dod.md` line — one this cycle never listed — keeps
  whatever state and note it already carried.
- **On a clean verdict**, and only then: clear any standing `**Unresolved:**` entry — the run has just
  re-verified clean — with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved clear --root
  <run-root>`, which succeeds and changes nothing when there is none. Then write the ledger's
  `**Stage:**` line with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set <value> --root
  <run-root>`, per that file's rule that a stage write never undoes completed work — the verb enforces it
  and refuses a write that breaks it. Read the current stage first (`scope.js get stage`).
  - `documented-unreviewed`, **no fix cycle ran** → write `documented`. The review it was missing has now
    run, and the doc pass still describes this code.
  - `documented-unreviewed`, **a fix cycle landed commits** → write `reviewed`. Those commits arrived
    after the doc pass, so the docs are stale by exactly them, and `reviewed` is what makes
    `/superdev:submit-pr` ask for the doc pass again.
  - `documented`, `submitted`, or `shipped` → leave the line alone and say so in one line; the run has
    moved past this gate. A `submitted` run's suite result — recorded above — is what
    `/superdev:ship` reads back when base has moved since the pull request opened.
  - Anything else → write `reviewed`.

  **A fix cycle that landed commits also clears the inline-doc-pass record**, with
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" docs clear --root <run-root>`. A `lite` run wrote that
  record when it documented itself, before this review existed; commits landed since make what it recorded
  stale, so the next `/superdev:document` must run the full `doc-writer` rather than the reader alone (ADR
  0031). It is the same judgment the `documented-unreviewed` row above makes, on the same trigger. **No fix
  cycle, or none that committed** → leave the record alone: the docs still describe this code. The verb
  succeeds and changes nothing when there is no record, so a `full` run needs no separate branch here.

  Publish the snapshot after any of the writes above — `unresolved clear`, the stage write, and `docs
  clear` alike — per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section.

  Then print the next command. **The stage reads `submitted`** — print `/superdev:ship <scope>` and say
  in one line what it does (merge the pull request `/superdev:submit-pr` already opened; ADR 0096). This
  is the re-review ADR 0096 sends an operator to after resolving a base-merge conflict, so this is the
  command that recovery ends on. **Otherwise** — print `/superdev:document <range>`, carrying the
  concrete range §1 resolved, and say in one line what it will do (reconcile the in-repo docs and the
  knowledge base with the merged state). Either way, add that this conversation is disposable: the
  ledger's stage and the scope branch carry everything the printed command reads, so a `/clear` first
  costs nothing.
- **Never merge, push, or open a pull request.** `/superdev:submit-pr` ends the chain.
