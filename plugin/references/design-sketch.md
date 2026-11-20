<!--
  Attribution: the page structure, the before/after diagram, the Problem / Solution / Wins fields, and the
  diagram patterns below are adapted from the improve-codebase-architecture skill's HTML report, and the
  single-file rule from the prototype skill, both by Matt Pocock (https://github.com/mattpocock). Credit to
  their author.
-->

# Design sketch

An HTML page that shows the operator the design `/superdev:plan` is holding, and why, while changing it is still
free. `skills/plan/SKILL.md` §3 reads this after its grounding step and before it decomposes, and only when the
operator asked for a sketch.

The reader is the operator running the interview, not a later reviewer. The epic's `## Slice graph` and
`## Touch map` serve that other reader and are unaffected: they draw the dependency order and the files, where this
draws what the feature is made of and why it takes that shape.

**The diagrams carry the weight.** A reader who sees only the header and the before/after diagram knows what the
plan builds, what it changes, and why. The decision and component cards are the detail under that picture.

## What the page holds

Four parts, in this order:

1. **Header.** The feature label, the date, a legend, then `Problem`, `Solution`, and `Wins`.
2. **Before / after.** The affected part of the system as it is, and as the plan leaves it, side by side.
3. **Decisions.** One card per design decision the interview settled.
4. **Components.** One card per component the plan adds, changes, or deletes.

### Header

| Field | What it says |
|---|---|
| `Problem` | one sentence: what hurts or is missing today, from the operator's intent |
| `Solution` | one sentence: what the plan builds or changes to answer it |
| `Wins` | two to five bullets of six words or fewer, each a gain the operator can check after the merge |

A win names a concrete gain in the repository's own terms: "one reader of the ledger", "reviews see the trace". It
never reads as a generic quality, such as "cleaner code" or "easier to maintain".

### Before / after

**Draw every component the plan touches, and the untouched components they talk to.** Untouched neighbours are drawn
plain, so the reader sees where the change attaches. Leave out components neither touched nor adjacent.

- **Before** draws the system as the grounding read it. Components the plan deletes appear here, marked deleted.
- **After** draws the system the plan leaves. Added components appear here, marked added. Changed components appear
  in both, marked changed in the after diagram.
- **Each edge is labelled with its verb**, read from the component that starts the interaction: `reads`, `writes`,
  `calls`, `dispatches`, `subscribes to` are examples of the shape, not a closed list.
- **A plan that only adds components** draws the after diagram alone, full width, with its neighbours. A plan that
  changes no components replaces the section with one `<div class="none">` saying so.

**Pick the diagram pattern that shows the change.**

| Pattern | Use it when | How |
|---|---|---|
| Mermaid flowchart | the change is in who talks to whom: a new edge, a removed hop, a rerouted call | `flowchart TB`, `classDef` for added, changed, deleted |
| Mermaid sequence diagram | the change is in order or count of calls: "before 4 round trips, after 1" | `sequenceDiagram` |
| Cross-section | a call passes through layers, and the plan adds, removes, or merges layers | stacked bands, one per layer, labelled with its responsibility |
| Collapse | several components merge into one, or one splits into several | the merged component as one thick box, its former parts faded inside it |

A flowchart runs top to bottom, because a left-to-right graph shrinks to unreadable text in a half-width column. A
Mermaid diagram stays at 14 nodes or fewer. A larger change draws one diagram per area, each with its own caption.
Hand-built patterns are HTML boxes in the skeleton's `.stack` and `.collapse` classes, with inline SVG only where an
arrow is needed.

### Decisions

One card per design decision the interview settled, that a reader of the diagram would otherwise question: a
component's placement, a contract between components, a data shape, a dependency the plan takes or refuses. A choice
left to the implementer is no decision here.

| Line | What it says |
|---|---|
| decision | the choice, as a short imperative: "Keep the trace writer in the hook" |
| why | one sentence: the reason this choice wins |
| instead of | the alternative that lost, and in a few words why |
| ADR | where the decision rests on or reopens an ADR: its number and one line; omit the line otherwise |

A decision that reopens an ADR is marked as such in its callout, and names why the friction warrants it.

### Components

One card per **component** (`CONTEXT.md`) the plan intends to **add**, **change**, or **delete**. A component is a
unit that acts — a module, a class, a command file, a hook, a service — as distinct from a **domain shape**, which is
data the code declares.

**Name each component in the implementation language's own terms.** `docs/agents/toolchain.md` records the language;
take the word that language uses — class, struct, module, trait, protocol, command, hook. A repository with no
recorded language gets plain component names, and no invented terms; its cards take a plain `kind` word, or omit the
line.

**Every component the plan touches has a card**, and the same name in the diagrams.

| Line | On which cards | What it says |
|---|---|---|
| kind | every card, where the language has one | the language's word for this kind of component |
| name | every card | the component's own name, in `CONTEXT.md`'s vocabulary |
| why | every card | one sentence: why the plan adds, changes, or deletes it |
| `now` / `after` | changed only | what the component does today, and what it becomes |
| talks to | every card | this component's outgoing interactions, as in the after diagram |
| shapes | where the language has them | the domain shapes this component introduces, by name |

**A card with no shapes line is correct** in a repository whose language has none. Omit the line rather than
printing a placeholder.

## The artifact

- **One file, at `.superdev/design/<feature-slug>.html`**, resolved as an absolute path from the invoking checkout.
  `<feature-slug>` is the feature label's slug, so re-planning the same feature overwrites the same file instead of
  leaving a rival beside it.
- **Ensure `.superdev/` is in the repository's `.gitignore`, and add it when it is absent** — the same guarantee §2's
  knowledge-base staging makes.
- **HTML with an inline `<style>` block and one script: Mermaid 12.3.0 from jsDelivr**, exactly as the skeleton
  imports it. No other script, no other network request, no external stylesheet, no build step, and no local server.
  The page opens by double-click. Without the network, each Mermaid block shows its source, and every other part of
  the page renders.
- **Throwaway.** It never enters the epic, the pull request, or the knowledge base, and `/superdev:document` never
  reconciles it.

## The skeleton

Follow this structure, so every sketch reads the same way. Extend the lists and pick the diagram patterns; leave the
shape of the page and the stylesheet alone.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Design sketch — {{feature label}}</title>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@12.3.0/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad: true, theme: "base", securityLevel: "strict",
                       flowchart: { curve: "basis", htmlLabels: false },
                       themeVariables: { fontFamily: "ui-sans-serif,-apple-system,sans-serif", fontSize: "13px",
                                         primaryColor: "#f8fafc", primaryBorderColor: "#cbd5e1",
                                         lineColor: "#94a3b8", edgeLabelBackground: "#ffffff" } });
</script>
<style>
  :root { --ink:#0f172a; --mute:#64748b; --line:#e2e8f0; --bg:#fafaf9; --card:#fff;
          --add:#059669; --chg:#d97706; --del:#dc2626; --acc:#4f46e5; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:15px/1.6 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width:1120px; margin:0 auto; padding:56px 24px 96px; }
  h1 { font:600 30px/1.2 ui-serif,Georgia,serif; margin:0 0 4px; letter-spacing:-.01em; }
  .sub { color:var(--mute); font-size:13px; margin:0 0 20px; }
  .legend { display:flex; gap:18px; flex-wrap:wrap; font-size:12px; color:var(--mute); margin:0 0 32px; }
  .legend span { display:flex; align-items:center; gap:7px; }
  .dot { width:10px; height:10px; border-radius:2px; display:inline-block; }
  .brief { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .brief > div { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:18px 20px; }
  .brief .wins { grid-column:1 / -1; }
  .label { font-size:10px; text-transform:uppercase; letter-spacing:.1em; color:var(--mute); font-weight:600;
           margin:0 0 6px; }
  .brief p { margin:0; font-size:16px; }
  .wins ul { margin:0; padding:0; list-style:none; display:flex; flex-wrap:wrap; gap:8px; }
  .wins li { background:#ecfdf5; color:#065f46; border-radius:999px; padding:4px 12px; font-size:13px; }
  h2 { font:600 20px/1.3 ui-serif,Georgia,serif; margin:56px 0 16px; }
  .ba { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .ba.single { grid-template-columns:1fr; }
  figure { margin:0; background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; }
  figcaption { font-size:10px; text-transform:uppercase; letter-spacing:.1em; color:var(--mute); font-weight:600;
               margin:0 0 10px; }
  pre.mermaid { margin:0; background:none; display:flex; justify-content:center; font-size:12px; }
  .stack { display:flex; flex-direction:column; gap:6px; }
  .stack div { border:1px solid var(--line); border-left:4px solid var(--mute); border-radius:6px;
               padding:8px 12px; font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
  .collapse { border:3px solid var(--ink); border-radius:10px; padding:12px; }
  .collapse .title { font:600 13px ui-monospace,SFMono-Regular,Menlo,monospace; margin:0 0 8px; }
  .collapse .inner { display:flex; flex-wrap:wrap; gap:6px; opacity:.45; }
  .collapse .inner span { border:1px dashed var(--mute); border-radius:4px; padding:3px 8px; font-size:11px; }
  .add { border-left-color:var(--add) !important; }
  .chg { border-left-color:var(--chg) !important; }
  .del { border-left-color:var(--del) !important; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px; }
  article { background:var(--card); border:1px solid var(--line); border-left:4px solid var(--acc);
            border-radius:10px; padding:16px 18px; }
  .kind { font-size:10px; text-transform:uppercase; letter-spacing:.09em; color:var(--mute); }
  .name { font:600 15px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace; margin:2px 0 12px; word-break:break-word; }
  .decision { font-weight:600; margin:0 0 12px; }
  dl { display:grid; grid-template-columns:auto 1fr; gap:6px 12px; margin:0; font-size:13px; }
  dt { color:var(--mute); font-size:10px; text-transform:uppercase; letter-spacing:.06em; padding-top:3px; }
  dd { margin:0; }
  dd ul { margin:0; padding:0; list-style:none; }
  dd li::before { content:"\2192\00a0"; color:var(--mute); }
  .shapes { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
  .adr { margin:12px 0 0; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:6px 10px;
         font-size:12px; color:#92400e; }
  .none { background:var(--card); border:1px dashed var(--line); border-radius:10px; padding:28px;
          text-align:center; color:var(--mute); }
  @media (max-width:760px) { .brief, .ba { grid-template-columns:1fr; } }
</style>
</head>
<body>
<main>
  <h1>{{feature label}}</h1>
  <p class="sub">Design sketch · /superdev:plan · {{YYYY-MM-DD}}</p>
  <div class="legend">
    <span><i class="dot" style="background:#059669"></i> added</span>
    <span><i class="dot" style="background:#d97706"></i> changed</span>
    <span><i class="dot" style="background:#dc2626"></i> deleted</span>
    <span><i class="dot" style="background:#e2e8f0"></i> untouched neighbour</span>
    <span>edge label = what the source does to the target</span>
  </div>

  <section class="brief">
    <div><p class="label">Problem</p><p>{{one sentence}}</p></div>
    <div><p class="label">Solution</p><p>{{one sentence}}</p></div>
    <div class="wins"><p class="label">Wins</p><ul><li>{{six words or fewer}}</li></ul></div>
  </section>

  <h2>Before / after</h2>
  <div class="ba">
    <figure>
      <figcaption>Before</figcaption>
      <pre class="mermaid">
flowchart TB
  A[{{Component}}] -->|{{verb}}| B[{{Component}}]
  B -->|{{verb}}| C[{{Component}}]
  classDef del fill:#fef2f2,stroke:#dc2626,stroke-width:2px;
  classDef chg fill:#fffbeb,stroke:#d97706,stroke-width:2px;
  class C del
      </pre>
    </figure>
    <figure>
      <figcaption>After</figcaption>
      <pre class="mermaid">
flowchart TB
  A[{{Component}}] -->|{{verb}}| B[{{Component}}]
  B -->|{{verb}}| D[{{Component}}]
  classDef add fill:#ecfdf5,stroke:#059669,stroke-width:2px;
  classDef chg fill:#fffbeb,stroke:#d97706,stroke-width:2px;
  class B chg
  class D add
      </pre>
    </figure>
  </div>

  <h2>Decisions</h2>
  <div class="grid">
    <article>
      <p class="decision">{{the choice, as a short imperative}}</p>
      <dl>
        <dt>why</dt>        <dd>{{one sentence}}</dd>
        <dt>instead of</dt> <dd>{{the alternative that lost, and why}}</dd>
      </dl>
      <p class="adr">ADR {{NNNN}} · {{one line}}</p>
    </article>
  </div>

  <h2>Components</h2>
  <div class="grid">
    <article class="add">
      <div class="kind">{{language's word for the kind}}</div>
      <div class="name">{{ComponentName}}</div>
      <dl>
        <dt>why</dt>      <dd>{{one sentence}}</dd>
        <dt>talks to</dt> <dd><ul><li>{{verb}} {{OtherComponent}}</li></ul></dd>
        <dt>shapes</dt>   <dd class="shapes">{{ShapeName}}</dd>
      </dl>
    </article>
    <article class="chg">
      <div class="kind">{{kind}}</div>
      <div class="name">{{ComponentName}}</div>
      <dl>
        <dt>why</dt>      <dd>{{one sentence}}</dd>
        <dt>now</dt>      <dd>{{what it does today}}</dd>
        <dt>after</dt>    <dd>{{what it becomes}}</dd>
        <dt>talks to</dt> <dd><ul><li>{{verb}} {{OtherComponent}}</li></ul></dd>
      </dl>
    </article>
    <article class="del">
      <div class="kind">{{kind}}</div>
      <div class="name">{{ComponentName}}</div>
      <dl>
        <dt>why</dt>      <dd>{{one sentence}}</dd>
      </dl>
    </article>
  </div>
</main>
</body>
</html>
```

**Hand-built patterns** replace a `<pre class="mermaid">` inside the same `<figure>`:

```html
<div class="stack">
  <div>{{layer responsibility}}</div>
  <div class="del">{{layer the plan removes}}</div>
</div>

<div class="collapse">
  <p class="title">{{MergedComponent}}</p>
  <div class="inner"><span>{{former part}}</span><span>{{former part}}</span></div>
</div>
```

Write each Mermaid block's source flush left, because Mermaid reads its indentation. Give each node a short id and its
component name as the label. Quote a label that holds punctuation: `A["scope.js dod-line"]`.

**Drop a whole section whose list is empty** — a plan with no decision worth a card carries no `Decisions` heading.
Order the component cards added, then changed, then deleted.

## The prose on the page

**Prose is sparse and plain.** A diagram that needs a paragraph to be understood is redrawn, not explained.

- `Problem`, `Solution`, and every `why` line is one sentence. Every other line runs to six words or fewer where it
  can.
- Component names come from `CONTEXT.md`'s vocabulary, and the diagrams and the cards use the same name. Concision is
  not licence to drift to a synonym; a concept the glossary lacks is reported rather than renamed.
- `now` and `after` state behaviour, never a diff of the file.
- The page carries no paragraph beyond the header fields, and no closing summary. A sentence that could be a bullet is
  a bullet, and a bullet that could be cut is cut.

## The wait

**Write the file, print its path, and stop there.** The operator opens it.

- **A correction** rewrites the same file and presents it again. Repeat until the operator approves.
- **Approval** is what releases §3 to decompose, and it decomposes the design that was approved.

An operator who declines the sketch at §3's question never reaches this file, so nothing here loads for them.
