# 0021: The change type leads the feature label and the scope branch

**Status:** Accepted

## Context

Every superdev run named its branch `superdev/<scope>`, and every issue-backed store seed labelled its
features `feat/<slug>`. Both were fixed strings. A scope that repairs a defect, restructures a module, or
rewrites prose therefore shipped a branch and a pull request announcing a feature. The commits inside it
carried honest Conventional Commits types, so the branch disagreed with its own contents, and a reviewer
reading the branch list saw one kind of work everywhere.

ADR 0019 had already moved the label's *notation* into the store document. What it left behind was the
assumption that the notation's prefix, wherever a store had one, meant `feat`.

## Decision

A feature carries a **change type**: the Conventional Commits type of what it does to the codebase, one of
`feat`, `fix`, `refactor`, `docs`, `perf`, `test`, `build`, `ci`, `chore`, `style`, `revert`.
`/superdev:plan` picks it from what the plan does and writes it into the feature label. The label
is the type plus the slug, in each store's own notation, and the **scope branch is that label verbatim**
(`<type>/<slug>`). The `superdev/` branch namespace is gone.

The run root stays keyed on the slug alone (`.superdev/scopes/<slug>/`), so nothing that finds a run from a
scope needs to know the type. `references/scope-mode.md` owns the type set, `hooks/scope-prune.js` matches
it on its pre-CLI fallback path (ADR 0007), and `drift-check.js` asserts those two agree.

## Considered options

- **Keep `superdev/<slug>` and type the label only.** Smaller diff, and it fixes the tracker view. It
  loses because the branch and the pull request are what a human reviews, and they were the surface
  reporting the wrong thing.
- **Record the type as a field on the scope anchor rather than in the label.** It preserves ADR 0019
  untouched. It loses on cost: every store document gains a mapping row, `/superdev:implement` gains a
  read, and the label still would not say what the work is. A maintainer types that label.

## Consequences

A branch, its pull request, and its commits agree about what kind of change they carry, and the tracker
lists a feature under its real type. The `superdev/` namespace no longer marks which branches a run owns.
`scope-prune` instead recognises a scope branch by its shape (`<type>/<slug>`, last segment matching the
run root's name). A maintainer's own `wip/<slug>` branch is not mistaken for one, and neither is a
`slice/<scope>/<id>` branch. `scope-prune` uses this shape scan only as a fallback, for a pre-CLI ledger
that carries no `**Branch:**` line to read the branch from directly (ADR 0007).

ADR 0019 stands where it matters, because no command hardcodes a notation. Its example of a store whose
label is a bare slug no longer applies: the local-file store nests plan directories under their type
(`docs/plans/<type>/<slug>/`), so every store's label carries both parts.

Two slugs that differ only by type collide on one run root. Slugs name features and are expected to be
unique within a repo, so this is accepted rather than encoded into the path.

A scope slug no longer names its branch. `superdev/<slug>` was computable from the slug alone, and
`<type>/<slug>` is not, while `/superdev:ship` still takes a slug and has to decide whether the checkout
it stands in is the right one. The run's own ledger carries the branch instead: `/superdev:implement`
Run init writes a `**Branch:**` line, and `references/scope-mode.md`'s `## The scope branch` resolves from
it. A ledger written before that line falls back to the same shape scan `scope-prune` uses, which is a
guess. It is exactly the slug collision above that it cannot resolve.
