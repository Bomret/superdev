# Inline fix

Applies to an ad-hoc `/superdev:review` once the operator answered yes to `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` §3's inline-fix question. The skill reads this file at that point, and no other command reads it. Follow the steps in order to the report.

- `<tip>`: the reviewed tip §1 resolved, a full commit.
- `<short>`: `git rev-parse --short=12 <tip>`.
- `<branch>`: `review-fix/<short>`.
- `<main>`: the main working tree, resolved as `lib/main-work-tree.js` resolves it. Take the parent of `git rev-parse --path-format=absolute --git-common-dir`, or the `core.worktree` that git directory's own config names (a submodule). Normalize the path before you compose with it.
- `<tree>`: `<main>/.superdev/review-fixes/<short>`, the **Fix worktree** (CONTEXT.md).
- `<list>`: every Minor finding of the review and every warranted cut, each as quoted data.

**No step writes to the operator's checkout.** Its `HEAD`, index, working tree, and branch tips stay as they are, and so does the tracked `.gitignore`. Review merges, pushes, and opens nothing at any step.

## 1. The ignore check

Run `git -C <main> check-ignore -q .superdev/`. Exit 0 → continue. Exit 1 → append the line `.superdev/` to `info/exclude` in the git directory `<main>` resolved, never to `.gitignore`. Any other exit → stop and report the exit and what git reported. Nothing is created yet, so nothing needs cleanup.

## 2. The branch and the worktree

Run `git -C <main> worktree add -b <branch> <tree> <tip>`, never `-B`.

- **The command fails** (the branch exists, the directory exists, a worktree registration names the path, or a ref clashes) → stop. Name what git reported. Remove nothing and delete nothing, since none of it is this run's own. Offer no second fix.

## 3. The preparation

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" prepare <tree>`, per `${CLAUDE_PLUGIN_ROOT}/references/scope-branch.md`'s `## Preparing a worktree`.

- **A non-zero exit** → stop. Run **The early-exit cleanup** below and report the command and its exit.

## 4. The inline fix dispatch

Dispatch one `superdev:implementer`. This is the inline fix dispatch of the implementer's own contract, which owns the RED-test rule, the test-run bound, the fail-to-pass run, and the report. Restate none of it beyond the bullets below.

- **Model**: `opus`. `haiku` only when every item in `<list>` is mechanical, one whose fix changes no stated rule or behaviour.
- **Working directory**: `<tree>`, where its commits land on `<branch>`.
- **Findings**: the complete `<list>`, and `<cycle-base>` = `<tip>`. One implementer takes the whole list.
- **Hand no `dod.md`, no run root, and no progress log.** The fix worktree is no run root.
- **Separate calls**: tell the implementer to run any revert, each test run, and the restore as separate Bash calls.
- **Sibling surfaces**: require the implementer to bring each sibling surface in `<tree>` into agreement with the rule or behaviour its fix changes, and to report each place it checked and each it changed. It reports a place outside `<tree>`, the `AGENTS.md` hierarchy, and the knowledge base unedited.

**You apply no fix yourself**, also when the dispatch is denied.

- **The dispatch is denied, or the report reads `BLOCKED` or `NEEDS_CONTEXT`** → stop. Run **The early-exit cleanup** below and report the reason.
- **`<branch>` still points at `<tip>`** (the implementer committed nothing) → stop. Run **The early-exit cleanup** below and say so.
- **A report with no checked-and-changed list of sibling surfaces** → send it back to the implementer once, as a report defect.

## 5. The focused run

With `<tree>` as the working directory, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test focused <paths>` once. `<paths>` are the paths `git -C <tree> diff --name-only --no-renames <tip> HEAD` lists that exist in `<tree>`.

- **No path, or no test command configured** → run no test and record `not run: <reason>`.
- Every test run passes Bash's `timeout` at its ceiling, 600000 ms unless `BASH_MAX_TIMEOUT_MS` raises it, and runs in the foreground. Only a run that can outlast the ceiling runs in the background, and you wait for its end.

## 6. The warm re-review

Continue the review's own `final-reviewer` through SendMessage. Its subject is the fix range `<tip>..<fix-tip>` as full commits, `<fix-tip>` being `git -C <tree> rev-parse HEAD`.

- Hand it the step 5 result labelled focused, and `<list>` as quoted data.
- Its instruction: close or keep each listed item, a warranted cut it did not raise included, and report any defect the fix introduced.
- Hand it no implementer report text. It reads the code and the range.
- **The resume fails, is denied, or ends other than `completed`** → dispatch a fresh `superdev:final-reviewer` (`model: opus`) with the same subject and inputs.

This is the only cycle. Run no second cycle, no full suite, and no `simplicity-reviewer`, and read no run trace.

## 7. The cleanup

Run `git -C <main> worktree remove <tree>`, never with `--force`.

- **Git refuses because the worktree is dirty** → keep it and name it in the report.
- Keep `<branch>` in every case.

## 8. The report

Report each item below. Then close per the skill's closing-message concept.

- `<branch>` and its commits, `git -C <main> log --oneline <tip>..<branch>`.
- What changed, one line per item of `<list>`.
- The step 5 result.
- What the re-review still lists, by severity.
- How the operator brings the branch in: `git merge <branch>`, or `git cherry-pick <tip>..<branch>`.
- A kept dirty worktree, by path.

## The early-exit cleanup

Applies to a stop at step 3 or step 4. Run `git -C <main> worktree remove <tree>`, never with `--force`. Then delete `<branch>` with `git -C <main> branch -D <branch>` only when it still points at `<tip>`.

- **A branch with commits beyond `<tip>`** → keep it and name it in the report.
- **A dirty worktree** → git refuses the removal, and `<branch>` stays too, because git deletes no branch a kept worktree has checked out. Name both in the report. Where `<branch>` still points at `<tip>`, tell the operator to remove both before a later review can offer an inline fix for `<tip>` again: `git worktree remove --force <tree>`, then `git branch -D <branch>`. Where it carries commits beyond `<tip>`, name those commits and leave the choice of keeping or deleting them to the operator.
- The report names the step that stopped and what this cleanup removed and kept.
