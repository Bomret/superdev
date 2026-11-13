---
name: document
description: Reconcile the project's docs and optional knowledge base with the current state of the code, removing stale text. Third step of the implement chain, after /superdev:review; also runs standalone.
argument-hint: "[BASE..HEAD | area/path | audit [--chained] | (empty = full reconcile)]  [--unattended]"
---

# superdev document

## Role and terms

Applies to every start. You bring the docs and the knowledge base into agreement with the code. The **`superdev:doc-writer`** does the work, and the fresh-context **`superdev:doc-reader`** reader-tests it. You scope, relay, and report, and you redo none of the writer's work.

- **A live run**: a range `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md` finds to be a live superdev run. Every other start is **ad-hoc**, and an ad-hoc start writes no stage.
- **`<run-root>`**: the **absolute** path to the live run's scope directory. The run's artifacts are `<run-root>/ledger.md`, `<run-root>/run.lock`, and `<run-root>/dod.md`.
- **The scope's own commits**: `<range-base>..<branch>`, per `scope-mode.md`'s `## The scope's range base`.
- **The staging path**: the **absolute** path `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" staging <scope>` prints, or `staging _adhoc` on an ad-hoc start, resolved before the dispatch. It names `.superdev/kb-pending/<scope>/` in the main working tree from any cwd.
- **An open `docs` line**: a `docs`-tagged line of `<run-root>/dod.md` neither ticked nor `accepted:`.
- **The publish**: on a live run, the run's one snapshot publish, per `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state` section. It is the last act of the exit that ends the run, after the closer §3's **The step** lists. No write site publishes.
- **A writer dispatch**: dispatch `superdev:doc-writer` with an **explicit `model`** (`sonnet`).
- **A reader dispatch**: dispatch `superdev:doc-reader` with an **explicit `model`** (`sonnet`).

## The closing message

Applies to every message this command ends on, except under `--chained`, which prints no Next block. Close it per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` and `## The offer`.

## No test command

Applies to every path of this command: the pass, its fix round, an audit, a bootstrap, the tick re-check, and the `docs`-line fix round. Run no test command. The review's green suite record carries to `/superdev:ship` across Markdown-only doc commits.

## 1. Config

Applies to every start. Read `docs/agents/documentation.md` (the in-repo documentation convention) and `docs/agents/knowledge-base.md` (KB backend, audience, language, outline; it may read "none"). Neither present → suggest `/superdev:setup` and stop.

## 2. Range

**`--unattended`.** Applies before anything else in this section. Take it out of `$ARGUMENTS` first, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section. That section governs every stop this command reaches.

**`--chained`.** Applies to an argument carrying it. Take it out the same way. It marks this run as `/superdev:sweep`'s doc leg in the **chained posture** (CONTEXT.md), and only `audit` (§6) reads it.

**The mode.** Applies to the remaining `$ARGUMENTS`. Neither flag is part of the range or the area path.

- **A git range** (`BASE..HEAD`) or an **area path** → a focused reconcile of what changed there. `/superdev:review` hands on `<range-base>..<type>/<scope>`. A range or area never bootstraps.
- **Empty**, except the case below → a **full reconcile** of every in-repo doc (README and the whole `AGENTS.md` tree) and the KB against the current repository.
- **Empty, the convention is the `AGENTS.md` hierarchy, and the root `AGENTS.md` is absent** → skip §3–§5 and run **bootstrap** in §7.
- **The literal word `audit`** → skip §3–§5 and run the **reader-first audit** in §6.

**Scope mode.** Applies to every start. Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md` to tell whether the range is a live run. A live run adds §8's steps. On a live run, capture `<run-root>` and refresh `<run-root>/run.lock` here, per that file, before §3's `step set`.

## 3. Dispatch

**The step.** Applies to a live run, before any other ledger or store write. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step set document --root <run-root>`. Every exit after it ends in one call from the list below, and a blocked stop, a refusal, and a `First:` wait each run `step block` first.

- `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step clear --root <run-root>`
- a stage write
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" step block --root <run-root>`

**The writer dispatch.** Applies to an ad-hoc start and to every live run. Make a writer dispatch, `haiku` for a tiny focused range. Name `${CLAUDE_PLUGIN_ROOT}/references/doc-pass.md` in it as the pass the writer performs, and describe the pass in no words of your own.

- the range: the git range, the area, or "full"; for a range, a reminder to start from `git diff --stat` and `git log` over it
- the two config file paths
- the staging path
- on a live run, every open `docs` line, verbatim, as targets the pass must make true
- on a live run, the scope checkout as its working directory
- where the KB config carries `- **Hierarchy:** links`, that it stages each page's parent link as `references/doc-pass.md`'s knowledge-base pass states

The writer commits its doc changes on the current branch. A denied writer's inline reconcile takes the same targets.

**The knowledge-base pass.** Applies to a remote KB backend. The writer stages every page, and nothing in this command writes to the backend. `/superdev:publish-kb` sends the staged pages later.

**`.gitignore`.** Applies before this section's writer dispatch. Add `.superdev/` to the repository's `.gitignore` when it is absent.

## 4. Reader test

**The reader dispatch.** Applies to every doc pass, also one whose writer changed nothing. Make a reader dispatch: it reads the docs cold and read-only. Hand no narrative and no summary of the work.

- the file list: in-repo docs and **local** KB pages the writer changed, and every doc its report names as judged current; after a denied writer, the docs your inline reconcile changed and every doc it judged current, named the same way
- the staged pages, after the writer and after a denied writer's inline reconcile alike: every `.md` file under the staging path whose frontmatter `action` is not `delete`. A KB config with no remote backend, or a staging directory that is absent or empty, adds no page and reports no gap
- the tree to ground against: the scope checkout on a live run, the current checkout on an ad-hoc run. The staging path lies in the main working tree, which may not hold the scope's code
- the `docs/agents/documentation.md` path
- the commit range: on a live run, the scope's own commits, which hold the writer's commits too, so the reader's writing-standard pass judges every doc line the scope added. On an ad-hoc run, `<first>^..<last>` of the writer's commits, or of your inline reconcile's after a denied writer, covering both passes. An ad-hoc pass that committed nothing has no range: say in the dispatch that it carries none.

**An empty file list.** Applies when the writer judged no doc relevant and the file list holds no doc and no staged page. Make no reader dispatch. §5 relays the writer's reason and says the reader had no in-repo doc to test.

**The fix round.** Applies when the reader reports findings. Make one writer dispatch as in §3 with the findings, in the reader's most-severe-first order, and tell the writer that order is its priority. Run one round only, and re-dispatch no reader. A finding on a staged page goes to the same round: the dispatch carries the staging path, and the writer corrects the staged file, never the backend. Findings left unresolved go in §5's report.

**A denied dispatch.** Applies when the permission classifier denies a `doc-writer` or a `doc-reader`. It is a degraded pass: read and follow `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes` section. Say so in §5's report.

- **A denied `doc-writer`** → reconcile inline, and name the docs you changed and every doc you judged current, or your reason when you judged no doc relevant, as `${CLAUDE_PLUGIN_ROOT}/references/doc-pass.md`'s `## Pass 1 — in-repo docs` directs. On a live run, write the entry with `scope.js degraded add`. Under `--unattended`, block instead.
- **A denied `doc-reader`** → the docs went unread by fresh eyes. On a live run, write the entry with `scope.js degraded add-denial -`, the refusal piped through a quoted heredoc. Under `--unattended`, follow that section's authorship rule up to the cap: read `scope.js get denials` after the entry and block once the count reaches it.

**A pass the writer could not stage.** Applies to a staging path the writer could not write, or an existing page a read could not reconcile against. It is a degraded pass, and the writer's report carries the note. On a live run, write the entry too.

**An observation.** Applies to a defect a writer or reader report surfaces that no slice of this scope covers and the scope did not cause. Follow `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Observations` section. File the triage record yourself, at once.

## 5. Report

**The relay.** Applies to every report except a chained audit. Relay what the writer changed and any concerns.

- the `AGENTS.md` files and docs updated, and the stale text removed
- the KB pages written to `docs/kb/` or **staged**, and under which action, or that the KB pass was none or skipped
- every outline entry the writer added to the KB config, with its reason
- the reader test's result, on every doc pass: the reader's tally with the findings left unresolved after the fix round; or, on an empty file list, the writer's reason and that the reader had no in-repo doc to test; or a denied reader's degraded entry
- the **writing standard** that applied, or that none did
- on a live run whose stage reads `shipped` or `closed`, every unticked `docs` line

**Staged pages.** Applies when pages were staged. Name `/superdev:publish-kb`, and say how many pages wait and under which scope.

**The ad-hoc next command.** Applies to an ad-hoc run. A run that staged knowledge-base pages names `/superdev:publish-kb _adhoc` as its next command. Any other ad-hoc run's Next block says no command follows.

## 6. Audit mode (`audit`)

Applies to an `audit` start. The reader runs first, and a writer only fixes what it finds.

1. **The audit set.** The default doc tree: the `AGENTS.md` hierarchy, `README.md`, `CONTEXT.md`, `docs/invariants.md` when present, and the local KB pages when the KB backend is local `docs/kb/`. Add the globs listed under a `## Audit set` section in `docs/agents/documentation.md`. That section absent → use the default tree alone and say so in the report.
2. **The reader.** Make a reader dispatch with the full audit set and the `docs/agents/documentation.md` path, cold, and with no writer commit range. Tell it that hook and guardrail enforcement claims ("a hook blocks X", "the gate re-runs Y") are always load-bearing and are verified against the hooks' source (`hooks/*.js`).
3. **`--chained` present.** Dispatch no `doc-writer` and commit nothing. Return the findings to the caller most-severe-first, in the reader's order, or an empty list. Stop here.
4. **`--chained` absent.** On findings, run §4's fix round.
5. **Report** per §5.

## 7. Bootstrap mode (brownfield seed)

**Precondition.** Applies to a §2 bootstrap start whose `docs/agents/documentation.md` records a custom, non-`AGENTS.md` convention. Say in one line that bootstrap does not apply, and run the full reconcile (§3–§5).

**The seed.** Applies to every other bootstrap start.

1. **Confirm once.** Tell the user no doc hierarchy was found and ask to seed one. Proceed only on confirmation.
2. **Recon.** A large or unfamiliar repository → fan out 2–4 read-only `Explore` agents in parallel. Each maps one aspect (structure and stack, domain vocabulary, subsystem boundaries, build and conventions) and returns a compressed map. A small repository skips this.
3. **The writer.** Make a writer dispatch in **bootstrap** mode. Hand it "bootstrap" (no diff, no prior tree), the recon maps or "small repo — explore directly", the two config file paths, and the staging path. It seeds the root `AGENTS.md` and a child `AGENTS.md` only at a real boundary, mines the existing README and `docs/`, and proposes `CONTEXT.md` candidate terms in its report without committing `CONTEXT.md`.
4. **The glossary.** Present the candidates to the user to confirm or prune, and commit none on your own. Make a writer dispatch with the confirmed set to write and commit `CONTEXT.md`. An empty confirmed set → no `CONTEXT.md`.
5. **Reader test** the seeded files as §4 does, then **report** per §5.

## 8. Scope mode

Applies to a live run. Everything above still applies.

**The checkout.** Applies to every live run. Find the scope checkout, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`. The writer's commits land there.

**The tick re-check.** Applies to every ticked `dod.md` line naming a file, an ADR, a glossary entry, or a fixture that a doc commit landed in this run touched: the writer's, §4's fix round's, the `docs` fix round's, or the inline pass's. Follow `${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s Document's case. A line the branch still satisfies stays as it stood, with no note, and a line your change broke is unticked with a one-line note on what broke it. The re-check observes and changes no system outside the repository.

**The anchor checklist.** Applies to every tick and untick this section writes. Apply the same verdict to the anchor's Definition of Done checklist, through the active store's `## Definition of Done ticks` section (`docs/agents/issue-tracker.md`). It is best-effort: report a failed write once and continue.

**An untick's entry.** Applies to every untick of the tick re-check. Write a `**Unresolved:**` entry naming the criterion it broke: a quoted heredoc (`<<'SUPERDEV_TEXT_EOF'`) piped to `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved add - --root <run-root>`.

**The `docs` settle.** Applies to every live run, on every path the pass took. Follow `dod-ticks.md`'s Document's case. Read the stage first with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get stage --root <run-root>`.

- **`shipped` or `closed`** → judge no `docs` line and write no tick, untick, or entry. §5 names the unticked lines.
- **Any other stage** → judge each open `docs` line against the scope branch after the pass. True → tick it with its evidence. False → take **The `docs` fix round**.

An `accepted:` `docs` line stays exactly as it stands.

**The `docs` fix round.** Applies to the lines the settle judged false. Make one writer dispatch with exactly those lines as its targets and the scope checkout as its working directory, or reconcile inline when it is denied (§4's **A denied dispatch**). Judge those lines again, and run the tick re-check over this round's commits too.

- **Now true** → tick it with its evidence.
- **Still false** → untick it with a `not met:` note naming what the `AGENTS.md` text still lacks. Write one `**Unresolved:**` entry worded `docs criterion unmet after the doc pass: <criterion>`, as **An untick's entry** does, unless `scope.js get unresolved` already prints a bullet naming that criterion.

**The settle's clear.** Applies after the settle, when every `docs` line is ticked or `accepted:` and every bullet `get unresolved` prints is a `docs criterion unmet after the doc pass:` entry. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved clear --root <run-root>`. Any other bullet standing → leave every entry.

**The stage write.** Applies after the settle. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get unresolved --root <run-root>` first.

- **An open `docs` line still stands after the settle** → write no stage. Run `step block` and go to **The next command**.
- **Otherwise, the re-check unticked a line or `get unresolved` prints anything** → write no stage. Run `step clear` and go to **The next command**.
- **None of them** → read the current stage with `scope.js get stage`, and write with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set <value> --root <run-root>` per the table below. The verb refuses a write that undoes completed work.

| Current stage | Action |
|---|---|
| `shipped`, `submitted`, or `closed` | leave the line, run `step clear`, and say so in one line |
| `reviewed` | write `documented` |
| `documented` | leave the line and run `step clear` |
| anything else, or no line | write `documented-unreviewed`, then run `step clear` |

A pass in which the writer changed nothing still counts. Each branch above ends in its closer, and the publish follows it.

**The next command.** Applies to every live run. Where a command prints, first say that the conversation is disposable: the ledger's stage and `dod.md` carry everything the next command reads, so a `/clear` first costs nothing. Print the command last, from the first row that matches.

| Case | Next block |
|---|---|
| An open `docs` line the settle judged stands (never at `shipped` or `closed`) | `Blocked:` naming each such criterion, and `/superdev:document <range>` in the fence; an attended operator may instead accept the line (`accepted:`) |
| This pass unticked a line, or `get unresolved` printed one | `/superdev:review <range>`, naming the unmet criterion and that review's fix loop (`review-scope-mode.md`'s `### 4.9 The re-tick`) re-ticks it; no `/superdev:submit-pr` |
| The stage read `submitted` | `/superdev:ship <scope>` |
| The stage read `shipped` | the command `${CLAUDE_PLUGIN_ROOT}/references/shipped-run.md`'s `## Routing a shipped run` picks: `/superdev:plan` (its repair choice, with the route's open-repair line for each open repair and `/superdev:verify-ship <scope>` on the `Or:` line), `/superdev:verify-ship <scope>`, or `/superdev:wrap-up <scope>` (re-verify adds `/superdev:plan`'s repair choice on the `Or:` line); `/superdev:verify-ship <scope>` when the anchor cannot be read |
| The stage read `closed` | no command follows, and the disposable note is left out |
| Any other | `/superdev:submit-pr <scope>`, with one line: it opens the pull request against the scope's current Definition of Done |
