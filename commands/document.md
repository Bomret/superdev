---
description: Reconcile the project's docs and optional knowledge base with the current state of the code, removing stale text. The third step of the implement chain, after /superdev:review, and available on demand at any time.
argument-hint: "[BASE..HEAD | area/path | audit | (empty = full reconcile)]  [--unattended]"
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

**`--unattended`, if present, comes out first** — per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
**Unattended** section, it is never part of the range or the area path below.

From `$ARGUMENTS`:

- **A git range** (`BASE..HEAD`) or an **area path** → a focused reconcile of what changed there.
  (`/superdev:review` hands on `merge-base(base, <type>/<scope>)..<type>/<scope>`.) A range or area
  **never** bootstraps (§7) — so the chain's doc pass, which always passes a range, can't.
- **Empty** → a **full reconcile**: all in-repo docs (README + the whole `AGENTS.md` tree) + the KB
  against current repo state. **Exception:** if the convention is the `AGENTS.md` hierarchy and the root
  `AGENTS.md` is **absent**, this repo has no doc tree to reconcile — skip §3-§5 and run **bootstrap** in
  §7 instead.
- **The literal word `audit`** → skip §3-§5; run the **reader-first audit** in §6 instead.

**Scope mode.** Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md` for what makes the range a live
superdev run. When it is, §8 adds its steps. Every other invocation is ad-hoc: no stage is written and no
next command is printed.

**`--unattended`** in the arguments means nobody is watching: that file's **Unattended** section governs
every stop this command reaches, including whatever a later change adds.

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
(`sonnet`), that file list, the `docs/agents/documentation.md` path, and the doc-writer's **commit
range** (`<first>^..<last>`, covering both of its passes) — no narrative, no summary of the work: it
reads the docs cold and verifies their claims against the repo, read-only.

The range scopes its **writing-standard pass** to the lines those commits added, so the configured
standard binds new prose without flagging text nobody touched. Its claim-verification passes stay cold.

If it reports findings, re-dispatch **`superdev:doc-writer`** (as in §3) with the findings to fix.
**One fix round** — don't loop the reader; unresolved findings go in the report instead.

The reader returns its findings **most-severe-first** (false claims, then incomplete ones, then style), so
hand them over in that order and **tell the writer the order is a priority** — the `doc-writer` has no
fix-round section of its own, so say it. With a single round, anything it can't reach is then the least
costly finding rather than an arbitrary one.

**Two things here are degraded passes**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
`## Degraded passes` section — read it and follow it, on either one:

- **A dispatch the permission classifier denies.** A denied `doc-writer` means you reconcile inline; a
  denied `doc-reader` means the docs went unread by fresh eyes. Say so in §5's report and, on a live scope
  run, write the `**Degraded:**` entry that section defines. **`--unattended` → block** instead.
- **A knowledge-base pass the writer could not publish.** `docs/agents/knowledge-base.md` states its own
  skip-and-note fallback, and the note ends at the writer's report. On a live scope run, write the entry
  too, so the unpublished pass is still visible at ship time.

## 5. Report

Relay what the doc-writer changed: which `AGENTS.md`/docs were updated, what was removed as stale, which
KB pages were updated/created (or that the KB pass was none/skipped), the reader-test tally (including
any findings left unresolved after the fix round), the **writing standard** that applied (or that none
did), and any concerns (e.g. a missing KB token). Do not re-do its work.

## 6. Audit mode (`audit`)

Inverts the usual order: **reader first**, writer only to fix what it finds.

1. **Build the audit set:** the default doc tree (`AGENTS.md` hierarchy + `README.md` + `CONTEXT.md` +
   local KB pages, when the KB backend is local `docs/kb/`) plus any globs listed under a `## Audit set`
   section in `docs/agents/documentation.md`. That section is optional — if it's absent, use the default
   tree alone and say so in the report.
2. Dispatch **`superdev:doc-reader`** with an **explicit `model`** (`sonnet`), the full audit set, and
   the `docs/agents/documentation.md` path — cold, and with **no writer commit range**, which is what
   tells it to skip the writing-standard pass: an audit has no writer, so no prose is newly-written and the
   standard has nothing in scope to bind. Tell it explicitly: hook/guardrail-enforcement
   claims ("a hook blocks X", "the gate re-runs Y") are **always load-bearing** and must be verified
   against the hooks' actual source (`hooks/*.js`), not assumed from prose.
3. If it reports findings, run **one doc-writer fix round** exactly as in §4 (dispatch
   `superdev:doc-writer` once with the findings, in the reader's most-severe-first order so the round works
   down from the top; don't re-loop the reader; unresolved findings go in the report).
4. **Report** per §5.

## 7. Bootstrap mode (brownfield seed)

Reached from §2 when the doc convention is the `AGENTS.md` hierarchy **and** the root `AGENTS.md` is
absent: there's no doc tree to reconcile, so **seed** one from the existing code.

**Precondition — AGENTS.md convention only.** If `docs/agents/documentation.md` records a **custom**
(non-`AGENTS.md`) doc convention, bootstrap doesn't apply — say so in one line and fall through to the
normal full reconcile (§3-§5) instead. Bootstrap only seeds the `AGENTS.md` hierarchy.

1. **Confirm once, never silent.** Tell the user no doc hierarchy was found and ask to seed one. Only on
   confirmation proceed.
2. **Recon (large/unfamiliar repo only).** Fan out **2-4 read-only `Explore` agents** in parallel — each
   mapping a different aspect (structure + stack, domain vocabulary, subsystem boundaries, build +
   conventions) and returning a **compressed map**, not raw file dumps. A **small** repo skips this — the
   doc-writer explores directly.
3. **Dispatch `superdev:doc-writer`** with an **explicit `model`** (`sonnet`) in **bootstrap** mode. Hand
   it: "bootstrap" (no diff, no prior tree), the recon maps (or "small repo — explore directly"), and the
   two config file paths. It seeds root `AGENTS.md` + child `AGENTS.md` only at genuine boundaries, mines
   existing README/`docs/` as input, and **proposes `CONTEXT.md` candidate terms in its report** without
   committing `CONTEXT.md`.
4. **Confirm the glossary before it lands.** Present the writer's `CONTEXT.md` candidates to the user to
   **confirm/prune** — never auto-commit them. Re-dispatch the writer with the confirmed set to write +
   commit `CONTEXT.md`. Empty confirmed set → no `CONTEXT.md`.
5. **Reader test** the seeded files exactly as §4, then **report** per §5.

## 8. Scope mode — commit in the scope checkout, then hand off

Only when §2 found a live run. Everything above still applies; this adds the run's own steps. Capture
`<run-root>` — the **absolute** path to that scope's directory — before anything else, and address the
run's artifacts as `<run-root>/ledger.md` and `<run-root>/run.lock`.

- **Find the scope checkout, and refresh the run lock.** Per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`. Hand the doc-writer the scope checkout path as its
  working directory: this is where its commits must land.
- **Write the stage.** Once §4 finishes, write the ledger's `**Stage:**` line per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s rule that a stage write never undoes completed work.
  Read the current stage first. `shipped` → leave the line alone and say so in one line. A shipped scope
  never regains an earlier stage. `reviewed` → write `documented`. `documented` → leave it. The docs are
  already recorded as reconciled. Anything else, including no line at all, → write
  `documented-unreviewed` instead, which records that the review step never ran before this doc pass. A
  pass in which the doc-writer changed nothing still counts: the docs already agreed with the code, which
  is the state this stage records.
- **Print the next command:** `/superdev:ship <scope>`, with one line on what it does (tick the Definition
  of Done, close the scope anchor, open the pull request, and take the run down).
