# 0012 — The writing standard is documentation configuration, not agent behaviour

**Status:** Accepted

**Context.** Nothing constrains *how* the doc agents write. `doc-writer` is told what to document and
what to delete, never in what register; `doc-reader` verifies that claims are true, never that they are
legible. The prose that results shows three defects of form: it reads as AI slop, it is ambiguous (long
sentences, dropped articles, pronouns without a referent), and its style drifts between dispatches.
ASD-STE100 Simplified Technical English is a mature controlled language that fixes exactly this class of
defect, and a published distillation of it measures a 50–74% drop in heuristic anti-slop violations
across two model families.

**Decision.** The writing standard is **documentation configuration**: a `## Writing standard` section in
`docs/agents/documentation.md`, written by `/superdev:setup`, holding a **pointer** — `STE` (the agents
read `${CLAUDE_PLUGIN_ROOT}/references/ste.md`), a repo-relative path to the project's own style guide, or
`none`. `references/ste.md` restates ASD-STE100 Issue 9 Part 1 and ships with the plugin. The standard
binds only prose an agent writes or rewrites in that dispatch; it never governs untouched text.

**Why.** A style is not agent behaviour, it is a property of the repo being documented. ASD-STE100 is
English-only, and the knowledge-base config already carries a `Language` field that may say German — an
unconditional standard would be inapplicable in a configuration superdev explicitly supports. The repo's
own rule that `commands/` and `agents/` stay tool-agnostic applies unchanged to a writing standard. A
pointer keeps the rules in one shipped file that upgrades with the plugin, instead of copying ~150 lines
into every consumer repo where they freeze at install time.

**Considered options.**

- *Both doc agents apply STE unconditionally* — rejected: bakes an English-only style choice into agents
  that are otherwise tool-agnostic, and collides head-on with a knowledge base configured for German.
- *A deterministic linter gate over doc diffs* — rejected: needs a runtime dependency decision, catches
  only the mechanical subset, and regex-scores markdown noisily. Revisit if `doc-reader` proves
  unreliable at the style lens.
- *`doc-reader` alone enforces the standard, `doc-writer` untouched* — rejected: rewrite-after-the-fact.
  It spends the single fix round on style instead of writing it right the first time, and the writer
  never learns the register.
- *The rules inline in `docs/agents/documentation.md`* — rejected: ~150 lines copied into every consumer
  repo, frozen at setup time, never upgrading.
- *Convert a whole file to the standard whenever any prose in it is touched* — rejected: removes the
  mixed-style transition, but a one-line correction then triggers a full-file rewrite and an
  unreviewable diff.

**Consequences.** `doc-reader`'s dispatch is deliberately starved of history so it reads cold, but a
changed-text-only rule needs a diff. The controller therefore passes the writer's commit sha, and
`doc-reader` diffs for the **style lens only** — claim verification stays cold. `/superdev:document audit`
has no preceding writer, so it drops the style lens entirely rather than flag prose nobody touched. Docs
converge on the standard as they are touched, which leaves files in a mixed style during the transition;
this repo resolves that for itself by converting `AGENTS.md` and `README.md` once. Voiced prose stays
exempt by the standard's own scope rule, so `README.md`'s opening pitch is not converted. Part 2 of
ASD-STE100 (the Dictionary) is copyrighted and is not reproduced or bundled: `references/ste.md` carries
the Part 1 writing rules and substitutes a short-common-word discipline for the dictionary lockdown.
