---
description: Reconcile the project's docs and optional knowledge base with the current state of the code, removing stale text. Runs at the end of /superdev:implement and on demand at any time.
argument-hint: "[BASE..HEAD | area/path | (empty = full reconcile)]"
---

# superdev document

Bring the docs and the knowledge base into agreement with reality. Dispatches the isolated
**`superdev:doc-writer`** subagent to do the work, then reader-tests the result with the fresh-context
**`superdev:doc-reader`**; you (the controller) just scope, relay, and report.

## 1. Config

- Read `docs/agents/documentation.md` (in-repo documentation convention) and `docs/agents/knowledge-base.md`
  (KB backend, audience, language, outline — may be "none").
- Neither documentation config present → this repo hasn't been set up for superdev docs; suggest
  `/superdev:setup` and stop.

## 2. Range

From `$ARGUMENTS`:

- **A git range** (`BASE..HEAD`) or an **area path** → a focused reconcile of what changed there.
  (`/superdev:implement` passes `merge-base(base, superdev/<scope>)..superdev/<scope>`.)
- **Empty** → a **full reconcile**: all in-repo docs (README + the whole `AGENTS.md` tree) + the KB
  against current repo state.

## 3. Dispatch

Dispatch **`superdev:doc-writer`** with an **explicit `model`** (`sonnet`; `haiku` for a tiny focused
range). Hand it: the range (git range/area/"full"), the two config file paths, and — for a range — a
reminder to start from `git diff --stat`/`git log` over that range. It runs two passes (in-repo docs, then
KB per its outline/language/audience, human-first), **deleting stale/obsolete text**, and commits its
doc changes on the current branch.

## 4. Reader test

Skip if the doc-writer changed nothing.

From the doc-writer's report, collect the changed doc files — in-repo docs and **local** KB pages
(software-KB pages are out of scope). Dispatch **`superdev:doc-reader`** with an **explicit `model`**
(`sonnet`) and that file list **only** — no range, no history, no summary of the work: it reads the
docs cold and verifies their claims against the repo, read-only.

If it reports findings, re-dispatch **`superdev:doc-writer`** (as in §3) with the findings to fix.
**One fix round** — don't loop the reader; unresolved findings go in the report instead.

## 5. Report

Relay what the doc-writer changed: which `AGENTS.md`/docs were updated, what was removed as stale, which
KB pages were updated/created (or that the KB pass was none/skipped), the reader-test tally (including
any findings left unresolved after the fix round), and any concerns (e.g. a missing KB token). Do not
re-do its work.
