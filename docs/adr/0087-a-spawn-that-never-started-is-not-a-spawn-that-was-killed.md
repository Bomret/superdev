# 0087: A spawn that never started is not a spawn that was killed

**Status:** Accepted

**Amended by:** [ADR 0100](0100-the-bridge-retries-a-transient-spawn-failure-once.md), which splits a
spawn failure into an installation class and a transient class, and has the bridge retry a transient
one once.

**Amended by:** [ADR 0102](0102-superdev-is-a-claude-code-only-plugin.md), which removes the OpenCode hook bridge, so this decision holds on `plugin/hooks/green-gate.js` and `plugin/scripts/scope.js` alone.

**Amends:** [ADR 0086](0086-a-duration-is-never-the-assertion.md), whose INV-0009 Statement reads "a
process that did not finish carries no verdict" and therefore covers a process that never began.

**Context.** ADR 0086 established that the absence of a verdict is not a pass, and INV-0009 carries the
rule. Its Statement is scoped to `plugin/hooks/green-gate.js` and `plugin/scripts/scope.js`, because a
third gate contradicts it: `plugin/scripts/adapter.js`'s `runBridgeHook`, the OpenCode hook bridge,
kills its hook child at a ceiling and resolves `{ status: code }` with `code` of `null`, which
matches neither the blocking status nor a deny payload. On OpenCode the bridge is the only gate
there is, so a green-gate killed at that ceiling passes the merge. Triage record #606 holds it.

Bringing the bridge under the rule raises a question green-gate never had to answer. The bridge resolves
two different absences through one path: `child.on('close')` with a signal, where the hook ran and was cut
off, and `child.on('error')`, where the hook never started at all — a missing `node`, a wrong plugin path,
a broken install. Green-gate treats both as blocking, on the stated grounds that a working tree which
cannot run its suite gates like a red verdict. The bridge cannot follow it there.

The reason is not that blocking every tool call is unpleasant. It is that **a spawn failure's remedy
requires tool calls.** `node` missing, the plugin path wrong, the install broken: every repair is made
through the surface the block would close. A gate that fails closed on that condition removes the
operator's means of clearing it, which is self-sealing rather than safe.

The distinction is already in this repository's own language, in the narrower place. `CONTEXT.md`'s
**No verdict** entry defines it as "what a spawn that its own bound ended carries … a `status` of `null`
beside a `signal`". By the glossary, no verdict is the killed case specifically. A spawn that never started
carries an error and no signal, which is the seam `tests/spawn-verdict.js` already reads to tell the two
apart. INV-0009's Statement is the loose text, not the concept.

**Decision.** A process that ran and was ended by its own bound, and a process that never started, are two
classes with two answers.

**No verdict** keeps the glossary's meaning: a spawn its own bound ended. It carries no decision, no gate
reads its absence as a pass, and INV-0009 governs it on every gate superdev's own code owns — including the
bridge, which blocks on a killed hook. The signal the bridge's `close` handler discards is the evidence,
the same field `green-gate.js` and `scope.js` already read.

**Spawn failure** is a different subject and sits outside INV-0009. The gate did not run, so there is
nothing it declined to decide, and the absence is evidence about the installation rather than about the
code under the gate. Its answer is per-surface, and each surface states its own with its reason:

- `plugin/hooks/green-gate.js` **blocks**. It fires only on a merge, and a working tree that cannot run
  its suite is a defect in the thing being gated. Blocking closes one merge and leaves every other tool
  call available to repair it. This is a local rule, stronger than INV-0009 requires, not an instance of
  it.
- `plugin/scripts/adapter.js`'s bridge **continues, and says so**. It fires on every tool call, so
  blocking would close the surface the repair is made through. The notice is emitted once per hook,
  per session boundary, rather than per call, because a notice nobody can read past is the same
  failure as no notice — keyed by hook, not by one session-wide flag, because the host runs every tool
  call, hook, and event for every concurrent session on one process, and a single flag would let one
  hook's transient failure silence every other hook's own notice. The keying is process-global, not
  scoped to the session that started: a concurrent session's own session.created event re-arms every
  hook's notice host-wide, which trades under-notification for over-notification rather than eliminating
  it.

**The bridge's ceiling is read from `hooks/hooks.json`**, the manifest it already claims in prose to
mirror, through `green-gate.js`'s own `readHookTimeoutMs`. `plugin/scripts/adapter.js` therefore requires
a hook, which inverts the direction the root `AGENTS.md`'s Child DOX Index documents — `hooks/` is
otherwise the only runtime consumer of `plugin/scripts/`. The inversion is recorded there rather than left
to be discovered.

**Consequences.** INV-0009's Statement names the gates superdev's own code owns — `green-gate.js`,
`scope.js`, and the bridge — rather than the two files it named before, and its exception for the bridge
comes out along with #606. The rule it states is narrower than its old wording implied in two ways: it
governs a killed spawn, not any absent process, and it reaches only the hooks superdev's own code spawns,
not a hook process a harness's own host kills directly (Codex, which invokes every hook through its own
`.codex/hooks.json` rather than through the bridge).

Two surfaces now answer a spawn failure differently, deliberately. An unexplained divergence between two
implementations of one rule reads as an oversight — which is how the bridge's own fail-open comment reads
today — so each states its reason where a reader meets it.

A consumer whose OpenCode install is broken meets a notice rather than a wall, and a consumer whose hook
is merely slow meets a block where a merge used to pass silently.

**One authoring rule this decision's own drafting produced.** An architecture decision record may state a
decision before the code holds it — that is what a decision record is for, and every ADR in this
repository is written at plan time. The **invariant register may not**: an entry states a rule the system
holds now, and an entry written ahead of the code claims an enforcement that does not exist. The two
documents are routinely written in one sitting, from one decision, and the ADR's tense carries into the
register if nobody separates them. It happened while drafting this one: INV-0009's Statement was widened
to its post-repair form and committed before any code delivered it, inside the feature whose subject is a
gate claiming a verdict nobody established. An entry widens in the slice that earns it, never in the
capture that decides it.

**Considered options.**

- **Symmetry: the bridge blocks on a spawn failure too.** Consistent, and self-sealing for the case it
  most often fires on.
- **Keep the fail-open as an exception inside INV-0009.** It reads as a carve-out justified by the
  comment calling it deliberate, which is the argument ADR 0086 spent a feature refuting.
- **A per-hook policy**, so a killed `green-gate` and a killed `merge-guard` answer differently. Different
  stakes, the same answer, and a policy table is a capability nobody has asked for.
- **The bridge reads `hooks/hooks.json` with its own small reader.** A second reader is a second thing to
  drift, which is the defect this decision is repairing one file over.
