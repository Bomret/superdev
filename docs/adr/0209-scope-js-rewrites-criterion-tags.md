# 0209: scope.js rewrites criterion tags

**Status:** Accepted

## Context

On a multi-slice plan, `/superdev:plan` writes the epic's Definition of Done with criterion tags in
slice-id notation (`01`, `01, 02`, `scope`, `docs`). Once every slice issue exists, the controller
rewrites each slice-id tag into the store's notation: `#<n>` on Forgejo and GitHub, `<PROJ>-<n>` on
Jira. The controller made that rewrite by hand, and no document showed a tag that names several slices
in store notation. Epic #1385 received `{#1388, #1396}`. `dod-line` reads only a bare tag
(`#1388, #1396`), so a tick on such a line found no checklist line, and the mapping gate in
`references/dod-ticks.md` resolved the tag to no slice (triage #1411).

## Decision

`scope.js dod-tags` owns the tag rewrite, and the controller types no store tag.

- It reads an anchor body on stdin and an id-to-reference map from a file, and prints the body with
  every slice-id tag in the `## Definition of Done` checklist rewritten into store notation. Several
  references are joined with `, ` and carry no brackets.
- It leaves `scope`, `docs`, a tag already in store notation, and every judged line unchanged.
- It refuses, prints nothing, and exits non-zero when an unjudged checklist line carries no tag
  `dod-line` reads, or a tag names a slice id the map lacks. Its error names each such line.
- With no map, it only checks, and prints the body unchanged when every line passes.
- `/superdev:plan` runs it on the drafted Definition of Done before it creates the epic, and as the
  producer of the tag-rewrite body edit, so a refusal stops that edit at the store document's
  **Edit an issue's body** gate.

## Considered options

- **Spell out the multi-slice form in prose only.** Lost because the model still types the tags, and
  nothing catches the next format it invents.
- **Make `dod-line` also read `{#a, #b}`.** Lost because it widens the tag grammar every reader shares
  for one invented form, and leaves the next one unread.
- **Refuse an odd tag in `scope.js dod-merge` at implement time.** Lost because an untagged line is legal
  there, so the check could only list known bad shapes, and it fires one command after the store holds
  the bad tag.

## Consequences

A multi-slice epic's Definition of Done reaches the store only with tags `dod-line` reads (INV-0182).
An append onto an epic carrying an untagged, unjudged line is refused until the plan tags that line.
A single-slice plan carries no tags and does not run the verb.
