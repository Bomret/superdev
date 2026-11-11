# 0135: Bash hooks read shell words with one shared scanner

**Status:** Superseded

**Superseded by:** [ADR 0227](0227-guardrails-read-no-shell-words.md), which deletes the shared scanner: no shipped code reads a Bash command's words.

**Amended by:** [ADR 0155](0155-a-slice-merge-runs-no-test-suite.md), which deletes `green-gate.js`, so
the shared scanner serves `merge-guard.js`, `ledger-guard.js`, and `run-trace.js`, and the green-gate rules below no longer apply.

**Context.** `merge-guard.js`, `green-gate.js`, `ledger-guard.js`, and `run-trace.js` read a Bash
command's words through the `ARG` regex token, kept byte-identical in all four by the drift `arg-token`
contract. `ledger-guard.js` adds `RAW_ARG`. `ledger-guard.js` and `run-trace.js` share a byte-pinned
`stripHeredocs`. `ARG` reads one nested `$(…)` level and does not see quotes inside a substitution.
merge-guard and green-gate add the `STUCK` and `STUCK_MERGE` regexes, which fail closed past that level
through a line-wide verb lookahead. Three review passes on `fix/command-substitution-merge` each closed
one shape and exposed the next (triage #814). The residuals fail open on a newline inside a value, on a
`case` or comment paren, and on a quoted `)`. They over-block on a verb later on the line, and they take
quadratic time. The run trace records phantom edits for the same reasons (triage #947, #950, #954, #968,
#988).

**Decision.** One module, `plugin/hooks/shell-words.js`, scans a Bash command in one linear pass. It
balances quotes, `$'…'` (its ANSI-C escapes decoded), `$(…)`, `${…}`, `$((…))` (its quotes read, so a quoted `)` closes
nothing), `$[…]` (read like `$((…))`: the substitutions and backtick groups
it holds are read, a quoted `]` closes nothing, and its `>` is no redirect), backticks, subshells, `case` patterns, comments, heredocs, and
backslash-newline continuations where bash joins them (not in a comment, single quotes, or a
quoted-delimiter heredoc body). It returns the command's simple commands, each with its words and
redirects, and the commands nested inside substitutions. It reports a command it cannot read to its end as
unreadable. All four hooks require it, and `ARG`, `RAW_ARG`, `STUCK`, `STUCK_MERGE`, and both
`stripHeredocs` copies go away. The module also holds the one table of prefix wrappers (`sudo`, `env`,
`xargs`, `nohup`, `exec`, `eval`, `command`, `timeout`, `rtk`, `arch`, `flock`, `taskset`, and others) with the options each one
takes.
ledger-guard and merge-guard find a command word past them, and past `rtk`'s run-anything subcommand, through
the module's one `commandStart`. It reads each word by its name: the word's value built from a capped prefix of its
quoted and unquoted parts, so a short name spelled in many raw characters (`env''''…''`) is still that name, and a word
whose value is longer than any name is no name, at a cost that stays linear. run-trace reads the
option values of the wrappers it records a test run behind from it.

- **merge-guard reads every integration from the scanned commands.** For each command, at every level,
  it skips the `NAME=value` words and the table's wrappers, then denies a `git merge`, `push`, `rebase`, `pull`, or
  `subtree push`, directly or through an alias defined inline (`git -c alias.p=push p`),
  a `gh pr merge` or `tea pr merge` (tea's `pulls` and `pull` names for `pr` and its `m` for `merge` included, options before `pr`
  and `merge` read past), and a `gh api` or `tea api` write to a pull request's `/merge`
  endpoint. The pull request merge and the API call are also tested on the raw text, as a match at the
  start of a line or after a separator, so every shape that match denied stays denied.

- **green-gate reads its merge the same way.** It reads each command past the same `NAME=value` words and
  wrappers through `commandStart`, resolves an alias defined inline, and gates a controller `git pull` when the HEAD reflog
  tops on a `pull` entry, once per HEAD, as it gates a `git commit`.

- **A guard reads every quoted word's text as a command line as well.** `sh -c "git merge x"`,
  `ssh host "git push"`, and `watch "…"` run a quoted string, and no list of wrappers is complete. A quoted word
  whose text follows an unquoted `NAME=` or an attached `-c`, `-S`, `--command=`, or `--split-string=` is read past that
  prefix too (`alias g='git push'`, `su -c'git push'`). merge-guard therefore denies any quoted word whose text names a guarded integration, a known false
  positive class: a grep or rg pattern (`grep -rn "git merge" docs/`), a commit message
  (`git commit -m "git push fails behind rtk"`), or a pull request body. A quoted text that does not read
  as a command line, such as a commit message with a parenthesis or an apostrophe, is denied by the
  raw-text rule below when it names one. green-gate gates a merge
  found only inside a quoted word when a readable tree's HEAD reflog shows a landed merge that the gate
  has not run a suite on yet, and stays silent otherwise. The gate keeps the HEAD sha of its last
  suite run, red or green, in a file of the tree's git directory, so a `grep -rn "git merge" .` after a
  gate run on that HEAD re-runs nothing. It stays silent without a landed merge because its directory-change block claims a landed merge without a reflog, and an
  obedient revert of a merge that never ran undoes a real commit. run-trace reads quoted text as data.
  A quoted text that does not read as a command line leaves the scan readable and comes back in the
  result's `failedQuoted` list, because `sh -c` runs the lines before a syntax error, so a guarded verb on
  an earlier line must not pass. The caller applies the raw-text rule below to each failed text, and to
  those texts only: a commit message such as `fix(merge-guard): stop` or `don't push` is a failed text, and
  the command around it stays readable. The scan reads at most a fixed total of quoted text, in
  proportion to the command's length, and past it the scan is unreadable, so the reading stays linear. A
  quoted word at the fixed depth limit makes the scan unreadable too. The heredoc bodies the scan reads
  again, a body that holds a heredoc being read again at every level, draw on one budget in proportion to
  the command's length, and past it the scan is unreadable.
- **Text a known shell reads on stdin is a command line; any other stdin is data.** A heredoc body is read as a
  command line, one subshell level down, by every hook, run-trace included, when a known shell (`sh`, `bash`, `zsh`, `dash`,
  `ksh`, at any path and behind any wrapper of the table) reads it on stdin: no `-c` and no script operand, or `-s`;
  `/dev/stdin` or `/dev/fd/0` as the script; `source` or `.` of `/dev/stdin`; a shell later in the same pipeline
  (`cat <<E | sh`); or a `cat` inside a `$( … )` whose output is a command line (`eval "$(cat <<E …)"`). A compound command
  or a `( … )` group is one element of its pipeline: every command inside it feeds the later elements, and a later element
  feeds a shell when it is or holds one (`{ cat <<E; } | sh`, `if …; then cat <<E; fi | sh`, `cat <<E | (bash)`). A heredoc
  opened in a `( … )` subshell that closes before the body is read like any other (`(cat <<E) | sh`). A shell the line reaches
  indirectly counts too, and the reading fails closed: a known shell behind `xargs`, with any options (`cat <<E | xargs sh -c`);
  a call of an alias whose value names a known shell (`alias s=sh; cat <<E | s`); a call of a function whose body holds a
  stdin-reading shell (`f() { sh; }; cat <<E | f`); a command in any function body once a call of a defined function feeds a
  shell (`f() { cat <<E; }; f | sh`); and a numbered heredoc (`3<<E`, `exec 3<<E`) when a known shell of the line reads that
  descriptor through `<&3`, `<&3-`, `0<&3`, or `/dev/fd/3`. A command that writes into a `>( … )` counts as a shell
  (`cat <<E > >(sh)`, `cat <<E | tee >(sh)`), and so does a command whose command line a bare `cat` in a `$( … )` builds
  from its stdin (`cat <<E | sh -c "$(cat)"`, `eval "$(cat)"`). Each command is read into the line's context once. With quoted
  reading on, a `<<<` here-string and the text an `echo` or `printf` writes are read as quoted text under the same receiver
  test, and so is the output of a `<( … )` a shell reads (`sh < <(echo …)`). `cat <<E`, `ssh host <<E`, and an interpreter
  such as `python3 <<E` keep their body data for this reading, and the contents of a file piped to a shell (`cat f | sh`)
  are unknown. A shell-read body that does not read as a command line comes back in `failedQuoted`, and these reads draw on
  the heredoc re-read budget, so the scan stays linear. The receiver test decides what green-gate gates as a command line,
  what run-trace records, and which heredoc bodies and here-strings ledger-guard judges as command lines. ledger-guard also
  denies an interpreter whose script on stdin names a ledger, unless its script operand, the first word past every option
  and option value, names a script file (`node scope.js deferred add - <<'E'`); `-`, `/dev/stdin`, `/dev/fd/0`, and
  `/proc/self/fd/0` name stdin, and so does an operand holding no `.` or `/`. The stdin interpreters are `python` (with optional
  digits and dots), `node`, `perl`, and `ruby`, matched by basename; an inline script makes stdin judged too. On a line that runs such a stdin interpreter, any heredoc body, here-string, or
  `echo`/`printf` word naming a ledger is denied wherever it sits (`cat <<E | python3`), failing closed. Two accepted
  fail-closed false positives: a script operand held in a variable (`node "$S" … -`) reads as no script file, and the rule reads
  the whole command line, so text naming a ledger is denied beside a stdin interpreter even when that text goes elsewhere. merge-guard decides every heredoc body and here-string by the rule below.
- **merge-guard denies any heredoc body or here-string that names an integration, unless a file or message sink receives
  it.** The scan lists every heredoc body (any delimiter quoting, `<<-` and a numbered descriptor included) and every `<<<`
  here-string text in its result's `texts`, each with its receiving command and whether that command stands alone on the
  line. Standing alone means it is read from the command itself, runs in the current shell, and sits in no function body,
  group, or compound command, with no pipe after it. merge-guard denies a text that holds the word `git` and later a
  guarded verb, or `gh` or `tea` and later `pr merge`, `pulls merge`, or `pull merge`, or that holds a `gh api` or `tea api`
  merge call. This is the rule the base hooks applied to heredoc text. It closes by construction every route from a
  heredoc to a shell that no receiver test lists, such as `busybox sh`, a duplicated descriptor
  (`exec 4<<E; exec 3<&4; sh <&3`), and `ssh host <<E`. Two receivers are exempt when they stand alone, run behind no
  wrapper, take the text on stdin, and write only plain files: no expansion, no process substitution, and no `/dev/` or
  `/proc/` path except `/dev/null`. A file sink is `cat` with no operand, or `tee` with at most `-a` and plain file
  operands, whose stdout is redirected to such a file (`cat >> progress.md <<'E'`). A message sink is `git commit -F -`,
  `gh pr|issue … --body-file -`, or `tea issue|issues|pull|pulls|pr … --description-file -`, that opens no editor on its
  text: git `-e`, `--edit`, or a `-c` or `--config-env` setting of `core.editor` or `sequence.editor`, and gh `-e` or
  `--editor`, run an editor over the body, so they exempt nothing. A line that runs `exec` exempts neither,
  because `exec` can point a file such as `/dev/stdout` at a shell. A sink's text is still denied where the base hook denied
  it: a line or `;`, `&`, `|` segment that starts with `git` and later names a guarded verb, a line that starts with
  `gh pr merge` or `tea pr merge`, and an API merge call. A body that names nothing guarded is allowed. Any other
  data that names a guarded verb is denied too, a known false positive of the quoted-word class (`cat <<E` prose to stdout).
  A here-string's text is charged to the heredoc re-read budget before it is built, so the list stays linear. green-gate
  reads such a text naming a merge as a merge found only inside a quoted word, which the HEAD reflog decides. merge-guard
  also denies a git, gh, or tea command behind `xargs` that stops before its subcommand or `pr` verb, because `xargs`
  appends that word from stdin (`cat <<E | xargs git`).
- **Commands built at run time stay out of reach.** A command assembled from a variable (`$v`, `"$@"`, `${0/*/git}`), by
  `printf -v`, `read c <<<`, an array, an `IFS` trick, or `BASH_ENV=<(…)` is not read, nor is an API endpoint built in a
  variable (`gh api -X PUT $x/merge`).
- **An unreadable command is denied only when its raw text names what the guard protects.** merge-guard
  denies when the raw text holds the word `git` and later a guarded verb (`merge`, `push`, `rebase`, or `pull`), or `gh` or `tea` and later
  `pr merge`, `pulls merge`, or `pull merge`. ledger-guard denies when the raw text holds a ledger path, and green-gate reports a blind
  verification when it holds `git` and later `merge`, or `git` and later `pull` when the HEAD reflog shows a landed merge. Any other
  unreadable command is allowed, because bash rejects most of them
  as syntax errors and runs nothing. run-trace records nothing for it. A failed quoted text is held to
  the same rule by merge-guard. green-gate reads a failed quoted text that holds `git` and later `merge` as a merge
  found only inside a quoted word, and one that holds `git` and later `pull` as such a pull, which the HEAD reflog decides as
  above, so a commit message such as `don't git merge twice` stays silent without a landed merge. ledger-guard denies a failed text only when it names a ledger path and
  holds a write form, a `>` redirect or a write or in-place-editor word, so a commit message or issue body
  that only mentions a ledger passes. ledger-guard also reads every command twice, because dash runs `((…))` as
  nested subshells while bash reads arithmetic: once as written, and once with each `((` that is no `$((` spread to `( (`, which is dash's
  reading. A ledger write in either reading is denied. The spread covers quoted words, so `eval "((cp a L))"` and `echo "((cp a L))" | dash` read
  `cp a L` through the quoted-text rule, and `grep "((" L` and a commit message with `((x))` read as no write. `))` is left alone, which keeps `$((1 + 2))` whole.
  A text that no longer reads (`for ((i=0;…))`, a mid-word unquoted `foo((`) that names a ledger is denied by the unreadable-command rule, an accepted over-deny.
  One normalizer, which drops backslash-newlines and then every backslash and quote character, serves every raw-text ledger test, so a path spelled with a doubled backslash
  through nested `dash -c` or `eval` quoting is still found.
- **A guard that cannot load the module fails closed.** merge-guard and ledger-guard deny the Bash call,
  and green-gate reports a blind verification. run-trace records nothing, as it does when `scope.js` fails
  to load.
- **A seeded differential test checks the scanner against `bash -n`.** A fixed-seed generator builds
  nested fragments, and the test asserts that the scanner's readable verdict matches `bash -n`. Shapes on
  which bash versions disagree are excluded by name.

**Why.** A regex cannot balance nesting to an arbitrary depth, so each patch to `ARG` closed one shape and
left the next one open. A scanner that keeps a stack closes the whole class, and it runs in linear time.
One module gives one place to fix, where four pinned copies need four. A guard that fails open on a broken
install would let a subagent integrate silently, so the guards fail closed.

**Considered options.**
- *Keep patching `ARG`.* Rejected: three passes each exposed the next shape (triage #814).
- *A copy of the scanner in each hook, byte-pinned.* Rejected: it keeps every hook standalone, at the cost
  of four copies of a scanner, the duplication the `arg-token` contract pins today.
- *Re-scan only known wrappers (`sh`, `bash`, `zsh`, `dash` with `-c`, and `eval`).* Rejected: it removes
  the grep false positive, and an unlisted wrapper such as `ssh` or `xargs` becomes fail-open for a
  subagent merge.
- *green-gate treats a quoted candidate like an unquoted one.* Rejected: its directory-change block then
  fires on quoted text that ran no merge.
- *Deny every unreadable command.* Rejected: it blocks unrelated commands the scanner misreads, for the
  controller too.
- *A corpus of named shapes only.* Rejected: it misses an unnamed shape, which is the gap triage #814
  records.

**Consequences.** `merge-guard.js` and `ledger-guard.js` stop being standalone. The `arg-token` drift
contract is replaced by a contract that all four hooks require the shared module. The test suite needs
`bash` on the path for the differential test. `run-lock.js` keeps its own `git worktree add` regex,
because it reads one phrase and no lexing record names it.
