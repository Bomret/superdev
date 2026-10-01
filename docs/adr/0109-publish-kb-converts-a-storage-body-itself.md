# 0109: publish-kb converts a staged page to Confluence storage itself

**Status:** Accepted

**Context.** A staged knowledge-base page is markdown: `/superdev:plan` and the doc-writer write it that
way for every backend. Confluence stores a page as `storage`, which is XHTML. The Confluence seed's
`create` and `update` commands sent the staged body unchanged as `storage`. Confluence accepts that call
with HTTP 200 and stores the markdown as literal text, so the page renders as raw markdown and nothing
reports a failure. Every adopting repository found this out on its own. The same seed also asks at setup
for a parent page that no command uses, so every new page lands at the space root.

**Decision.** `scripts/publish-kb.js` converts the staged markdown body to `storage` XHTML before it runs
`create` or `update`, and only when `docs/agents/knowledge-base.md` carries `- **Body format:** storage`.
The converter is a shipped, dependency-free script next to `publish-kb.js`. `SUPERDEV_KB_BODY_FILE`
names the converted file, so the backend commands send what they receive. A backend without that bullet
receives the staged body byte-identical (INV-0109).

A staged page may carry an optional `parent:` frontmatter key that names the parent page's title.
`publish-kb.js` resolves that title through the backend's own `find` command and passes the id as
`SUPERDEV_KB_PARENT_ID`. A parent staged in the same batch is published first. A parent that still cannot
be found leaves the page staged, with the reason reported. A page without `parent:` uses the parent page
the configuration names.

**Why.** The body format is a property of the backend, so the step that knows the backend does the
conversion. A converter shipped with the plugin means no adopting repository carries its own copy or a
package dependency. The `Body format` bullet exists already, and only the Confluence seed carries it, so
the conversion reaches Confluence and nothing else.

**Considered options.**

- *Each repository supplies its own converter command.* It keeps a parser out of the plugin. Every
  repository still has to find the problem first and then carry a copy and a dependency of its own.
- *The doc-writer writes XHTML directly for a storage backend.* It adds no code. A model-written XHTML
  body can be malformed, and nothing checks it before Confluence stores it.
- *Gate the conversion on `- **Backend:** Confluence`.* It reads more directly. It ties the behavior to a
  name, so a second storage backend under another name gets no conversion.
- *Parent from the configured parent page only.* It adds no frontmatter key. Every page lands flat under
  one page, and the outline's hierarchy is rebuilt by hand.

**Consequences.** `action: patch` stays refused for a storage backend: `kb-patch.js` merges markdown
headings, and the live page is XHTML. `update` does not move a page to a new parent. A repository that
added its own conversion step to `create` or `update` removes it, because the body it receives is
already XHTML.
