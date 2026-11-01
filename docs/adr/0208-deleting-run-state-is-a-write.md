# 0208: Deleting run state is a write

**Status:** Accepted

**Amends:** [ADR 0022](0022-run-state-is-owned-by-a-deterministic-cli.md): the CLI that owns run state also owns its removal.

## Context

ledger-guard refuses every Bash write into a run's `ledger.md` or `trace.log`: `cp`, `sed -i`,
`truncate`, a redirect, and `mv`. Its write-target table in `lib/ledger-writes.js` lists no delete verb,
so `rm`, `rm -f`, and `unlink` of either file pass, and so do `find <dir> -delete` and a recursive `rm` of
the run root, `.superdev/scopes`, or `.superdev`. The ledger is the record the stage machine,
`/superdev:status`, and every `scope.js` verb read, and the scope anchor cannot rebuild it. One sanctioned
flow deletes these files from an agent: `/superdev:plan`'s label revision removes the old run root's
ledger, run trace, and lock.

## Decision

A delete of a run's ledger or run trace is a write, and ledger-guard refuses it.

- **Counted as a write:** `rm` or `unlink` naming a `ledger.md` or `trace.log` under a run root; a
  recursive `rm` of a directory that holds one (the run root, `.superdev/scopes`, `.superdev`); and
  `find` with `-delete`, or `-exec` running `rm` or `unlink`, over such a directory; and an `mv` whose source
  is such a file or directory, since the move removes it from the run root. A relative operand after a
  `cd` or `pushd` in the same command is read against the `cd` target (`cd .superdev && rm -rf scopes`).
- **A glob counts when it could match run state.** A `*`, `?`, or `[…]` matches a leading `.` only when the
  glob segment itself opens with `.`, as the shell reads it without `dotglob`, so `rm -rf dist/*` passes and
  `rm -rf .super*/scopes` is refused. A brace group is expanded first, so `rm -rf {x,.superdev}` is refused
  and `rm -rf {dist,build}` passes.
- **Still passes:** a delete of any other file or directory in a run root, such as `run.lock`, `dod.md`,
  `slicetrees/`, or `scopetree/`.
- **`scope.js discard --root <run-root>` is the one sanctioned removal.** It deletes the ledger, the run
  trace, and the lock, then the run root when that leaves it empty. `/superdev:plan`'s label revision
  calls it.

## Considered options

- **Refuse a delete only for a dispatched subagent**, as tree-guard scopes its denial. Lost because the
  controller can delete a ledger by mistake too, and the single-writer rule of ADR 0022 holds for every
  caller.
- **Refuse only `rm` and `unlink`.** Lost because `find -delete` removes the same files with the same
  effect, and the scanner already reads its operands.

## Consequences

The Stop hooks remove run state through Node calls, so ledger-guard does not see them, and they are
unchanged. These deletes pass, as accepted limits of a guardrail that reads command text and knows no
working directory:

- `git clean -x` and `git clean -fdx`: the guard reads no git subcommand, and a clean of ignored files is an
  explicit operator act.
- `rm -rf .` and `find . -delete` run at the repository root: the operand names no run-state segment, and the
  guard cannot tell the root from a build directory without the call's directory.
- A delete inside a command string `find -exec` runs (`find .superdev -exec sh -c "rm {}" \;`): the
  operand reaches the inner `rm` only at run time.
