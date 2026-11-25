# 0284: A repository's commit convention is a prose rule in code-management

**Status:** Accepted

**Context.** superdev wrote Conventional Commits into every commit an implementer, a lite run, or run init makes,
hardcoded `chore(setup): configure superdev` for setup's commit, and left merge commits on git's default message
(`Bomret/superdev` #522). A repository whose commit-msg hook enforces another standard, such as a ticket prefix or
gitmoji, refuses those commits, and an agent then bypassed the hook.

**Decision.** A repository's **commit convention** is one prose rule, with one example each for a commit, a merge
commit, and a pull-request title, in a `## Commit messages` section of `docs/agents/code-management.md`. Both
code-host seeds carry the section with Conventional Commits as its rule. `/superdev:setup` proposes the rule from the
repository's own evidence (a commitlint config, a commit-msg hook, recent commit subjects) and the operator confirms
or edits it; a re-run offers the section to an existing document as a seed gap. Every writer of a commit, a merge
commit, or a pull-request title reads the section itself, and a repository without it follows Conventional Commits.
The change type in a feature label stays the Conventional Commits type set: it names branches and labels, and no
commit text.

**Considered options.**

- *Placeholder templates* (`{type}({scope}): {subject}`). Deterministic and checkable. It lost because it cannot
  express a mapping such as gitmoji's, and a ticket prefix would need a placeholder fed from the slice store.
- *A document of its own* (`docs/agents/commits.md`). It keeps the convention apart from the code host. It lost
  because every commit writer already reads `code-management.md`, and a new document is a new setup decision.
- *The controller pastes the rule into each dispatch.* It saves a subagent's file read. It lost because the rule's
  text would travel in dispatch prose and could drift from the document within a run.
