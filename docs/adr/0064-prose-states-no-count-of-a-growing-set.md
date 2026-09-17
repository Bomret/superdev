# 0064: Prose states no count of a growing set

**Status:** Accepted

**Context.** A sentence that counts an inventory is wrong the next time the inventory changes. "The eight
shipped hooks" reads as a fact and is a hostage: adding a hook makes it false in every document that
repeats it, and nothing fails when one of them is missed. The count carries no information the named set
does not already carry, because the reader wants to know which hooks exist and where they live.

The failure is observed, not predicted. `docs/adr/0061` says the drift-check narrative walks "all
seventy-one checks"; the registry holds seventy-four. `docs/adr/0055` and `docs/adr/0056` say the OpenCode
render emits eleven skills; it emits twelve, because two surfaces landed after those records were written.
Each was true on the day it was written and rotted without a single edit to the sentence.

`documentation.md`'s **Single-source** rule already ruled on this, the other way. It named a count as a
derivable fact and prescribed one owning place for it, which makes a count legitimate as long as it is
stated once. That is the right treatment for a name-list and the wrong one for a count. A single-sourced
count still needs a hand edit on every add and remove, and nothing reports the edit that never happened.

**Decision.** Prose states no count of a set the repository can grow or shrink. It names the set, or names
its members. A numeral appears only where the number is the fact itself: a cap, a limit, a threshold, or a
contract of fixed arity.

The rule lands in every place a writing standard governs, because no one standard governs the whole tree:

- `references/controlled-prose.md`, under `## Words`, which reaches `AGENTS.md` files, `README.md`, ADR
  text, glossary entries, knowledge-base pages, and report text, in this repository and in every repository
  that selects the standard. `doc-writer` applies it, `doc-reader` verifies it, and
  `/superdev:prose-check` reports it on demand.
- Root `AGENTS.md`'s prompt-architecture rules, which are the only rules governing `plugin/skills/`,
  `plugin/agents/`, and `plugin/references/`. The writing standard's own `## Scope` excludes prompt prose,
  so a rule written only in the standard leaves half the shipped tree ungoverned.
- The **Single-source** clause in `references/documentation.md` and in this repository's
  `docs/agents/documentation.md`, which stops naming a count as a fact to single-source.

Existing ADR text stays as written. It needs no exemption clause, because the standard's `## Scope`
already binds only the prose an agent writes or changes. An ADR is a dated record of a decision, so a count
inside one describes the day it was written. A new ADR is text somebody writes, and is governed.

**Why.** The rule removes the maintenance rather than relocating it. Single-sourcing moves a hand edit to
one file; deleting the count removes the hand edit. The named set is the durable form of the same sentence:
`hooks/` lists its own members, and a reader who needs the number counts them from the place that cannot be
stale.

The repeated homes are not redundancy. Each is a governing standard the tree actually has, and a rule
written in one of them silently exempts the prose the others own. `FULL_SUITE_CONTRACTS` is the
precedent named in root `AGENTS.md`: a one-sided pin reads enforced, stays green, and lets the live path
drift.

**Considered options.**
- *Keep Single-source unchanged and delete only the restatements.* Rejected: it leaves the owning place
  counting, so root `AGENTS.md`'s `Structure` listing still needs a hand edit on every add and remove. The
  listing names every member on the same line, which is what the reader came for.
- *Permit a count where the members are enumerated beside it.* Rejected: it keeps a numeral that a reader
  must reconcile against the list by hand, and it splits the rule into a judgment about proximity. The
  numeral earns nothing where the list is already there.
- *A drift-check scanner over tracked markdown.* Rejected: the check is a number word before a plural noun,
  and that pattern cannot separate "the eight hooks" from "two halves of a contract" or "the three run
  kinds". A tuned allowlist becomes its own maintained inventory, which is the cost the rule exists to
  remove. `scripts/AGENTS.md` names the standing ceiling on an absence check: a missed paraphrase is a
  silent pass.
- *A glossary entry naming the concept.* Rejected: the rule is one sentence in three files and no surface
  passes the term to another, so the entry would be vocabulary with no reader.

**Consequences.** A reader who wants the number counts the members. That is a real cost on a long listing
and a small one on every listing this repository has.

The rule is enforced by prose alone, so a regression reaches `main` whenever no doc agent reads the
changed file. `/superdev:prose-check`, `doc-writer`, and `doc-reader` catch it on a file they touch, and
`review-checklist.md`'s **duplicated fact** smell catches a restatement. A count written in a file nobody
reconciles survives until somebody reads it. The drift-check option above stays available if that turns
out to happen often.

Consumer repositories that select the `controlled` standard inherit the rule on the next release. A
repository whose documentation deliberately counts something — a specification with a fixed item count, a
compliance list — writes that count as the fact it is, which the cap-and-limit exception already permits.
