# 0150: Shipped code starts a shell only for an operator command, as `sh` from PATH

**Status:** Accepted

**Amends:** [ADR 0069](0069-the-knowledge-base-backend-is-five-command-templates.md), whose templates run
under `/bin/sh -c`.

**Amends:** [ADR 0127](0127-a-test-run-records-its-own-outcome.md), whose test verb starts the command
through `sh -c` watcher processes and a pipe handshake.

**Context.** Claude Code runs on native Windows, and with Git for Windows installed it uses Git Bash as its
shell. superdev's hooks and scripts run under native Node, which does not translate MSYS paths. A user
report (2026-10-13, Windows 11, Node 24) showed `/superdev:publish-kb` publishing nothing, because
`spawnSync('/bin/sh', …)` fails with `ENOENT`. An audit of `plugin/` found the same class of failure in
more places:

- `hooks/green-gate.js` calls `execSync` without a `shell` option, so on Windows the test command and its
  git calls run through cmd.exe.
- `scripts/scope.js` runs its own control logic in shell: `sh -c` watcher processes and a `bash` fd-3 start
  handshake, with POSIX process-group kills.
- `scripts/scope.js` runs the test command under `bash` from PATH, in both `test` and `fail-to-pass`. On
  Windows, that name can resolve to
  WSL's `bash.exe`.

Node's `child_process` docs (*Shell requirements*, checked 2026-10-13) state that a `shell` string other
than cmd.exe must understand `-c`, so `sh` from PATH resolves Git's `sh.exe` on Windows and `/bin/sh` on a
standard POSIX system.

**Decision.**

- **A shell runs only an operator-supplied command.** The repository's test command, full or focused, and
  a knowledge-base backend command template are the only text a shipped executable hands to a shell.
  Everything superdev decides itself, such as process supervision, worktree cleanup, and git calls, is
  Node code or a direct spawn of the program with an argument array.
- **That shell is `sh`, resolved from PATH.** No shipped executable names a shell by absolute path, starts
  `bash`, or runs a command through Node's default shell (`exec`, `execSync`, `shell: true`), which is
  cmd.exe on Windows. The green gate, `scope.js test`, and `scope.js fail-to-pass` therefore run the same
  `verification.md` command under the same shell.
- **Process trees end per platform.** On POSIX a run's process group is killed. On Windows,
  `taskkill /pid <pid> /t /f` ends the process and every child it started (Microsoft's `taskkill`
  reference, checked 2026-10-13).

**Consequences.** Windows with Git Bash becomes a supported platform, with Node and Git for Windows as
prerequisites. A Windows process whose parent has already exited is outside the tree `taskkill /t` walks,
so it can outlive a killed run. A POSIX system resolves `sh` from PATH instead of naming `/bin/sh`; on a
standard system both are the same binary. `scope.js test` and `scope.js fail-to-pass` change shell, from
`bash` to `sh`. Where `sh` is not bash, as with dash on Debian and Ubuntu, a test command that relies on
`bash` syntax runs differently under both verbs than before. The green gate already ran such a command
under `/bin/sh`, so the verbs now run it as the gate does. INV-0153 states the rule, and a drift check
enforces it. superdev's own `tests/` stay POSIX-only.

**Considered options.**

- Fix only publish-kb's spawn. The green gate would still block every merge on Windows.
- A best-effort tier: fix the two blockers and document the rest as known Windows limits. Rejected for a
  full support statement.
- A Windows CI runner. The suites rely on `#!/bin/sh` shims and symlinks, so porting them is its own
  project. Unit tests with an injected platform cover the Windows branches, and a manual smoke on a real
  machine verifies them.
- Declare Windows unsupported and fail loudly on `win32`. A real user runs superdev on Windows, and the
  fixes are small.
- A `SUPERDEV_SHELL` override for a system without `sh` on PATH. Git for Windows provides `sh`, so an error
  that names the missing `sh` is enough.
- Run hooks under the Bun runtime inside the Claude Code binary, to drop the Node prerequisite. Claude Code
  2.1.296 ignores `BUN_BE_BUN=1`, and its docs expose no runtime. Removing the prerequisite is a later
  feature (triage #1113).
