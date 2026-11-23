# Verify skill

**The verify skill.** Applies to every reader of this file. A repository's **verify skill** (CONTEXT.md) holds the procedure to start, drive, inspect, and stop its running app (ADR 0277). This file owns where its path is recorded, what the file holds, and what setup does with it.

## The section

**The section.** Applies to `docs/agents/verification.md`'s `## Verify skill` section. It holds one repository-relative path to a skill file, or `none`, in a backtick span. It never holds a fenced block, because the full and focused readers take the document's fences by index (INV-0069).

````markdown
## Verify skill

`.claude/skills/verify/SKILL.md`
````

**An absent section.** Applies to a `verification.md` with no `## Verify skill` section, and to a repository with no `verification.md`. It reads as `none`.

**Drift.** Applies to the section's content. An absolute path, a `~` path, a directory, more than one path, and `none` beside a path are drift.

## The scaffold

**The sections.** Applies to the skill file `/superdev:setup` drafts. It carries each of these level-2 headings with exactly this name, and a reader recognises a section by its heading alone:

- `## Start`: how to start the app for this checkout, and the readiness check that shows it is up.
- `## Drive`: how to exercise it, such as requests to send or commands to run.
- `## Inspect`: where to read what it did, such as responses, logs, or a data store.
- `## Stop`: how to stop it and remove what Start created.
- `## Isolation`: how several checkouts run it side by side, each with its own port, instance name, and data store.
- `## Untracked inputs`: each input a checkout needs that git does not hold, named by variable or file name, never by value, and how a checkout gets it.
- `## May touch`: the state its own instance owns, inside the verification ceiling (`scope-mode.md`'s `## Verification ceiling`).

**Plain text.** Applies to every section's content. A reader takes the file as plain text, so a `!` command injection, `$ARGUMENTS`, and `${CLAUDE_SKILL_DIR}` stay unexpanded. The scaffold uses none of them.

**The frontmatter.** Applies to the scaffold's frontmatter. It carries `disable-model-invocation: true`. The operator runs it as `/verify`, no session loads its description or starts the app unasked, and a builder still reads it as a file by its path.

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

## Setup runs no step

**No step runs.** Applies to `/superdev:setup`. Setup drafts and writes the verify skill and runs none of its steps: no Start, no Drive, no Inspect, and no Stop.
