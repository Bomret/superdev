---
name: review
description: Review a change — a commit range, a branch, a path, or the working tree — for correctness, architecture, security, and over-engineering. Read-only on an ad-hoc range; on a live superdev scope it reviews against the DoD and can drive the fix loop.
argument-hint: "[BASE..HEAD | branch | path | scope-slug | (empty, or the top-level path = changes, else a scope run, else the whole repo)]  [--unattended]  [--chained]  [-- what it should do]"
---

# superdev review

Review a change end to end. Two modes, and §1 decides which:

- **Ad-hoc** — a spot-check, a pre-PR pass, a second opinion on someone else's branch, or
  `/superdev:sweep`'s code leg under `--chained` (§1). No plan behind it, and **read-only end to end** (§3).
- **Scope** — the range is a live superdev scope branch, so this is the whole-scope review gate in the
  implement chain (ADR 0013). It reviews against that run's Definition of Done, may drive the fix loop
  after asking once, and hands off to `/superdev:document`. **§4 owns everything that differs.**

Either way the reviewers themselves are the same read-only subagents.

Every message this command ends on closes with the Next block, per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` section (INV-0111). An attended run first makes the offer in `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The offer` section (ADR 0157). A run under `--chained` prints no Next block. An ad-hoc review's block names `/superdev:plan` where findings stand (§3) and says no command follows otherwise.

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

**The argument is user input, never command text** (triage #451). A ref candidate — a branch name, or
each non-empty half of a range — passes the **ref shape test** before any git call: it matches
`[A-Za-z0-9._/~^@{}:+-]+` and does not start with `-`. The set admits git's revision syntax (`HEAD~3`,
`main^`, `@{u}`, a branch name with `+`) and holds no whitespace and no `'`, so a single-quoted candidate
reaches git as one literal word, and none reaches git as an option. A candidate that fails the test is never passed to git as a ref. A candidate that passes
is single-quoted wherever it reaches git or `scope.js`. Every ref candidate resolves through the commit
peel, `git rev-parse --verify --quiet '<name>^{commit}'`: `:` stays in the set for revision syntax, so a
candidate such as `HEAD:README.md` passes the shape test and names a blob, and a candidate that does not
peel to a commit does not resolve. A path
is not shape-tested, because a real path may hold a space or a quote: quote it the same way, writing each
`'` inside it as `'\''`, and pass it after `--` where git takes a pathspec. A scope slug reaches
`scope.js` only after the slug charset below admits it.

- **Range** — whatever remains, resolved to a concrete git range:
  - **`BASE..HEAD`** (or `BASE...HEAD`: contains `..`, and is no path on disk — an existing path such as
    `../x` resolves through the path shapes below) → split it once at `...` or `..`. An empty half
    stands for `HEAD`, as git reads it, and takes no shape test (`main..`, `..main`, `HEAD~3..`,
    `main...`). **Each non-empty half passes the ref shape test** → resolve it with the quoted
    commit-peel call (`git rev-parse --verify --quiet '<half>^{commit}'`), and use the range as given,
    the assembled range reaching git single-quoted (`git diff '<BASE>..<HEAD>'`). **A non-empty half
    fails it, or does not resolve** → refuse, naming the argument and the half that failed, and dispatch
    nobody. **Both halves are empty** (`...` alone) → no range: refuse, naming the argument, and
    dispatch nobody.
  - **A branch** (no `..`; passes the ref shape test and resolves via
    `git rev-parse --verify --quiet '<name>^{commit}'`) → range is
    `merge-base(base, branch)..branch`. A branch a live run root names takes its range base instead,
    per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`: `<range-base>..branch`.
  - **A path outside the checkout** (exists on disk, and `git ls-files -- '<path>'` exits non-zero, git
    reporting the path outside the repository) → it resolves to nothing: stop, name the argument, say it
    lies outside the checkout, and dispatch nobody. Git decides from the quoted input, so the test needs
    no path normalization (ADR 0150). `..` or `../x` at the top level takes this shape. A path through
    `..` that stays inside the work tree (`../plugin` from a subdirectory) passes the test and takes the
    path shapes below.
  - **A path naming the checkout's top level** → the **Empty** shape below, exactly as if no argument
    were given (ADR 0165, INV-0168). A path names the top level when both git calls succeed,
    `git -C '<path>' rev-parse --show-toplevel` prints the invoking checkout's own
    `git rev-parse --show-toplevel`, and `git -C '<path>' rev-parse --show-prefix` prints nothing. Both
    strings come from git, so they compare as they are, with no path normalization (ADR 0150). Any
    non-zero exit means the path does not name the top level. `.` and `./` at the top level, the
    absolute top-level path, and a symlink to it all take the **Empty** shape. `.` from a
    subdirectory, any subdirectory, a submodule root, a nested repository, another linked worktree's
    root, the git directory, and a file each keep the path shape below.
  - **A path/area** (exists on disk inside the checkout, isn't a ref, and does not name the top level) → the diff of the current branch vs base, scoped to
    that path (`git diff <merge-base>..HEAD -- '<path>'`, or `git diff HEAD -- '<path>'` if there are
    uncommitted changes there). When HEAD is a branch a live run root names, `<merge-base>` is the range base
    per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`; any other HEAD keeps the merge-base.
  - **Standing code** — that same path, where the scoped diff above comes back **empty** → the files
    under it at `HEAD`, reviewed as they are rather than as a change. This is what makes "review this
    existing area" work: on a clean checkout a path has no diff, so the diff shapes above review nothing.
    A **fallback, never a replacement** — a path with a non-empty scoped diff resolves to that diff
    exactly as it does above, so no existing invocation changes meaning. **The path exists and holds no
    files** → say there is nothing to review and dispatch nobody. Read-only like every other ad-hoc
    range: nothing is edited, committed, or merged.
  - **Empty** → a four-step cascade, which reviews the first subject it finds:
    1. **The working tree carries uncommitted changes** (`git diff HEAD` non-empty) → review those,
       exactly as before. A dirty working tree is reviewed as it always was, and the command says in one
       line which eligible scope it passed over, when one exists — the single run root step 3 below would
       have found, named with a quick, best-effort scan; several or none, say nothing extra.
    2. **Otherwise `merge-base(base, HEAD)..HEAD` is non-empty** → review that.
       When HEAD is a branch a live run root names (the test the branch bullet above uses), the range base per
       `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base` replaces the
       merge-base: `<range-base>..HEAD`. Any other HEAD keeps `merge-base(base, HEAD)`.
    3. **Otherwise, and not under `--chained`** → run `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Resolving an empty
       argument` cascade over the run roots at stage `merged` or `documented-unreviewed` — the same two
       stages the chain hands to this review, so the attended and unattended paths select
       the same scopes. Its resolved candidate is a scope slug: take that scope's `**Branch:**` line
       (`## The scope branch`) as `<branch>`. **No such line, or the named branch does not verify** —
       take `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope branch` shape-scan fallback
       and say which route was taken. The range becomes `<range-base>..branch`, the range base per
       `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base` (`scope.js base resolve --branch <branch> --base <base> --root <run-root>`),
       which the **Scope mode wins** bullet above then recognizes as a live run.
       Several candidates still put the question, and block under `--unattended`, as that section states.
       **No candidate** → go on to step 4. Review adds this step after the shared cascade, so its
       **No candidate** stop does not apply here (ADR 0165, INV-0077).
    4. **Otherwise** → **standing code of the whole repository**: the files at `HEAD`, the standing-code
       shape above applied to the top level. Before any reviewer starts, the range announcement lists
       every run root with its stage (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## A live scope
       run` → *Run-root enumeration*) and adds a `/superdev:review <scope-slug>` line for the operator
       who meant a run, or says the repository holds no run root. It is an ad-hoc review like any other,
       attended or unattended: no ledger write, no run lock, and no fix loop. No files at `HEAD` → say
       there is nothing to review and dispatch nobody. **`--chained`** skips step 3 and comes straight
       here, which is the standing tree `/superdev:sweep` asks its code leg to read.
  - **A scope slug** — reached only once every shape above fails: no `..`, no ref
    (the ref shape test or the quoted `git rev-parse --verify --quiet '<name>^{commit}'` fails), and no path on
    disk. **Validate it against
    `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope slug` charset
    (`[a-zA-Z0-9][a-zA-Z0-9_-]*`) before addressing `.superdev/scopes/<arg>/` with it** — the same test
    `lib/ledger.js`'s `SLUG_RE` applies to a label's slug segment. **It fails** (a `../`-shaped
    argument among them) → stop, name the argument and each shape it failed (the ref shape test or
    `git rev-parse`, no path on disk, the slug charset), and dispatch nobody, rather than reading
    whatever path the argument resolves to. **It passes** — a run root exists for it
    (a `<run-root>/ledger.md` per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## A live scope
    run`). Resolve the branch with
    `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get branch --root <run-root>` and verify it
    (`git rev-parse --verify --quiet '<branch>^{commit}'`); the range becomes `<range-base>..branch`, the range base per
    `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base` (`scope.js base resolve --branch <branch> --base <base> --root <run-root>`), which the
    **Scope mode wins** bullet above then recognizes as a live run. **No such line, or the named branch
    does not verify** → take `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope branch`
    shape-scan fallback and say which route was taken. **No run root names the argument** → the argument
    named something that resolves to nothing: no ref, no path on disk, and no run root. Stop, name the
    argument and each shape it failed, and dispatch nobody. Only an argument that is absent reaches the
    **Empty** shape above, so a mistyped branch or slug never starts a review of something it did not
    name.

**State the concrete range/target** (e.g. "Reviewing `a1b2c3..d4e5f6`" or "Reviewing working tree changes
incl. untracked") before dispatching.

**In scope mode, record the step before any other ledger or store write.** Run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step set review --root <run-root>`, which replaces any standing step. Every
`step set` writes its own `step review` line, even when the step already reads `review`, so the run trace
starts a new fix loop for this invocation. Every exit this command reaches after that call ends in a
`step clear`, a stage write, or `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step block --root <run-root>`: a
blocked stop, a refusal, a `First:` wait, and a review exit without a clean verdict each run `step block`
first, which closes the final review's verdict window and leaves the step standing, so `/superdev:status`
and the published run state still show it.

**Size caution (qualitative, non-blocking).** Glance at `git diff --stat`, or on a standing-code target
at the file count under it (`git ls-files -- '<path>'`, the whole tree for the top level). If the change spans enough
files or churn that one review pass would likely miss things — a judgment call, not a line count — say so
alongside the range announcement (e.g. "large, multi-concern diff; consider splitting it via
`/superdev:plan`") and proceed anyway. Never block on it.

## 2. Review (parallel, read-only)

Dispatch both reviewers in parallel, each with an **explicit `model`** (a hook blocks any dispatch to a
superdev subagent that omits one):

- **`superdev:final-reviewer`** (`model: opus`) — correctness, consistency, whole-scope brevity,
  security, performance, applied adversarially per axis. Give it: a one-line summary of what changed
  (derive it from the diff if the trailing description didn't supply one), the `acceptance` from §1, and
  the git range — **on a standing-code target (§1's standing-code shape), the path and its file set at `HEAD` in
  place of a range, with the summary derived from that file set instead of a diff** (it reads the review
  checklist itself via `${CLAUDE_PLUGIN_ROOT}`).
  **In scope mode both of those change shape**, so the reviewer can write its own criteria before it sees
  the answer key (ADR 0020):
  - **The git range is the whole scope range on every dispatch**, `<range-base>..<branch>`, each re-review
    after a fix cycle included (ADR 0137, INV-0143): a full-tier slice re-review reads only its fix cycle's
    range, so this review is the backstop that reads the whole branch. A fix cycle's range, below, is what the
    fix-cycle outcome rule reads, never the review's subject.
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
  - **Also tell it the tier and the run root, so it reads the run trace.** The tier is derived per
    `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section (three or fewer slices is
    `lite`). On a **`lite`** scope, `final-reviewer` applies **Missing RED** to every slice's trace lines
    exactly as `slice-reviewer` does (Important, the checklist's closing sequence, no finding without a
    trace); at the fix cap it takes the escape path the fail-to-pass bullet below states. A trace line's second field is its slice (the slice id, or `scope`), and a `dispatch` line
    carries the plugin-scoped agent type, so it matches on the name part (`slice-reviewer`,
    `implementer`). On the lite tier a slice is `behavior` when its ledger row's type says so
    (`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get slices --root <run-root>`). On a **`full`** scope, every merged slice needs a `dispatch superdev:slice-reviewer` whose
    `completed` `dispatch-end` comes after that slice's last `completed` `dispatch-end` of `superdev:implementer`, or a
    `**Degraded:**` ledger entry naming that slice's denied review. A `dispatch-end` line ends with its outcome
    (`completed`, `failed`, `denied`, `stopped`, `unknown`, or `session-end`), a line with no outcome reads `completed`, and only a
    `completed` end finishes a dispatch. A slice with neither is an Important
    finding, **Unreviewed slice**. No trace, or no events for a slice: it names that in the report and raises neither finding.
    The remedy for an **Unreviewed slice** finding is a `superdev:slice-reviewer` dispatch that hands over the slice's
    `spec`, `acceptance`, range, and progress-log path `<run-root>/reports/<id>/progress.md`, so the run trace records the dispatch on that slice.
    The `slice-reviewer` judges the slice's range itself: the progress log is input to check against the code, not a verdict to adopt.
  - **Also tell it the fail-to-pass rule on a `lite` scope, so it reads the outcome lines.** `final-reviewer`
    applies `## Fail-to-pass run` in `${CLAUDE_PLUGIN_ROOT}/references/review-checklist.md` to every `behavior`
    slice: an **Important** finding, **Pass-to-pass**, where the slice's latest
    outcome line over its recorded range (the trace's `fail-to-pass` line, which is no test run) reads `pass-to-pass`,
    and an **Important** finding, **Missing fail-to-pass run**, where its range changes both a test-path file and
    another file and has no outcome line over it, or, where its ledger row records no range, where its own
    `edit test` and `edit impl` trace lines show both. With no trace, no `edit` line for the slice, or no test
    command it raises neither and names the gap in the report. Only `edit` lines count as a slice's or a cycle's
    change events, so a `run` or `ledger` line is none, even one written after the trace began for a slice whose
    edits came before it. Both take Missing RED's 3-cycle cap and
    escape path: a scope whose only remaining Critical or Important findings are **Missing RED**,
    **Pass-to-pass**, or **Missing fail-to-pass run** proceeds, and §3's report names each with its slice; any of
    them beside a Critical or Important finding of another kind blocks.
  - **Also tell it that a fail-to-pass `unknown` is no finding.** A `fail-to-pass` trace line reading `unknown`
    records a run that could not judge. `final-reviewer` names every one in its report with its slice and its reason
    (the exit status or signal in `control=`, or the `bound=` the run before the change ran under, or `start-failed:<code>`
    where a run could not start), raises no finding for it,
    and starts no fix cycle. The line counts as an outcome line for **Missing fail-to-pass run**, and the latest line
    reading `fail-to-pass` or `pass-to-pass` decides **Pass-to-pass**.
  - **Also tell it the fix-cycle rule on either tier, so it reads each cycle's outcome line.** `final-reviewer`
    applies `## Fail-to-pass run` in `${CLAUDE_PLUGIN_ROOT}/references/review-checklist.md` to each fix cycle of the
    scope branch. A fix cycle's re-review hands it the cycle's range, `<cycle-base>..<cycle-tip>` as full commits:
    an **Important** finding, **Pass-to-pass**, where the cycle's latest outcome line over that range reads
    `pass-to-pass`, and an **Important** finding, **Missing fail-to-pass run**, where the range changes both a
    test-path file and another file and has no outcome line over it. A **Pass-to-pass** finding closes only on a
    `fail-to-pass` outcome over a range from the original change's base to the tip current when that closing run
    ran, and stays closed once that line is written. That holds at every dispatch, the entry dispatch included (it
    runs no cycle and hands no range) and a re-review (it hands only its own cycle's range). A `scope` line that
    follows a finding's own `pass-to-pass` line and starts its range at that line's base is the finding's closing
    run, not a cycle: it closes the finding or keeps it open, and raises no second finding.
    Run handoff has no re-review of its own, so `final-reviewer` reads run handoff's cycles and the scope's earlier
    review cycles from the trace at every dispatch, a `scope` range whose latest outcome line reads
    `pass-to-pass`, and an `implementer` `dispatch` of `scope` with `edit` lines in its window, whose commits that
    landed in that window change both a test-path file and another file, with no outcome line over those commits.
    A fix cycle's window runs from each run of its `implementer` dispatch of `scope` (its `dispatch`
    line, and each `dispatch-resume` line of that dispatch) to the first `dispatch` line, whatever its agent type or
    slice, after the `dispatch-end` line that closes that run, or to the end of the trace when none follows. Whatever
    the end's outcome (`completed`, `failed`, `denied`, `stopped`, `unknown`, or `session-end`), the window is bounded
    the same way. An implementer run with no `dispatch-end` line has a window that ends at the first `dispatch` line
    after its own `dispatch` or `dispatch-resume` line, or at the end of the trace. A cycle's commits are read along
    the scope branch's first-parent chain, so the base commits a merge brings in are none of them, and neither is a
    merge commit that brings the base in. No trace, a run handoff cycle with no
    `edit` lines, and a repository with no test command get no finding: name the gap in the report. A cycle whose
    commits change only test-path files, or no file, gets no finding, and the report names no gap for it. Both take
    Missing RED's 3-cycle cap and escape path (§4), and §3's report names a cycle's finding with its range.
  - **Also tell it to judge every `dod.md` line, ticked or not.** `final-reviewer` returns a verdict for
    each — holds, broken, ceiling, accepted, or doc pass — in its own `### Criteria` section (`agents/final-reviewer.md`'s
    `### Judge every criterion`). §4 below unticks and re-ticks from that list; the axes above (Correctness,
    Consistency, whole-scope Brevity, Security, Performance) are what it judges the *code* on, and this is
    the DoD gate the same dispatch also carries.

  **Ad-hoc mode**, if a test command is configured (`docs/agents/verification.md`), tell it it may re-run
  the suite over the range rather than trust the diff alone. The dispatch tells it to run every test through `scope.js test`, and a suite
  longer than the Bash tool's time limit in the background, waiting for its end. **Scope mode** — §4 already ran a suite for
  this dispatch; hand it that result and tell it to review against that result, running no suite of its
  own. It judges the range itself and checks whether the suite result covers the changed code. Say which run it is: `final-reviewer` reviews against whichever result you hand it, full or
  focused (ADR 0075). The entry and exit dispatches hand a full-suite result — labelled whole-repo
  when the review ran the whole-repo command (§4) — and a fix cycle's
  re-review hands that cycle's focused run. Confirming a `dod.md` criterion observes; it changes no
  system outside the repository (ADR 0084, INV-0006). A criterion needing a deploy, a migration, or any
  other outward-facing change to confirm gets reported as unverifiable on the branch, needing
  verification after merge, naming the outward-facing change it needs.
- **`superdev:simplicity-reviewer`** (`model: sonnet`) — over-engineering only (unnecessary complexity,
  what stdlib/native replaces, what to delete). Give it the same git range. It assesses the diff itself; any text handed with the range is input to check, not a verdict to adopt.

Both subagents are **read-only** (`Read`, `Grep`, `Bash` — a hook blocks `git merge`/`push`/`rebase`/`pull`/`subtree push` and
the code-host merge calls `gh`/`tea pr merge`, `tea api`, and `gh api`, from any subagent). Scale the dispatch to the diff:

- **A `full`-tier scope** → `final-reviewer` alone; skip `superdev:simplicity-reviewer` (ADR 0037),
  reporting `` not dispatched — full tier, covered per `behavior` slice ``. That tier dispatched it beside each
  `behavior` slice's first review, and a reviewed fix cycle applied the warranted cuts before the slice merged
  (ADR 0138), so a whole-scope pass re-reads cut-down code for cuts. What only the integrated view reveals — the same logic in two slices, an
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
- **A standing-code target** (§1's standing-code shape) → `final-reviewer` alone; skip `simplicity-reviewer`,
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
net: -<N> lines possible   (zero included; "net: +<N> lines possible" when a clearer shrink: makes the cuts add more lines than they remove; "Lean already" if nothing to cut)

### Ceiling
[final-reviewer's ceiling note, carried through verbatim when it wrote one; omit this section entirely
when it didn't]

### Fail-to-pass unknown [final-reviewer's notes, one per outcome, carried through verbatim; omit this section entirely when it wrote none]

### Deferred to a plan
[a finding whose remedy would add a capability the Definition of Done never named — §4's boundary (a guard-rail remedy is not one); one
line each, with the follow-up `/superdev:plan`. Omit this section when there is none]

### Assessment
Full-suite run: [pass | fail | not run | denied — degraded pass]
Correctness: [ready | not ready]. Simplicity: [N cuts recommended, non-blocking | Lean already | not dispatched — <reason>].
Ready to merge? [Yes | No | With fixes]
Reasoning: [1–2 sentences]
```

The per-axis line is additive, sourced from each reviewer's own verdict — final-reviewer's `Ready to
merge?` line for Correctness, simplicity-reviewer's `net: -N lines possible` / `net: +N lines possible` / `Lean already` for
Simplicity (or "not dispatched — <reason>" per §2's skip rules, naming which one applied — e.g. "not
dispatched — full tier, covered per `behavior` slice"). It doesn't replace the combined `Ready to merge?`
verdict: over-engineering findings stay non-blocking, never gating merge on their own. `final-reviewer`
has no notion of deferral and lands its own line at the finding's actual severity, so a verdict whose only
remaining findings are `### Deferred to a plan` entries — §4's exit clause already treats that verdict as
clean — lands the combined `Ready to merge?` as `Yes`, naming the deferrals in the Reasoning line, rather
than carrying `final-reviewer`'s raw `No` into a report for a scope the run went on to advance. At the fix
cap the same holds for a verdict whose only remaining Critical or Important findings are **Missing RED**,
**Pass-to-pass**, or **Missing fail-to-pass run** (§4): the combined line lands `Yes`, and the Reasoning line names
each such finding with its slice, or a cycle's finding with its range.

**Apply nothing — on an ad-hoc range.** Never edit, commit, or merge, however small the fix looks. To act
on findings, the operator runs `/superdev:plan` to slice the fix, the command this run's Next block
names, then `/superdev:implement`. **Scope mode is the one
exception**, per §4: there the findings belong to a run already in flight, and fixing them is the point
of the gate. Even then you ask first, and the reviewers stay read-only.

## 4. Scope mode — fix loop and handoff

Only when §1 found a live run. Everything above still applies; this adds the run's own steps.

- **Find the scope checkout, and refresh the run lock.** Per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`. **The scope checkout not on `<type>/<scope>`** →
  report that and review read-only rather than writing to the wrong branch.
- **Read the suite record first: a red record of kind `whole` swaps in the whole-repo command.**
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get suite --root <run-root>` prints
  `<result> <sha>[ whole]`. Red with `whole`, and a `## Whole-repo command` section configured (ADR 0105,
  `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`'s `## Whole-repo command`) → the entry run and the
  fix loop's exit run below run the whole-repo command in place of the full command, skip the reuse
  check, and record with `scope.js suite set <result> <sha> --whole --root <run-root>`; tell
  `final-reviewer` the result is the whole-repo run, and treat a failing one as a Critical finding
  exactly as a failing full run is. Fix cycles still run the focused command. Any other record → the
  review runs the full command, as below.
- **Reuse a green suite record the tip still earns; otherwise run the full suite yourself, before
  dispatching `final-reviewer`.**
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite reusable --branch <branch>
  --root <run-root>` **in the scope checkout above**. Exit 0 → reused, running nothing (INV-0017: an
  exact tip match, or a Markdown-only range since the record, ADR 0128). Exit 1, or no record at all, means: take the full command from
  `docs/agents/verification.md` per `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` and run it **in
  the scope checkout above**, over the scope branch, through `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test full`
  (`test whole` for the whole-repo command, `test focused <changed paths>` inside a fix cycle). A suite longer than the Bash
  tool's time limit runs through the runner in the background, and you wait for its end before acting on it. Then record what happened with
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
  just landed, through `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test focused <changed paths>` — and **hand that result to the re-review**, saying it is the focused run: fix cycles never
  run the full suite. **When a fix cycle's re-review verdict first comes back clean, leaves only Minor Prompt-concept overlap findings and no broken criterion, or the cap leaves only Minor findings, run the full suite
  once more** in the scope checkout, and record it the same way
  (`scope.js suite set <result> <sha> --root <run-root>`, `<sha>` = the tip after the fix commits):
  that run is the gate the stage advances on. A scope whose first verdict is already clean runs none of
  this — the entry check above already reused a green record or ran and recorded that gate, so the full
  suite is paid at most once. A **red result
  there is itself a Critical finding** too — it re-enters the fix loop and **counts toward the 3-strike
  cap** below, the same shape as a cycle exposing a defect elsewhere, so the loop needs no bound of its
  own (ADR 0075). **The exit run follows the choice made at entry**, not a
  re-read of the record: when the entry swapped in the whole-repo command, the exit run is the whole-repo
  command recorded with `--whole` (`scope.js suite set <result> <sha> --whole --root <run-root>`), so a
  green result writes the `whole` record; when the entry run of that command was denied, the denied
  handling below applies to it. **A denied exit run takes the entry run's
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
  ledger bullet either. A duplicate bullet stands until somebody resolves it, and two paths reach one — a later fix cycle whose re-review returns the same still-deferred finding, and a
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
  **Where the store defines a triage record, list the open records after that read** and follow
  `${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md`'s *Triage record* rule (ADR 0145); on a match the
  ledger bullet carries the matched record's reference.
  **When no record plainly matches, create the triage record first**, in the configured slice store, the way that store's own
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
  **A guard-rail remedy stays in this loop** (ADR 0097, ADR 0153). A guard-rail remedy extends what exists:
  a case in an existing test suite, a case or row for an existing drift check, or a prose fix that makes
  shipped text agree with a rule the repository already states. It adds no behaviour, so it
  produces no deferred finding and no triage record. A remedy that builds a new scanner, check family,
  hook, or script verb, or that changes what a plugin user can observe, is still a deferred finding.
  A later instance of a failure-mode class that a Definition-of-Done criterion names is in scope, never a
  deferred finding (ADR 0146): the criterion states the class, so the remedy completes what the plan
  asked for. A finding that plainly states the same defect as a triage record this run's scope anchor
  absorbs is in scope, never a deferred finding: a criterion already cites that record (ADR 0144).
  **Severity does not move the boundary.** A Minor finding whose remedy adds a capability the Definition of
  Done never named is a deferred finding, with the triage record, ledger bullet, store-defines-none
  fallback, and dedup read above, exactly as one of any other severity.
  **That boundary needs an exit.** A deferred finding enters no fix loop, holds no stage, and is not an
  unresolved defect — the same non-gating shape the over-engineering and ceiling notes below use for their
  own findings. This holds precedence over `--unattended → fix every finding` just below: that rule fixes
  a real defect without asking, and a deferred finding is not one, so it never reaches that rule. A verdict
  whose only remaining findings are deferred counts as clean, for the ask-once gate right after this bullet,
  the 3-strike cap, and the clean-verdict stage advance alike.
  **A deferred finding re-enters this loop only when a later review names a guard-rail remedy for it**
  (ADR 0121, INV-0125), attended or unattended alike: the boundary that deferred it, applied again. A
  remedy that still adds a capability keeps it deferred. A re-entered finding joins the next cycle's fix
  list like any other, and the dispatch asks the fix implementer to name the commit that fixed it. Once the
  fix implementer's report names the commit that fixed it and a later re-review no longer lists it, resolve
  it by the procedure `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Deferred findings` section
  states, in its order: remove the bullet, close its triage record (only a record whose own body names this run's scope anchor
  and that no open anchor absorbs, by reads that succeed; that step comments on any other), rebuild an open pull request's
  deferred section, and publish the snapshot.
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
  A line called **doc pass** — tagged `docs`, its `AGENTS.md` text not yet written — is left exactly as it
  stood too: no note, no untick, no fix-cycle listing, no `**Unresolved:**` entry, and never a finding,
  because `/superdev:document` settles it after this review (ADR 0161, `dod-ticks.md`).
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
  criterion stands unmet, except a `ceiling` one, an `accepted` one, or a `docs` one (INV-0016) — the same non-advance
  rule the full-suite fail and Critical-finding rows above already apply.
- **A criterion `final-reviewer` finds missing from `dod.md` is not a tick to add.** Review writes no new
  line into `dod.md` (INV-0004). A **plan-coverage gap** — a criterion the code already satisfies — is
  fixed in the loop with the guard-rail remedy that proves the behaviour (ADR 0097); a gap an existing test
  already proves is reported only. A derived criterion the code **fails** is a `### Deferred to a plan`
  finding like any other, under the fix-loop boundary above (ADR 0035).
- **Ask once before fixing.** `final-reviewer` returned **any finding** — a Minor-only verdict included —
  a broken criterion, or the full
  suite came back `fail` → report them per §3 first, then ask once, offering three options: **fix every
  finding** (the recommended option), **fix only the Critical and Important findings**, or **fix none**.
  The option chosen fixes its set, and the loop below runs over that set. **When the
  findings include an unmet criterion** (a broken line, or one this cycle leaves unticked), **the same
  question also offers to accept it as unmet instead**, with the operator's own reason — this is the one
  decision point where a fresh `accepted:` note gets written (ADR 0095). **`--unattended`** never makes
  this offer, and never writes `accepted:`; an unmet criterion there follows the ordinary fix-or-block path
  below.
  - **Declined** (fix none) **with only Minor findings standing** → take the clean-verdict path below:
    the stage write, with the standing Minors named in the report and nowhere else — no `unresolved add`,
    no `deferred add`, no triage record (INV-0094).
  - **Declined** (fix none) **with a Critical or Important finding, a broken criterion, or a red suite
    standing** → stop. The findings stand: write the `**Unresolved:**` entry with a quoted heredoc
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
    of the findings this cycle fixes; any other finding still goes through the
    three-option choice above.
  - **`--unattended` → fix every finding**, Minors included, without asking: the fix loop is the point of
    this gate, and a review that found real defects and left them is worth less than no review.
  - **Missing fail-to-pass run** (a finding of that name in the chosen set) → answer it yourself, with no
    implementer cycle: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" fail-to-pass <base>..<tip>` from the
    scope checkout over the slice's range, and leave it off the **Confirmed** list below, dispatching
    none when no finding remains on it. Every run of the verb goes in the background when the suite outlasts the
    Bash tool's time limit, and you wait for its end before you read its outcome
    (`${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`). A slice whose ledger row records no range first has its range recorded:
    read the slice's commits from the scope branch's log, then run `scope.js slice <id> merged --range <base>..<tip> --root <run-root>`.
  - **Unreviewed slice** (a finding of that name in the chosen set) → answer it yourself, with no implementer
    cycle: dispatch the `superdev:slice-reviewer` with an explicit `model`, handing over the slice's `spec`,
    `acceptance`, range, and progress-log path `<run-root>/reports/<id>/progress.md`, and leave it off the
    **Confirmed** list below, dispatching no implementer when no finding remains on it. The run trace records that
    dispatch on the slice, which is what closes the finding at the re-review (§2). The reviewer judges the range itself and reads the progress log as input to check, not a verdict to adopt.
  - **Fail-to-pass run around each fix cycle** (ADR 0134, INV-0138) → before each fix dispatch below, record the scope
    tip, `git -C <run-root>/scopetree rev-parse HEAD`, as the cycle's `<base>`. Once the cycle's report is accepted,
    after any send-back to the implementer for a report defect or a missed sibling surface, and before the
    re-review, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" fail-to-pass <base>..<tip>` from the
    scopetree over the cycle's commits (`<tip>` is `git rev-parse HEAD` after them), where they change both a
    test-path file (`docs/agents/verification.md`'s `## Test paths`, the defaults where it has none) and another
    file. The trace line names `scope`, because the range matches no ledger row and no slice is in progress. A
    cycle whose commits change only test-path files, or no file, needs no outcome line and draws no finding. Where
    the chosen set holds a **Pass-to-pass** finding, also run the verb over a range from that finding's original
    base to the current tip: the base of the range the finding's `pass-to-pass` line names, a lite slice's recorded
    range base or a fix cycle's own base. That finding closes on the `fail-to-pass` outcome of this run, so a fix
    that only strengthens the test closes it, and it stays closed once that line is written. Neither run is a test
    run or a cycle of its own: neither satisfies a Missing RED step, moves a suite record, or counts as a cycle
    beside the implementer cycle it follows, and a refusal or a missing outcome line blocks no loop (INV-0017). A
    **Missing fail-to-pass run** finding on a cycle takes the answer of the bullet above over the cycle's range,
    which for a run handoff cycle you read from the scope branch's first-parent log over the cycle's window (§2). A
    run of either bullet that prints `pass-to-pass` reaches a re-review over that run's range, dispatched as §2
    states, even where no implementer cycle preceded it, so the **Pass-to-pass** finding is raised. Where a run
    answering a **Missing fail-to-pass run** finding prints `pass-to-pass` and no **Confirmed** implementer below is
    dispatched before the re-review after it, that run and that re-review count as one of the 3 cycles. Where a
    **Confirmed** implementer is dispatched before that same re-review, the run, the implementer, and the re-review
    they share count together as one cycle.
  - **Confirmed** (fix every finding, or fix only Critical and Important) → dispatch **one**
    `superdev:implementer` (`model: opus`; `haiku` only when every finding in the list is a mechanical
    finding, one whose fix changes no stated rule or behaviour, and any other finding keeps the whole
    dispatch on `opus`) with the **complete** list
    of the findings the chosen option covers, not one fixer per finding. Hand it the scope checkout as
    its working directory: this is where its fix commits must land. **The RED-test rule is conditional**:
    a fix for a finding that names failing behaviour opens with a RED test that reproduces it, and a
    finding whose cause is not yet established runs the diagnosis loop first
    (`${CLAUDE_PLUGIN_ROOT}/references/diagnosis.md` — the implementer reads it on any defect-repair
    dispatch); a fix for a finding that names none (style, naming, doc polish) takes no RED test, and the
    re-review verifies it by reading. Tell the implementer its report names which rule it applied to each
    finding. **Every sibling surface is reconciled**: tell the implementer to search its own checkout for
    every other place that states the rule or behaviour the fix changes, bring each one into agreement,
    and report each place it checked and each it changed, reporting a place outside its checkout
    unedited. Tell it to report the `AGENTS.md` hierarchy and the knowledge base unedited too, since the
    doc pass owns them (INV-0120). A fix report that omits the checked-and-changed list is a report
    defect, sent back to the implementer before the re-review. Tell the implementer to run every test
    through `scope.js test`, to run a suite longer than the Bash tool's time limit through the runner in the
    background and wait for its end, and to edit files through the edit tools, never through a script. On a
    **`lite`** scope, for each **Missing RED** finding in the list, also hand the implementer the run-trace
    remedy (`git add <paths>`, `git restore --worktree --source=<base> -- <paths>`, a failing run,
    `git restore -- <paths>`, a passing run, never `git stash`) and that slice's `<base>`: the base of the
    slice's recorded range in its ledger row (`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get slices --root <run-root>`). Before the re-review, grep the checkout
    for the key phrase of the rule the fix changed, in its old wording and its new, and compare the hits
    with the report's checked list. A hit in a file the list does not name is a missed sibling surface:
    send the report back to the implementer, naming the hit, in the same cycle. A hit in the `AGENTS.md`
    hierarchy or the knowledge base is named in your report instead. A hit in `CHANGELOG.md` is release
    history and needs no change. Re-review after it returns, and
    repeat until the re-review lists no finding in the chosen set or the **3-strike cap** is reached — **3
    cycles in total, every cycle counting, whichever findings drove it**. A re-review whose only findings
    left are Minor **Prompt-concept overlap** findings (`${CLAUDE_PLUGIN_ROOT}/references/review-checklist.md`'s
    `## Prompt-concept overlap`), with no criterion standing broken, ends the loop there, attended or
    `--unattended`: it takes the clean-verdict
    path below as a Minor remainder at the cap does, after the same exit full-suite run, because a
    whole-range re-review finds fresh overlap pairs on every cycle. At the cap a remainder of
    **only Minor findings** takes the clean-verdict path below once the exit full-suite run above is
    green (a red exit run at the cap is a remaining red suite): the stage write, with the leftover Minors
    named in the report and nowhere else — no `unresolved add`, no `deferred add`, no triage record
    (INV-0094). A scope whose only remaining Critical or Important findings are **Missing RED**,
    **Pass-to-pass**, or **Missing fail-to-pass run** proceeds so, §3's report naming each with its slice; any
    of them beside a Critical or Important finding of another kind blocks (ADR 0125, ADR 0134, INV-0118,
    INV-0138). At the cap a remaining
    **Critical or Important finding, a broken criterion, or a red suite** means a wrong cut, not a
    bug: stop, say so, write the `**Unresolved:**` entry — at a `submitted` stage, also invalidate the tip's suite record the same way the Declined branch above does
    — leave the stage where it is, and publish the snapshot before stopping — per
    `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section — since no later
    stage write in this run will do it. **`--unattended` → block** at that cap when a Critical or
    Important finding, a broken criterion, or a red suite remains, per
    that file's **Unattended** section, writing the same entry (and, at a `submitted` stage, invalidating the
    suite record the same way), publishing the same way, and leaving the stage where it is. A remainder whose only
    Critical or Important findings are **Missing RED**, **Pass-to-pass**, or **Missing fail-to-pass run** proceeds
    unattended too, exactly as above. **A clean verdict ends the loop
    here too, attended or unattended** — a finding it leaves standing outside the chosen set is a
    follow-up, never a fourth cycle. **An observation never joins the fix list**: a defect the scope did
    not cause, met during a fix cycle, gets its triage record per
    `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Observations` section (INV-0010), and the loop
    carries on without it.
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
  - `documented`, `submitted`, `shipped`, or `closed` → leave the line alone and say so in one line; the run has
    moved past this gate. A `submitted` run's suite result — recorded above — is what
    `/superdev:ship` reads back when base has moved since the pull request opened.
  - Anything else → write `reviewed`.

  On every clean-verdict exit, after the stage write or the leave-alone, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step clear --root <run-root>`, which changes nothing when no step stands. A stage write that changes the stage already cleared the step, and a write of the stage already standing (`reviewed` over `reviewed`) keeps it, so this run is what ends the step on every exit.

  **A fix cycle that landed commits also clears the inline-doc-pass record**, with
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" docs clear --root <run-root>`. A `lite` run wrote that
  record when it documented itself, before this review existed; commits landed since make what it recorded
  stale, so the next `/superdev:document` must run the full `doc-writer` rather than the reader alone (ADR
  0031). It is the same judgment the `documented-unreviewed` row above makes, on the same trigger. **No fix
  cycle, or none that committed** → leave the record alone: the docs still describe this code. The verb
  succeeds and changes nothing when there is no record, so a `full` run needs no separate branch here.

  **The same trigger unticks every ticked `docs` line** (ADR 0161): on `<run-root>/dod.md` and the anchor's
  checklist, through the active store's own `## Definition of Done ticks` section, with the note `not met: a
  fix cycle landed after the doc pass` (`dod-ticks.md`). Those commits may have made the `AGENTS.md` text
  stale, and the next `/superdev:document` judges the line again. The untick runs after the `unresolved
  clear` above, so an entry it writes stands. Whether it writes one turns on the stage you read before the
  stage write:
  - **A stage before `documented`** (`documented-unreviewed` included, which the row above moves to
    `reviewed`) → no `**Unresolved:**` entry and no stage hold: a `docs` line never holds the stage at
    review, and the next doc pass is the chain's next step.
  - **`documented` or `submitted`** → the run has moved past the doc pass, so nothing in the chain would
    judge the line again. Write one `**Unresolved:**` entry per `docs` line this untick unticked, worded
    exactly `docs criterion unmet after the doc pass: <criterion>` — the wording `/superdev:document`'s settle step
    writes and clears — through a quoted heredoc (`<<'SUPERDEV_TEXT_EOF'`) piped to
    `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved add - --root <run-root>`. **At `submitted`**,
    also invalidate the tip's suite record with
    `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" suite set none <sha> --root <run-root>` (`<sha>` = the
    scope branch's current tip), as the Declined branch above does, so `/superdev:ship` finds no record
    to merge on.
  - **`shipped` or `closed`** → the run has moved past the doc pass and the pull request, so the untick
    writes no `**Unresolved:**` entry, invalidates no suite record, and changes no route. Name each
    unticked `docs` line in your report instead, so the operator sees it; a shipped run's open lines
    reach `/superdev:verify-ship` as `not met:` lines through the existing routing. The
    `/superdev:document` this block prints at that stage judges no `docs` line: it names each unticked one
    and routes the run as any shipped or closed run.

  **No fix cycle, or none that committed** → leave every `docs` line as it stands.

  Publish the snapshot after any of the writes above — `unresolved clear`, the stage write, `docs clear`,
  `unresolved add`, and `suite set` alike — per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
  `## Publishing run state` section.

  Say first that this conversation is disposable: the ledger's stage and the scope branch carry everything
  the next command reads, so a `/clear` first costs nothing. Then print the next command, last, so the
  Next block closes the message. **The `docs` untick above wrote an `**Unresolved:**` entry** — print
  `/superdev:document <range>`, carrying the concrete range §1 resolved, and say in one line that it
  re-judges the unticked `docs` lines; `/superdev:submit-pr` and `/superdev:ship` wait for it. **The stage
  reads `submitted`** — print `/superdev:ship <scope>` and say
  in one line what it does (merge the pull request `/superdev:submit-pr` already opened; ADR 0096). This
  is the re-review ADR 0096 sends an operator to after resolving a base-merge conflict, so this is the
  command that recovery ends on. **Otherwise** — print `/superdev:document <range>`, carrying the
  concrete range §1 resolved, and say in one line what it will do (reconcile the in-repo docs and the
  knowledge base with the merged state).
- **Never merge, push, or open a pull request.** `/superdev:submit-pr` ends the chain.
