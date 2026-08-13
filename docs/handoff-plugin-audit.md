# Handoff — full-plugin audit (2026-08-13)

A fresh agent continues from here. The audit is finished; the work left is applying its findings.

## What happened

A full audit of the plugin ran on branch `feat/unresolved-defects` (clean tree at audit time):
correctness, performance, redundancy, brevity, contradictions, gaps. Three passes covered
`commands/` + `agents/` (prose), `references/` + `AGENTS.md` + `CONTEXT.md` + ADRs (docs), and
`hooks/` + `scripts/` (code, reviewed inline).

The full findings list with file:line evidence and the ranked change plan lives at
`~/.claude/plans/imperative-leaping-emerson.md` (machine-local, outside this repo). The actionable
core is restated below because that file does not travel with the repo.

## Verdict

Code is healthy — no real bugs in hooks or scripts, selftests strong, guards fail closed. The
problems are in the markdown: roughly 600–700 removable lines, 12 contradictions, 7 gaps.

Verified clean, do not "fix": the drift-check count in `AGENTS.md`, the change-type set (11 types,
consistent everywhere), the `scope.js` verb list, the tier boundary.

**Superseded.** The audited count and verb list are stale as of the fix pass that closed Tier 1 item
1 below: the count grew (more drift-check contracts added since) and the verb list gained
`unresolved add|clear` and `get unresolved|degraded`. Check `scripts/AGENTS.md` for the current count —
a number written down here would only go stale again at the next contract.

**Superseded.** The audit's FULL_SUITE five-row claim — removed from the verified-clean list above
because it no longer held — is stale for the same reason: Tier 3's first bullet below grew
`FULL_SUITE_CONTRACTS` to a sixth row, for `commands/implement.md`'s Final-phase full-suite run. Do not
revert that row — it is the pin ADR 0025's gap needs, not drift. Check `scripts/drift-check.js` for the
live count.

## Tier 1 — defects

1. **ADR 0026 is documented as live but unimplemented.** `CONTEXT.md:33-35` claims the
   `**Unresolved:**` ledger line and `scope.js unresolved clear` exist; `scripts/scope.js` has no
   `unresolved` verb, `references/scope-mode.md` has no `## Unresolved defects` section,
   `commands/ship.md` has no gate, and `commands/review.md:196,204` still drop declined findings.
   This branch (`feat/unresolved-defects`) exists to build it — either implement the ADR or mark it
   `Status: proposed` and revert the glossary entries.

   **Superseded.** This pull request implements the ADR: `scope.js` carries `unresolved add|clear`,
   `references/scope-mode.md` carries `## Unresolved defects`, and `commands/ship.md` gates on it.
2. `agents/implementer.md:71` instructs WebFetch/WebSearch doc-verification; its frontmatter grants
   neither tool. Add the tools or drop the duty.

   **Superseded.** `agents/implementer.md`'s frontmatter now grants both `WebFetch` and `WebSearch`.
3. `commands/afk.md:113,115` routes all-`mechanical`/`docs` scopes to `/superdev:review`, which
   `commands/implement.md:224-226` says such scopes skip by design.

   **Superseded.** `commands/afk.md`'s stage table exception routes such a scope from `merged` to
   `/superdev:document` and from `documented-unreviewed` to `/superdev:ship` instead, and a
   drift-check contract (`AFK_ROUTING_CONTRACTS`) pins the agreement with `commands/ship.md`.
4. `agents/final-reviewer.md:179` offers `pass | fail | not run` for the full-suite line;
   `commands/review.md:148` hands it `denied — degraded pass`.

   **Superseded.** `agents/final-reviewer.md`'s full-suite line now offers the same fourth value,
   `pass | fail | not run | denied — degraded pass`.
5. `commands/plan.md:103` uses the feature-label slug before the label is picked at `:185`; the
   command also declares no `argument-hint` and reads no `$ARGUMENTS`.

   **Superseded.** `commands/plan.md` now picks the feature label before the knowledge-base staging
   step that paths on its slug, declares an `argument-hint`, and seeds the interview from
   `$ARGUMENTS` when one is given.
6. `commands/document.md:111` reads a `## Audit set` section that no `/superdev:setup` run ever
   writes (missing from `references/documentation.md` and setup decision C).

   **Superseded.** `commands/setup.md` decision C now asks which docs sit outside the default audit
   tree and records the answer as `## Audit set`, and `references/documentation.md` seeds the same
   section as optional.
7. Smaller: `scripts/scope.js` `get` has no `degraded` field (`commands/ship.md:82` needs one);
   `commands/implement.md:236` ("full playbook alone") is falsified by its own Final phase;
   `commands/review.md:227` prints an undefined `<BASE>`; `commands/implement.md:50-52` omits
   `docs/agents/verification.md` from its config-read list; `commands/setup.md:145-146` claims the
   green-gate is full-tier only (it is unconditional); `commands/implement.md:37` vs
   `hooks/model-explicit.js:22` disagree on what an omitted model inherits;
   `commands/brainstorm.md:73` misstates what `status` scans; `references/implement-full.md:139`
   tells ship to collect a lock a full run never has; `agents/simplicity-reviewer.md:3,13` is scoped
   to one slice diff but dispatched on whole ranges.

   **Superseded**, eight of nine: `commands/ship.md` reads `get degraded`/`get unresolved` off
   `scripts/scope.js`, which carries both fields; `commands/implement.md`'s Model-selection section
   now credits the Final phase as a dispatcher, on either tier, instead of claiming the `full`
   playbook alone; `commands/review.md` prints the resolved `<range>` instead of a bare `<BASE>`;
   `commands/implement.md`'s config-read list now names `docs/agents/verification.md`;
   `commands/setup.md`'s green-gate wording now states the hook reads no execution tier;
   `commands/implement.md:37` and `hooks/model-explicit.js` already agreed (both call the inherited
   default the priciest/most-expensive tier); `commands/brainstorm.md`'s status-scan claim already
   matched `commands/status.md`; and `agents/simplicity-reviewer.md` already states both dispatch
   scopes (its line-15 rewrap is this same fix pass's MINOR 6). `references/implement-full.md`'s
   leave-standing list no longer names the lock, and says instead that the tier leaves none — only
   `references/implement-lite.md` creates one, because the `run-lock` hook guards a scope worktree the
   full tier never cuts (`references/scope-mode.md`'s `## The run lock`).

## Tier 2 — dedupe (~600–700 lines)

- `AGENTS.md:302-431`: the 25-check drift-check narration duplicates the script's own comments and
  success message — collapse to a pointer, keep only the "opposites" insights (`:432-439`).
  Likewise `:244-291` (scope.js/eval-run prose restating ADR 0022/0024).

  **Superseded.** `c2372ff`, on this same branch, already moved this narrative into `scripts/AGENTS.md`
  and cut root `AGENTS.md` to a five-line pointer — these line ranges no longer exist on either side.
- `agents/`: the Hygiene block and the "read economically" block are byte-identical across all six
  agents (~110 lines) — hoist each into one `references/` file.
- Issue-tracker seeds: `## Status workflow`, `## Scope anchor`, `## Assignee`, and the
  write/load-slices section are ~90% identical across github/forgejo/jira/local (~280 lines) —
  hoist invariants into `references/plan-contract.md`. The **Ambiguous** anchor rule exists only in
  the four copies and is unchecked; hoist it and add a drift row.
- `references/controlled-prose.md`: the checklist (`:239-267`) restates the rules 1:1 and the
  word-counting convention (`:209-220`) is unverifiable by an LLM — delete both; merge
  `references/content-types.md` in as a non-configurable leading section (12 load-bearing lines of
  64; both files are always read together). Update drift-check's CONTENT_TYPES rows and both doc
  agents' read lists when doing this.
- Verbatim duplicate paragraphs: implement↔review local-deviation prose (hoist into scope-mode's
  `## Degraded passes`); review↔document stage-write rule (delete — `scope.js` enforces it in
  code); 4× ".superdev in .gitignore" (`scope.js init` already does it); 5× ADR 0023 "only
  publish-kb reaches a backend" rationale; 3× kb-pending worktree-depth argument; both "Red flags"
  sections; `CONTEXT.md` entries that summarize references instead of defining terms.

## Tier 3 — small hardening

- drift-check: add a FULL_SUITE row for `commands/implement.md`'s Final-phase full-suite run
  (currently unguarded — the exact dead-lens shape check 7 exists for); fix `AGENTS.md:292-299`
  (taxonomy omits 4 of its own checks), the "green-gate reads test-selection.md" wording (it
  reimplements it), and the test-selection consumer list (split focused vs full-suite callers).

  **Superseded**, all four: `FULL_SUITE_CONTRACTS` carries a sixth row for `commands/implement.md`'s
  Final-phase run; the taxonomy moved to `scripts/AGENTS.md` and now names every check it guards; root
  `AGENTS.md`'s `references/` entry now says the three prose documents *read* `test-selection.md` while
  `hooks/green-gate.js` *implements* the same rule in code, instead of claiming green-gate reads the
  reference; and that entry now splits the consumers into the **focused** callers that run what the rule
  selects per loop increment and the **full-suite** callers that read it for the full command
  (`commands/review.md`'s scope review, `commands/implement.md`'s Final phase).
- Pin the ARG token regex shared by `hooks/merge-guard.js:23`, `hooks/green-gate.js:33`,
  `hooks/ledger-guard.js:11` with a string-equality drift assertion (same pattern as the
  slug-charset one in `scope.js --selftest`).

  **Superseded.** `ARG_TOKEN_CONTRACTS` in `scripts/drift-check.js` pins the canonical token verbatim
  across all three hooks.
- Add `**Status:**` lines to ADRs 0025 and 0026.

  **Superseded.** Both ADRs carry `**Status:** Accepted`.

## Deliberately not proposed

Merging the per-Bash hooks into one dispatcher (4 node spawns per Bash call is measurable but the
standalone-hook rule is worth more); trimming the scope-prune/scope.js selftests (they carry
retired drift assertions by design); touching `scripts/eval-run.js` (structure sound, off the hot
path, not reviewed line-by-line).

## Constraints the next agent must honour

- DOX: read `AGENTS.md` before editing; every Tier 2 hoist changes AGENTS.md's own descriptions of
  the moved content — the DOX pass is part of each change, and several drift-check contracts pin
  the exact files being edited. Run the suite after every move.
- Hooks are CommonJS; every hook ships a `--selftest`; version only in `.claude-plugin/plugin.json`.
- Verification: `bun run test` (all selftests + drift-check + `claude plugin validate .`).

## Suggested skills

- `superdev:plan` — slice this into an epic before implementing; Tier 1 item 1 (ADR 0026) is a
  scope of its own and likely this branch's plan.
- `superdev:review` — after each tier lands, over the branch range.
- `ponytail:ponytail` — keep every fix the minimum diff; most Tier 1 items are one-file edits.
- `mattpocock-skills:writing-for-agents` — for the Tier 2 hoists into runtime-read references.
