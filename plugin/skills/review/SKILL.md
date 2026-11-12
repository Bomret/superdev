---
name: review
description: Review a change — a commit range, a branch, a path, or the working tree — for correctness, architecture, security, and over-engineering. Read-only on an ad-hoc range, except an inline fix of Minors on the operator's yes; on a live superdev scope it reviews against the DoD and can drive the fix loop.
argument-hint: "[BASE..HEAD | branch | path | scope-slug | (empty, or the top-level path = changes, else a scope run, else the whole repo)]  [--unattended]  [--chained]  [-- what it should do]"
---

# superdev review

Review a change end to end. §1 decides the mode.

- **Ad-hoc**: a spot-check, a pre-PR pass, a second opinion on someone else's branch, or `/superdev:sweep`'s code leg under `--chained`. No plan stands behind it, and §3 keeps it read-only, except the inline fix the operator agrees to (ADR 0228).
- **Scope**: the range is a live superdev scope branch, the whole-scope review gate of the implement chain (ADR 0013). It reviews against that run's Definition of Done, may drive the fix loop after asking once, and hands off to `/superdev:document`. `${CLAUDE_PLUGIN_ROOT}/references/review-scope-mode.md` owns everything that differs.

**The closing message.** Applies to every message this command ends on. Close it with the Next block per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` section (INV-0111). An attended run first makes the offer in that file's `## The offer` section (ADR 0157).

- A run under `--chained` prints no Next block.
- An ad-hoc review's block names `/superdev:plan` where a Critical or Important finding or a failed focused run stands, the state after an inline fix included.
- Any other ad-hoc review's block says no command follows: a clean review, a Minor-only remainder fixed, declined, unoffered, or left under `--unattended`. After an inline fix it names the fix branch.

## 0. Config (optional)

**The config reads.** Applies to every run. Every file below is optional. A missing file costs the command only its hint.

- `docs/agents/code-management.md` → the **base branch** to diff against, default `main`.
- `docs/agents/verification.md` → the **test command**. The controller runs it and hands `final-reviewer` the result and never the command: §2's focused run states the ad-hoc run (ADR 0179).

## 1. Range

**The flags.** Applies to `$ARGUMENTS` before any parsing. Neither flag is ever part of the range or the trailing description.

- **`--unattended`** comes out first, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section.
- **`--chained`** comes out the same way. It marks a run `/superdev:sweep` dispatched as its code leg, in the **chained posture** (CONTEXT.md, ADR 0068). The concepts below state what it changes.

**The parse.** Applies after the flags. Parse `$ARGUMENTS` into a **range** and an optional trailing description of what the change should do.

- **Trailing description** → everything after a ` -- ` separator, or with no `--` a clear trailing natural-language sentence. It is `final-reviewer`'s `acceptance`.
- **`--chained` wins over scope mode** → skip the next bullet and resolve the range ad-hoc, whatever the invoking checkout's `HEAD` is.
- **Scope mode wins over both, otherwise.** Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md` for what makes the resolved range a live superdev run. When it is, capture `<run-root>` and read `${CLAUDE_PLUGIN_ROOT}/references/review-scope-mode.md` now, before the first scope write (`step set review`) and before the entry run. Follow its steps beside §0 to §3.
- **No trailing description** → run issue-ref discovery, as the next concept states.

**Issue-ref discovery.** Applies when no trailing description is given and `docs/agents/issue-tracker.md` is configured. An explicit description always wins.

1. Grep the resolved range's `git log` for issue references. Take the keyword-qualified form (`Close[sd]?`, `Fix(e[sd])?`, `Resolve[sd]?` followed by `#<n>`, case-insensitive) and fall back to a bare `#<n>`.
2. Dedupe the numbers. Fetch each through the tracker's configured read-issue step.
3. Concatenate the titles and bodies into `acceptance`.

- **No tracker configured, or no reference found** → `acceptance` is "no formal specification — general correctness, security, and quality".

**Untracked files.** Applies before the range resolves. Run `git add -N :/` with the repo-root pathspec. A plain `.` covers only the current directory.

- **Files cannot be included** → check `git status --porcelain` and say so in the range announcement.
- **`--chained`** → run no `git add -N :/`.

**The ref shape test** (triage #451). Applies to every ref candidate: a branch name, or each non-empty half of a range. The argument is user input and never command text.

- **Admit** a candidate that matches `[A-Za-z0-9._/~^@{}:+-]+` and does not start with `-` (`HEAD~3`, `main^`, `@{u}`, a branch name with `+`). Never pass a failing candidate to git as a ref.
- **Quote** an admitted candidate in single quotes wherever it reaches git or `scope.js`.
- **Resolve** every admitted candidate through `git rev-parse --verify --quiet '<name>^{commit}'`. A candidate that does not peel to a commit does not resolve (`HEAD:README.md` passes the shape test and names a blob).

**A path argument.** Applies to a path, which may hold a space or a quote and takes no shape test. Quote it the same way. Write each `'` inside it as `'\''`. Pass it after `--` as git's pathspec.

- A scope slug reaches `scope.js` only after the slug charset of the scope-slug concept below admits it.

**The range shapes.** Applies once the flags are out and each ref candidate has its shape test. Resolve whatever remains to a concrete git range.

- **`BASE..HEAD`** or **`BASE...HEAD`**: the argument contains `..` and is no path on disk. An existing path such as `../x` takes the path shapes below.
  - Split it once at `...` or `..`. An empty half stands for `HEAD`, as git reads it, and takes no shape test (`main..`, `..main`, `HEAD~3..`, `main...`).
  - Each non-empty half passes the ref shape test and resolves through the quoted commit peel. Use the range as given, assembled and single-quoted (`git diff '<BASE>..<HEAD>'`).
  - A non-empty half fails the test or does not resolve → refuse, naming the argument and the half that failed, and dispatch nobody.
  - Both halves are empty (`...` alone) → no range: refuse, naming the argument, and dispatch nobody.
- **A branch**: no `..`, passes the ref shape test, and resolves through the commit peel.
  - The range is `merge-base(base, branch)..branch`.
  - A branch a live run root names takes its range base instead, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`: `<range-base>..branch`.
- **A path outside the checkout**: it exists on disk and `git ls-files -- '<path>'` exits non-zero, git reporting the path outside the repository.
  - It resolves to nothing: stop, name the argument, say it lies outside the checkout, and dispatch nobody.
  - Git decides from the quoted input, so the test needs no path normalization (ADR 0150).
  - `..` or `../x` at the top level takes this shape. A path through `..` that stays inside the work tree (`../plugin` from a subdirectory) passes the test and takes the path shapes below.
- **A path naming the checkout's top level** → the Empty shape, exactly as if no argument were given (ADR 0165, INV-0168).
  - A path names the top level when both git calls succeed: `git -C '<path>' rev-parse --show-toplevel` prints the invoking checkout's own `git rev-parse --show-toplevel`, and `git -C '<path>' rev-parse --show-prefix` prints nothing. Compare the two strings as git prints them, with no path normalization (ADR 0150). Any non-zero exit means the path does not name the top level.
  - Taking the Empty shape: `.` and `./` at the top level, the absolute top-level path, and a symlink to it.
  - Keeping the path shape: `.` from a subdirectory, any subdirectory, a submodule root, a nested repository, another linked worktree's root, the git directory, and a file.
- **A path or area**: it exists on disk inside the checkout, is no ref, and does not name the top level.
  - The range is the diff of the current branch against base, scoped to the path: `git diff <merge-base>..HEAD -- '<path>'`, or `git diff HEAD -- '<path>'` when uncommitted changes lie there.
  - When HEAD is a branch a live run root names, `<merge-base>` is the range base per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`. Any other HEAD keeps the merge-base.
- **Standing code**: that same path where the scoped diff comes back **empty**. The subject is the files under it at `HEAD`, reviewed as they are rather than as a change.
  - A path with a non-empty scoped diff keeps that diff.
  - The path exists and holds no files → say there is nothing to review and dispatch nobody.
- **Empty** → the cascade of the next concept.
- **A scope slug** → the concept after the cascade, reached only once every shape above fails.

**The empty cascade.** Applies to an absent argument and to a path naming the top level. Review the first subject below that exists.

1. **The working tree carries uncommitted changes** (`git diff HEAD` non-empty) → review those. Say in one line which eligible scope this passed over when one exists: the single run root step 3 would have found, named by a quick best-effort scan. Several or none → say nothing extra.
2. **`merge-base(base, HEAD)..HEAD` is non-empty** → review that. When HEAD is a branch a live run root names, the range base per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base` replaces the merge-base: `<range-base>..HEAD`. Any other HEAD keeps `merge-base(base, HEAD)`.
3. **Not under `--chained`** → run `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Resolving an empty argument` cascade over the run roots at stage `merged` or `documented-unreviewed`, the stages the chain hands to this review.
   - Its resolved candidate is a scope slug. Resolve its range as the scope-branch concept below states.
   - Several candidates still put the question, and block under `--unattended`, as `## Resolving an empty argument` states.
   - **No candidate** → go on to step 4. This review adds step 3 after the shared cascade, so the cascade's own **No candidate** stop does not apply here (ADR 0165, INV-0077).
4. **Otherwise** → **standing code of the whole repository**: the files at `HEAD`, the standing-code shape applied to the top level.
   - Before any reviewer starts, the range announcement lists every run root with its stage (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Resolving an empty argument`, *Run-root enumeration*) and adds a `/superdev:review <scope-slug>` line for the operator who meant a run. A repository with no run root says so.
   - The review is ad-hoc, attended or unattended: no ledger write, no run lock, no fix loop.
   - No files at `HEAD` → say there is nothing to review and dispatch nobody.

**A scope slug.** Applies to an argument that fails every shape above: no `..`, no ref (the ref shape test or the quoted commit peel fails), and no path on disk. Validate it against `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope slug` charset (`[a-zA-Z0-9][a-zA-Z0-9_-]*`, the test `lib/ledger.js`'s `SLUG_RE` applies) first. Address `.superdev/scopes/<arg>/` only after the slug passes.

- **The slug fails** (a `../`-shaped argument among them) → stop, name the argument and each shape it failed (the ref shape test or `git rev-parse`, no path on disk, the slug charset), and dispatch nobody.
- **It passes and a run root exists for it** (a `<run-root>/ledger.md` per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## A live scope run`) → resolve its range as the scope-branch concept below states.
- **No run root names the argument** → it resolves to nothing: no ref, no path on disk, no run root. Stop, name the argument and each shape it failed, and dispatch nobody. Only an absent argument and a path naming the top level reach the Empty shape.

**The scope branch's range.** Applies to a scope slug that names a run root, from the empty cascade or from a scope-slug argument. Take `<branch>` from the scope's `**Branch:**` line (`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get branch --root <run-root>`). Verify it with `git rev-parse --verify --quiet '<branch>^{commit}'`. The range is `<range-base>..branch`.

- The range base comes from `scope.js base resolve --branch <branch> --base <base> --root <run-root>` per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`.
- No such line, or the named branch does not verify → take `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope branch` shape-scan fallback and say which route was taken.
- The scope-mode bullet of the parse concept then recognizes a live run.

**The range announcement.** Applies after the range resolves and before any dispatch. State the concrete range or target (`Reviewing a1b2c3..d4e5f6`, or `Reviewing working tree changes incl. untracked`).

**The reviewed tip.** Applies to an ad-hoc subject that ends at a commit, at the range announcement. Resolve that commit to a full commit with `git rev-parse --verify '<ref>^{commit}'` and keep it as the reviewed tip §3's inline fix cuts from.

- **Ends at a commit**: a `BASE..HEAD` or `BASE...HEAD` range (its right half, `HEAD` when empty), a branch, a path diff over committed changes (`HEAD`), standing code (`HEAD`), and the empty cascade's committed range (`HEAD`).
- **Ends at no commit**: the working tree's uncommitted changes, and a path diff resolved as `git diff HEAD -- '<path>'`.

**The size caution** (qualitative, non-blocking). Applies to the range announcement. Glance at `git diff --stat`, or on a standing-code target at the file count under it (`git ls-files -- '<path>'`, the whole tree for the top level). Never block on it.

- **The change spans enough files or churn that one review pass would likely miss things** (a judgment call and no line count) → say so beside the announcement (`large, multi-concern diff; consider splitting it via /superdev:plan`) and proceed.

## 2. Review (parallel, read-only)

**The dispatch.** Applies to every review. Dispatch both reviewers in parallel with an explicit `model` each. Scale the dispatch by the skip rules below.

**The `final-reviewer` dispatch** (`model: opus`). Applies to every dispatch of `superdev:final-reviewer`. Its `### What the dispatch hands you` owns each input's handling. This dispatch restates none of it. A scope review's inputs take the shapes of `## 2. Review` in `${CLAUDE_PLUGIN_ROOT}/references/review-scope-mode.md`.

- **Summary**: one line of what changed, derived from the diff unless the trailing description supplied one.
- **Acceptance**: §1's `acceptance`.
- **Subject**: the git range. On a standing-code target (§1's standing-code shape) hand the path and its file set at `HEAD` in place of a range, and derive the summary from that file set.
- **Suite result**: the focused-run concept below hands it.

**The focused run** (ADR 0179). Applies to every ad-hoc dispatch of `final-reviewer`, and to a scope review's entry run, which `${CLAUDE_PLUGIN_ROOT}/references/review-scope-mode.md`'s `### 4.2 The suite gate` adapts to the scope range (ADR 0192). The bullets below decide which run an ad-hoc dispatch gets.

- **A test command is configured in `docs/agents/verification.md` and the subject's tip is the checked-out tree** → run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test focused <changed paths>` once from the invoking checkout before the dispatch, and hand the reviewer that result labelled focused.
- **Every test run** passes Bash's `timeout` at its ceiling, 600000 ms unless `BASH_MAX_TIMEOUT_MS` raises it, and runs in the foreground. A run that can outlast the ceiling runs in the background, and you wait for its end.
- **The changed paths** are the paths the subject's diff changes that exist in the tree. A subject left with none runs no test.
- **The subject's tip is the checked-out tree** when the subject is the working tree's uncommitted changes, or when its range ends at the commit `git rev-parse HEAD` names and `git status --porcelain` prints nothing.
- **Any other subject runs no test**: a range that ends elsewhere, another branch, and a standing-code target. Hand the reviewer `not run: <reason>` (the tip is not checked out, the working tree is dirty, standing code has no change, or no test command) and name the reason in your report.
- **The operator asks for the full suite** in this invocation's arguments or in the conversation → run `test full` in place of the focused run, under the same tip condition, and hand it labelled full. `--chained` never runs it.

**The `simplicity-reviewer` dispatch** (`model: sonnet`). Applies to every dispatch of `superdev:simplicity-reviewer`. Hand it the same git range. Its `## Scope of the review` owns the lens.

**The warranted cut** (ADR 0228). Applies to every cut `simplicity-reviewer` recommends, in both modes. Warrant a cut only when it honours the rules the repository documents for itself: its `AGENTS.md` or `CLAUDE.md` files, its `docs/agents/` configuration, and its invariant register. A repository that documents none leaves the cut to your judgment alone. This is the rule `${CLAUDE_PLUGIN_ROOT}/references/implement-full.md` applies per slice.

- **A warranted cut** joins the findings as a Minor finding. It blocks nothing on its own and still enters the fix set.
- **A declined cut** is named in §3's report with the rule it would break, and enters no fix set.

**The skip rules.** Applies to every review. Evaluate them in this order.

- **A scope review** → `${CLAUDE_PLUGIN_ROOT}/references/review-scope-mode.md`'s `## 2. Review` decides a `full`-tier scope whose every slice is `behavior` first, and the rules below decide every other subject (ADR 0210).
- **A standing-code target** (§1's standing-code shape) → `final-reviewer` alone, reporting `` not dispatched — standing code, no diff to review ``.
- **A tiny diff** (a handful of lines) → `final-reviewer` alone.
- **Nothing plausible to cut** (docs-only, or already lean) → skip `simplicity-reviewer`.
- **`final-reviewer`** is never skipped.

**The reviewers' integration limit.** Applies to both reviewer dispatches. Ask neither reviewer to integrate. `plugin/hooks/merge-guard.js` denies a subagent's Bash call that runs a command below. The controller's own calls pass.

- `git merge`, `git push`, `git rebase`, `git pull`, or `git subtree push`, whatever git option or inline alias reaches it;
- `scope.js push`;
- `gh pr merge` or `tea pr merge` (tea's `pulls` and `pull` names for `pr` included);
- a `gh api` or `tea api` write to a pull request's `/merge` endpoint.

**The slice reviewer.** Applies to every review. Dispatch no `superdev:slice-reviewer`. `${CLAUDE_PLUGIN_ROOT}/references/review-scope-mode.md`'s `## 2. Review` states the one exception, an Unreviewed slice finding, and the report contract of that dispatch: the reviewer appends its full findings to the slice's progress log and returns a summary.

**A denied `final-reviewer` dispatch.** Applies when the permission classifier denies the dispatch. The denial is a degraded pass. Follow `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes` section.

- **Attended** → review inline yourself and say so in §3's report.
- **A live scope run** → also take the writes of `${CLAUDE_PLUGIN_ROOT}/references/review-scope-mode.md`'s `## 2. Review`.
- **`--unattended`** → that section's authorship rule decides: **block** where the controller authored what the review verifies, which the tier answers, and otherwise review inline as the attended branch does.

## 3. Report

**The consolidated report.** Applies to every review. Consolidate both verdicts into **one** report. Never relay them side by side.

```
### Strengths
[merged from both reviewers, deduped]

### Issues
#### Critical (must fix)
#### Important (should fix)
#### Minor (nice to have)
file:line · what's wrong · why it matters · how to fix (if not obvious)

### Over-engineering cuts
[simplicity-reviewer's findings, if dispatched, each marked warranted or declined — a declined cut with the rule it would break; omit this section if it wasn't]
net: -<N> lines possible   (zero included; "net: +<N> lines possible" when a clearer shrink: makes the cuts add more lines than they remove; "Lean already" if nothing to cut)

### Assessment
Full-suite run: [pass | fail | not run | denied — degraded pass]
Correctness: [ready | not ready]. Simplicity: [N cuts warranted, M declined | Lean already | not dispatched — <reason>].
Ready to merge? [Yes | No | With fixes]
Reasoning: [1–2 sentences]
```

**The per-axis line.** Applies to the Assessment's `Correctness` and `Simplicity` entries. They add to the combined `Ready to merge?` verdict. They never replace it.

- A warranted cut is a Minor finding, and gates merge no more than any other Minor (§2's warranted-cut concept).
- **Correctness**: `final-reviewer`'s `Ready to merge?` line.
- **Simplicity**: `simplicity-reviewer`'s `net: -N lines possible`, `net: +N lines possible`, or `Lean already`. A reviewer not dispatched reads `not dispatched — <reason>`, naming the skip rule that applied (for example `not dispatched — standing code, no diff to review`).
- **A scope review's** combined verdict also follows `${CLAUDE_PLUGIN_ROOT}/references/review-scope-mode.md`'s `## 3. Report`.

**The inline-fix gate** (ADR 0228). Applies to an ad-hoc review once its report is out. Offer the inline fix only when every condition below holds.

- The run is attended, with neither `--chained` nor `--unattended`.
- No Critical or Important finding stands.
- The focused run did not come back `fail`. A `not run` passes.
- At least one Minor finding or warranted cut stands (§2's warranted-cut concept).
- The subject has a reviewed tip (§1's reviewed-tip concept).
- No branch `review-fix/<git rev-parse --short=12 <tip>>` exists yet. An existing one is named in the report, and no second fix is offered. Where it still points at the tip, the report names the `git branch -D review-fix/<short>` that brings the offer back. Where `git worktree list` shows that branch checked out, the report first names `git worktree remove --force <path>`, with the worktree's path as that list shows it, because git deletes no branch a worktree has checked out. Where it carries commits beyond the tip, the report names those commits and leaves the choice of keeping or deleting them to the operator.

**The inline-fix question.** Applies when the gate holds. Ask one `AskUserQuestion`: fix the Minors inline, or leave them. On yes, read `${CLAUDE_PLUGIN_ROOT}/references/review-inline-fix.md` and follow it to its report.

**Apply nothing otherwise.** Applies to an ad-hoc review outside the inline fix. Apply no change to the reviewed tree. Never edit, commit, or merge yourself, however small the fix looks.

- A Critical or Important finding goes to `/superdev:plan`, the command this run's Next block names, and then `/superdev:implement`.
