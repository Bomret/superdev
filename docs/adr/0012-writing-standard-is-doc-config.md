# 0012 — The writing standard is documentation configuration, not agent behaviour

**Status:** Accepted

**Context.** Nothing constrains *how* the doc agents write. `doc-writer` is told what to document and
what to delete, never in what register; `doc-reader` verifies that claims are true, never that they are
legible. The prose that results shows three defects of form: it reads as AI slop, it is ambiguous (long
sentences, dropped articles, pronouns without a referent), and its style drifts between dispatches.
Controlled-language standards for technical documentation fix exactly this class of defect, and a
published distillation of one measures a 50–74% drop in heuristic anti-slop violations across two model
families.

**Decision.** The writing standard is **documentation configuration**: a `## Writing standard` section in
`docs/agents/documentation.md`, written by `/superdev:setup`, holding a **pointer** — `controlled`, a
repo-relative path to the project's own style guide, or `none`. The plugin ships one standard,
`references/controlled-prose.md`: a **language-neutral** rule set merged from ASD-STE100 Issue 9 Part 1
and the tekom Praxisleitfaden's rule catalogue for German technical communication. The standard binds only
prose an agent writes or rewrites in that dispatch; it never governs untouched text.

**Why.** A style is not agent behaviour, it is a property of the repo being documented. The repo's own
rule that `commands/` and `agents/` stay tool-agnostic applies unchanged to a writing standard, and a
pointer keeps the rules in one shipped file that upgrades with the plugin instead of copying ~150 lines
into every consumer repo where they freeze at install time.

The standard is language-neutral because the defects are. Both source catalogues independently reach the
same rules — active voice, no nominalizations, a sentence-length cap, one instruction per sentence, one
name for one thing, no semicolon, an unambiguous pronoun referent — from different languages, which is
what makes those rules portable rather than English trivia. Merging them is also what makes the standard
usable at all: the knowledge-base config carries a `Language` field that may say German, and a
single-language standard would be inapplicable in a configuration superdev explicitly supports.

**Considered options.**

- *Both doc agents apply a standard unconditionally* — rejected: bakes a style choice into agents that
  are otherwise tool-agnostic, and leaves no answer for a repo that has its own editorial guide.
- *One shipped standard per language (`STE` for English, `RBS` for German)* — rejected: duplicates the
  ~80% of rules the two catalogues share, and every further language would fork that duplication again.
  The residue that genuinely is language-bound — spelling convention, compound formation, case forms — is
  small enough to be a *declare per language* section inside one file.
- *Restate the tekom catalogue directly* — rejected: it is a commercial work whose notice forbids
  reproduction, translation, and storage in electronic media. Its rules are cited as prior art; nothing
  is derived from its text. ASD-STE100 is published free for adoption and Part 1 is restated; Part 2 (the
  Dictionary) is copyrighted and is not reproduced.
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
changed-text-only rule needs a diff. The controller therefore passes the writer's commit range, and
`doc-reader` diffs for the **style lens only** — claim verification stays cold. `/superdev:document audit`
has no preceding writer, so it drops the style lens entirely rather than flag prose nobody touched. Docs
converge on the standard as they are touched, which leaves files in a mixed style during the transition;
this repo resolves that for itself by converting `AGENTS.md` and `README.md` once. Voiced prose stays
exempt by the standard's own scope rule, so `README.md`'s opening pitch is not converted. Sentence-length
caps stay numeric while word counts follow each language's own conventions, so the same cap is stricter in
a language that compounds heavily. A repo that needs a language-bound rule the standard leaves open —
compound hyphenation, spelling convention — declares it in that file's *declare per language* section
rather than forking the standard.
