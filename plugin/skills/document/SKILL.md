---
name: document
description: Reconcile the project's docs and optional knowledge base with the current state of the code, removing stale text. Third step of the implement chain, after /superdev:review; also runs standalone.
argument-hint: "[BASE..HEAD | area/path | audit [--chained] | (empty = full reconcile)]  [--unattended]"
---

# superdev document

Bring the docs and the knowledge base into agreement with reality.
Dispatch the isolated **`superdev:doc-writer`** to do the work, then reader-test the result with the fresh-context **`superdev:doc-reader`**. You (the controller) scope, relay, and report.

Every message this command ends on closes with the Next block, per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` section (INV-0111). A run under `--chained` prints no Next block.

## 1. Config

- Read `docs/agents/documentation.md` (in-repo documentation convention) and `docs/agents/knowledge-base.md` (KB backend, audience, language, outline — may be "none").
- Neither present → this repo hasn't been set up for superdev docs; suggest `/superdev:setup` and stop.

## 2. Range

**`--unattended`, if present, comes out first** — per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section, it is never part of the range or the area path.

**`--chained`, if present, comes out the same way** — never part of the range or the area path either. It
signals that `/superdev:sweep` dispatched this run as its doc leg, in the **chained posture** CONTEXT.md
and ADR 0068 define. Only `audit` (§6) reads it; every other mode ignores it.

From `$ARGUMENTS`:

- **A git range** (`BASE..HEAD`) or an **area path** → a focused reconcile of what changed there. (`/superdev:review` hands on `merge-base(base, <type>/<scope>)..<type>/<scope>`.) A range or area **never** bootstraps (§7), so the chain's doc pass, which always passes a range, can't.
- **Empty** → a **full reconcile**: all in-repo docs (README + the whole `AGENTS.md` tree) + the KB against current repo state. **Exception:** the convention is the `AGENTS.md` hierarchy and the root `AGENTS.md` is **absent** → there is no doc tree to reconcile: skip §3-§5 and run **bootstrap** in §7.
- **The literal word `audit`** → skip §3-§5; run the **reader-first audit** in §6.

**Scope mode.** Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md` for what makes the range a live superdev run. When it is, §8 adds its steps. Every other invocation is ad-hoc: no stage is written, and its Next block says no command follows.

**`--unattended`** means nobody is watching: that file's **Unattended** section governs every stop this command reaches, including whatever a later change adds.

## 3. Dispatch

**Read the run's inline-doc-pass record first**, whenever §2 found a live scope run:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get docs --root <run-root>`. Anything but `absent` means
that run already performed the pass in its own context, while it still held the scope (ADR 0031), so the
work this section would dispatch is done:

- **Dispatch no `doc-writer`.** Go straight to §4 with the scope's own commits (`<base>..<branch>`) as the
  range, and the doc files those commits touched as the file list — the two things §4 would otherwise take
  from a writer's report.
- **Those commits touched no doc file** → skip §4 as well, and say in §5 that the pass was already done and
  left nothing for a reader. This invocation dispatches nobody at all.
- The record reads `absent` on every `full` run, on a `lite` run that ended before its doc step, and after
  `/superdev:review` cleared it because its fix loop landed commits. Each takes the dispatch below,
  unchanged.

An ad-hoc range has no run root and so no record: dispatch below.

Dispatch **`superdev:doc-writer`** with an **explicit `model`** (`sonnet`; `haiku` for a tiny focused range).
Hand it: the range (git range/area/"full"), the two config file paths, the **staging path** below, and — for a range — a reminder to start from `git diff --stat`/`git log` over that range.
It performs the pass `${CLAUDE_PLUGIN_ROOT}/references/doc-pass.md` states, and commits its doc changes on the current branch. **Name that reference in the dispatch**: it owns the pass, and a dispatch that describes the pass in its own words is the one the writer acts on (ADR 0031, ADR 0035).

**The knowledge-base pass reads a remote backend, and never writes to it** (ADR 0094, INV-0091). For a remote backend the doc-writer writes each page as a **staged page**, reading an existing non-aggregate page first to reconcile against and record its `live-hash`, and `/superdev:publish-kb` writes it later, once a human decides the feature has reached its readers (ADR 0023). A local `docs/kb/` backend is unaffected: its pages are repository files that ride the branch.

Hand the doc-writer the staging path as an **absolute** path — `.superdev/kb-pending/<scope>/` in the invoking checkout, or `.superdev/kb-pending/_adhoc/` when §2 found no live scope run — resolved before you dispatch, while the invoking checkout is your cwd.
The scope checkout is `<run-root>/scopetree`, inside `.superdev/` itself, so a checkout-relative path resolves one level too deep from the doc-writer's cwd and lands in a directory `/superdev:wrap-up` deletes.
Ensure `.superdev/` is in the repo's `.gitignore` before you dispatch; add it if absent — an ad-hoc run may reach this command before either ran the check.

## 4. Reader test

Skip if the doc-writer changed nothing, or if §3 found the pass already done and no doc file changed.

From the doc-writer's report, collect the changed doc files — in-repo docs and **local** KB pages (software-KB pages are out of scope). §3's no-writer path supplies both from the scope's own commits instead; everything else in this section is the same either way, including the fix round, which does dispatch a `doc-writer`.
Dispatch **`superdev:doc-reader`** with an **explicit `model`** (`sonnet`), that file list, the `docs/agents/documentation.md` path, and the doc-writer's **commit range** (`<first>^..<last>`, covering both passes) — no narrative, no summary of the work: it reads the docs cold and verifies their claims against the repo, read-only.

The range scopes its **writing-standard pass** to the lines those commits added, so the configured standard binds new prose without flagging text nobody touched. Its claim-verification passes stay cold.

If it reports findings, re-dispatch **`superdev:doc-writer`** (as in §3) with the findings to fix.
**One fix round** — don't loop the reader; unresolved findings go in the report instead.

The reader returns its findings **most-severe-first** (false claims, then incomplete ones, then style), so hand them over in that order and **tell the writer the order is a priority** — the `doc-writer` has no fix-round section of its own, so say it. With a single round, anything it can't reach is then the least costly finding rather than an arbitrary one.

**Read `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` and run the command it selects, in the scope
checkout over the scope branch on a live run (§8's checkout) or the invoking checkout otherwise** — the
same tree the doc commits just landed on, the writer's initial pass and any fix round above. Red → the doc
commit broke a test that asserts prose; fix it before the handoff. No test command configured → continue;
there's nothing to run. **A non-zero exit that reports no test matched the changed paths is not that
Red** — this step's changed-path set is docs-only by construction. A runner that maps nothing collects
none from it (`pytest {paths}` exits 5, "no tests ran"); a runner that maps source files to the tests
covering them finds no test for a docs-only path either (`vitest related {paths}` exits 1, "No test files
found", absent `--passWithNoTests`); read either outcome as green and continue. The same holds under
`--unattended`: there is nothing to ask, so don't stop on it.

**Two things here are degraded passes**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section — read it and follow it, on either one:

- **A dispatch the permission classifier denies.** A denied `doc-writer` means you reconcile inline; a denied `doc-reader` means the docs went unread by fresh eyes. Say so in §5's report and, on a live scope run, write the `**Degraded:**` entry that section defines: `scope.js degraded add` for the denied `doc-writer`, an authoring dispatch, and `scope.js degraded add-denial -` for the denied `doc-reader`, a verification dispatch, piping the classifier's refusal through a quoted heredoc rather than a shell argument. Publish the snapshot afterwards, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section. **`--unattended`** → a denied `doc-writer` blocks, since reconciling inline is the controller writing the docs itself; a denied `doc-reader` follows that section's authorship rule, blocking where the controller authored the docs under review and otherwise reading them inline — up to the cap, so read `scope.js get denials` after writing the entry and block once the count reaches it.
- **A knowledge-base pass the writer could not stage.** The pass writes to no backend, so what remains is a staging path it could not write, or an existing page a read (ADR 0094) could not reconcile against — the writer records that one itself, per `references/doc-pass.md`'s read step. The note ends at the writer's report. On a live scope run, write the entry too, so the pass nobody can publish later is visible when `/superdev:submit-pr` opens the pull request.

**An observation is captured the moment you meet it.** Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Observations` section and follow it: a defect a `doc-writer` or `doc-reader` report surfaces, or one the test command above shows, that no slice of this scope covers and the scope did not cause gets a triage record from you, the controller, right here — never held until §5's report.

## 5. Report

Relay what the doc-writer changed: which `AGENTS.md`/docs were updated, what was removed as stale, which KB pages were written to `docs/kb/` or **staged** and under which action (or that the KB pass was none/skipped), the reader-test tally (including findings left unresolved after the fix round), the **writing standard** that applied (or that none did), and any concerns. Do not re-do its work.

**Staged pages are named, with `/superdev:publish-kb`.** They are not on the knowledge base yet, and nothing later in the chain sends them. Say how many pages wait and under which scope.

## 6. Audit mode (`audit`)

Inverts the usual order: **reader first**, writer only to fix what it finds.

1. **Build the audit set:** the default doc tree (`AGENTS.md` hierarchy + `README.md` + `CONTEXT.md` + `docs/invariants.md` (when present) + local KB pages, when the KB backend is local `docs/kb/`) plus any globs listed under a `## Audit set` section in `docs/agents/documentation.md`. That section is optional — absent, use the default tree alone and say so in the report.
2. Dispatch **`superdev:doc-reader`** with an **explicit `model`** (`sonnet`), the full audit set, and the `docs/agents/documentation.md` path — cold, and with **no writer commit range**, which is what tells it to skip the writing-standard pass: an audit has no writer, so no prose is newly-written. Tell it explicitly: hook/guardrail-enforcement claims ("a hook blocks X", "the gate re-runs Y") are **always load-bearing** and must be verified against the hooks' actual source (`hooks/*.js`), not assumed from prose.
3. **`--chained` present** — this run is `/superdev:sweep`'s doc leg, in the **chained posture**
   (CONTEXT.md, ADR 0068). Dispatch no `doc-writer` and commit nothing, whatever the reader found. Return
   its findings to the caller **most-severe-first**, exactly as it ordered them — an empty list when it
   found none — and stop here: §5's report shape doesn't apply, since there is no writer work to relay.
4. **`--chained` absent** — if it reports findings, run **one doc-writer fix round** exactly as in §4 (dispatch once with the findings, in the reader's most-severe-first order; don't re-loop the reader; unresolved findings go in the report) — including §4's test-selection run afterward, over the commits that fix round lands.
5. **Report** per §5.

## 7. Bootstrap mode (brownfield seed)

Reached from §2 when the doc convention is the `AGENTS.md` hierarchy **and** the root `AGENTS.md` is absent: there's no doc tree to reconcile, so **seed** one from the existing code.

**Precondition — AGENTS.md convention only.** `docs/agents/documentation.md` records a **custom** (non-`AGENTS.md`) convention → bootstrap doesn't apply: say so in one line and fall through to the normal full reconcile (§3-§5).

1. **Confirm once, never silent.** Tell the user no doc hierarchy was found and ask to seed one. Only on confirmation proceed.
2. **Recon (large/unfamiliar repo only).** Fan out **2-4 read-only `Explore` agents** in parallel — each mapping a different aspect (structure + stack, domain vocabulary, subsystem boundaries, build + conventions) and returning a **compressed map**, not raw file dumps. A **small** repo skips this — the doc-writer explores directly.
3. **Dispatch `superdev:doc-writer`** with an **explicit `model`** (`sonnet`) in **bootstrap** mode. Hand it: "bootstrap" (no diff, no prior tree), the recon maps (or "small repo — explore directly"), and the two config file paths. It seeds root `AGENTS.md` + child `AGENTS.md` only at genuine boundaries, mines existing README/`docs/` as input, and **proposes `CONTEXT.md` candidate terms in its report** without committing `CONTEXT.md`.
4. **Confirm the glossary before it lands.** Present the writer's `CONTEXT.md` candidates to the user to **confirm/prune** — never auto-commit them. Re-dispatch the writer with the confirmed set to write + commit `CONTEXT.md`. Empty confirmed set → no `CONTEXT.md`.
5. **Reader test** the seeded files exactly as §4, then **report** per §5.

## 8. Scope mode — commit in the scope checkout, then hand off

Only when §2 found a live run. Everything above still applies; this adds the run's own steps. Capture `<run-root>` — the **absolute** path to that scope's directory — before anything else, and address the run's artifacts as `<run-root>/ledger.md` and `<run-root>/run.lock`.

- **Find the scope checkout, and refresh the run lock.** Per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`. Hand the doc-writer the scope checkout path as its working directory: this is where its commits must land.
- **Re-check the ticks this pass's own commits could touch,** per `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s Document's case: read `<run-root>/dod.md` for every ticked line naming a file, an ADR, a glossary entry, or a fixture the doc commits landed in this run touched — the `doc-writer`'s commits when §3 dispatched one, or the inline pass's own commits when §3's no-writer path applied instead. A line the branch still satisfies stays exactly as it stood, with no note added; a line your own change broke gets unticked, with a one-line note on what broke it (INV-0014). Apply the same verdict to the anchor's own Definition of Done checklist, through the active store's own `## Definition of Done ticks` section (`docs/agents/issue-tracker.md`) — best-effort, a failed write reported once and never stopping the pass. **An untick here also writes the ledger's `**Unresolved:**` entry, naming the criterion it broke** — a quoted heredoc (`<<'SUPERDEV_TEXT_EOF'`) piped to `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved add - --root <run-root>` (the sole word `-` reads the bullet text from stdin rather than a shell-interpolated argument, `references/dod-ticks.md`, triage #680) — and publishes the snapshot, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section (INV-0016: the stage never advances past review while a criterion stands unmet, except a ceiling one or an accepted one, and this untick is what keeps submit-pr's own gate from opening a pull request over it). The entry is cleared the next time `/superdev:review` returns a clean verdict, the same as any other `**Unresolved:**` entry. Verifying a tick observes; it changes no system outside the repository (ADR 0084, INV-0006). This step runs no test command of its own.
- **Write the stage — unless the re-check above unticked a line, or a standing `**Unresolved:**` entry
  already stands.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get unresolved --root <run-root>`
  first: printing anything means an earlier pass's untick still stands unresolved, and this pass writing
  `documented` over it would advance the stage past review while a criterion stands unmet (INV-0016), the
  same violation an untick of this pass's own would cause. Either case leaves the ledger's `**Stage:**`
  line exactly as it stands: write nothing, and skip straight to the next-command bullet below. **Neither
  case** → write the line with
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set <value> --root <run-root>`, per that file's
  rule that a stage write never undoes completed work — the verb enforces it and refuses a write that
  breaks it. Read the current stage first (`scope.js get stage`). `shipped`, `submitted`, or `closed` → leave the
  line alone and say so in one line; a shipped scope never regains an earlier stage, a submitted one
  already has an open pull request the next command merges rather than re-opens, and a closed one is terminal. `reviewed` → write
  `documented`. `documented` → leave it; the docs are already recorded as reconciled. Anything else,
  including no line at all → write `documented-unreviewed`, which records that the review step never ran
  before this doc pass. A pass in which the doc-writer changed nothing still counts: the docs already
  agreed with the code, which is the state this stage records. **Wrote `documented` or
  `documented-unreviewed` above** →
  publish the snapshot, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state`
  section. The two leave-alone branches, and the untick branch above, wrote nothing, so there is nothing
  to publish there.
- **Close with the Next block.** Where a command is printed, say first that the conversation is
  disposable: the ledger's stage and `dod.md` carry everything the next command reads, so a `/clear`
  first costs nothing. Then print the command, last, so the Next block closes the message. **This pass unticked a line above, or the standing-entry check above
  printed one** → print `/superdev:review <range>`, naming the criterion that stands unmet (this pass's
  own untick, or the earlier one the standing entry already named) and that review's fix loop is what
  re-ticks it once the branch meets it again; print no `/superdev:submit-pr` in the same breath — the
  stage still reads `reviewed` or below, and the step that opens the pull request asks once when attended
  and refuses only when unattended, on a scope with an unmet criterion — a criterion noted `ceiling:` or
  `accepted:` is settled, never this kind of unmet, and reaches neither this bullet nor that gate.
  **The stage read `shipped`, `submitted`, or `closed` above** — the leave-alone branch — → when it read
  `submitted`, print `/superdev:ship <scope>`; when it read `shipped`, pick the
  command by `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Routing a shipped run` (ADR 0116, INV-0116)
  and print `/superdev:verify-ship <scope>` or `/superdev:wrap-up <scope>` as it routes, and print `/superdev:verify-ship <scope>` when the anchor cannot be read, as ship does; when it read `closed`, the Next block says no command follows, and the note is left out.
  **Neither case** → print
  `/superdev:submit-pr <scope>`, with one line on what it does (open the pull request against the scope's
  current Definition of Done).
