# 0009: A plan's visuals live in the markdown epic, not a rendered artifact

**Status:** Superseded

**Superseded by:** [ADR 0036](0036-the-plan-sketches-its-design-before-it-decomposes.md), which keeps the
epic's markdown visuals and adds a throwaway HTML design sketch for the plan's author.

**Context.** A plan's dependency structure is real data, because `id` and `depends-on` form a DAG. The epic
renders it as a numbered list the reader has to topologically sort in their head. Tools in this space
(Builder.io's `visual-plan`, for one) answer that with a rendered document: a block catalog the agent
authors against, plus a renderer that draws canvases, wireframes, and file maps. Porting that shape into
superdev means shipping a stylesheet, browser JS, and an HTML template, and writing the output somewhere
a browser can open it.

**Decision.** Plan visuals are markdown sections in the epic: a mermaid `## Slice graph` and a plain-text
`## Touch map`, each written only when the plan's shape defeats a list. superdev ships no renderer, no
stylesheet, and no HTML artifact.

**Why.** The reader who needs the visual is the one reviewing the plan later, on the code host, inside
the PR. Forgejo sanitizes HTML in issue and PR bodies while rendering markdown and mermaid, so an HTML
file cannot reach that reader wherever it is written. A git-ignored one under `.superdev/` reaches only
the plan's author, who just ran the interview and needs it least. Markdown also has no second surface to
drift out of sync with, and nothing generated for `/superdev:document` to fail to reconcile.

**Considered options.**

- *HTML under git-ignored `.superdev/plans/`*. Rejected: serves only the author, and is invisible to reviewers.
- *HTML committed beside the plan*. Rejected: a generated blob in version control, stale on every plan
  revision, and the path is slice-store-specific, which the pluggable-backend rule forbids.
- *HTML as a Forgejo issue attachment*. Rejected: reaches the reviewer only via a download, goes stale
  with no diff to signal it, and every non-Forgejo code host would need its own version.

**Consequences.** A slice store that renders neither mermaid nor HTML (Jira) shows the slice graph as a
fenced code block, legible but unrendered. The touch map is plain text and unaffected. The ceiling on plan
visuals is mermaid's syntax. Revisit only if a reader who cannot use markdown appears.
