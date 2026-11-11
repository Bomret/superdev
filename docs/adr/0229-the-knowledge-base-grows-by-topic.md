# 0229: The knowledge base grows by topic

**Status:** Accepted

## Context

superdev's own outline gave every built feature a `How it works: <mechanism>` page, and the wiki reached 50
of them. A reader looking up one subject, such as tests, collects it from several pages. The shipped doc pass
names no page shape, and the local seed's `docs/kb/<feature>-spec.md` example points to one file per feature,
so every adopter's knowledge base drifts the same way.

## Decision

The doc pass routes a feature's knowledge-base text to the **topic page** of an existing outline entry and
stages it as a whole-page `upsert` with `live-hash` (ADR 0094). Every page the doc pass writes is one the
outline names explicitly. An outline entry holding a placeholder, such as `How it works: <mechanism>`, names
no page, and the doc pass writes no new page under it. When no entry fits, the doc pass adds a new topic entry
to `docs/agents/knowledge-base.md` in the scope's doc commit and states the reason there and in its report.
Every seed proposes a topic-shaped outline. superdev's own outline replaces the `How it works:` group with
topic pages, and its `Guide:` pages and the `Concepts` aggregate page stay.

## Considered options

- **Outline-only fix**: topic pages in superdev's outline, plugin unchanged. Rejected: every adopter's
  knowledge base keeps drifting to one page per feature.
- **Hub pages over the feature pages.** Rejected: a topic layer is added, and the per-feature pages keep
  growing below it.
- **Tags or categories.** Rejected: the wiki backends offer no such structure.
- **Topic pages as aggregate sections**, one `action: patch` section per feature (ADR 0027). Rejected:
  Confluence marks nothing aggregate, and the page becomes a pile of feature sections, cut by feature again.
- **Keep honoring a placeholder entry.** Rejected: an adopter's outline that keeps the placeholder keeps the
  sprawl until the adopter edits it.

## Consequences

Two scopes that stage the same topic page leave the second one staged after the first publishes, because its
`live-hash` no longer matches. Re-running `/superdev:document` re-reads the live page, rebuilds the staged
page from it with the second scope's passages kept, and re-stages it with a fresh hash. Links to a removed
`How it works:` page stop resolving, and the wiki carries no redirects. An adopter's existing per-feature
pages stay as they are: the doc pass corrects stale text on them and adds none.
