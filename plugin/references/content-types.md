<!--
  Sources and attribution (see NOTICE):
  - Technical Writing 101: A Real-World Guide to Planning and Writing Technical Content, 3rd edition,
    Alan S. Pringle and Sarah S. O'Keefe, Scriptorium Publishing Services, Inc. Chapter 6 names the four
    content types and identifies conceptual information as the hardest to write and the most often
    absent. The taxonomy is restated here in superdev's own words.
-->

# Content types

The four kinds of information documentation carries. The `doc-writer` agent applies this lens when it
writes. The `doc-reader` agent checks it in Pass 1, its cold read (ADR 0014).

This lens is not a style. The **writing standard** governs how a sentence is formed, and a repo may set
that standard to `none`. This file governs whether a reader receives the kind of information the document
owes them, so it always applies.

## The four types

- **Interface.** What a part is called. A flag, a field name, a menu item, a config key. It answers what
  the thing is named.
- **Reference.** Data the reader looks up. A field mapping, a status table, a list of options. It answers
  what the value is, and it assumes the reader already knows what to do with that value.
- **Conceptual.** Why the thing exists, when to reach for it, and when not to. It answers whether the
  thing applies to this reader. It is the hardest type to write, because it needs understanding beyond
  the interface, and it is the type most often absent.
- **Procedural.** The steps that perform a task. It answers how the reader does the thing.
  `controlled-prose.md` owns the rules for writing a procedure.

One document carries several types. A single `AGENTS.md` section may hold all four. The type classifies a
passage, not a file.

## The conceptual layer

Reference text answers what. Procedural text answers how. Neither answers whether. A reader who cannot
tell whether a thing applies to them reads the whole document and still cannot act on it.

So ask one question of every document you write or verify: does a reader learn why this exists and when to
use it?

A document that fails that question is not incomplete in the ordinary sense. It is complete and still
unusable, which is why an accurate document passes every grounding check and leaves a newcomer stuck.

### When to report a gap

Report an absent conceptual layer only where the gap leaves a reader unable to decide whether the thing
applies to them. That is the whole test.

These are exempt:

- A pure lookup table, when a document that links to it carries the why.
- A passage whose surrounding document already answers whether, at the level this reader needs.
- Code, identifiers, command syntax, and fenced blocks. They hold no prose layer that could go missing.

Do not report a document for carrying only one or two of the four types. Most documents legitimately carry
one or two. The finding names an absent **decision**, never an absent category.

## What the writer does

Write the conceptual layer where the reader needs it, which is usually before the steps and not after
them. Two sentences often carry it. Name what the thing is for, and name the case it does not cover.

Do not pad a document to reach all four types. A reference table that needs no why gets none. Add the
layer where its absence would leave a reader guessing.
