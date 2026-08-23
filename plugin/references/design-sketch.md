<!--
  Attribution: the self-contained single-file rule below is distilled from the prototype skill, and the
  card structure and style direction from the improve-codebase-architecture skill, both by Matt Pocock
  (https://github.com/mattpocock). Credit to their author.
-->

# Design sketch

A throwaway HTML page that shows the operator the design `/superdev:plan` is holding, while changing it
is still free. `commands/plan.md` §3 reads this after its grounding step and before it decomposes, and
only when the operator asked for a sketch (ADR 0036).

The reader is the operator running the interview, not a later reviewer. The epic's `## Slice graph` and
`## Touch map` serve that other reader and are unaffected: they draw the dependency order and the files,
where this draws what the feature is made of.

## What the sketch inventories

One card per **component** (`CONTEXT.md`) the plan intends to **add**, **change**, or **delete**. A
component is a unit that acts — a module, a class, a command file, a hook, a service — as distinct from a
**domain shape**, which is data the code declares.

**Name each component in the implementation language's own terms.** `docs/agents/toolchain.md` records
the language; take the word that language uses — class, struct, module, trait, protocol, command, hook.
A repository with no recorded language gets plain component names, and no invented terms; its cards
take a plain `kind` word, or omit the line.

**Every component the plan touches is on the page.** A plan that changes no components produces a page
that says so in one line, rather than a page with no cards.

## What a card carries

| Line | On which cards | What it says |
|---|---|---|
| kind | every card, where the language has one | the language's word for this kind of component |
| name | every card | the component's own name, in `CONTEXT.md`'s vocabulary |
| `now` / `after` | changed only | what the component does today, and what it becomes |
| talks to | every card | this component's interactions with the others |
| shapes | where the language has them | the domain shapes this component introduces, by name (ADR 0030) |

**An interaction names the other component and the direction.** Write it as a short verb phrase —
`reads`, `writes`, `calls`, `dispatches`, `subscribes to` are examples of the shape, not a closed list,
because superdev serves any domain. A card lists its own outgoing interactions, so each edge is written
once by the component that initiates it.

**A card with no shapes line is correct** in a repository whose language has none. Omit the line rather
than printing a placeholder.

## The artifact

- **One file, at `.superdev/design/<feature-slug>.html`**, resolved as an absolute path from the
  invoking checkout. `<feature-slug>` is the feature label's slug, so re-planning the same feature
  overwrites the same file instead of leaving a rival beside it.
- **Ensure `.superdev/` is in the repository's `.gitignore`, and add it when it is absent** — the same
  guarantee §2's knowledge-base staging makes.
- **Pure HTML with an inline `<style>` block.** No JavaScript, no CDN, no external stylesheet, no build
  step, and no local server, so the page opens by double-click, works offline, and survives being sent
  to someone else.
- **Throwaway.** It never enters the epic, the pull request, or the knowledge base, and
  `/superdev:document` never reconciles it.

## The skeleton

Follow this structure, so every sketch reads the same way. Extend the card list; leave the shape of the
page alone.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Design sketch — {{feature label}}</title>
<style>
  :root { --ink:#0f172a; --mute:#64748b; --line:#e2e8f0; --bg:#f8fafc;
          --add:#059669; --chg:#d97706; --del:#dc2626; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width:1100px; margin:0 auto; padding:48px 24px 80px; }
  h1 { font-size:26px; margin:0 0 4px; letter-spacing:-.01em; }
  .sub { color:var(--mute); font-size:13px; margin:0 0 28px; }
  .legend { display:flex; gap:18px; flex-wrap:wrap; padding:12px 16px; margin:0 0 8px;
            background:#fff; border:1px solid var(--line); border-radius:8px; font-size:12px; }
  .legend span { display:flex; align-items:center; gap:7px; color:var(--mute); }
  .dot { width:10px; height:10px; border-radius:2px; }
  h2 { font-size:11px; text-transform:uppercase; letter-spacing:.09em; color:var(--mute);
       margin:36px 0 14px; font-weight:600; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(310px,1fr)); gap:16px; }
  article { background:#fff; border:1px solid var(--line); border-left:4px solid var(--line);
            border-radius:8px; padding:16px 18px; }
  article.add { border-left-color:var(--add); }
  article.chg { border-left-color:var(--chg); }
  article.del { border-left-color:var(--del); }
  .kind { font-size:10px; text-transform:uppercase; letter-spacing:.09em; color:var(--mute); }
  .name { font:600 15px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;
          margin:2px 0 12px; word-break:break-word; }
  dl { display:grid; grid-template-columns:auto 1fr; gap:5px 12px; margin:0; font-size:13px; }
  dt { color:var(--mute); font-size:10px; text-transform:uppercase; letter-spacing:.06em;
       padding-top:3px; }
  dd { margin:0; }
  ul { margin:0; padding:0; list-style:none; }
  li::before { content:"\2192\00a0"; color:var(--mute); }
  .shapes { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
  .none { background:#fff; border:1px dashed var(--line); border-radius:8px;
          padding:28px; text-align:center; color:var(--mute); }
</style>
</head>
<body>
<main>
  <h1>Design sketch — {{feature label}}</h1>
  <p class="sub">/superdev:plan · {{YYYY-MM-DD}} · the components this plan intends to change</p>

  <div class="legend">
    <span><i class="dot" style="background:#059669"></i> added</span>
    <span><i class="dot" style="background:#d97706"></i> changed</span>
    <span><i class="dot" style="background:#dc2626"></i> deleted</span>
    <span>→ an interaction, read from this component outward</span>
  </div>

  <h2>Added</h2>
  <div class="grid">
    <article class="add">
      <div class="kind">{{language's word for the kind}}</div>
      <div class="name">{{ComponentName}}</div>
      <dl>
        <dt>talks to</dt>
        <dd><ul><li>{{verb}} {{OtherComponent}}</li></ul></dd>
        <dt>shapes</dt>
        <dd class="shapes">{{ShapeName}}</dd>
      </dl>
    </article>
  </div>

  <h2>Changed</h2>
  <div class="grid">
    <article class="chg">
      <div class="kind">{{kind}}</div>
      <div class="name">{{ComponentName}}</div>
      <dl>
        <dt>now</dt>   <dd>{{what it does today}}</dd>
        <dt>after</dt> <dd>{{what it becomes}}</dd>
        <dt>talks to</dt>
        <dd><ul><li>{{verb}} {{OtherComponent}}</li></ul></dd>
      </dl>
    </article>
  </div>

  <h2>Deleted</h2>
  <div class="grid">
    <article class="del">
      <div class="kind">{{kind}}</div>
      <div class="name">{{ComponentName}}</div>
      <dl>
        <dt>talks to</dt>
        <dd><ul><li>{{verb}} {{OtherComponent}}</li></ul></dd>
      </dl>
    </article>
  </div>
</main>
</body>
</html>
```

**Drop a whole group whose list is empty** — a plan that deletes nothing carries no `Deleted` heading.
A plan that changes no components at all replaces every group with one `<div class="none">` saying so.

## The prose on the page

**The cards carry the weight.** A card that needs a paragraph to be understood is redrawn, not explained.

- Each line runs to six words or fewer where it can.
- Component names come from `CONTEXT.md`'s vocabulary. Concision is not licence to drift to a synonym; a
  concept the glossary lacks is reported rather than renamed.
- `now` and `after` state behaviour, never a diff of the file.
- The page carries no introduction, no summary, and no recommendation. The inventory is the whole
  document.

## The wait

**Write the file, print its path, and stop there.** The operator opens it.

- **A correction** rewrites the same file and presents it again. Repeat until the operator approves.
- **Approval** is what releases §3 to decompose, and it decomposes the design that was approved.

An operator who declines the sketch at §3's question never reaches this file, so nothing here loads for
them.
