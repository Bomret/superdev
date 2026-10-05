# 0119: A staged page lives in the main working tree, and the close names it

**Status:** Accepted

**Amends:** [ADR 0023](0023-the-knowledge-base-publish-is-its-own-command.md), the staging path.

## Context

ADR 0023 resolves the staging path from the invoking checkout. A documentation pass runs in a
scopetree, so "the invoking checkout" can be read as the scopetree. A page staged there sits under the
scopetree's own `.superdev/kb-pending/`. `.superdev/` is ignored, and `git worktree remove` deletes
ignored files without refusing (verified 2026-10-05, on git 2.54.0: a removed worktree took an ignored
`.superdev/kb-pending/x/p.md` with it, exit 0). `/superdev:wrap-up` removes the scopetree, so the page is
lost with no message.

`scope.js`'s staged-page scan reads the raw cwd. `/superdev:status` run from a scopetree reports no
pending page that the main checkout holds (reproduced 2026-10-05: 0 pending lines from the
`fix-cycle-cost` scopetree, 1 from the main checkout). `publish-kb.js` already resolves the main checkout
through `git rev-parse --git-common-dir`.

The close hand-off has no rule about staged pages. `/superdev:ship` and `/superdev:verify-ship` say
nothing about them, so an agent fills the gap. In one session it printed "wrap-up deletes the staging
directory" and named a staged page that did not exist on disk. `references/doc-pass.md`,
`references/implement-lite.md`, `skills/document/SKILL.md`, and `agents/doc-writer.md` each say a
scopetree-relative path lands "in a directory `/superdev:wrap-up` deletes", which is true of the
scopetree and reads as true of the staging directory.

## Decision

- **A staged page lives in the main working tree.** `scope.js staging <scope>` prints the absolute
  staging directory, `<main working tree>/.superdev/kb-pending/<scope>`, from any checkout of the
  repository. It accepts `_adhoc`. It refuses a scope name that could leave the staging root and refuses
  outside a git repository, with no fallback to the cwd. `--count` prints the number of `.md` pages
  there. Every staging instruction gets its path from this verb, and the staged-page scan behind
  `/superdev:status` resolves the same directory.
- **The close names staged pages from a read.** One section of `references/scope-mode.md` states the
  rule. Ship's post-merge hand-off, verify-ship's end message, and wrap-up's finish cite it. A count
  above zero prints the count, the directory, and that wrap-up keeps the pages, plus
  `/superdev:publish-kb <scope>`: an `Or:` line in ship and verify-ship, the next command in wrap-up. A
  count of zero prints nothing about pages.
- **Wrap-up refuses a run whose checkouts hold staged files.** A file under the scopetree's or a
  slicetree's own `.superdev/kb-pending/` is a gate reason. Wrap-up names each file and the directory to
  move it into, and changes nothing.

## Considered options

- *Wrap-up asks before closing when pages are staged.* Rejected: wrap-up keeps the main tree's pages, so
  the question warns about a loss that cannot happen. Repeated false alarms train the operator to click
  through.
- *Wrap-up moves mis-staged pages into the main tree itself.* Rejected for now: a refusal with a named
  path is enough while the staging fix makes the case rare. Add a move if the refusal fires in real use.
- *Guard every step that removes a worktree.* Plan's label revise, implement-full's slicetree cleanup, and
  `hooks/slicetree-sweep.js` also remove worktrees. Rejected: no stager writes there once staging resolves
  through the verb, and the guard sits at the one removal that ends a run.
- *Prose derives the path from `scope.js root` and counts with `ls`.* Rejected: path arithmetic and a
  count in prose have no test.
- *Ship and verify-ship parse `/superdev:status`'s pending line.* Rejected: it covers the count only, and
  ties the hand-off to a report format.
- *Each skill carries the close sentence.* Rejected: three copies of one rule drift apart.

## Consequences

- A page staged from a scopetree survives wrap-up.
- `/superdev:status` reports the same pending pages from every checkout.
- An operator reads the staged-page count at every close step, so no agent has to infer it.
- `scope.js` gains a second verb that touches no ledger.
