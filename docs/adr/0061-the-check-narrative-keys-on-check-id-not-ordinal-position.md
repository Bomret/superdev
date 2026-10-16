# 0061: The check narrative keys on check id, not ordinal position

**Status:** Superseded

**Superseded by:** [ADR 0153](0153-drift-check-checks-facts-not-wording.md), which replaces the per-check
narrative with one table row per check.

**Context.** `scripts/AGENTS.md`'s drift-check section walks all seventy-one checks in one continuous prose
run, numbering each by a spelled-out ordinal — *First*, *Second*, … *Seventy-first*. The ordinals are
maintained by hand. `drift/checks.js` says what that costs, in its own header: *"A new contract is appended
at the END of this array. Every ordinal after an insertion point has to be rewritten by hand in
`scripts/AGENTS.md`, which is the cost the append-at-the-end rule exists to avoid."* The scheme also pulls
tooling behind it: `CHECK_COUNT_CLAIMS` pins three sentences that state the count in words, and
`numberWord()` with `NUMBER_ONES`/`NUMBER_TENS` exists only to spell an integer the way those sentences
spell it.

**Decision.** Each check's paragraph is keyed by its **check id** — the same string `drift/checks.js`
registers and `scanNarrativeCoverage` already reads — instead of by an ordinal word. The narrative's prose
is otherwise untouched. `CHECK_COUNT_CLAIMS`, `numberWord()`, `NUMBER_ONES`, and `NUMBER_TENS` are deleted
along with the scheme that needed them. `drift/checks.js`'s append-at-the-end rule is lifted: a new check
may be registered wherever it belongs.

**Why.** The narrative is **reasoning**, not a restatement of the registry: it explains why
`run-state-contract` exempts no store where `assignee` exempts one, why a lead-in anchoring carries extra
weight on the dependency element, why naming the exceptions cannot drift. None of that is derivable from
`checks.js`, so generating the section was rejected. The ordinal is the one part that *is* purely
positional, and it is the only part that imposes a seventy-one-item hand edit on an unrelated change.

**Considered options.**
- *Generate an id and `ok`-phrase roster from `checks.js` into a marked block, keeping the prose beneath.*
  Rejected: it cuts more lines, but it adds a generator plus a drift check to guard the generator's output
  — tooling added to remove tooling — and the roster restates what the paragraph beneath it already says.
- *Leave the ordinals alone.* Rejected: it is a tolerable tax only until the next check lands out of order,
  and `checks.js` already contorts its own registration order to avoid paying it. ADR 0057's `prose-check`
  entry was appended at the end for exactly this reason rather than placed with its siblings.

**Consequences.** Cross-references inside the narrative that name a position ("the `run-state-contract`
check (sixty-sixth, below)") are rewritten to name the id instead. The count claims in `scripts/AGENTS.md`
and the root `AGENTS.md` lose their mechanical pin: a stale count is no longer caught by drift-check, and
nothing replaces that guard, because a count nobody has to keep in sync is a count worth stating loosely or
not at all.
