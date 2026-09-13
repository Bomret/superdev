# 0060: The render fixture stores an overlay, not a body

**Status:** Accepted

**Context.** The `opencode-render` drift check pins `plugin/scripts/adapter.js` against golden fixtures
under `scripts/drift/fixtures/opencode/`: a fresh render into a temp dir, diffed file by file against a
committed tree. The fixtures total 3,239 lines. Of the 2,755 lines belonging to files that have a source
counterpart in `plugin/skills/` or `plugin/agents/`, 2,070 are byte-identical to that source — 75%. The
adapter's body rewrite is three deterministic substitutions (`/superdev:` to `/superdev-`,
`${CLAUDE_PLUGIN_ROOT}` to the plugin root, and the model-map resolution), so the copied 75% asserts
nothing the source file does not already state. It does cost something: every prose edit to a skill forces
a mirrored fixture regeneration in the same commit, doubling the diff a reviewer reads.

**Decision.** A derived surface whose render is **line-aligned** with its source is committed as an
**overlay**: the rendered frontmatter in full, plus the body lines that differ from the source, keyed by
line number. The check renders fresh, computes the overlay against the source the same way, and compares.
A surface whose render is **not** line-aligned is committed as a full-body fixture, unchanged. Today that
is the `afk` command render (+15 synthesized lines), the generated hook bridge
`.opencode/plugins/superdev.js`, and the synthesized `upgrade` skill (ADR 0052) — the three files with no
line-for-line source to overlay onto.

**Why.** Every skill and every agent renders line-for-line in the body, verified across all fifteen. That
alignment is what makes an overlay a plain line-number map rather than a diff: no diff algorithm, no new
dependency in a repo that has none, and a fixture roughly 80% smaller than a whole-body render. Regenerating
is still required whenever an edit changes the body's line count or touches a rewritten line — the map is
keyed on absolute line numbers, so either kind of edit shifts or replaces an entry — but an edit that does
neither leaves the fixture, and the check, untouched. The three exceptions keep full fixtures because they
have no aligned source, not as a special case bolted on.

**Considered options.**
- *Store a unified diff per rendered file.* Rejected: a real diff needs either a dependency or a
  hand-rolled algorithm, and the line alignment makes both unnecessary — a plain line-number map is the
  smaller mechanism, and the comparison it needs (line and content equality) is simpler than diffing two
  hunk sets.
- *Drop fixtures for derived surfaces and unit-test `rewriteProse` against inline inputs.* Rejected: it is
  the smallest artifact, but the check stops covering "this particular skill renders correctly end to
  end", and the frontmatter emission (JSON-quoted scalars, the marker comment, the `superdev-` prefix) is
  where the render has actually broken before.
- *Keep whole-body fixtures.* Rejected: regenerating is one command, but the reviewer cost of a doubled
  diff on every prose edit is paid on every commit that touches a skill.

**Consequences.** Alignment becomes a property the check must verify, not assume. A future skill whose
render shifts line numbers must be **detected and refused** with a message naming the file, never silently
overlaid onto the wrong lines — a silent misalignment would pin garbage and pass. The maintainer's recovery
is to move that surface onto the full-fixture list, the same place `afk` already sits.
