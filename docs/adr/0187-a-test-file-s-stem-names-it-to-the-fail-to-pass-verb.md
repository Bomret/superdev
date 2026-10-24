# 0187: A test file's stem names it to the fail-to-pass verb

**Status:** Accepted

**Amends:** [ADR 0182](0182-the-implementer-proves-its-change-and-the-controller-runs-only-suite-gates.md) point 2,
whose verb takes a test file as named only by its path or a directory above it.

## Context

ADR 0182's `scope.js fail-to-pass` refuses a command that leaves out a test file the range adds or modifies,
and a word names a file only by its path or a directory above it. Some runners select a test file by name.
Cargo runs `tests/foo.rs` as `cargo test --test foo`, and no word of that command is a path. The verb refused
every such command. The implementer could record no fail-to-pass outcome, and the reviewer raised a
**Missing fail-to-pass run** finding no fix could close.

## Decision

1. **A slash-free word of a segment that runs something also names the test file whose stem it is.** The stem
   is the file name less its last extension: `foo` for `tests/foo.rs`, `foo.test` for `tests/foo.test.js`.
2. **A word with a slash keeps the path rules.** `tests/foo` names neither `tests/foo.rs` nor a file under
   another directory.

## Considered options

- *Declare the gap.* A repository would state in `docs/agents/verification.md` that its runner cannot run a
  single test file, and reviewers would raise no **Missing fail-to-pass run** there. Those repositories would
  lose the fail-to-pass evidence entirely.
- *A file-to-name template in `docs/agents/verification.md`.* Exact for every runner, at the cost of a new
  configuration section for one case.

## Consequences

Cargo integration tests get a fail-to-pass outcome. The check is looser: a word that is a test filter or a
subcommand (`npm test`) names a test file whose stem it equals, so such a command passes the check whether or
not it runs that file. A test file in Cargo's directory layout, `tests/foo/main.rs`, has the stem
`main`, so `--test foo` does not name it, and the command names it by its path or its directory.
