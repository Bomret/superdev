# 0218: A worktree runs the repository's prepare command

**Status:** Accepted

**Amended by:** [ADR 0234](0234-test-runs-overlap-and-skip-repeated-preparation.md), whose clean between the two runs keeps what the first
preparation wrote. [ADR 0238](0238-prepare-skips-a-tree-it-already-prepared.md), whose verb skips the command on a tree it
already prepared whose every tracked change since is Markdown.

**Amends:** [ADR 0215](0215-fail-to-pass-reuses-a-traced-control.md): the verb reuses a traced control only when
`docs/agents/verification.md` carries a `## Prepare command` section.

## Context

superdev creates git worktrees for a run: the scopetree, one slicetree per slice, setup's probe worktree, and the
throwaway worktree of `scope.js fail-to-pass`. A new worktree holds the tracked files only. Installed dependencies,
such as `node_modules/` from `bun install` or the output of `dotnet restore`, are ignored files, so the worktree has
none of them. Module resolution walks up from the worktree to the main checkout's root `node_modules/`. It never
reaches a workspace-local `node_modules/` in a monorepo package.

In an adopter's bun-workspace and dotnet monorepo, every `fail-to-pass` call printed `unknown control=1`: the control
run could not load `happy-dom` or `uplot` in the throwaway worktree (WEAVER-620). Under ADR 0215 the result can be
wrong instead of unknown. The verb takes a passing control from the run trace, recorded in a tree where an agent had
installed the dependencies, and then runs only the put-back run in the bare throwaway worktree. That run fails for
lack of dependencies, and the verb prints `fail-to-pass`.

## Decision

`docs/agents/verification.md` takes an optional `## Prepare command` section. It holds one shell command that makes
a new worktree of the repository ready to run its tests, or the word `none` when a worktree needs no preparation.

A verb, `scope.js prepare`, runs that command at the root of a named worktree. Every prose step that creates a
worktree that will run tests calls it right after the creation: implement's scopetree at implement start, each
slicetree, a recreated scopetree, and the scopetree again at review start, because a merged slice can add a
dependency. `/superdev:setup` runs a proposed command once in a probe worktree before it writes it. `fail-to-pass` runs the command in its throwaway
worktree before each of its two runs, because the clean before the second run removes the installed files and the
put-back can restore the base's lockfile. A prepare command that fails gives no verdict: `fail-to-pass` prints
`unknown prepare=<exit>`. A prepare command that changes a tracked file fails too, in the verb, in
`fail-to-pass`, and in setup's probe. The verb compares each tracked path's difference from `HEAD` before and after the
command and names each path that changed, because a resumed scopetree or a reused slicetree can already hold tracked
edits. An untracked file it writes is no such change.

A preparation has no time bound, on purpose. The control run has none either: an install takes as long as the
repository needs, and no fixed bound fits every repository. The caller's Bash tool timeout caps it.

The verb reuses a traced control only when the section is present, as a command or as `none`. Then the throwaway
worktree has the same dependencies as the tree that recorded the control. With the section absent, the control
runs in the throwaway worktree.

## Considered options

- **Copy the ignored files the main checkout holds, selected by `.worktreeinclude`, reflinked where the file system
  supports it.** Rejected by the operator. It saves install time, but the copy is the main checkout's dependency
  state, not the state the worktree's own lockfile names, and reflinking needs code per platform.
- **Run the prepare command from a hook on `git worktree add`.** Rejected: an install in a hook outruns hook
  timeouts, and the agent does not see it run or fail.
- **Keep reusing a traced control in every repository.** Rejected: a repository that needs dependencies and states
  no prepare command keeps getting a false `fail-to-pass`.
- **Prepare only the throwaway worktree of `fail-to-pass`.** Rejected by the operator: every worktree superdev
  creates for a test run starts without dependencies.

## Consequences

A repository with no `## Prepare command` section loses ADR 0215's saving until the section is written.
`/superdev:setup` proposes the section, and `setup check` reports a missing one. Reviewer worktrees under `/tmp` run
no test and are not prepared.

A preparation that hangs in `fail-to-pass` holds the verb until the caller's Bash tool timeout ends it. The verb then
writes no outcome line, so a reviewer reads a Missing fail-to-pass run.
