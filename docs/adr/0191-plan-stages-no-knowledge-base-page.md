# 0191: Plan stages no knowledge-base page

**Status:** Accepted

**Amends:** [ADR 0023](0023-the-knowledge-base-publish-is-its-own-command.md), which keeps
`/superdev:plan` as a knowledge-base writer that stages its pages.

## Context

ADR 0023 removes every knowledge-base backend call from `/superdev:plan`, and keeps plan's seed of the
feature specification and ADR summaries as staged pages under `.superdev/kb-pending/<slug>/`.
`/superdev:publish-kb` reads that directory and cannot tell a planned scope from a shipped one. Its only
guard is the containment test of `lib/kb-containment.js`.

After a plan-only run, that guard gives one of two results:

- Plan made a design-docs commit. The scope branch is not contained in base, the script refuses, and the
  skill asks once whether to publish anyway. The question names an unmerged branch, and no implementation
  exists.
- Plan had nothing to commit, which `skills/plan/SKILL.md` allows when no capture crystallised. The scope
  branch sits at the base tip, `testContainment` reads it as contained, and publish-kb sends the pages
  with no question.

In both cases publish-kb offers pages that describe a feature nobody has built. This is the claim
ADR 0023 exists to keep off a reader-facing surface.

`/superdev:document` already writes every knowledge-base page from the built code, through its
doc-writer, and stages it for a remote backend.

## Decision

`/superdev:plan` writes no knowledge-base page, for any backend. `references/plan-kb-staging.md` is
deleted. `/superdev:document` is the only command that writes or stages a knowledge-base page, and
`/superdev:publish-kb` the only one that sends a staged page.

The rule covers a local `docs/kb/` backend too. A page plan seeds there describes intent, and the
doc-writer rewrites it from the code in the same scope.

## Considered options

- **Keep the seed, and have publish-kb refuse a scope whose ledger stage reads `planned`.** It adds a
  second gate beside containment, and keeps a page whose content the doc pass replaces anyway.
- **Write plan's seed to a path publish-kb never reads, as input for the doc-writer.** More moving parts
  for content the specification and ADRs on the scope branch already hold.
- **Make the containment test treat a branch at the base tip as unmerged.** It closes the silent case
  only. The question in the other case still offers pages for an unbuilt feature.

## Consequences

A staged page always comes from a documentation pass over built code. A scope that is only planned holds
no staged page, so `/superdev:publish-kb` and `/superdev:status` show none for it.

The `kb-no-backend-call` drift check keeps `skills/plan/SKILL.md` in its document list, so a plan step
that reaches a backend still fails it.

A consumer repository whose `docs/agents/knowledge-base.md` came from an older seed still names plan as a
writer. `/superdev:setup`'s seed reconcile (ADR 0107) offers the corrected lines.
