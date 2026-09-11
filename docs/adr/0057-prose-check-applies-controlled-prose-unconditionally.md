# 0057: `prose-check` applies `controlled-prose.md` unconditionally

**Status:** Accepted

**Context.** ADR 0012 makes the writing standard **documentation configuration**: a repo opts in with
`## Writing standard: controlled` in `docs/agents/documentation.md`, and only `doc-writer`/`doc-reader`
read `references/controlled-prose.md`, only inside `/superdev:document`. Nothing lets a user apply that
rule set to one piece of prose on demand, in any repo, at any time.

**Decision.** `/superdev:prose-check` reads `references/controlled-prose.md` directly and applies it
unconditionally. It never reads `docs/agents/documentation.md`'s `## Writing standard` pointer to decide
*whether* to run, so it works the same way in a repo that has never run `/superdev:setup`, one whose
pointer says `none`, and one pointing at its own style guide. It does still read that file
**opportunistically** for the *Declare per language* answers alone (spelling convention, compound
formation, case forms, number and date format, quotation marks) when the file and those answers exist,
and skips just those sub-rules, saying so in its report, when they don't.

**Why.** `prose-check` is a tool a user reaches for, not a repo-wide policy: gating it on the same pointer
`doc-writer`/`doc-reader` use would make it inert in most repos, the opposite of "usable at any time." The
two consumers stay independent by design — `doc-writer`/`doc-reader`'s config-gated path is untouched, and
a repo can point its own docs at a different standard while still running `prose-check` against
`controlled-prose.md` by name.

**Considered options.**
- *Gate on `docs/agents/documentation.md`'s pointer, like `doc-writer`/`doc-reader`.* Rejected: makes the
  command inert everywhere the repo hasn't opted in to `controlled` for its own docs, defeating the point
  of an on-demand check.

**Consequences.** A repo whose configured standard is a different style guide, or `none`, still gets
`controlled-prose.md`'s rules from `prose-check` specifically — that mismatch is intentional, not a bug to
reconcile toward one pointer.
