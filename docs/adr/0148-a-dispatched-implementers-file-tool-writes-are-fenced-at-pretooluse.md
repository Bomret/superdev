# 0148: A dispatched implementer's file-tool writes are fenced at PreToolUse

**Status:** Accepted

**Context.** A full-tier run dispatches each slice's implementer into its own slicetree. The
implementer can still write into a checkout of the same repository outside `.superdev/`, such as the
invoking checkout. Nothing detects that write. Triage #566 records two instances, both caught by a human
who read `git status`. In the first, an implementer wrote four files into the main checkout as well as
into its slicetree, and the copies were byte-identical to what the scope branch carried. The work was
right and the path was wrong.

ADR 0079 removed the case where `/superdev:plan` itself writes to the invoking checkout, and INV-0001
pins what the prose instructs. Neither one governs the path a dispatched agent writes to at run time.

**Platform basis.** ADR 0117 verified that plugin hooks fire inside subagents, and that each tool call
there carries `agent_id` and `agent_type`. `merge-guard.js` already denies a subagent's tool call at
PreToolUse on that basis. The run trace binds an `agent_id` to its dispatch only when the `Agent` call
returns (`dispatch-bind`). For a foreground dispatch that is after the subagent has finished, so a hook
cannot learn which slicetree a running implementer was given.

Verified 2026-10-13, on Claude Code 2.1.296. The subagent metadata files in the local transcripts
(`~/.claude/projects/<project>/<session>/subagents/agent-*.meta.json`) record `"agentType":"superdev:implementer"`
for a dispatched implementer. The hooks reference
([hooks docs](https://code.claude.com/docs/en/hooks.md), checked 2026-10-13) describes `agent_type` as the
subagent's type and gives plugin-scoped names in the `<plugin>:<agent>` form. No transcript records the hook
input itself, so the `agent_type` value in the hook input was not observed directly.

**Decision.**

- **A guardrail denies the write before it lands.** `plugin/hooks/tree-guard.js` runs at PreToolUse on
  `Edit|Write|NotebookEdit`. It denies a `superdev:implementer` call whose target lies in a working tree
  of a repository that holds a superdev run, outside that repository's main-working-tree `.superdev/`
  directory. A repository holds a run when a readable `ledger.md` sits under its `.superdev/scopes/<slug>/`.
  It also denies such a call whose target lies in a git directory under the `.git/` directory of a main
  working tree that holds a run. That covers the main `.git/`, every linked working tree's gitdir under its
  `worktrees/`, and every submodule's gitdir under its `modules/`. The path places such a target, because
  git run inside a submodule's gitdir names the submodule. A `.git` that is a symlink leaves no `.git`
  segment in the resolved path, so the guard also places the target by its path as spelled, with `..`
  collapsed. Any other git directory passes.
  The guard judges the path the bytes would land on, after symlinks and `..` are resolved.
- **The denial tells the agent how to recover.** It names the refused path and states that an implementer
  writes only inside the slicetree its dispatch named. For a working-tree target it gives the path relative
  to the target's working tree. The implementer's prompt names its slicetree, so the agent can rewrite the
  file there. For a git-directory target it states that an implementer never writes into a repository's git
  directory.
- **The guard fails open.** A call it cannot judge passes: unreadable input, a git call that fails or
  exceeds its bound, an unreadable run directory, a main working tree it cannot determine, or a helper
  module that will not load. The three Bash guardrails fail closed instead (INV-0140), because the
  integrations and run-state writes they deny cannot be undone safely. A misdirected write into a checkout
  is visible in `git status` and is reverted easily. A write into a git directory is not visible there, so
  the guard refuses one whenever it can judge the call. The guard backstops both, and a transient git
  failure must not stop every implementer write in a run (INV-0009).
- **Only the implementer, and only the file tools.** Every other agent type, the controller, and a call
  naming no agent type pass without a git call.

**Consequences.** A misdirected file-tool write by an implementer no longer lands in a checkout or in its repository's git directory. The
guard does not cover the following:

- A Bash write, such as `sed -i`, `cat >`, or `cp`, into a checkout.
- A write under `.superdev/` that lands in the wrong tree: the scopetree, another slice's slicetree, or
  another scope's run.
- A write into a submodule's working tree, a nested repository, or a bare repository inside a checkout,
  none of which holds a run. A submodule's gitdir under the main `.git/modules/` is covered.
- A write into a run repository's git directory spelled by its real path outside `<repo>/.git`: the
  target of a `.git` symlink, or the directory a `--separate-git-dir` repository's `.git` file names.
  Neither path lies under the `.git` of a directory that holds a run.
- A write through a symlinked `.git` spelled in another letter case, such as `.GIT/config` on a
  case-insensitive filesystem. The `.git` segment compare is case-sensitive.

The guard costs at most three bounded git calls for each implementer file-tool call:
`git rev-parse --is-inside-work-tree --show-cdup`, which places the target in a working tree or
a git directory and fails in neither. For a target in a working tree, `git rev-parse --git-common-dir` and
`git config --file <git-dir>/config --get core.worktree` follow inside `scope.js`'s `mainWorkTree`.
`tests/tree-guard.test.js` counts them through a PATH shim, for a working-tree target and a git-directory target.

**Considered options.**

- **Detect after the dispatch.** Compare the main checkout's `git status` before and after each
  dispatch. It catches every write route, Bash included. The stray files still land, and an operator's
  own edits during the run read as the agent's.
- **Read Bash commands too.** The run trace's command-target reader ignores a `cd` (triage #1003), so it
  resolves `cd <slicetree> && cat > rel` against the wrong directory, and the guard would refuse a correct
  write.
- **Cover the doc-writer too.** An ad-hoc `/superdev:document` writes the main checkout on purpose. A
  hook cannot tell that run from a scope run, so the guard would refuse a legitimate write.
- **Extend `ledger-guard.js`.** It saves a file and a `hooks.json` entry, but it puts a second, unrelated
  rule into a guard about run-state files, and that guard's matcher omits NotebookEdit.
