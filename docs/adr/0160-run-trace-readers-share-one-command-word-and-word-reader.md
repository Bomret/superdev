# 0160: run-trace's Bash readers share one command-word reader and one word reader

**Status:** Superseded

**Superseded by:** [ADR 0227](0227-guardrails-read-no-shell-words.md), which removes run-trace's Bash readers.

**Amends:** [ADR 0159](0159-run-trace-reads-a-bash-call-s-starting-directory-from-a-pretooluse-stash.md),
whose rule for a `cd` the hook cannot read stays, and whose list of wrong-path shapes changes as stated
below.

## Context

`plugin/hooks/run-trace.js` reads a Bash command in four places: the write reader `bashTargets`, the test
run reader (`segWords`, `verificationKind`, `compoundKind`, `testRunsOf`), the restore reader
`restoreEventsOf`, and `scopeTestCalls`. Each reader finds the command word, the directory, git's options,
and a word's text in its own way, so the readers disagree on one command.

- `bashTargets` skips only the bare words `sudo`, `command`, `env`, and `time`, and no wrapper option. A
  write behind `command -p`, `sudo -E`, `env -i`, `nice -n 5`, `exec`, or `rtk` records nothing, while the
  test run reader reads the same wrappers (triage #1230).
- No reader sees a wrapper option that changes directory (`sudo -D`, `env -C`). A write, a test run, or a
  restore behind one records against a directory the program does not use. The ending directory that ADR
  0159 falls back to does not hold that move either, because the wrapper does not move the shell.
- `bashTargets` and `restoreEventsOf` each walk git's global options themselves. They take one `-C` where
  git composes all of them, resolve a redirect against git's `-C`, and read `git apply` input from the
  whole command line.
- Three unquoting rules exist. A brace expansion, a bracket glob, and a process substitution record as
  literal paths.

## Decision

**One command-word reader.** Every reader takes the command word and its arguments from `segWords`.
`segWords` reads every wrapper's options through shell-words.js's `WRAPPER` table and `optionWords`, `env`
included.

**One word reader.** Every reader reads a word through the scanner's own word value, which already applies
bash's quoting rules. A word that holds an unquoted `$`, backtick, glob character, bracket expression, brace
expansion, or leading `~`, or that is a process substitution, names no path.

**git through `gitSubcommand`.** The write reader and the restore reader read git's subcommand and its
global options through shell-words.js's `gitSubcommand`. Every `-C` composes in order, and a segment's
redirects resolve against the shell's directory.

**A directory the ending directory cannot reflect records nothing.** A wrapper option that changes
directory (`sudo -D`, `-R`, `-i`, `env -C`, and their other spellings) and a `git -C` whose value the hook
cannot read move the program and not the shell. For that segment the hook records no write, no test run,
and no restore. Its redirects still record against the shell's directory, which the shell opens before the
wrapper runs. A `cd` behind a wrapper other than `command`, `builtin`, or `time` runs in a child process
and moves no reader's base.

**Changes to ADR 0159's shapes.**

- A `cd` behind assignments (`FOO=1 cd sub`) moves the base in every reader, the write reader included, and a `cd` behind a
  wrapper that runs an external program (`env cd sub`, `sudo cd sub`, `nohup cd sub`) moves it in none. A quoted or escaped
  command word (`\cd`, `'cd'`, `"command" cd`, `\builtin cd`) moves as the bare word does. ADR 0159 listed each of these
  as a shape outside the paths the command reached.
- An `eval` whose first argument's value, with its quotes removed, starts with the word `cd`, `pushd`, or `popd`
  (`eval cd /x`, `eval "cd /x"`, `eval 'cd /x'`) reads as a `cd` the hook cannot read. Bash's `eval` skips one
  leading `--`, so the hook reads the argument after it (`eval -- cd /x`). The segments after it resolve
  against the ending directory under ADR 0159's rule. Any other `eval`, and a sourced file, stay moves the hook does not read. The command word after `command` or `builtin` reads as bash reads it, so
  `command \cd /x` moves to `/x`.
- A function body's literal `cd` moves the body's later segments in the shell instance it runs in. A `cd` in a
  subshell, a pipeline stage, an `&` job, or a substitution inside the body moves only that instance. After a `cd` in a body that the hook
  cannot read, the body's later segments resolve against the ending directory under ADR 0159's rule. That
  directory holds the body's move only when the function ran last, so a body whose function did not run
  last records a path other than the one the command reached. This is a new wrong-path shape, and it is
  accepted. A function body defined inside another body starts in the enclosing body's directory where it is
  defined.
- A command read out of a backtick group or out of a heredoc body a shell reads, inside a function body,
  resolves against the directory outside the body. The body's `cd` does not move it (`f() { cd /a; echo
  \`tee z\`; }` records `z` against the directory outside `f`). This is a wrong-path shape, and it is accepted.

## Considered options

- **Record nothing after every `cd` the hook cannot read.** A miss is safer than a wrong path. ADR 0159
  resolved those segments against the ending directory one day earlier, which gives the right path in the
  common case `cd "$D" && bun run test`. Rejected.
- **Reuse shell-words.js's `commandStart` as the command-word reader.** It skips every `command` option,
  `-v` included, so `command -v cp a b` would record a write. Rejected.

## Consequences

- A segment behind a wrapper chdir option records nothing, so evidence of a test run behind
  `sudo -D <dir>` no longer reaches the trace (INV-0161).
- The guards that share shell-words.js read the same tables. A value option added to `WRAPPER` must match
  the real program's option table, or ledger-guard skips the real command word.
