# Verify skill

**The verify skill.** Applies to every reader of this file. A repository's **verify skill** (CONTEXT.md) holds the procedure to start, drive, inspect, and stop its running app (ADR 0277). This file owns where its path is recorded, what the file holds, how a builder or a fixer follows it, and what setup does with it.

## The section

**The section.** Applies to `docs/agents/verification.md`'s `## Verify skill` section. It holds one repository-relative path to a skill file, or `none`, in a backtick span. It never holds a fenced block, because the full and focused readers take the document's fences by index (INV-0069).

````markdown
## Verify skill

`.claude/skills/verify/SKILL.md`
````

**An absent section.** Applies to a `verification.md` with no `## Verify skill` section, and to a repository with no `verification.md`. It reads as `none`.

**Drift.** Applies to the section's content. An absolute path, a `~` path, a directory, more than one path, and `none` beside a path are drift.

## The scaffold

**The sections.** Applies to the skill file `/superdev:setup` drafts. It carries each of these level-2 headings with exactly this name, and a reader recognizes a section by its heading alone:

- `## Start`: how to start the app for this checkout, and the readiness check that shows it is up.
- `## Drive`: how to exercise it, such as requests to send or commands to run.
- `## Inspect`: where to read what it did, such as responses, logs, or a data store.
- `## Stop`: how to stop it and remove everything Start and the app wrote outside ignored paths, so the checkout's status reads as it did before Start. It succeeds when no instance runs, and acts on this checkout's instance alone, identified by `## Isolation`, leaving a parallel checkout's instance running.
- `## Isolation`: how several checkouts run it side by side, each with its own port, instance name, and data store.
- `## Untracked inputs`: each input a checkout needs that git does not hold, named by variable or file name, never by value, and how a checkout gets it.
- `## May touch`: the state its own instance owns, inside the verification ceiling (`scope-mode.md`'s `## Verification ceiling`).

**Plain text.** Applies to every section's content. A reader takes the file as plain text, so a `!` command injection, `$ARGUMENTS`, and `${CLAUDE_SKILL_DIR}` stay unexpanded. The scaffold uses none of them.

**The frontmatter.** Applies to the scaffold's frontmatter. It carries `disable-model-invocation: true`. The operator runs it as `/verify`. At the repo root, a project skill at `.claude/skills/verify/SKILL.md` replaces the bundled `/verify` (Claude Code skills docs, https://code.claude.com/docs/en/skills.md, checked 2026-11-23). No session loads its description or starts the app unasked, and a builder still reads it as a file by its path.

````markdown
---
name: verify
description: Start, drive, inspect, and stop this repository's app against a change.
disable-model-invocation: true
---

# Verify

## Start
## Drive
## Inspect
## Stop
## Isolation
## Untracked inputs
## May touch
````

## Following the skill

**Who follows it.** Applies to every builder or fixer handed a skill path other than `none`. A builder follows it on a `behavior` slice: the implementer on a slice dispatch or a slice fix dispatch, and the controller building the slice inline. A fixer follows it when a finding in its list changes behavior (**A behavior-changing finding**): the implementer on a review fix dispatch or a sweep fix dispatch, and the controller fixing inline where that dispatch was denied. Follow it against your own change after your final test run and before your self-check or report. Following the skill is no test run (INV-0017 governs test runs alone). An implementer reports each concern this section names as `DONE_WITH_CONCERNS` and names it, and the controller following inline names it in its own report.

**A behavior-changing finding.** Applies to every reader that decides whether a finding changes behavior: the fixer, the scope review's report check, and the sweep re-review. A finding changes behavior when it is no mechanical finding (`skills/implement/SKILL.md`'s **A mechanical finding**) and its fix touches a file outside the test paths and outside documentation. The test paths are `docs/agents/verification.md`'s `## Test paths`, the defaults where it has none, and documentation is the `AGENTS.md` hierarchy, `README.md`, and `docs/`.

**The target.** Applies to what you drive and inspect. A builder drives each acceptance item of its slice. A fixer drives, after its fix, the behavior each behavior-changing finding's remedy should produce. An observation that contradicts the target is a failing check: fix again, and report a contradiction you cannot resolve as that finding still open, a concern, with your commits kept.

**Read it.** Applies before the first step, on every route. Read the skill file from your checkout by the handed path, as plain text.

- **The file is missing from your checkout**, or lacks a `## Start` or `## Stop` heading → a concern. It never reads as `none`.
- **A section the work needs holds an unresolved `TODO`** → the same concern.

**A committed tree.** Applies once the file reads whole. Commit your own change first. Start the skill only when `git status --porcelain` prints nothing, an untracked file outside ignored paths included. A tree that still prints something is a concern naming what it printed.

**Stop before Start.** Applies once the tree is committed. Run the skill's `## Stop` before its `## Start`, so an instance an earlier, ended run left in this checkout stops first. A Stop that fails there is a concern naming the failed Stop. On that concern, or on an uncommitted tree's, nothing starts, and every item the skill would observe reads `not observable`.

**Start, drive, inspect.** Applies once that first Stop succeeded. Start the app in the background (Bash `run_in_background`) and wait for the readiness check its `## Start` names. Drive it and inspect what it did against the target, by its `## Drive` and `## Inspect`. Keep each observation as you saw it, for your self-check or report to quote.

**Stop on every exit.** Applies to every way the work ends once Start ran: `DONE`, a concern, `BLOCKED`, `NEEDS_CONTEXT`, a failed Start, and a timeout. Run the skill's `## Stop` before you report.

**Untracked inputs.** Applies to every input the skill's `## Untracked inputs` names. It comes through the environment or by the skill's own instruction. Never print, quote, or commit its value.

**A clean tree.** Applies once the app ran. After the last Stop, `git status --porcelain`, which leaves ignored files out, reads exactly as it read right after the first Stop: no file the app wrote stays untracked, no tracked file stays modified, and you commit nothing the app wrote. A later traced run then reads the tree `clean`, and the worktree removes without `--force`.

**The verification ceiling.** Applies to every step. The instance the skill starts for your checkout, with the state it alone owns, is inside the ceiling (`scope-mode.md`'s `## Verification ceiling`). Skip a step that would touch state outside the skill's `## May touch`, or state shared with the main checkout or a third-party service. The item that step would observe reads `not observable`.

## Setup runs no step

**No step runs.** Applies to `/superdev:setup`. Setup drafts and writes the verify skill and runs none of its steps: no Start, no Drive, no Inspect, and no Stop.
