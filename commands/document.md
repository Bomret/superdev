---
disable-model-invocation: false
description: Reconcile the project's documentation with the current state of the code — run the in-repo docs pass and the optional knowledge-base pass, adding what's new and removing stale/obsolete text. Runs at the end of /superdev:implement and on demand at any time.
argument-hint: "[BASE..HEAD | area/path | (empty = full reconcile)]"
---

# superdev document

Bring the docs and the knowledge base into agreement with reality. Dispatches the isolated
**`superdev:doc-writer`** subagent to do the work; you (the controller) just scope it and report.

## 1. Config

- Read `docs/agents/documentation.md` (in-repo documentation convention) and `docs/agents/knowledge-base.md`
  (KB backend, audience, language, outline — may be "none").
- Neither documentation config present → this repo hasn't been set up for superdev docs; suggest
  `/superdev:setup` and stop.

## 2. Scope

From `$ARGUMENTS`:

- **A git range** (`BASE..HEAD`) or an **area path** → a focused reconcile of what changed there.
  (`/superdev:implement` passes `merge-base(base, scope)..<scope>`.)
- **Empty** → a **full reconcile**: all in-repo docs (README + the whole `AGENTS.md` tree) + the KB
  against current repo state.

## 3. Dispatch

Dispatch **`superdev:doc-writer`** with an **explicit `model`** (`sonnet`; `haiku` for a tiny focused
range). Hand it: the scope (range/area/"full"), the two config file paths, and — for a range — a
reminder to start from `git diff --stat`/`git log` over that range. It runs two passes (in-repo docs, then
KB per its outline/language/audience, human-first), **deleting stale/obsolete text**, and commits its
doc changes on the current branch.

## 4. Report

Relay what the doc-writer changed: which `AGENTS.md`/docs were updated, what was removed as stale, which
KB pages were updated/created (or that the KB pass was none/skipped), and any concerns (e.g. a missing
KB token). Do not re-do its work.
