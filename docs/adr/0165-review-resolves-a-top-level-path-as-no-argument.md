# 0165: Review resolves a top-level path as no argument

**Status:** Accepted

**Amends:** [ADR 0078](0078-one-cascade-resolves-an-empty-argument.md) and
[ADR 0063](0063-test-cost-is-a-review-lens.md). The shared empty-argument cascade stands unchanged for
every other command. `/superdev:review` adds one step after it, and that step reviews standing code.

## Context

An operator who types `/superdev:review` and an operator who types `/superdev:review .` mean the same
subject: the current state of the repository. `/superdev:sweep` and `/superdev:review-tests` follow that
model, because each treats an absent path as `.`, the whole repository.

`/superdev:review` did not. Its §1 parsed `.` as the path shape and an empty argument as the empty
cascade. On a clean checkout with nothing ahead of base, `.` reviewed the whole repository as standing
code (ADR 0063). An empty argument ran the live-scope cascade and stopped on "No candidate" (ADR 0078). On
a dirty working tree with an eligible scope, an empty argument named the scope it passed over, and `.` did
not. The result depended on a spelling the operator does not think of as a choice.

The implement chain does not reach the bare command. Run handoff prints `/superdev:review
<BASE-sha>..<branch>`, and ship and submit-pr print `/superdev:review <scope>`.

## Decision

A path argument that names the top level of the invoking checkout resolves exactly as no argument. Two
git outputs decide it: `git -C '<arg>' rev-parse --show-toplevel` equals the invoking checkout's own
`git rev-parse --show-toplevel`, and `git -C '<arg>' rev-parse --show-prefix` prints nothing. The
top-level test alone matches every directory inside the work tree. The prefix test alone matches the git
directory, where `--show-toplevel` fails. Both strings come from git, so the comparison needs no path
normalization (ADR 0150). Any non-zero exit means the argument is not the top level. A submodule root, a
nested repository, and another linked worktree have a different top level, so each stays a path. A path
into a subdirectory, `.` from a subdirectory included, keeps the path shape.

A named argument that resolves to nothing stops and names the argument. Before this decision such an
argument fell through to the empty cascade, which now ends in a whole-repository review, so a mistyped
branch or slug would start one. A ref candidate must pass a ref shape test with no leading `-` before any
git call, so no argument reaches git as an option (triage #451). A ref candidate resolves only when it
peels to a commit (`git rev-parse --verify --quiet '<name>^{commit}'`), so a blob such as `HEAD:README.md`
resolves to nothing. An existing path that git reports outside the checkout's work tree
(`git ls-files -- '<path>'` exits non-zero) resolves to nothing too.

The empty cascade gains a fourth step. After the uncommitted changes, the branch against base, and the
live-scope cascade, review reads standing code of the whole repository in place of the "No candidate"
stop. Its range announcement lists every run root with its stage, and the `/superdev:review <scope-slug>`
line, before it dispatches a reviewer. An unattended run takes the same step, because an ad-hoc review is
read-only. Several candidates still put the question, or block an unattended run.

Under `--chained` the live-scope step is skipped, because the chained posture never enters scope mode. The
code leg of a whole-repository sweep, `/superdev:review . --chained`, resolves as it did before.

## Considered options

- **Document the difference in `argument-hint` and keep both behaviors.** Rejected: the trap stays in
  place for every operator who does not read the hint.
- **Empty and `.` always review the whole repository as standing code.** Rejected: it removes "review my
  uncommitted changes" and the scope cascade from the bare command, which operators use by hand.
- **A literal `.` means the repository root from any directory.** Rejected: one spelling of a path would
  then behave unlike every other path.
- **Keep the "No candidate" stop for an unattended run.** Rejected: the bare command and `.` would then
  differ by mode, and the standing-code review writes nothing that needs a human gate.

## Consequences

`/superdev:review` is the one command whose empty argument does not stop on "No candidate". The stop still
reports what exists, so an operator who meant a run sees the run roots before the standing-code pass.
INV-0077 records that a command may add its own step after the shared cascade.
