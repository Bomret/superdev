# The documentation pass

The procedure that brings documentation into agreement with reality: adding what is new, correcting what
changed, and **deleting what is obsolete**. Two callers perform it, and both `Read` this file at the point
they run it (ADR 0031):

- **`agents/doc-writer.md`**, dispatched by `/superdev:document` whenever the run's inline-doc-pass record
  reads `absent` — every `full` run, a `lite` run that ended before its doc step, and a record
  `/superdev:review` cleared — plus audit mode, bootstrap mode, any fix round, and every ad-hoc invocation.
- **`references/implement-lite.md`**, where the `lite` controller performs the pass in its own context as
  the last step of the run.

It states the pass alone. What is specific to a dispatched agent — its brief, its bootstrap mode, its
report — stays in `agents/doc-writer.md`. What is specific to a `lite` run — when the step runs, what it
commits, the ledger record it writes — stays in the execution playbook.

## What the pass needs

- **Range**: either a git range (`BASE..HEAD`) or an area path to focus on, or "full" — reconcile the
  whole docs tree and knowledge base against current repo state.
- **`docs/agents/documentation.md`** — the in-repo doc convention.
- **`docs/agents/knowledge-base.md`** — the knowledge-base config: backend (local `docs/kb/` or software
  like Confluence, or none), plus its **audience(s)**, **language**, and agreed **outline**. May say
  "none".
- **The staging path**, as an **absolute** path, when the knowledge-base backend is remote.

Given a git range, start from `git diff --stat BASE..HEAD` and `git log BASE..HEAD` to see what actually
changed; then check which docs that touches.

## Content types

Read `${CLAUDE_PLUGIN_ROOT}/references/content-types.md` before the first edit and apply it in **both**
passes below — the in-repo docs (Pass 1) and the knowledge base (Pass 2). The knowledge base holds feature
specifications and design overviews, which are conceptual content by definition, so the lens carries at
least as much weight there.

It names four kinds of information — interface, reference, conceptual, procedural — and one question to ask
of every doc you touch: does a reader learn **why** this exists and **when** to use it? Reference text
answers *what* and procedural text answers *how*. Neither answers *whether*. A doc that describes new
behavior with structure and steps but no rationale is the gap this lens exists to close.

Unlike the writing standard below, this lens is **never configurable and never `none`** — content coverage
is a completeness property, not a style one (ADR 0014). Don't pad a doc to reach all four types; add the
conceptual layer where its absence would leave a reader guessing.

## Writing standard

`docs/agents/documentation.md` carries a **`## Writing standard`** section naming the prose style this
repo writes in (ADR 0012). Read it before the first edit and act on the value:

- **`controlled`** → Read `${CLAUDE_PLUGIN_ROOT}/references/controlled-prose.md` and apply it.
- **a repo-relative path** → Read that file and apply it.
- **`none`, no section, or no such file at all** → no standard applies. Write as you otherwise would,
  and skip the rest of this section.

Apply the named standard in the mode that fits the text: **strict** for procedural and safety prose
(step lists, runbooks, error messages), **relaxed** for descriptive prose (`AGENTS.md`, `README.md`, ADR
narrative, knowledge-base pages). Code, identifiers, command syntax, fenced blocks, and voiced prose (a
README pitch) are exempt: the standard states its own scope.

The standard is language-neutral, so it governs the knowledge-base pass too, whatever
`knowledge-base.md`'s **Language** says. Take any language-bound choice (spelling, compound formation,
number format) from the standard's *Declare per language* section as that repo answered it.

Two limits, both deliberate:

- **It binds only prose you write or rewrite.** Never reformat a line you had no other reason to touch.
- **Read your text against every rule of the standard before you commit.**

If the section names a file that does not exist, say so in your report and continue without a standard.
A missing style guide does not fail a doc pass.

## Never reach a knowledge-base backend

You write files. A remote backend is reached by `/superdev:publish-kb` alone, after a human decides the
feature has reached its readers (ADR 0023) — so make no wiki, Confluence, or other knowledge-base API
call, and need no credential for one.

## Pass 1 — in-repo docs

Walk the `AGENTS.md` hierarchy from root to the areas the change touched (or the whole tree for a full
reconcile). For each affected `AGENTS.md`:

- **Update** structure, ownership, workflow, and child-index entries to match the code as it is now.
- **Add** a child `AGENTS.md` when a new folder has become a durable boundary.
- **Delete stale or contradictory text immediately** — don't narrate history ("previously…", "used
  to…"). Present-tense, state-of-the-world prose. Keep it concise and operational; broad rules in
  parent docs, concrete detail in child docs.

Also update the **top-level in-repo docs** the change affects — especially `README.md` (its usage and
examples must match real behavior), and any `CONTRIBUTING` / `docs/*.md` that drifted.

**Resolve the invariant register.** Where `docs/invariants.md` exists, resolve every entry's `Paths:`
glob and every `Symbols:` entry against the repository, and report — never gate on — one that matches
nothing, naming the entry's id. `Concepts` already carries the invariant's own matching, so a stale
`Paths:` or `Symbols:` costs precision, not correctness. An entry naming neither field needs no
resolution, and a repository with no `docs/invariants.md` needs no check at all.

Do not touch code or tests — docs only.

## Pass 2 — knowledge base

If `knowledge-base.md` is **none**, skip this pass.

Otherwise update the knowledge base to match reality, following that file's backend commands and its
**outline**, writing in its **language**, for its **audience(s)** — **human-consumption first**,
agent-relevant detail second:

- Fill/refresh the durable, reader-facing docs the change affects (feature specification, design
  overview, ADR summaries) under the agreed outline. Don't mirror every `AGENTS.md`.
- Correct and **remove obsolete** content — a knowledge base that contradicts the code is worse than none.
- **Local file** backend: edit the markdown under `docs/kb/` and keep its index current. Its pages are
  repository files, so they ride the branch with the code and you stage nothing.
- **Remote** backend (a wiki, Confluence, anything with an API): write each page as a **staged page**
  instead of sending it. One `.md` file per page under the staging path, named `<title-slug>.md` (the
  page `title`'s slug), YAML frontmatter carrying the page `title` and an `action` of `upsert`, `patch`,
  or `delete`, the page body below. A non-`.md` file is invisible to `/superdev:status` and
  `/superdev:publish-kb` alike. A page you judge obsolete is `action: delete`, never a call to the
  backend: a removal waits for the same gate a creation does. Find the existing page's title from the
  configured outline and the pages already staged, so one title yields one file for `upsert` and
  `delete` — the slugged filename is what makes a second write to that title overwrite it instead of
  creating a rival.

  **An outline entry marked `(aggregate)` takes `action: patch` instead** (ADR 0027). Such a page collects
  one section from each of many scopes — an index, a changelog, an ADR-summaries digest — so the sections
  already on it were written by scopes you cannot see. Name the file `<title-slug>--<section-slug>.md`
  (`<section-slug>` is the section heading's text, kebab-cased the same way `<title-slug>` is), never the
  plain `<title-slug>.md` above: that filename is one file per *page*, and a second section staged under
  it, now or in a later run, would silently overwrite the first. **Two sections staged in this pass whose
  headings kebab-case identically** collide on that filename before `/superdev:publish-kb` ever sees
  either — append `-2`, `-3`, … to the later ones' `<section-slug>`. Stage **one section per file**: an
  ATX heading (`#` … `######`), at the level the outline entry names and never the page's own title, as
  the very first line of the body — nothing above it, nothing after it but that section's own content up
  to the next heading of the same or higher level, no setext (underlined) heading anywhere in it, and no
  fenced code block left open. `scripts/kb-patch.js` refuses a file that breaks any of these and leaves it
  staged for you to fix. `/superdev:publish-kb` merges the section into the live page by its heading; an
  `upsert` here would replace every section already there with the one you can see, which is the loss the
  marker exists to prevent. A page the outline does **not** mark stays `upsert`: you own it end to end.
  Removing one section of an aggregate page is not yours — `patch` replaces or appends, and `delete`
  still removes a whole page.

**Use the absolute staging path you were given.** A checkout-relative `.superdev/kb-pending/` resolves one
level too deep from a scopetree, into a directory `/superdev:ship` deletes — the pages would be
gone before anyone published them.
