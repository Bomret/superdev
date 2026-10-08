# 0123: The green-gate gates a landed merge from the reflog

**Status:** Accepted

This record amends ADR 0047.

**Context.** `hooks/green-gate.js` runs on `PostToolUse(Bash)` alone, and it runs the suite when the
command text matches a `git merge`. Claude Code fires `PostToolUse` only when the Bash call succeeds. A
failed call fires `PostToolUseFailure` instead (ADR 0117). Two merges therefore reach no gate. The first is
a merge that lands inside a chain whose later part fails, for example
`git -C <tree> merge --no-ff <slice> && git worktree remove <slicetree>` when the remove fails. The second
is a conflicted merge. Its `git merge` call exits non-zero, and the shipped prose concludes the resolution
with `git commit --no-edit`, which is not a merge command. The riskiest merges in a run, the conflict
resolutions, go unverified until the review's full suite. Slices that run in the meantime build on that
unverified scope branch. The 2026-10-05 repository sweep found this gap.

**Decision.** The green-gate gates a merge that landed, whatever the outcome of the Bash call that landed
it.

- The hook registers on `PostToolUseFailure(Bash)` as well as `PostToolUse(Bash)`. Both events carry the
  call's `tool_input`, and exit code 2 on either one shows the hook's stderr to Claude. Neither event can
  undo the call, because the tool has already run.
- A command that names `git merge` or `git commit` is a candidate. The hook resolves the candidate's own
  tree, through the same `-C` and `--work-tree` resolution ADR 0047 defines, and reads the top entry of
  that tree's `HEAD` reflog. A merge landed when that entry's subject begins with `merge ` or with
  `commit (merge)`. Git writes the first for a merge that completes, a fast-forward included, and the
  second for a commit that concludes a conflicted merge, whether `git commit` or `git merge --continue`
  made it.
- No landed merge means no suite. This covers a merge still waiting on a conflict (`MERGE_HEAD` present),
  a plain commit, and a command that names neither verb.
- The shipped prose concludes a resolved conflict with `git -C <tree> merge --continue`.

**Considered options**

- **Prescribe `merge --continue` and change nothing else.** This is a prose change only. It loses because
  a chain that fails after its merge still reaches no gate, and an agent that types `git commit --no-edit`
  from habit gets no gate either.
- **Require every merge to run as its own Bash call.** This also changes prose alone. It loses because it
  turns a deterministic guardrail back into a prompted rule, and the green-gate exists to remove that kind
  of rule.
- **Detect a landed merge from the command's exit status.** It loses because a Bash call's status belongs
  to its last command, not to its merge. The hook cannot tell from the status which part of a chain
  failed.

**Consequences.** Every merge and merge-completing commit that lands is gated on the tree where it landed.
A failed call whose merge never started, made while an older merge sits on top of the reflog, runs the
suite on that older merge. That costs one suite run, and it never passes a red tree. The green-gate now
reads the `HEAD` reflog, so a repository that disables its reflog (`core.logAllRefUpdates=false`) gets no
gate from a failed call or a commit. A successful `git merge` call in such a repository is still gated
from its command text.

A call that fails, or a `git commit`, names a tree the gate must read before it can probe. When the command
leaves that tree unknowable (a `cd` before the verb, a `$(…)` in `-C`, a bare `--git-dir`), there is no
reflog to read and the gate stays silent for it. A successful `git merge` keeps the blind block ADR 0047
defines, and a stuck merge shape keeps its own, because that reason already reads "if this command
merged". A stuck `git commit` is not gated.

Verified 2026-10-06, on Claude Code 2.1.289, against the hooks reference
(https://code.claude.com/docs/en/hooks). The `PostToolUseFailure` input section states that those hooks
"receive the same `tool_name` and `tool_input` fields as PostToolUse", and its example carries
`"tool_name": "Bash"`, `"tool_input": {"command": "npm test", …}`, and `"error": "Exit code 1\n…"`, so a
Bash call that exits non-zero reaches the hook with its command text. The exit-code table lists exit 2 for
`PostToolUseFailure` as "Shows stderr to Claude; the tool already failed", and the same page says that to
surface a warning to Claude from a `PostToolUse` or `PostToolUseFailure` hook, "exit 2 instead so Claude
sees the stderr even though the tool already ran".

`git merge --continue` concludes without an editor only because Claude Code's Bash tool exports `GIT_EDITOR=true`.
Verified 2026-10-06, on Claude Code 2.1.289: `git var GIT_EDITOR` in the Bash tool prints `true`, so `git merge --continue` concludes without opening an editor.
