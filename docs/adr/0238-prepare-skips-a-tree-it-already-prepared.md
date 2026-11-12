# 0238: Prepare skips a tree it already prepared

**Status:** Accepted

**Amends:** [ADR 0218](0218-a-worktree-runs-the-repositorys-prepare-command.md): `scope.js prepare` skips the command
on a tree it already prepared whose every tracked change since is Markdown.

## Context

`scope.js prepare <tree>` runs the repository's prepare command in a worktree before its first test run. The
scopetree is prepared at implement start, again at review start, and again whenever a step recreates or resumes it.
For an adopter whose prepare command is a dependency install of one to two minutes, each call costs that time. A
call on a tree that an earlier call already prepared, with nothing changed since, buys nothing: a resumed implement,
a review run a second time on the same tip, or a reused slicetree.

The verb cannot know which files the command reads. An install reads the manifests and lockfiles. A command that
also builds reads every source file. A skip that a changed input invalidates leaves the tree with stale
dependencies or stale build output, and a test run there can pass where a fresh tree fails.

## Decision

1. **A successful run leaves a stamp.** When the command succeeds, changes no tracked file, and the tree held no
   tracked change from `HEAD` before it, the verb writes `superdev-prepare.json` to the tree's own git directory. The
   stamp records the command, `HEAD`, the tree's untracked paths, a wholly untracked directory as one entry, and its
   untracked files git does not ignore, one entry per file. A
   call that runs the command removes the stamp first, so a failed run leaves none.
2. **A later call skips while the stamp holds.** The command is the same, every recorded untracked path is still
   there, every path that `git diff --name-only <stamped HEAD>` names, committed or uncommitted, is a `.md` file, and
   so is every untracked file git does not ignore that the stamp does not record.
   The verb then runs nothing, prints one `prepare: skipped` note on stderr, and exits 0.
3. **Any other change runs the command again.** That covers a test file, a source file, a manifest, a lockfile, and a
   configuration file. It also covers a removed dependency directory, which the untracked-path check catches. A test
   file is no exemption: a prepare command that compiles tests, such as `tsc -b` over a project including them or
   `cargo build --tests`, reads test files.

## Considered options

- **Skip when the range changes no dependency manifest or lockfile.** Rejected: the file names differ per ecosystem,
  and a prepare command that builds reads source files too. A wrong skip gives a stale tree and a false green, and a
  missed skip costs one preparation.
- **Skip only when `HEAD` equals the stamped commit.** Rejected as too narrow: a doc pass that changes only Markdown
  would prepare again for nothing.
- **Also skip when every change is a test path.** Rejected: a prepare command that compiles tests then leaves stale
  compiled tests, and a test run there runs the old test.
- **Skip when the range changes no declared prepare input.** Deferred, as in ADR 0234: it needs a new configuration
  list, which the operator must keep complete. It is the rule that would also skip the review-start preparation after
  an implement whose slices changed source files.

## Consequences

The review-start preparation after an implement still runs, because the slices change source files. The skip saves
the preparation on a resumed scopetree, a reused slicetree, and a second review entry on a tree whose changes since
its last preparation are Markdown. A fix cycle that changes only tests prepares again. A tree prepared with a tracked edit in place is not stamped, so its next
call runs the command. An ignored file the command wrote that a later step deletes inside a directory still present
goes unnoticed, since the stamp records the directory only. An untracked file git does not ignore that existed at the stamp and is edited after it goes unnoticed
too, since the stamp records its name only.
