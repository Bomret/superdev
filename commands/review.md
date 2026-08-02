---
description: Review a change — a commit range, a branch, a path, or the working tree — for correctness, architecture, security, and over-engineering. Read-only on an ad-hoc range; on a live superdev scope it reviews against the DoD and can drive the fix loop.
argument-hint: "[BASE..HEAD | branch | path | (empty = working tree)]  [--unattended]  [-- what it should do]"
---

# superdev review

Review a change end to end. Two modes, and §1 decides which:

- **Ad-hoc** — a spot-check, a pre-PR pass, a second opinion on someone else's branch. No plan behind it,
  and **read-only end to end**: this command never edits, commits, or merges.
- **Scope** — the range is a live superdev scope branch, so this is the whole-scope review gate in the
  implement chain (ADR 0013). It reviews against that run's Definition of Done, may drive the fix loop
  after asking once, and hands off to `/superdev:document`. **§4 owns everything that differs.**

Either way the reviewers themselves are the same read-only subagents.

## 0. Config (optional)

- Read `docs/agents/code-management.md`, if present, for the **base branch** to diff against (default
  `main`).
- Read `docs/agents/verification.md`, if present, for the **test command** — pass it to the
  final-reviewer so it can re-run the suite over the range and confirm green, not just read the diff.
- **Neither file is required.** This command works in any repo, including one never set up for superdev
  (`/superdev:setup` was never run) — it just loses the test-command hint.

## 1. Range

**`--unattended`, if present, comes out first** — per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
**Unattended** section, it is never part of the range or the trailing description below.

Parse `$ARGUMENTS` into a **range** and an optional trailing description of what the change should do:

- **Trailing description** — everything after a ` -- ` separator, or (no `--` present) a clear trailing
  natural-language sentence describing what the change should do. This is handed to both reviewers as
  their `acceptance`.
- **Scope mode wins over both.** Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md` for what makes the
  resolved range a live superdev run. When it is, capture `<run-root>` and take `<run-root>/dod.md` as the
  `acceptance` for both reviewers. That is the run's own verification plan, so no trailing description and
  no issue-ref discovery is needed or wanted. **No `dod.md` in the run root** → say so in one line and fall
  back to the two rules below. Then follow **§4** as well as §2 and §3.
- **No description given → try issue-ref discovery.** If `docs/agents/issue-tracker.md` is configured, grep
  the resolved range's `git log` for issue references — keyword-qualified
  (`Close[sd]?`/`Fix(e[sd])?`/`Resolve[sd]?\s+#<n>`, case-insensitive), falling back to a bare `#<n>`.
  Dedupe the matched issue numbers, fetch each via the tracker's configured read-issue step, and
  concatenate their titles + bodies into `acceptance`. No tracker configured, or no ref found →
  acceptance = "no formal specification — general correctness, security, and quality" (today's default).
  Never runs when an explicit description was given — discovery is a fallback, not an override.
- **Range** — whatever remains, resolved to a concrete git range:
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

- **`superdev:final-reviewer`** (`model: opus`) — correctness, consistency, whole-scope brevity,
  security, performance, applied adversarially per axis. Give it: a one-line summary of what changed
  (derive it from the diff if the trailing
  description didn't supply one), the `acceptance` from §1, and the git range (it reads the review
  checklist itself via `${CLAUDE_PLUGIN_ROOT}`). If a test command is configured
  (`docs/agents/verification.md`), tell it it may re-run the suite over the range to verify green rather
  than trust the diff alone.
- **`superdev:simplicity-reviewer`** (`model: haiku`) — over-engineering only (unnecessary complexity,
  what stdlib/native replaces, what to delete). Give it the same git range.

Both subagents are **read-only** (`Read`, `Grep`, `Bash` — a hook blocks `git merge`/`push`/`rebase` and
`gh`/`tea pr merge` from any subagent). Scale the dispatch to the diff:

- **Tiny diff** (a handful of lines) → `final-reviewer` alone is enough; skip `simplicity-reviewer`.
- **Nothing plausible to cut** (e.g. the diff is docs-only, or already lean) → skip `simplicity-reviewer`.
- **Never skip `final-reviewer`** — correctness is always in scope.

**Exclude `superdev:slice-reviewer`.** It verifies one slice's diff against that slice's own
`spec`/`acceptance` from a plan — standalone review has no per-slice specification for it to check against.

**A dispatch of either reviewer above that the permission classifier denies is a degraded pass.** Read
`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section and follow it: review
inline yourself, say so in §3's report, and — on a live scope run — write the `**Degraded:**` entry that
section defines. **`--unattended` → block** there instead. That section's own carve-out already covers a
denied `simplicity-reviewer` here.

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
Correctness: [ready | not ready]. Simplicity: [N cuts recommended, non-blocking | Lean already | not dispatched].
Ready to merge? [Yes | No | With fixes]
Reasoning: [1–2 sentences]
```

The per-axis line is additive, sourced straight from each reviewer's own verdict — final-reviewer's
`Ready to merge?` line for Correctness, simplicity-reviewer's `net: -N lines possible` / `Lean already`
line for Simplicity (or "not dispatched" per §2's skip rules). It doesn't replace the combined
`Ready to merge?` verdict below it — over-engineering findings stay non-blocking, never gating merge on
their own.

**Apply nothing — on an ad-hoc range.** Never edit, commit, or merge, no matter how small or obvious a fix
looks. To act on findings, run `/superdev:plan` to slice the fix, then `/superdev:implement` to build and
merge it. **Scope mode is the one exception**, and §4 states it: there the findings belong to a run that is
already in flight, and fixing them is the point of the gate. Even then you ask first, and the reviewers
above stay read-only.

## 4. Scope mode — fix loop and handoff

Only when §1 found a live run. Everything above still applies; this adds the run's own steps.

- **Find the scope checkout, and refresh the run lock.** Per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`. **Not on `superdev/<scope>`** → report that and review
  read-only rather than writing to the wrong branch.
- **Ask once before fixing.** `final-reviewer` returned **Critical or Important** findings → report them
  per §3 first, then ask whether to fix them now. **Declined** → stop. The findings stand, nothing is
  written, and the stage does **not** advance. **`--unattended` → fix**, without asking: the fix loop is the
  whole point of this gate, and a review that found real defects and left them is worth less than no
  review. **Confirmed** → dispatch **one**
  `superdev:implementer` (`model: sonnet`; `haiku` only for a mechanical fix) with the **complete**
  findings list, not one fixer per finding. Every fix opens with a RED test that reproduces the defect.
  Re-review after it returns, and repeat until the verdict is clean or the **3-strike cap** is reached
  (three fix cycles each exposing a new defect elsewhere means a wrong cut, not a bug: stop, say so, and
  leave the stage where it is). **`--unattended` → block** at that cap, per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section, leaving the stage where it is
  exactly as above.
- **The fix implementer's own dispatch is a degraded pass too, if the permission classifier denies it.**
  Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section and follow it —
  **attended**, apply the fix inline yourself and say so in §3's report; **unattended**, **block there
  instead**, in place of the `--unattended → fix` rule above, since nobody is there to review a fix the
  controller wrote itself. Write the `**Degraded:**` entry either way.
- **Over-engineering findings never gate.** `simplicity-reviewer`'s cuts stay advisory here exactly as in
  §3. They do not hold up the handoff and they do not trigger the fix loop.
- **On a clean verdict**, and only then: write the ledger's `**Stage:**` line per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s rule that a stage write never undoes completed work.
  Read the current stage first. `documented-unreviewed`, and **no fix cycle ran** → write `documented`. The
  review it was missing has now run, and the doc pass it followed still describes this code.
  `documented-unreviewed`, and **a fix cycle landed commits** → write `reviewed` instead. Those commits
  arrived after the doc pass, so the docs are stale by exactly them, and `reviewed` is what makes
  `/superdev:ship` ask for the doc pass again. `documented` or `shipped` → leave the line alone and
  say so in one line. The run has already moved past this gate. Anything else → write `reviewed`. Then
  print the next command with the range already resolved — `/superdev:document <BASE>..superdev/<scope>`,
  the same range you just reviewed — and say in one line what it will do (reconcile the in-repo docs and
  the knowledge base with the merged state).
- **Never merge, push, or open a pull request.** `/superdev:ship` ends the chain.
