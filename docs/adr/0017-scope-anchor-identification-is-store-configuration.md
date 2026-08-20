# 0017: Scope-anchor identification is store configuration

**Status:** Accepted

**Context.** `/superdev:afk` selects work by scope anchor, and the slice stores disagree on how a
feature's root is expressed. GitHub and Jira model parent and child natively (ADR 0011), this repo's
Forgejo rendering uses an `epic` label plus an `**Epic:** #<n>` body line, and the local-file store uses a
`00-epic-*.md` filename. `commands/afk.md` selected by the `epic` label, so a single-slice plan was
invisible to the sweep, even though every store seed already documents that such a plan has no epic and
that its lone slice is the anchor.

**Decision.** Each issue-tracker document states how to identify a feature's scope anchor, and afk reads
that rather than encoding any one store's shape. The anchor is the feature's **root**: the issue with no
parent. It has children on a multi-slice plan and none on a single-slice one.

**Why.** The shape is a property of the store, so it belongs with the store, the same reason the assignee
contract lives there (ADR 0010). A command that hardcodes one store's shape is wrong on every other
backend, which the **Backends are pluggable** working rule forbids. Rooting the rule in parent and child
also collapses a special case: the epic stops being a distinct kind of thing to look for, and one rule
covers both plan sizes.

**Considered options.**

- *afk selects the `epic`-labelled issue, falling back to a lone labelled issue when no epic carries that
  label*. Rejected: it is correct on Forgejo alone, and it reimplements inside a command what GitHub and
  Jira already express natively.
- *`/superdev:plan` applies an explicit `anchor` label that afk queries*. Rejected: it adds a store
  concept for a relation two backends already have, and every plan written before it becomes invisible.
- *afk lists all open issues and groups them by whichever label is not one of superdev's own*. Rejected:
  it needs no prefix and no relation, but it breaks the moment a maintainer adds an unrelated label.

**Consequences.** A store with no native relations can still present two roots under one feature label.
That is a malformed plan with no single anchor to label or comment on, so afk skips it and names it in its
closing report rather than guessing which root owns the Definition of Done. Adding a backend now includes
stating its anchor rule, and `drift-check.js` asserts that every issue-backend document carries one, the
way it already asserts the assignee contract.
