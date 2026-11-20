# 0266: The design sketch draws the design and states why

**Status:** Accepted

**Supersedes:** [ADR 0036](0036-the-plan-sketches-its-design-before-it-decomposes.md).

## Context

ADR 0036 added the design sketch: a page of cards, one per component, each naming its interactions as text. It
ruled out JavaScript and the network, so the page has no layout engine, and its Consequences named the ceiling:
"cards and text rather than a drawn graph with routed edges". `references/design-sketch.md` also forbade an
introduction, a summary, and a recommendation.

The operator found the result of little use. A reader rebuilds the component graph in their head from
`→ verb Other` lines, and the page names what changes without the problem it solves, the decisions behind it, or
the alternatives that lost. The operator named the HTML report of `mattpocock-skills:improve-codebase-architecture`
as the quality bar. That report puts a before/after diagram at the centre of every card, draws graphs with Mermaid
and editorial visuals with hand-built SVG, and carries the reasoning in one-sentence `Problem` and `Solution`
fields and short `Wins` bullets, with no explanatory paragraph.

## Decision

The design sketch keeps its place in `/superdev:plan` §3, its trigger, its wait for approval, its path, and its
throwaway status. Its content and its artifact rules change:

- **Header.** One sentence of `Problem`, one sentence of `Solution`, and `Wins` bullets of six words or fewer.
- **Before / after diagram.** The affected part of the system as it is and as the plan leaves it, side by side,
  components coloured as added, changed, or deleted, and each edge labelled with its verb. A plan that only adds
  components draws one diagram.
- **Decisions.** One card per design decision the interview settled: the choice, why in one sentence, the
  alternative that lost, and an ADR callout where the decision rests on or reopens an ADR.
- **Components.** The cards of ADR 0036, each with a `why` line.

The page loads Mermaid from jsDelivr, pinned to an exact version, through one `<script type="module">`. Graph-shaped
structure is a Mermaid flowchart. A structure Mermaid lays out badly — layers a call passes through, a component
absorbing others — is hand-built HTML and inline SVG. CSS stays inline. The page carries no other script.

## Why

A diagram is what lets the operator approve a design at a glance, which is the approval ADR 0036 exists to get.
Mermaid's automatic layout routes edges reliably, and hand-placed SVG coordinates from a model drift as the
component count grows. The one-sentence fields carry the reasoning without the paragraphs the page still forbids.

Without the network a Mermaid block shows its source text, which reads as a node and edge list. The hand-built
visuals and the cards render either way. The sketch is opened by the operator on the machine that planned, so the
fallback is rare and still legible.

## Considered options

- **Stay offline with hand-built SVG only.** Keeps ADR 0036's self-contained rule. Lost because layout quality then
  rests on coordinates the model places by hand, which the reference report itself avoids for graphs.
- **Vendor Mermaid into the plugin and inline it into each page.** Offline and drawn. Lost because every sketch
  carries a multi-megabyte library, and superdev ships no renderer.
- **Tailwind from a CDN, as the reference report does.** Lost because the inline stylesheet already gives the look,
  and a second script adds a network dependency for no drawing gain.
- **An unpinned Mermaid major.** Lost because a new release could change how the same source renders between two
  revisions of one sketch.

## Consequences

The sketch needs the network the first time it is opened, and a jsDelivr outage shows diagram source instead of a
drawing. Raising the pinned version is a prose edit to `references/design-sketch.md`. INV-0054's self-contained
clause now reads as one pinned script and inline CSS.
