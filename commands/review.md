---
description: Review a change — a commit range, a branch, a path, or the working tree — for correctness, architecture, security, and over-engineering. Read-only, standalone: no plan or slice store required. Dispatches final-reviewer + simplicity-reviewer in parallel and consolidates their verdicts.
argument-hint: "[BASE..HEAD | branch | path | (empty = working tree)]  [-- what it should do]"
---

# superdev review

Review a change end to end without a plan behind it — a spot-check, a pre-PR pass, a second opinion on
someone else's branch. Dispatches the same reviewer subagents `/superdev:implement` uses per scope, but
standalone: this command never edits, commits, or merges anything.

## 0. Config (optional)

- Read `docs/agents/code-management.md`, if present, for the **base branch** to diff against (default
  `main`).
- Read `docs/agents/verification.md`, if present, for the **test command** — pass it to the
  final-reviewer so it can re-run the suite over the range and confirm green, not just read the diff.
- **Neither file is required.** This command works in any repo, including one never set up for superdev
  (`/superdev:setup` was never run) — it just loses the test-command hint.

## 1. Scope

Parse `$ARGUMENTS` into a **scope** and an optional **intent**:

- **Intent** — everything after a ` -- ` separator, or (no `--` present) a clear trailing natural-language
  sentence describing what the change should do. This is handed to both reviewers as their
  `requirements`. No intent given → requirements = "no formal spec — general correctness, security, and
  quality."
- **Scope** — whatever remains, resolved to a concrete git range:
  - **`BASE..HEAD`** (or `BASE...HEAD`, contains `..`) → use verbatim.
  - **A branch** (no `..`; resolves via `git rev-parse --verify --quiet <name>`) → range is
    `merge-base(base, branch)..branch`.
  - **A path/area** (exists on disk, isn't a ref) → the diff of the current branch vs base, scoped to
    that path (`git diff <merge-base>..HEAD -- <path>`, or `git diff HEAD -- <path>` if there are
    uncommitted changes there).
  - **Empty** → the working tree: `git diff HEAD` if it's non-empty, else the current branch vs base
    (`merge-base(base, HEAD)..HEAD`).

**Include untracked files.** `git diff HEAD` (the working-tree and path scopes) shows modified/staged
files but **not new untracked files** — so "review what I just wrote" could otherwise miss the whole
subject. Before diffing the working tree, run `git add -N .` (intent-to-add) so brand-new files appear
in the diff, or check `git status --porcelain` and, if you can't include them, **say so** in the range
announcement rather than reviewing silently-incomplete changes.

**State the concrete range/target** (e.g. "Reviewing `a1b2c3..d4e5f6`" or "Reviewing working tree changes
incl. untracked") before dispatching — the user should see exactly what's under review.

**Size caution (qualitative, non-blocking).** Glance at `git diff --stat` for the resolved range. If the
change spans enough files or churn that a single review pass would likely miss things — not a fixed line
count, a judgment call — say so alongside the range announcement (e.g. "this is a large, multi-concern
diff; consider splitting it via `/superdev:plan` for a sharper review") and proceed anyway. Never block
on it.

## 2. Review (parallel, read-only)

Dispatch both reviewers in parallel, each with an **explicit `model`** (a hook blocks any dispatch to a
superdev subagent that omits one):

- **`superdev:final-reviewer`** (`model: opus`) — correctness, architecture, security, tests, production
  readiness. Give it: a one-line summary of what changed (derive it from the diff if the intent didn't
  supply one), the `requirements` from §1, the git range, and the **absolute path** to
  `${CLAUDE_PLUGIN_ROOT}/references/review-checklist.md` (resolve the macro yourself, here — it doesn't
  expand inside the dispatched agent). If a test command is configured (`docs/agents/verification.md`),
  tell it it may re-run the suite over the range to verify green rather than trust the diff alone.
- **`superdev:simplicity-reviewer`** (`model: haiku`) — over-engineering only (unnecessary complexity,
  what stdlib/native replaces, what to delete). Give it the same git range.

Both subagents are **read-only** (`Read`, `Grep`, `Bash` — a hook blocks any mutating git command from
either). Scale the dispatch to the diff:

- **Tiny diff** (a handful of lines) → `final-reviewer` alone is enough; skip `simplicity-reviewer`.
- **Nothing plausible to cut** (e.g. the diff is docs-only, or already lean) → skip `simplicity-reviewer`.
- **Never skip `final-reviewer`** — correctness is always in scope.

**Exclude `superdev:slice-reviewer`.** It verifies one slice's diff against that slice's own
`spec`/`acceptance` from a plan — standalone review has no per-slice spec for it to check against.

## 3. Report

Consolidate both verdicts into **one** report — don't just relay them side by side:

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
net: -<N> lines possible   (or "Lean already" if nothing to cut)

### Assessment
Ready to merge? [Yes | No | With fixes]
Reasoning: [1–2 sentences]
```

**Apply nothing.** This command is read-only end to end — never edit, commit, or merge, no matter how
small or obvious a fix looks. To act on findings, run `/superdev:plan` to slice the fix, then
`/superdev:implement` to build and merge it.
