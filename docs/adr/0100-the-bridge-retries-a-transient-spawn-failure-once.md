# 0100: The bridge retries a transient spawn failure once

**Status:** Superseded

**Superseded by:** [ADR 0102](0102-superdev-is-a-claude-code-only-plugin.md), which makes superdev a Claude Code-only plugin and removes the harness renders.

**Amends:** [ADR 0087](0087-a-spawn-that-never-started-is-not-a-spawn-that-was-killed.md), which reads a
spawn that never started as evidence about the installation, and has the OpenCode hook bridge let the
call through with a notice.

**Context.** `tests/adapter.test.js` failed once inside a full `bun run test`. One `scope-prune` spawn
never started, the bridge printed its "installation problem" notice, and the next three reruns passed
(triage #688). A machine that runs out of processes for a moment is not a broken install, and the notice
said it was.

Node's own `lib/internal/child_process.js` (v20.x and main, read 2026-09-27) reports spawn errors in
three shapes, and the bridge handled one of them:

- `EACCES`, `EAGAIN`, `EMFILE`, `ENFILE`, and `ENOENT` are emitted as an `'error'` event on the next
  tick.
- `EMFILE` and `ENFILE` also return before `child.stdin`, `child.stdout`, and `child.stderr` are
  assigned, "because we won't be able to set up the stdio file descriptors". `runBridgeHook` read
  `child.stdout` right after `spawn()`, so a `TypeError` rejected its promise and blocked the tool call.
  The `'error'` event then fired on a child with no listener, which is an unhandled `'error'` event
  that ends the host process.
- Every other code, `ENOMEM` among them, makes `spawn()` throw synchronously. That also rejected the
  promise and blocked the tool call, with no notice.

A reproduction against the rendered bridge confirmed all three: `EAGAIN` proceeded with the installation
notice, `EMFILE` blocked with the `TypeError` and then crashed the process, and `ENOMEM` blocked with the
raw `ErrnoException`.

**Decision.** A spawn failure has two classes, named by its code:

- **Installation:** `ENOENT` and `EACCES`. The bridge answers as ADR 0087 states: the call proceeds, and
  the once-per-hook notice names the code and the installation.
- **Transient:** `EAGAIN`, `EMFILE`, `ENFILE`, and `ENOMEM`. The bridge retries the spawn once, after a
  short fixed delay. A retry that starts runs the hook as usual. A retry that fails again lets the call
  through, and the notice names the code and says the system ran out of processes, file descriptors, or
  memory.

Every spawn failure reaches this one path, whatever shape Node reports it in. `runBridgeHook` never
rejects and never throws because of a spawn failure, so a spawn failure never blocks a tool call and
never ends the host process. A code outside both lists is answered as an installation failure.

**Why.** The retry is for the class that clears by itself. An installation failure does not clear by
retrying, so retrying it only delays the notice. A transient failure clears as other processes exit, and
an immediate retry would usually meet the same exhausted table, so the retry waits a short fixed time.
There is one retry and no backoff, because a machine that is still exhausted after the delay is better
reported than waited on, and the delay applies only on a failure, never on a normal call.

The call still proceeds after a failed retry, for the reason ADR 0087 gives: the bridge fires on every
tool call, and every repair is made through that surface.

**Considered options.**

- *Immediate retry.* It needs no constant, but it is likely to meet the same exhausted process table or
  descriptor table.
- *Several retries with backoff.* More resilient, but a real exhaustion then holds every tool call for
  the sum of the delays before the call proceeds.
- *Blocking after a failed transient retry.* It stalls every tool call on a loaded machine, and closes
  the surface the repair is made through.
- *Recording the code first, and retrying later.* It would settle which code caused #688 before
  building on it. The reproduction showed that the `EMFILE` path blocks tool calls and ends the host
  process. The `ENOMEM` path blocks tool calls too, whatever caused #688, so the fix did not wait on it.
- *Retrying in `hooks/green-gate.js` too.* That gate fires only on a merge, blocks on any spawn failure,
  and already names Node's own error text, code included. A transient failure there costs one merge,
  which is the trade ADR 0087 accepted.

**Consequences.** A transient failure that clears within the delay is invisible: the hook runs, and no
notice appears. A transient failure that persists costs every affected tool call one retry delay before
it proceeds. `green-gate.js` keeps blocking a merge on any spawn failure, transient or not.
