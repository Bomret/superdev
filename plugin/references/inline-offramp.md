# Inline off-ramp

**The off-ramp.** Applies to `/superdev:brainstorm` §6 and `/superdev:plan` §1, at the point each skill names. Follow the sections in order, from the question to the exit report. The calling skill owns when it offers the question and what it does with its own intent and drafts.

**The values.** Applies to every section.

- `<slug>`: a short kebab-case name for the work, in the form `scope-mode.md`'s scope-slug rule admits.
- `<main>`: the main working tree, resolved as `review-inline-fix.md`'s **The values** resolves it.
- `<tree>`: `<main>/.superdev/inline/<slug>`.
- `<branch>`: `inline/<slug>`.
- `<cut>`: the commit `<branch>` was cut from, `git -C <tree> rev-parse HEAD` right after the cut.

**No store or host write.** Applies to every section. The off-ramp writes nothing to the slice store or the code host (INV-0206). The one exception is the intent settle the calling skill owns.

## 1. The criterion

**No `behavior` slice.** Applies before the question. Offer the off-ramp only when the agreed scope would carry no `behavior` slice (CONTEXT.md *Test-applicability*). Every other scope gets no question.

## 2. The question

**One question.** Applies once the criterion holds. Ask one `AskUserQuestion` with two options, "inline here" and "continue superdev". Its text names the expected kind of change, mechanical, docs, or no code change, and the concrete reason the scope carries no `behavior` slice.

- **No concrete reason** → ask no question. The calling skill goes on as without the off-ramp.
- **"continue superdev"** → the calling skill goes on as without the off-ramp.
- **"inline here"** → go to `## 3. The worktree`.

## 3. The worktree

**Ignore `.superdev/`.** Applies first. Run the ignore check of `review-inline-fix.md`'s `## 1. The ignore check`, with its three outcomes.

**Cut the worktree.** Applies once the ignore check passed. Run `git -C <main> worktree add -b <branch> <tree> HEAD`, never `-B`. The cut comes first, so the calling skill disposes of its intent and drafts only after it succeeded.

- **The command fails** (the branch exists, the directory exists, a worktree registration names the path, the ref name is invalid, or `HEAD` names no commit) → the off-ramp ends here. The calling skill removes, deletes, and writes nothing more, so every intent, record, and draft stays as it was. Its closing message ends on its Next block with a `Blocked: <what git reported>` line, and the fence holds the calling skill's own command, `/superdev:brainstorm` or `/superdev:plan`.
- **It succeeds** → tell the operator `<tree>` and `<branch>`. Say that uncommitted changes in the invoking checkout are not carried over.

## 4. The work

**Work in the worktree.** Applies to every edit, git call, and command of the inline work. The session never switches into `<tree>`. Edit every file by its absolute path under `<tree>`, run every git call as `git -C <tree>`, and run every other command in a subshell, `(cd <tree> && <command>)`, so the session's own working directory stays where it was.

## 5. The closing checks

**Prepare, then run the focused command.** Applies once the inline work is done. In `<tree>`, by `## 4. The work`'s subshell form, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" prepare <tree>` when `<tree>`'s `docs/agents/verification.md` sets a `## Prepare command`. Then run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test focused --since <cut>`, which takes committed, uncommitted, and untracked changes alike. Run each in the background, its exit status written into its output file, and wait for its end with Bash calls that each end within 170 s (`test-selection.md`'s `## The two commands`).

- **No `docs/agents/verification.md`, no focused fence, or no path changed since `<cut>`** → run no test and record `not run: <reason>`.
- **A failed preparation** → record `not run: <the command and its reason>`.

## 6. The exit report

**The report.** Applies at the end of the off-ramp. Report these items.

- `<tree>` and `<branch>`.
- `<cut>`.
- The focused-run outcome, or its `not run: <reason>`.
- That committing, merging, `git -C <main> worktree remove <tree>`, and `git -C <main> branch -D <branch>` stay the operator's.
- The offered review: after committing, run an ad-hoc `/superdev:review <cut>..<branch>`. A working-tree review from the main checkout sees the ignored worktree as empty.
