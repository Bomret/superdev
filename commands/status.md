---
description: Report per-scope DAG progress for every superdev run in this repo, from each scope's ledger. Read-only; makes no changes.
model: haiku
allowed-tools: Read, Glob
---

# superdev status

Give a compact, read-only snapshot of every in-flight `/superdev:implement` run in this repo. You never
write, transition, or merge anything here — this is a report, not a control command.

## 1. Find run roots

- List `.superdev/scopes/*/` directories. Each one that holds a `ledger.md` is a **run root** for scope
  `<scope>` (the directory name). `.superdev/` also holds non-scope areas (e.g. `.superdev/brainstorm/`)
  — only `.superdev/scopes/` is scanned.
- **No `.superdev/scopes/` directory, or no subdirectory has a `ledger.md`:** report `No superdev runs
  found in this repo.` and stop. Do not create `.superdev/` or any file.

## 2. Read each ledger

For each run root, read `.superdev/scopes/<scope>/ledger.md` (see `${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md` for the
canonical status vocabulary: `todo` / `in-progress` / `in-review` / `blocked` / `merged`). Parse its
table (columns: `id`, `issue`, `title`, `type`, `depends-on`, `status`, `range`) to tally, per scope:

- total slice count;
- count per status;
- the `id` + `title` of every slice whose status is `blocked`.

A ledger that fails to parse (malformed table, missing file despite the directory existing) → report it
as `<scope>: ledger unreadable` and continue with the remaining scopes; don't abort the whole command.

## 3. Report

Print one block per scope, oldest run root first:

```
<scope>  (N slices)
  todo: N  in-progress: N  in-review: N  blocked: N  merged: N
  blocked: <id> <title>, <id> <title>   (omit this line if none)
```

If every slice in a scope is `merged`, still show it (it's a completed run whose worktree/ledger wasn't
cleaned up yet) but note `complete` next to the scope name.

End with nothing further — no suggested next action, no mutation. If the caller wants to act on a
blocked slice, that's `/superdev:implement` or manual intervention, not this command.
