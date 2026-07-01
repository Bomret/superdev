# superdev

A self-contained Claude Code plugin for the full **plan → implement** loop, with **no prerequisite
plugins**. Interview-driven vertical slicing, parallel execution in isolated git worktrees with
separate implementer/reviewer subagents, deterministic guardrails, and a pluggable slice store + code
host.

```
/superdev:setup      → write docs/agents/{issue-tracker,code-management}.md (once per repo)
/superdev:plan       → interview + slice a feature into the slice store
/superdev:implement  → drive the slices to merge, then open the PR
```

## What it does

- **`/superdev:plan`** — a relentless interview pins intent and a Definition of Done, captures ADRs +
  a glossary as decisions surface, then decomposes the work into **independently-green vertical
  tracer-bullet slices** with explicit `depends-on` dependencies, written to the configured store.
- **`/superdev:implement`** — the controller drives the slices as a **dependency-ordered DAG**:
  unblocked slices run in **parallel** as `implementer` subagents in isolated worktrees (TDD + lazy
  "ponytail" minimalism); each behavior slice is gated by a separate **correctness reviewer** and an
  **over-engineering reviewer**; the controller merges **serially**; when all slices land, one
  **whole-scope review** gates the **PR**.
- **`/superdev:setup`** — records the backends in `docs/agents/*.md` so the workflow never hardcodes a
  tool.

## Roles (subagents)

`implementer`, `slice-reviewer`, `ponytail-reviewer`, `final-reviewer` — each runs in an isolated
context; only its result returns to the controller.

## Guardrails (deterministic hooks)

Cross-platform Node hooks (`node` is a Claude Code runtime dependency — no bash/PowerShell variants):

- **merge-guard** — blocks `git merge`/`push`/`rebase` from inside subagents (scoped by `agent_id`);
  the controller integrates.
- **model-explicit** — blocks a dispatch to a superdev subagent that omits an explicit `model`, so cost
  is always warrant-scaled.

## Pluggable backends

Configured once via `/superdev:setup`, stored in `docs/agents/`:

- **Slice store** — local plan file (`docs/plans/`) · Jira · *other* (freeform).
- **Code host** — GitHub (`gh`) · Forgejo/self-hosted (`tea`/REST) · *other* (freeform).

Adding a backend = a new seed template in `references/` + a config doc. No skill or agent changes.

## Install

Add the plugin to Claude Code (marketplace or local path), then run `/superdev:setup` in your repo.

## Requirements

- Claude Code (provides `node` for the hooks).
- For the chosen backends: the relevant CLI/token (`gh`; or a Jira/Forgejo token in an env var). The
  PR step degrades to "push + printed command" when a host CLI is absent.

## Attribution

Distills MIT-licensed material from [superpowers](https://github.com/obra/superpowers) (© Jesse
Vincent) and ponytail (© Dietrich Gebert), plus engineering-skill patterns. See `NOTICE`.

## License

MIT — see `LICENSE`.
