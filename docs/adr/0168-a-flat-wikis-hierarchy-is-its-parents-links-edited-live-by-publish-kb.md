# 0168: A flat wiki's hierarchy is its parents' links, edited live by publish-kb

**Status:** Accepted

**Amends:** [ADR 0069](0069-the-knowledge-base-backend-is-five-command-templates.md), whose `find` keys
gain one optional named key, `sub_url`.

## Context

A staged page's `parent:` names the title of the page it belongs under (ADR 0109). `publish-kb.js`
resolves it into `SUPERDEV_KB_PARENT_ID` for the `create` command, and a backend that nests pages, such as
Confluence, files the new page under that id. A Forgejo wiki, Codeberg's included, has no page nesting. On
such a wiki the hierarchy exists only as links in a parent page's body, and no step writes them: the doc
pass stages the child, publish-kb creates it, and the parent is never edited. A link walk from `Home` on
2026-10-18 found 16 of 54 pages unreachable in the `bomret/superdev` wiki and 2 of 17 in the
`bomret/open-armada` wiki.

## Decision

A knowledge-base configuration declares `- **Hierarchy:** links` when its backend's hierarchy is body
links. An absent bullet keeps today's behaviour, nesting through `SUPERDEV_KB_PARENT_ID`.

Under `links`, a staged page that names a `parent` also carries `parent-section`, an ATX (`#`) heading in
the parent page, and `parent-link`, the whole list-item line in the link form the configuration states. A
setext heading is not read as a section. This holds for `upsert`, `patch`, and `delete` pages.

The backend command contract (ADR 0069) names one optional `find` key: a `find` template may emit
`sub_url`, the page's address. The link target in `parent-link` may hold the literal placeholder
`{sub_url}`, and `publish-kb.js` fills it from that key. A backend whose `find` emits no `sub_url` gets
the not-linked refusal for a `parent-link` that carries the placeholder. The doc-writer has no
backend access, and a new page has no address until it is created, so the doc-writer cannot know the
target. After the child has landed, `publish-kb.js` replaces each `{sub_url}` in a link target with the
`sub_url` field of the child's own `find` answer, before it inserts the line. It fills the target only
once the live parent is read and found to lack the link, so a parent that already links the child costs
no fill and no extra `find`. On an update the value comes from the `find` the page already used. After a
create it comes from a fresh bounded `find`. The value goes into the target
verbatim. The value must be URL-safe: RFC 3986 unreserved characters, the sub-delims except `(` and
`)`, and `%`, `/`, `:`, `@`, `?`, `#`. Any other character, such as an unbalanced `(`, a `\`, or a `<`,
can leave a line that CommonMark does not read as a link while publish-kb's own matcher does. A `find`
answer with no `sub_url` field, or a value with any other character, leaves the page not linked and staged. A `parent-link` with no placeholder is inserted exactly
as staged. The substitution applies only when a link is added: a delete finds its line by link text.

`publish-kb.js` edits the live parent after the child has landed. It reads the parent through the
backend command contract's `read`, and it writes it back through `update` under the parent's own title. It
treats the parent as linking the child when a list item's link text equals the child's title, whatever
the link's target spelling, outside fenced code. A list item counts at any indent, nested ones included,
except that an item indented to column 4 or deeper counts only inside a list run, so indented code after
a paragraph is not a link. A list run continues through a line indented to column 2 or deeper. A tab in an
indent advances to the next tab stop. The comparison unescapes `\[` and `\]` in the link text. It accepts the text
as written, and it also accepts the text with matched pairs of emphasis or code markers peeled off when the
title carries no such pair itself. It peels a `_` pair at most once. So `**Child**`, `_Child_`, and
`` `Child` `` all equal `Child`, `__init__` equals only itself, and a title such as `_init_`
matches only the text `_init_`. A parent that does not link the child gets the
`parent-link` line after the last top-level list item of the named section's own list, ahead of any subsection. A
top-level item is the section's first list item, or an item indented less than the content column of the top-level
item above it. The line follows every line that item carries: a nested item, a continuation line, or a fenced code
block indented to its content column, blank lines between them included, and a lazy continuation line directly below
the item's text. A carried fenced code block is carried to its closing fence. A list
under a deeper heading inside the section is not that list. A section whose own content holds no list item yet
gets the line as its first list item, one blank line below the heading. A parent that already links it gets no
write. A `delete` removes the first list item in the named section of the parent whose single link has the
page's title as its text. When that item is the only list item of the section's own content, nested items
counted, one blank line below the heading,
the blank line goes with it, and so does a line end the add appended to a heading that was the unterminated
last line. Add then delete thus restores such a section, except that a prose line directly below the heading
keeps one blank line above it. Any other line that links the page stays and is reported, whatever its shape: prose,
an item with several links, an item that carries a nested item, a continuation line, a lazy continuation line, or
fenced code, a reference-style link, or a
wiki link. An image is no link, and a `!` escaped by an odd number of backslashes is no image marker. A parent that is
gone, or whose body is empty or only whitespace, holds no link, so the delete clears with no write. A delete that names
a parent but no `parent-section` is refused before any backend call and stays staged. On a backend whose body format
is not markdown, a staged page that names a parent, a delete included, is refused before any backend call and stays
staged, with the body format as its reason, so it never lands or goes without its link. A link that cannot be written leaves the
page staged and reported as not linked, and the next run retries it (INV-0170). The edit changes one line
and nothing else in the parent, apart from the blank lines that set a section's first list item apart (INV-0164).

Under `links` the create-time parent check does not apply, because the create command does not nest.

## Considered options

- *The doc pass stages a `patch` of the parent's section next to the new page.* Rejected: a patch replaces
  the whole section from the doc-writer's local view of it, so two scopes linking into one parent
  overwrite each other's links.
- *Generate `Home` from the outline.* Rejected: live pages keep no `parent` metadata, so a rebuild needs
  every staged file ever written, and it discards the hand-written introduction on `Home`.
- *Report unreachable pages only, through a walk from `Home`.* Rejected as the fix: it finds orphans and
  repairs none, and it needs a sixth backend command to list pages.
- *A configuration link template, `- **Link form:**`, from which publish-kb builds the whole line.*
  Rejected for the line: the one-line description needs a source, so the doc-writer writes the whole
  line. Accepted for the target only: publish-kb does not encode page names itself. It fills the
  `{sub_url}` placeholder with the address the backend's own `find` returns, which only publish-kb can
  read.
- *Detect an existing link by its target.* Rejected: Forgejo page addresses differ from any slug of the
  title (`ADR+0023%3A+…`), and hand-written links use absolute and relative spellings, so a target match
  misses real links and adds duplicates.

## Non-goals

- *Moving a link when a page changes parent.* A staged `upsert` that names a new parent adds a link to
  the page in the new parent's section. The old parent's link to the page stays in place until a `delete` of
  the old placement runs.
- *Backfilling links on a switch to `links`.* A wiki that adds `- **Hierarchy:** links` to its
  configuration gets no link for a page published before the switch. Such a page gets its link only when a
  later run stages it again.

## Consequences

- An aggregate page cannot be a link parent: a `patch` of the section that holds the links replaces them.
- Two publish runs at the same moment can still race between the parent's read and its write. Runs one
  after another cannot overwrite each other's links.
- No Forgejo knowledge-base seed ships the bullet yet, so an adopter adds it by hand (triage #1252).
