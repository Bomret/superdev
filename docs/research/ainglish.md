# Ainglish

A research note for a superdev maintainer deciding whether to spend effort on
[Ainglish](https://ainglish.org). It answers one question: does Ainglish improve superdev, and where?

The short answer is no. The reasoning follows, and every claim about Ainglish carries its source.

Sources were read on 2026-09-17. Ainglish publishes counts that change, so the counts below are dated
readings rather than fixed facts.

## What Ainglish is

Ainglish calls itself "a developing dialect of English for clearer, more efficient communication between
AI agents" ([ainglish.org](https://ainglish.org)). Its own framing rejects the prescriptive reading: it is
"a dialect of English, not a replacement language, secret code or set of rules published from above"
([ainglish.org](https://ainglish.org)).

Three parts make up the project:

- **A register of marked forms.** A list of ratified constructs, each with a mapping back to standard
  English ([ainglish.org/register](https://ainglish.org/register)). The reading on 2026-09-17 showed 31
  ratified entries and 85 open proposals ([ainglish.org](https://ainglish.org)).
- **A governance process.** Agents propose a form, second it, measure it, and vote on it. The project
  states that "a popular idea can still fail; a vote can never substitute for evidence"
  ([ainglish.org](https://ainglish.org)).
- **A measurement harness.** A Python package, `ainglish`, ships comprehension panels, deterministic
  screens, and content-addressed corpus slices
  ([github.com/ai-nglish/ainglish](https://github.com/ai-nglish/ainglish)).

So Ainglish is a notation plus the process that admits entries into it. It is not a tokenizer trick, and
it is not a style guide for sentence form.

### The constructs

The register holds short markers that attach to a claim or an instruction. Representative entries, with
the meaning the register assigns ([ainglish.org/register](https://ainglish.org/register)):

| Form | Meaning |
|------|---------|
| `we-including-you`, `we-excluding-you` | Reader belongs to the group, or reader is informed and not tasked. |
| `you-one`, `you-all` | Addresses one recipient, or the whole group. |
| `fact-not-known`, `choice-not-made` | An answer exists and is unknown, or a decision is unmade. |
| `no-delegation`, `one-hop-delegation-allowed` | The task stays with the recipient, or moves one level. |
| `supersedes(<refs>)`, `supplements(<refs>)` | Replaces earlier instructions, or adds to them. |
| `human_needed(<why>)` | Requires a human decision, for the stated reason. |
| `X as_of(<t>)`, `X until(<t>)` | Evidence was current at time t, or the claim expires at t. |
| `still(<as-of>)` | True at the last check, and not re-verified. |
| `unless(<F>)` | A claim carrying its own falsifier. |
| `text-fixed(<ref>)`, `meaning-fixed` | Exact words required, or meaning preserved with flexible words. |
| `<assertion> [c=<0..1>; ⊥ <falsifier>]` | Inline confidence plus a concrete falsifier. |

Each form targets an ambiguity in ordinary English rather than a sentence-level defect. The register
addresses what a sentence leaves underspecified. It says nothing about voice, sentence length, or
nominalization.

### Maintenance and licensing

Jack Parnell maintains the project as the human contact, and agents named Reticuli and Dexagon do the
authoring and review ([ainglish.org](https://ainglish.org),
[ainglish.org/paper](https://ainglish.org/paper)). The harness code is MIT and the language material is
CC0 ([github.com/ai-nglish/ainglish](https://github.com/ai-nglish/ainglish),
[ainglish.org](https://ainglish.org)).

Release activity is high and external adoption is not. The reference repository showed 505 commits and one
star on 2026-09-17 ([github.com/ai-nglish/ainglish](https://github.com/ai-nglish/ainglish)). A Claude Code
plugin exists, carrying an `ainglish-write` skill and an `ainglish-participate` skill, with 11 commits and
zero stars ([github.com/ai-nglish/ainglish-claude-plugin](https://github.com/ai-nglish/ainglish-claude-plugin)).

## Evidence quality

Ainglish publishes an AI-authored paper and a limitations page, and both are unusually candid. The
findings below come from the project's own measurements, not from a critic.

**Marked forms lose to careful English.** The paper reports that "marked forms fall 10–23 percentage
points behind the careful English they compress" on cold reads, while they beat "the bare phrase people
actually write by 11–31" ([ainglish.org/paper](https://ainglish.org/paper)). The comparison that favors
Ainglish is against careless prose. The comparison against careful prose goes the other way.

**Token savings are the weakest claim.** The flagship page reports lower token cost for all four flagship
distinctions, with comprehension accuracy unsettled in every case
([ainglish.org/flagships](https://ainglish.org/flagships)). The limitations page then calls token-count
improvement "the weakest signal", says it may be "illusory", and states that "literal token counts improve
only if the tokenizer is also trained or adapted"
([ainglish.org/limitations](https://ainglish.org/limitations)).

**Replication mostly fails.** Of 65 multiply-replicated originals, eligible agreements outnumber
disagreements for 12, and "none a comprehension original"
([ainglish.org/paper](https://ainglish.org/paper)). The deterministic token metric reproduced 37 percent of
the time ([ainglish.org/paper](https://ainglish.org/paper)).

**Adoption counts do not hold up.** Over 277 candidate messages, "the scanner counts 181 uses; a judge
calibrated on 55 hand labels counts 50; the two agree on only 32"
([ainglish.org/paper](https://ainglish.org/paper)).

**The evidence is self-referential.** The paper states that "this paper is AI-authored, end to end", and
the limitations page states that "every number on this site rests on the judgement of the same class of
system the numbers are about" ([ainglish.org/paper](https://ainglish.org/paper),
[ainglish.org/limitations](https://ainglish.org/limitations)). The project calls that condition
"unmitigated" until external reproduction happens
([ainglish.org/limitations](https://ainglish.org/limitations)).

The verdict: the measurement apparatus is real and the results it produced are negative or unreplicated.
Ainglish deserves credit for publishing that instead of a marketing number. A reader who takes the
evidence at face value reaches the conclusion that the register is not yet demonstrated.

## Fit against superdev's standards

superdev governs prose in two places, and Ainglish touches them differently.

### Against controlled-prose

`plugin/references/controlled-prose.md` and Ainglish operate on different layers, so they mostly do not
meet. The controlled standard fixes sentence form: active voice, a sentence-length cap, one name for one
thing, one referent per pronoun, no semicolon. Ainglish fixes semantic underspecification inside an
otherwise ordinary sentence.

They agree on the goal. Both want one reading per sentence. `controlled-prose.md`'s `Sentences` section
already demands that a pronoun have exactly one possible referent, and Ainglish's `we-including-you`
attacks the same class of defect from the vocabulary side.

They conflict on form, in four places:

- **Notation against words.** `controlled-prose.md`'s `Punctuation` section forbids a character in place of
  a word and forbids a mathematical symbol in running prose. Ainglish's claim tag
  `<assertion> [c=<0..1>; ⊥ <falsifier>]` is both.
- **Coined vocabulary.** The `Words` section says to use the shorter and more common word of two with the
  same meaning. `overslip` is neither shorter nor more common than "missed".
- **Function words.** The `Sentences` section says to keep the function words a language uses, and to omit
  a word only when exactly one reading remains. Compressed forms such as `done-under(<C>)` cut them.
- **The semicolon.** The claim tag carries one, which `controlled-prose.md` forbids outright.

A repo could adopt both by declaring the Ainglish markers exempt as identifiers. That exemption would then
cover the substance of what Ainglish adds, which makes the combination formal rather than useful.

The deeper point is the one the Ainglish paper itself supplies. superdev's docs are already the careful
English that marked forms measured 10 to 23 points behind
([ainglish.org/paper](https://ainglish.org/paper)). Ainglish's own evidence predicts a comprehension loss
for this repo, not a gain.

### Against the prompt-architecture rules

Root `AGENTS.md` governs `plugin/skills/`, `plugin/agents/`, and `plugin/references/` with its own rules,
outside `controlled-prose.md`. That prose does carry the ambiguities Ainglish names. A dispatch tells a
subagent to do a thing, and whether the subagent may delegate it is often implicit. A reference states a
platform fact that was true at the last check.

superdev already resolves those in plain English, and resolves them more explicitly than a marker would.
`plugin/agents/implementer.md` writes "You never talk to the user" and "Work only inside that worktree,
only on that slice", which is `no-delegation` plus a scope bound, stated so a model cannot misread it.
Root `AGENTS.md` requires a dated verification for every platform-dependent claim, naming the version and
the observed evidence, which is `still(<as-of>)` with the evidence attached. The repo's rule is stronger
than the marker, because the marker records that a check happened and the repo's rule records what the
check saw.

Ainglish also runs against the repo's own prompt-architecture rule that a description is permanent context
load. A marker vocabulary of 31 entries has to reach the model before the model can read it. Either every
prompt carries the register, or the model guesses. Neither is cheaper than the plain sentence.

### Generated artifacts

Slice bodies, PR text, and knowledge-base pages have human readers. A reviewer reading
`fact-not-known — <ISSUE>` in a PR description has to learn a register to read a status line. The
comprehension result above applies to those readers too.

## Cost of adoption

Adopting Ainglish is not a small edit. A full adoption touches, at minimum:

- A new reference under `plugin/references/`, carrying the register, plus its row in
  `plugin/references/AGENTS.md`.
- A revision of ADR 0012, which chose `controlled` after weighing three catalogues, plus a new ADR for the
  notation layer.
- A new `## Writing standard` value, and the `/superdev:setup` seed that offers it. `scripts/drift/checks.js`
  asserts the seed carries the section, so the seed change is checked.
- Drift rows in `scripts/drift/contracts.js`, which pins `controlled-prose.md`'s `Modes` and `Self-check`
  sections today. A second standard needs the matching pins.
- `plugin/skills/prose-check/SKILL.md`, which loads `controlled-prose.md` unconditionally by ADR 0057, and
  which reports findings under that file's own section headings.
- `plugin/agents/doc-writer.md` and `plugin/agents/doc-reader.md`, which apply and verify the standard.
- A pinned upstream version. The register changes by vote, and superdev's prose would track a moving
  vocabulary it does not control.

The honest measurement path costs more than the edits, and superdev carries no instrument for it
(ADR 0071). Ainglish is not one contested line. It is a vocabulary, and settling it against superdev's own
prose would take a measurement apparatus this repository deliberately does not keep.

## Recommendation

**Do not adopt.**

The reason that drives it stands alone. Ainglish's own paper measures its marked forms 10 to 23 percentage
points behind the careful English they replace, and superdev already writes that careful English by
contract ([ainglish.org/paper](https://ainglish.org/paper), ADR 0012). Ainglish wins only against the
careless prose superdev's standard exists to prevent. Adopting it would trade a measured improvement for a
measured regression.

Three further facts support the same answer. Token savings are described by the project as possibly
illusory and dependent on a trained tokenizer, so the cost argument fails
([ainglish.org/limitations](https://ainglish.org/limitations)). The comprehension originals did not
replicate ([ainglish.org/paper](https://ainglish.org/paper)). External adoption is near zero, so superdev
would be pinning its prose to a vocabulary with no speech community
([github.com/ai-nglish/ainglish](https://github.com/ai-nglish/ainglish)).

One thing is worth keeping without adopting anything. The register is a good catalogue of the ambiguities
that hurt agent instructions, and it is CC0, so its ideas are free
([ainglish.org](https://ainglish.org)). A maintainer who meets a real ambiguity in a dispatch can read the
register for the distinction and then write the distinction in plain English. That costs no reference
file, no ADR, and no drift row.

Revisit this note when an external party reproduces an Ainglish comprehension result against careful
English, which is the condition the project's own limitations page names
([ainglish.org/limitations](https://ainglish.org/limitations)).

## What this note could not establish

- Per-construct measurement detail. The register lists a form and its meaning, and the paper reports
  aggregate results. The mapping from an individual entry to its evidence was not traced.
- Package version and release cadence. PyPI did not render for the fetch tool, so version numbers come
  from search result titles rather than from the package page.
- Whether Ainglish compares itself to ASD-STE100, Basic English, or Attempto Controlled English. The home
  page, the paper, and the limitations page carry no such comparison. The absence is a reading of those
  three pages and not of the whole site.
