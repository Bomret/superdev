# 0188: The fail-to-pass verb reads no word of its command

**Status:** Accepted

**Supersedes:** [ADR 0187](0187-a-test-file-s-stem-names-it-to-the-fail-to-pass-verb.md), whose stem rule widened the
lexical check this decision removes.

**Amends:** [ADR 0182](0182-the-implementer-proves-its-change-and-the-controller-runs-only-suite-gates.md) point 2,
whose verb refuses a command that leaves out a test-path file the range adds or modifies.

## Context

ADR 0182's `scope.js fail-to-pass` refuses a command unless a word of it names every test file the range adds or
modifies. The check is lexical. It reads the command's words and never learns which files the runner ran. Every
runner that selects tests some other way needs a rule of its own:

- Cargo selects an integration test by target name, `cargo test --test foo`. ADR 0187 added the stem of a test
  file as a name for it. A word that is a subcommand or a test filter then names any test file whose stem it
  equals, so `npm test` passes the check for `tests/test.sh` whether or not it runs that file.
- Cargo's directory layout `tests/foo/main.rs` has the stem `main`. A positional word after `--test foo` is a
  test-name filter, so a command that names the path selects no test and exits 0. No Cargo command both runs
  that file and passes the check.
- `dotnet test --filter <criteria>` selects tests by name, and no word of it is a path or a stem.
- A monorepo runs one runner per package. A range can touch test files under two runners, and the command
  `cd api && dotnet test … && cd ../web && npx vitest run …` joins them.

The implementer that writes the command knows its runner. The slice reviewer reads the tests against the
`acceptance` already (ADR 0182), and knows the runner too.

## Decision

1. **The verb reads no word of the command.** It refuses a missing or empty command, and checks no test file
   against the command's words. The command runs at the tree root in both runs, as before.
2. **The outcome line records the command**, as its last field: `fail-to-pass <base>..<tip> <outcome> <reason>
   <command>`, escaped as every trace field is.
3. **The reviewer judges coverage.** An outcome line counts for **Pass-to-pass** and for **Missing fail-to-pass
   run** only where its command runs every test file the range adds or modifies. A line whose command leaves one
   out counts as no outcome line, and the report names the file. A line whose coverage the reviewer cannot judge
   counts, and the report names the doubt.
4. **The control run's `path` line names the range's test files**, the files the command was handed to cover.

## Considered options

- *Narrow the stem match to option values.* `--test foo` and `--test=foo` still name `tests/foo.rs`, and a
  subcommand stops naming a file. It leaves filter values, `tests/foo/main.rs`, `--filter`, and monorepos open.
- *A per-file template in `docs/agents/verification.md`.* Exact for one runner per repository, at the cost of a
  configuration section and a setup question. A monorepo needs one template per package.
- *Append the agent's arguments to the configured full command.* It pins the runner, and fails where the full
  command is compound or a wrapper over several runners, as in a monorepo.
- *Observe the files that ran.* Break each test file in turn and run the command again: a run that still passes
  never loaded the file. It needs one extra run per test file, against ADR 0182's aim of fewer runs.

## Consequences

The verb carries no model of any runner, and every runner and repository layout passes it. A command that leaves
out a test file is no longer refused when the implementer runs it. The likely outcome is `pass-to-pass`, which sends
the implementer back to its tests, or the slice reviewer finds the gap from the recorded command, at the cost of a
fix cycle. A trace line written before this decision carries no command, and a reviewer reading it has no command
to judge.
