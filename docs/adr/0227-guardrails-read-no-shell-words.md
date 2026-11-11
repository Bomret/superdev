# 0227: Guardrails read no shell words

**Status:** Accepted

**Supersedes:** [ADR 0135](0135-bash-hooks-read-shell-words-with-one-shared-scanner.md),
[ADR 0159](0159-run-trace-reads-a-bash-call-s-starting-directory-from-a-pretooluse-stash.md),
[ADR 0160](0160-run-trace-readers-share-one-command-word-and-word-reader.md),
[ADR 0181](0181-a-hook-refuses-an-implementers-full-suite-run.md).

**Amends:** [ADR 0022](0022-run-state-is-owned-by-a-deterministic-cli.md) and
[ADR 0208](0208-deleting-run-state-is-a-write.md): scope.js detects an outside write to the ledger or the run
trace after the fact, and no hook refuses one. [ADR 0117](0117-the-run-trace-is-hook-written-evidence.md) and
[ADR 0127](0127-a-test-run-records-its-own-outcome.md): the run trace infers nothing from a Bash command.

## Context

merge-guard, ledger-guard, run-lock, run-trace, and test-guard decide what a Bash command does by reading its
words through a shared scanner, `lib/shell-words.js` and the modules around it. Every review that probes a guard
finds another spelling the guard misreads. Scope #122 spent three fix cycles on such spellings and did not
converge. The guards target the commands a model normally writes, and isolation against a hostile agent is the
platform's job.

## Decision

1. **No shipped code reads a Bash command's words.** Each guard enforces the effect, owns the operation, or
   detects after the fact. The shared scanner and its modules are deleted.
2. **merge-guard is one raw-text check over a subagent's Bash call.** It denies a line that holds `git`, `gh`,
   `tea`, or `scope.js` followed later by `push`, `merge`, `rebase`, or `pull` as a word. A lead word written after
   a backslash, as in `\git push`, which skips a shell alias, counts. A word joined by `-` is no verb. The controller's calls are not checked. This is the one exception to decision 1.
3. **run-lock is removed.** `scope.js open`'s nonce check and implement's entry liveness check are the run
   lock's readers. A scopetree is created with a plain `git worktree add`.
4. **ledger-guard is removed.** scope.js keeps a digest of the ledger and the run trace in the run root. A verb
   that reads a file whose digest shows an outside edit reports it once, records a `tamper` trace line, and keeps
   going.
5. **The run trace records test runs only from `scope.js test` and `scope.js fail-to-pass`, and edits only from
   file-tool events.** `scope.js test` runs a free command as given, against the test files its caller names. A
   path a range changes with no `edit` line is an untraced write, and review grades it.
6. **test-guard is removed.** An implementer's full-suite run is a review finding.

## Considered options

- **Freeze the scanner at normal model output.** Smaller, and every guard stays, but it keeps the scanner, which
  is the cost this decision removes.
- **Harden the scanner spelling by spelling.** Scope #122 ran three fix cycles this way without converging.
- **Read-only ledger files.** Claude Code's Edit tool rewrites a `0444` file (checked 2026-11-11, Claude Code
  desktop, macOS).
- **Per-worktree git hooks fencing a slicetree.** They deny every other-branch ref update and push from that
  worktree, but cannot see `gh` or `tea pr merge` and do not fence the shared scopetree, so the raw-text check is
  needed anyway.
- **Remove every guard with nothing in its place.** It leaves a subagent's `gh pr merge` to host branch
  protection alone.

## Consequences

A deliberately obfuscated command passes every guard, and no review counts that as a finding. A subagent's
one-line commit message holding an integration verb after `git` is denied. A heredoc message passes only while no
line of it holds a lead word followed by a verb. merge-guard also denies some ordinary subagent commands that
integrate nothing and that the earlier word-reading guard allowed: `git stash push -u -m <tag>`, a command naming a
branch that ends in `/merge` or `/push` (`git log feat/merge`), and a search for the text (`grep -rn "git push"
plugin`). A subagent rewrites such a command, and the controller runs it where needed. A run whose own trace lines keep its
lock fresh no longer blocks itself on a scopetree recreate.
