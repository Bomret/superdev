# Plan: knowledge-base staging

How `/superdev:plan` seeds the knowledge base. `skills/plan/SKILL.md` §2 reads this only when
`docs/agents/knowledge-base.md` defines a knowledge base, so a repository with none loads none of it.

## Seed the outline

Seed the feature specification and ADR summaries into the knowledge base's agreed **outline**, in its
**language**, for its **audience(s)** (human-first). A **local** `docs/kb/` backend seeds its pages as
repository files that ride the scope branch. A remote backend gets staged pages, below.

## A remote backend gets a staged page, never a call

At plan time none of the feature is built, so a page sent now claims a feature that does not exist
(ADR 0023). `/superdev:publish-kb` sends the staged page when the feature reaches its readers.

Write each page under the directory `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" staging <slug>` prints:
`.superdev/kb-pending/<slug>/` in the main working tree, as an **absolute** path, whatever checkout you
run it from (ADR 0119). `<slug>` is the feature label's slug. Ensure `.superdev/` is in `.gitignore`, and
add it if absent. This is git-ignored scratch, so plan §2's rule that nothing lands in the invoking
checkout does not cover it, as it covers no untracked file.

Write one `.md` file per page, named `<title-slug>.md` (the page `title`'s slug), so a re-run overwrites the
same file instead of creating a rival. It carries YAML frontmatter with the page `title` and an `action` of
`upsert`, and the body below it. `/superdev:publish-kb` sends no non-`.md` file, and `/superdev:status`
prints one as a stray with a rename hint.

**Placement keys.** Where `docs/agents/knowledge-base.md` documents a staged page's `parent` key, a page the
outline places under another page also carries `parent: <that page's title>` (ADR 0109). A configuration
that documents no such key gets none. Where that document also carries `- **Hierarchy:** links`, such a
page carries `parent-section` (the parent's heading the outline names) and `parent-link` beside `parent`
(ADR 0168). `parent-link` is one list-item line in the link form the configuration states, with link text
equal to the page title, a one-line description, and a `{sub_url}` placeholder the link form names, kept
literally for `/superdev:publish-kb` to fill. The same holds for a `patch` or `delete` page, and a `delete`
page carries the keys of the placement it leaves.

## An `(aggregate)` outline entry takes a patch

An outline entry marked `(aggregate)` takes `action: patch` instead of `upsert` (ADR 0027), because an
`upsert` would replace every section other scopes wrote. `/superdev:publish-kb` merges the section into the
live page by its heading.

- **Name the file `<title-slug>--<section-slug>.md`**, `<section-slug>` being the section heading
  kebab-cased, never the plain `<title-slug>.md`, which is one file per page and would silently overwrite.
  Two sections staged in this pass whose headings kebab-case identically collide on that filename: append
  `-2`, `-3`, … to the later ones' `<section-slug>`.
- **Stage one section per file.** The body's first line is an ATX heading, at the level the outline entry
  names and never the page's own title. Nothing sits above it, and the body holds no setext heading and no
  unterminated fenced code block. `scripts/kb-patch.js` refuses a body with no heading, content before its
  first heading, more than one section, a setext heading, or an unterminated fence, and refuses a heading
  the live page already carries twice. Nothing checks the heading **level**, so get it right.
