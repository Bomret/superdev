superdev-render-overlay
source: skills/document/SKILL.md
body-lines: 126
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-document
description: "Reconcile the project's docs and optional knowledge base with the current state of the code, removing stale text. Third step of the implement chain, after /superdev-review; also runs standalone."
---
@5
Dispatch the isolated **`doc-writer`** to do the work, then reader-test the result with the fresh-context **`doc-reader`**. You (the controller) scope, relay, and report.
@10
- Neither present → this repo hasn't been set up for superdev docs; suggest `/superdev-setup` and stop.
@14
**`--unattended`, if present, comes out first** — per `<plugin-root>/references/scope-mode.md`'s **Unattended** section, it is never part of the range or the area path.
@17
signals that `/superdev-sweep` dispatched this run as its doc leg, in the **chained posture** CONTEXT.md
@20
From the message that invoked this skill:
@22
- **A git range** (`BASE..HEAD`) or an **area path** → a focused reconcile of what changed there. (`/superdev-review` hands on `merge-base(base, <type>/<scope>)..<type>/<scope>`.) A range or area **never** bootstraps (§7), so the chain's doc pass, which always passes a range, can't.
@26
**Scope mode.** Read `<plugin-root>/references/scope-mode.md` for what makes the range a live superdev run. When it is, §8 adds its steps. Every other invocation is ad-hoc: no stage is written and no next command is printed.
@33
`node "<plugin-root>/scripts/scope.js" get docs --root <run-root>`. Anything but `absent` means
@43
  `/superdev-review` cleared it because its fix loop landed commits. Each takes the dispatch below,
@48
Dispatch **`doc-writer`** with an **explicit `model`** (`sonnet`; `haiku` for a tiny focused range).
@50
It performs the pass `<plugin-root>/references/doc-pass.md` states, and commits its doc changes on the current branch. **Name that reference in the dispatch**: it owns the pass, and a dispatch that describes the pass in its own words is the one the writer acts on (ADR 0031, ADR 0035).
@52
**The knowledge-base pass reaches no backend.** For a remote backend the doc-writer writes each page as a **staged page**, and `/superdev-publish-kb` sends it later, once a human decides the feature has reached its readers (ADR 0023). A local `docs/kb/` backend is unaffected: its pages are repository files that ride the branch.
@55
The scope checkout is `.superdev/scopes/<scope>/scopetree`, inside `.superdev/` itself, so a checkout-relative path resolves one level too deep from the doc-writer's cwd and lands in a directory `/superdev-ship` deletes.
@63
Dispatch **`doc-reader`** with an **explicit `model`** (`sonnet`), that file list, the `docs/agents/documentation.md` path, and the doc-writer's **commit range** (`<first>^..<last>`, covering both passes) — no narrative, no summary of the work: it reads the docs cold and verifies their claims against the repo, read-only.
@67
If it reports findings, re-dispatch **`doc-writer`** (as in §3) with the findings to fix.
@72
**Read `<plugin-root>/references/test-selection.md` and run the command it selects, in the scope
@83
**Two things here are degraded passes**, per `<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section — read it and follow it, on either one:
@85
- **A dispatch the permission classifier denies.** A denied `doc-writer` means you reconcile inline; a denied `doc-reader` means the docs went unread by fresh eyes. Say so in §5's report and, on a live scope run, write the `**Degraded:**` entry that section defines: `scope.js degraded add` for the denied `doc-writer`, an authoring dispatch, and `scope.js degraded add-denial` for the denied `doc-reader`, a verification dispatch, quoting the classifier's refusal. Publish the snapshot afterwards, per `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section. **`--unattended`** → a denied `doc-writer` blocks, since reconciling inline is the controller writing the docs itself; a denied `doc-reader` follows that section's authorship rule, blocking where the controller authored the docs under review and otherwise reading them inline — up to the cap, so read `scope.js get denials` after writing the entry and block once the count reaches it.
@92
**Staged pages are named, with `/superdev-publish-kb`.** They are not on the knowledge base yet, and nothing later in the chain sends them. Say how many pages wait and under which scope.
@99
2. Dispatch **`doc-reader`** with an **explicit `model`** (`sonnet`), the full audit set, and the `docs/agents/documentation.md` path — cold, and with **no writer commit range**, which is what tells it to skip the writing-standard pass: an audit has no writer, so no prose is newly-written. Tell it explicitly: hook/guardrail-enforcement claims ("a hook blocks X", "the gate re-runs Y") are **always load-bearing** and must be verified against the hooks' actual source (`hooks/*.js`), not assumed from prose.
@100
3. **`--chained` present** — this run is `/superdev-sweep`'s doc leg, in the **chained posture**
@115
3. **Dispatch `doc-writer`** with an **explicit `model`** (`sonnet`) in **bootstrap** mode. Hand it: "bootstrap" (no diff, no prior tree), the recon maps (or "small repo — explore directly"), and the two config file paths. It seeds root `AGENTS.md` + child `AGENTS.md` only at genuine boundaries, mines existing README/`docs/` as input, and **proposes `CONTEXT.md` candidate terms in its report** without committing `CONTEXT.md`.
@123
- **Find the scope checkout, and refresh the run lock.** Per `<plugin-root>/references/scope-mode.md`. Hand the doc-writer the scope checkout path as its working directory: this is where its commits must land.
@124
- **Write the stage.** Once §4 finishes, write the ledger's `**Stage:**` line with `node "<plugin-root>/scripts/scope.js" stage set <value> --root <run-root>`, per that file's rule that a stage write never undoes completed work — the verb enforces it and refuses a write that breaks it. Read the current stage first (`scope.js get stage`). `shipped` → leave the line alone and say so in one line; a shipped scope never regains an earlier stage. `reviewed` → write `documented`. `documented` → leave it; the docs are already recorded as reconciled. Anything else, including no line at all → write `documented-unreviewed`, which records that the review step never ran before this doc pass. A pass in which the doc-writer changed nothing still counts: the docs already agreed with the code, which is the state this stage records. **Wrote `documented` or `documented-unreviewed` above** → publish the snapshot, per `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section. The two leave-alone branches wrote nothing, so there is nothing to publish there.
@125
- **Print the next command:** `/superdev-ship <scope>`, with one line on what it does (tick the Definition of Done, close the scope anchor, open the pull request, and take the run down). Add that this conversation is disposable: the ledger's stage and `dod.md` carry everything `/superdev-ship` reads, so a `/clear` first costs nothing.
