# 0190: Listed skill files are written as prompt concepts

**Status:** Accepted

**Amends:** [ADR 0169](0169-agent-bodies-are-written-as-prompt-concepts.md), whose convention now also
governs the skill files the glossary lists, and
[ADR 0170](0170-prompt-concept-overlap-is-judged-by-rule-equivalence.md), whose overlap test now applies
to a standing-code review, to a reference-only change, and to a governed skill's dispatch prose.

## Context

ADR 0169 writes every agent body as prompt concepts. The skill bodies kept the shape the agents had
before it. `plugin/skills/review/SKILL.md` states rationale and history inline, and it states conditions
in the middle of a paragraph. Its dispatch prose restates contracts that `review-checklist.md` and the
agent bodies already own, such as `## Fail-to-pass run` and `## Test order`. A dispatch is the later,
more specific instruction, so it wins a conflict with the agent body (ADR 0035). A restated rule that
drifts therefore overrides the agent without a word. The skill's scope-mode step also loads on every
ad-hoc review, although it applies only when a live run is found.

The overlap test of ADR 0170 applies only to a change that touches an agent body, and it excludes
dispatch prose. A standing-code review of the agent bodies gets no overlap finding (triage #1310). A
change that edits only a reference section an agent reads gets none either (triage #1316).

## Decision

- **The convention governs listed skill files.** A skill file is written as prompt concepts when the
  glossary's **Prompt concept** entry lists it. The pilot lists `plugin/skills/review/SKILL.md`,
  `plugin/references/review-scope-mode.md`, and `plugin/skills/verify-ship/SKILL.md`. Verify-ship is a
  short skill that dispatches no subagent, so every rule it states is a controller rule. A later scope adds a skill file to the list when it rewrites
  that file.
- **Steps stay the ordered frame.** A skill's numbered steps keep their order. Prompt concepts live inside
  each step. A concept whose condition is the step's trigger takes that trigger as its condition head. A
  concept with a narrower condition states its own "Applies to …" head.
- **Rationale leaves the prompt.** A governed file states what the controller does. The reason for a rule
  lives in the ADR its citation names. An ADR or invariant id stays as a citation.
- **Dispatch prose points.** A governed skill's dispatch names the agent concept or the reference section
  that owns a rule, and it hands the data that rule needs. Where the dispatch departs from the agent body,
  it names the rule it departs from.
- **Scope mode is its own reference.** Every scope-only rule of the review skill moves to
  `plugin/references/review-scope-mode.md`: the fix loop, the run handoff, and the scope-only rules the
  earlier steps carried. The skill reads that file when it finds a live run, before its first scope write.
- **The controller keeps its own rules in reach.** A rule the controller carries out stays in a file the
  controller reads. A rule only an agent reads is no home for it.
- **The overlap test follows the governed set.** It applies to a review subject, a change or standing
  code, that includes a governed body or a reference section a governed body directs its reader to read.
  For a governed skill, it also judges a dispatch sentence against the agent body that sentence reaches.
  Dispatch prose of a skill the glossary does not list stays outside the test.

## Considered options

- *Govern every skill at once.* Rejected: every skill except the pilot is unrewritten, so each later
  scope that touches one would draw overlap findings on prose nobody rewrote. An Important conflict pair
  holds the scope.
- *Move the scope-mode step verbatim.* Rejected: that step holds the fix loop, the hardest prose in the
  skill. A pilot without it tests the convention on the easy half.
- *Keep pointing as an authoring rule only.* Rejected: without the overlap test on dispatch prose, a
  restatement comes back unnoticed, and the dispatch wins every conflict it causes.
- *Merge the scope-mode step into `scope-mode.md`.* Rejected: many skills read that file, and a read loads
  the whole file, so each of them would carry the review fix loop.

## Consequences

The review skill loads less text on an ad-hoc review, and a reviewer can grade its dispatch prose against
the agents it reaches. The rule inventory and the ad-hoc comparison of this scope show whether the
rewrite kept the skill's behaviour. A single comparison run per version is one sample, not a measurement
(ADR 0129). The rollout to other skills is a later decision.

The governed review files hold fewer words than the skill alone held before the rewrite. The 0.83.0
`plugin/skills/review/SKILL.md` held 11,277 words, and the skill at the pilot's base commit held 11,403.
The rewritten `plugin/skills/review/SKILL.md` holds 3,010 words and
`plugin/references/review-scope-mode.md` holds 5,173, 8,183 together. An ad-hoc review loads
the 3,010-word skill and not the scope reference.

**Comparison.** One headless review of the 0.83.0 skill and one of the rewrite as commit `e42e0db7` holds
it each read the fixed range `4d33f993^..4d33f993` from a checkout at `6dd42b91`. The standing-code review's
fixes below changed both files after `e42e0db7`, in `83638ca7`. Each run loaded the version it claims, finished under
its budget, met no denied call, and left the tree clean. Both runs report no Critical or Important finding
and judge the commit ready to merge. They cost $1.75 (0.83.0) and $1.25 (rewrite) of a $10 cap each.

- Neither version found the defects that `a2119a75` (a bare relative directory literal selects suites) and
  `58038d8f` (a `.md` name in a bare relative string or a temp-dir join selects suites) fixed later.
- Both versions report the wrong `RELEASE_TOOLING` reason for `package.json`, the line-based comment
  stripping that can drop a real read (a ` // ` inside a string), and the doubled `rel.endsWith('.md')`
  check.
- Only the 0.83.0 run reports that `docs/agents/verification.md` says a `.md` path is named "as a string"
  where the code's `read` pattern matches only a basename that ends a string. It also reports two missed
  read shapes: a name followed by `#anchor`, and a comma-separated list. The code at `4d33f993` confirms
  each.
- Only the rewrite run reports that the `target` lookup takes the first `require.resolve` declaration of a
  name whatever its scope, and the open question that `release.config.cjs` selects no suite. The code
  confirms the first, because `text.match` returns the first match.

Each version reports real Minor findings the other misses. The difference is reviewer sampling over
Minor-level findings and no lost rule. The ad-hoc rewrite run made no read of `review-scope-mode.md`.

A standing-code review of the rewritten skill (`/superdev:review plugin/skills/review`) applied the widened
overlap lens to a governed skill file. It reported No-overlap, Effect, condition-head, and rationale
findings, all Minor, and two gaps in `review-scope-mode.md`: the moment its Config concepts fire, and the
timing of the range base. The slice fixed all of them.

The 0.86.0 `plugin/skills/verify-ship/SKILL.md` held 1,509 words. The rewritten skill holds 1,485. The
rewrite adds a term list, a condition head on each concept, and a split of the closing paragraph, and
removes rationale and restated rules, so the word count stays near the original. Its gain is that each
concept holds three main sentences or fewer, and that the exit table in the rule inventory shows the same
store, host, and ledger calls, next command, and offer on every exit.

The 0.98.1 `plugin/skills/wrap-up/SKILL.md` held 1,898 words. The rewritten skill holds 1,817. The
rewrite adds the same term list and start concepts as verify-ship, a condition head on each concept, and a
numbered cleanup order, and removes rationale and restated rules. Its before/after exit table shows the same
gates, asks, refusals, store, host, and ledger calls, next commands, and offers on every exit.
