# 0036: The plan sketches its design before it decomposes

**Status:** Accepted

**Supersedes:** [ADR 0009](0009-plan-visuals-are-markdown.md).

## Context

`/superdev:plan` ends its interview holding a design. The operator does not. §5 quizzes them on slice
granularity and dependencies, never on what the feature is made of, and ADR 0030 keeps structure out of a
slice `spec` on purpose. So the operator approves a plan whose shape they have not seen, and the
implementation sometimes builds something they did not predict.

ADR 0009 decided that plan visuals are markdown in the epic, and rejected every HTML option. Its reasoning
turns on the reader: the epic's visuals serve the reviewer reading the pull request later, and a
git-ignored HTML file "serves only the author, who just ran the interview and needs it least". That
reader model is what this decision overturns. The author is exactly who cannot see the design, and the
epic's two visuals draw the dependency DAG and the file touch map — neither draws the components.

ADR 0009 also priced HTML as "shipping a stylesheet, browser JS, and an HTML template", which is a
renderer subsystem. An agent authoring one self-contained file is not that, and it is the shape
`mattpocock-skills:prototype` already prescribes: "one file, plain HTML/CSS, no framework, no bundler, no
server, everything inline so it opens by double-click".

## Decision

`/superdev:plan` §3 offers a **design sketch** after the `Explore` grounding maps the existing code and
before decomposition begins. The operator asks for it or declines it. On a yes the command reads
`references/design-sketch.md` and writes `.superdev/design/<slug>.html`: one card per **component** the
plan intends to **add**, **change**, or **delete**, in the implementation language's own terms, each card
naming its interactions with other components, and a changed card naming what the component does now and
what it becomes. The step then waits, and rewrites the file until the operator approves it.

The artifact is pure HTML with inline CSS. No JavaScript, no network, no build step, and superdev still
ships no renderer. It is git-ignored, overwritten per feature slug, and never reconciled.

## Why

The correction has to land before the slices exist, or it costs the decomposition. Placing the step after
the grounding rather than before it is what lets the sketch mark *change* honestly, because the agent has
just read the code it is describing.

Holding the contract in `references/design-sketch.md` rather than in the command body keeps it out of
context on every run that declines the sketch, which is the boundary the prompt-architecture rules already
sanction.

## Considered options

- **Mermaid in the epic, as ADR 0009 decided.** Still correct for the epic, and untouched by this
  decision. It draws the DAG for a later reader, not the components for the author.
- **A mermaid block in the chat.** Lost on observed evidence: this repository's existing inline mermaid
  does not render in session, so the diagram arrives as source text.
- **A markdown file with mermaid, read in the editor preview.** Renders, and ships nothing. Lost because
  the operator asked for a styled artifact in the prototype skill's shape.
- **HTML with Tailwind and Mermaid from CDNs**, the shape `mattpocock-skills:improve-codebase-architecture`
  uses. Real arrows and automatic layout for two `<script>` tags. Lost because it needs the network at the
  moment the file is opened, where the sibling prototype skill's self-contained rule does not.
- **Folding the sketch into the §5 quiz.** One approval point instead of two. Lost because the slices
  already exist there, so a design correction throws away the decomposition.
- **Its own section between §2 and §3.** Cleaner structure. Lost because the `Explore` grounding has not
  run yet, so "change X" would be a guess.
- **Showing the sketch without waiting.** Never blocks. Lost because the gap this closes is an approval
  the operator cannot make, and a display they may read after the slices are cut does not close it.
- **Keeping the sketch and reconciling it after implement.** A lasting architecture picture. Lost because
  it hands `/superdev:document` a second surface to maintain, to serve a reader the epic already serves.
- **A drift check pinning the ordering, or an eval arm.** Lost on cost against no benefit: scanner 1
  already reports a cited reference that does not exist, `ADR_STATUSES` already admits `Superseded`, and
  no clause is duplicated across two documents, which is the shape a drift row guards.

## Consequences

`.superdev/design/` accumulates one file per feature slug, git-ignored and unswept — the same shape
`.superdev/brainstorm/` already has. `/superdev:status` scans only `.superdev/scopes/*/`, so it never sees
them.

The ceiling is hand-authored layout: with no JavaScript there is no layout engine, so the sketch is cards
and text rather than a drawn graph with routed edges. Revisit if a plan appears whose component graph
genuinely defeats cards.

ADR 0009's own text is unchanged, including its three rejected HTML options, which still lose for the
reasons recorded there. Only its Status line and a supersession pointer are added, per the
supersede-never-edit rule this decision also writes into `references/domain-modeling.md`.
