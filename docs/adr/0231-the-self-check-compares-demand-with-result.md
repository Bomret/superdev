# 0231: The self-check compares what an item demands with what the work does

**Status:** Accepted

**Amends:** [ADR 0205](0205-the-implementer-self-checks-before-it-reports.md): a self-check item counts as covered
only where its evidence quotes what the item demands beside what the work does.

## Context

A full-tier run of 12 slices on a UI scope, read from its transcripts (triage record #158), failed all 12
first slice reviews on Important findings, although every self-check marked its items covered. The
implementer counted an item covered when a test of its own existed. The reviewer judged an item met when
the result matched the reference the dispatch cited. The Important findings were reference deviations
(a mockup's dialog size, a design-system type), items that held on some pages and not on others, tests
that a plausible wrong implementation would pass, and broken repository rules. The build dispatch already
named every reference the reviewer used, so a longer dispatch would not have changed the result.

## Decision

A self-check marks an item `covered` only with evidence that quotes what the item, or the reference its
`spec` or dispatch cites, demands beside what the work does. A test's existence alone is no evidence. An
item that names a set, such as every page or each dialog, is walked member by member. On a `behavior`
slice, each covered item also names one plausible wrong implementation that its test rejects. On a fix
dispatch, each finding's claim is quoted beside what the work now does. An item the implementer has no
tool to observe is marked `not observable` with its reason, and the report names it as a concern under
`DONE_WITH_CONCERNS`. The item stays in the spec's acceptance list, which the slice reviewer already reads,
so the reviewer judges it in its blind pass like any other. The controller relays no concern text to the
reviewer, and the dispatch hands only the log path. The `lite` tier stays outside the self-check, as ADR 0205 decided.

## Considered options

- **Compare only where a reference is cited, and keep a test as evidence elsewhere.** It saves self-check
  turns in a repository with no reference artifacts, but leaves an item that holds on one page of several
  marked covered.
- **Carry each `not observable` item to the operator through a new record that `/superdev:submit-pr` lists.**
  It keeps an unattended run from dropping a visual check, at the cost of new run state for a case the
  slice reviewer already judges.
- **Hand the implementer `references/review-checklist.md` or its `## Test gaps` lens.** ADR 0205 rejected
  the checklist on token cost, and only `test-gap-auditor` reads `## Test gaps` (ADR 0162). The test-hole
  line states its one rule in the implementer's own body instead.

## Consequences

A self-check entry is longer, and a reviewer can check each quoted value against the diff. Cutting the
test cost inside the build and fix loop, and flagging a slice that blocks several others, stay outside
this decision. Each has its own triage record.
