# 0159: run-trace reads a Bash call's starting directory from a PreToolUse stash

**Status:** Superseded

**Superseded by:** [ADR 0225](0225-guardrails-read-no-shell-words.md), which removes run-trace's Bash readers and with them the PreToolUse stash.

**Amends:** [ADR 0117](0117-the-run-trace-is-hook-written-evidence.md), whose hook resolved a Bash command's
relative paths against the hook input's `cwd`.

**Amended by:** [ADR 0160](0160-run-trace-readers-share-one-command-word-and-word-reader.md), which adds the
function-body `cd` shape and reads an `eval` whose first argument starts with the word `cd`, `pushd`, or `popd`
as a `cd` the hook cannot read.

## Context

`plugin/hooks/run-trace.js` records a Bash call on PostToolUse. It resolves the command's relative paths,
and the targets of the `cd` commands the command runs, against the `cwd` field of the hook input. Claude
Code fills that field with the working directory at the moment the hook runs. The shell keeps a `cd`
across calls, so on PostToolUse the field holds the directory the command ended in, not the one it started
in. The hooks documentation states that `cwd` is "the new directory after Claude runs `cd`"
(<https://code.claude.com/docs/en/hooks.md>, checked 2026-10-16).

A command such as `cd scripts/drift/selftest && …`, run from the repository root, therefore resolves its `cd`
twice. The trace of scope `drift-facts-only` records paths under
`scripts/drift/selftest/scripts/drift/selftest/` (triage #1210), and the trace of scope `superdev-view`
records a redirect write under a doubled path (triage #978). A doubled path names no file, so the trace
attributes the run or the write to the wrong path and the scope review's Missing RED reading rests on it.

## Decision

**run-trace takes a Bash call's starting directory from its PreToolUse input.** `hooks.json` registers
`run-trace.js` on PreToolUse for Bash. That handler writes the input's `cwd` to a stash file keyed by the
call's `tool_use_id`, in a per-user directory under the operating system's temporary directory, and does
nothing else. The directory name carries the user id where the platform has one, so on a shared `/tmp` each
account stashes in its own directory. The hook uses that directory only when it is a real directory, not a
symlink, owned by the current user. Windows has no user id, and its temporary directory is per user. A
`tool_use_id` outside `[A-Za-z0-9_-]` stashes nothing, and the handler creates the file exclusively, so it
never writes through a file or symlink already at that path. On every other Bash event, PostToolUse
and PostToolUseFailure included, the hook reads the stash for the same `tool_use_id` and deletes it before
anything else, so a call that records nothing removes its stash too. It resolves the command against that
directory. With no readable stash, it uses the input's `cwd`, as before.
After a `cd` whose target the hook cannot read (a variable, `~`, `-`, a bare `cd`, `pushd`, `popd`), the
segments that follow resolve against the input's `cwd`, the directory the command ended in. When that `cd`
runs in the outer shell, a later relative `cd`, `pushd`, or `popd` of the outer shell also resolves to the
input's `cwd`, because that directory already holds its move. The hook cannot read the target, so a segment
between that relative move and the end of the command resolves against the ending directory too. In
`cd "$X" && cd sub && echo x > f && cd ..`, the write records as `f` in the ending directory, where the
command wrote `sub/f` below it.

A `cd` moves only the shell instance it runs in. bash runs each of these in a shell instance of its own: a
subshell, a substitution, a backtick group, a heredoc body a shell reads, each stage of a pipeline of two or
more commands, simple or compound (`{ cd sub; } | cat`, `cat a | while …; done`), each and-or list that
`&` sends to the background (`cd sub && echo x > f &`), and each coprocess (`coproc cd sub`,
`coproc { cd sub; }`). A `cd` there moves the commands after it in that
instance and nothing outside it. An instance starts in the directory of the instance around it. A `cd` the
hook cannot read inside a nested instance therefore leaves the outer shell's later moves resolving as before,
because the ending directory holds none of that instance's moves. A `cd` in a function body moves nothing
where the function is defined. A call of the function runs the body in the calling shell, so the call
resolves as a `cd` the hook cannot read. The hook reads the call's command word unquoted, so `"f"` and `\f`
call `f`. It does not tell the bodies apart: once any function body holds a `cd`, a later call of any
function the command line defines resolves that way. Those functions include one defined in a heredoc body
a shell reads (`bash <<E`), although that definition runs in the child shell. run-trace reads no quoted
text as a command line, so a function a quoted `bash -c` body defines is not one of them. A subshell, a
pipeline stage, or an `&` job that starts after an unreadable `cd` of the outer shell starts at the ending
directory and resolves its own relative `cd` against it. A later absolute target resolves to itself.
`pushd -n` and `popd -n` change only the directory stack, so the segments after them resolve against the
directory before them. A `cd`, `pushd`, or `popd` behind `command` or `builtin` (`command cd sub`,
`command -p cd sub`, `builtin cd sub`) moves as the bare one does. `command -v` and `command -V`, also in an
option cluster such as `command -pv`, look the name up. They move nothing and record no test run. Bash opens a `cd`'s own redirect before the `cd` runs, so `cd sub > out` records
`out` in the directory before the `cd`.

**The shapes outside the paths the command reached.** The hook records a path other than the one the command
reached in each of these shapes:

- **A segment after an unreadable `cd` of the outer shell.** The outer shell's segments after it resolve
  against the ending directory, up to a later absolute `cd`. A later move of the outer shell, relative or
  absolute, therefore misplaces the segments before it. In `cd "$X" && cd sub && echo x > f && cd ..`, the
  write records as `f` in the ending directory, where the command wrote `sub/f` below it.
- **A nested instance after an unreadable `cd` of the outer shell.** It starts at the ending directory, which
  includes the outer shell's later moves. In `cd "$X" && (cd sub && echo x > f.txt) ; cd ..`, the write
  records as `sub/f.txt` below the parent of `$X`, where the command wrote it below `$X`.
- **An unreadable `cd` or a call of a defined function inside a nested instance.** It moves the instance to
  the ending directory of the outer shell, which holds none of the instance's own moves. The instance's later
  relative moves resolve against that directory. In `(cd "$X"; cd sub; echo x > f)`, the write records as
  `sub/f` below the ending directory, where the command wrote it below `$X`. A test run in
  `(cd "$X" && node tests/a.test.js)` records against the ending directory in the same way. In
  `f() { cd a; }; (f; echo x > g)`, the write records as `g` in the ending directory, where the command
  wrote `a/g` below the starting directory.
- **A call of a defined function.** Once any function body holds a `cd`, a call of any function the command
  line defines resolves as an unreadable `cd`. The shapes "A segment after an unreadable `cd` of the outer
  shell" and "A nested instance after an unreadable `cd` of the outer shell" therefore follow the call. That holds also for a
  function whose body moves nothing, and for a function a heredoc body a shell reads defines.
- **A function body's commands.** They resolve where the function is defined, against the directory there.
  A write in the body records at the definition, and a `cd` in the body moves none of the body's later
  commands. In `f() { cd sub; echo x > g; }; f`, the write records as `g`, where the command wrote `sub/g`.
- **A `cd` that runs a number of times other than once.** The hook reads every `cd` once, in the order the
  command line holds it. A `cd` in a branch that does not run (`false && cd sub`, `if false; then cd sub;
  fi`), a `cd` that fails (`cd missing; …`), and a `cd` in a loop body that runs zero times or more than once
  each move the hook's directory exactly once. In `false && cd sub; cd sub && echo x > f`, the write records
  as `sub/sub/f`, where the command wrote `sub/f`.
- **A `cd` command word the hook reads differently from bash.** A quoted or escaped `cd` (`"cd" sub`,
  `\cd sub`) moves bash's directory, and the hook reads no move. A quoted or escaped `command` or `builtin`
  before a `cd` (`"command" cd sub`, `"builtin" cd sub`, `\builtin cd sub`) also moves bash's directory, and
  the hook reads no move. In `"command" cd sub; echo x > f`, the write records as `f`, where the command wrote
  `sub/f`. In `"builtin" cd sub && node tests/a.test.js`, the run records `tests/a.test.js`, where the command
  ran `sub/tests/a.test.js`. An assignment before a `cd` (`FOO=1 cd sub`), or before a `cd` behind
  `command` or `builtin` (`FOO=1 command cd sub`, `FOO=1 builtin cd sub`), moves bash's directory too. The
  hook's reading of file writes ignores that move, and its readings of test runs, restores, and
  `scope.js test` calls follow it. A `cd` behind a wrapper that runs an
  external program, such as `env cd sub`, `sudo cd sub`, or `nohup cd sub`, moves nothing in bash. The
  hook's readings of test runs, restores, and `scope.js test` calls move to its target.
- **A redirect on a compound command.** Bash opens a redirect after a `{ … }` group, or after an `if`,
  `case`, `while`, `until`, `for`, or `select` command, before the command runs. The hook resolves it
  against the directory the commands inside the compound command moved to. In `{ cd a; } > out`, the write
  records as `a/out`, where the command wrote `out`.
- **A move the hook does not read.** A `cd` inside `eval` or a sourced file moves the outer shell, and the
  hook does not see it. `shopt -s lastpipe` runs a pipeline's last stage in the outer shell, and the hook
  still reads that stage as an instance of its own. A target that `CDPATH` resolves, and `cd -P` through a
  symlink, reach a directory other than the lexical one the hook computes.

The PreToolUse handler records evidence and guards nothing. Every failure in it passes silently: it denies no
call, prints nothing, and exits 0 (INV-0160).

## Considered options

- **Infer the starting directory from the command's leading `cd` chain.** Strip the relative `cd` targets
  off the ending directory. This needs no new hook entry. It cannot invert `cd ..`, an absolute target, or a
  target held in a variable, and Claude Code resets the directory when a `cd` leaves the project, so the
  inference is wrong in exactly the commands that move the most. Rejected.
- **Keep the stash under the run root.** The run root is not known before the command runs: a call that
  starts outside a run tree and `cd`s into one would stash nothing. Rejected.

## Consequences

- Every Bash call starts one more Node process, before the command runs.
- A stash whose PostToolUse never arrives, such as for an interrupted call, stays in the temporary directory
  until the operating system clears it.
- Another account on a shared temporary directory can create the stash directory's name first, because the
  name is predictable. The hook writes and reads a stash only in a real directory that the current user owns,
  so a directory another account created, or a symlink at that name, holds no stash the hook reads or writes.
  Calls then resolve from the input's `cwd`. The exclusive create keeps a planted symlink at a stash path from
  turning the write into an overwrite of another file.
