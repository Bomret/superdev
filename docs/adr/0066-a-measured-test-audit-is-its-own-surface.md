# 0066: A measured test audit is its own surface

**Status:** Accepted

**Amends:** [ADR 0063](0063-test-cost-is-a-review-lens.md), whose decision stands. One of its rejected
options reverses.

**Amended by:**
[ADR 0068](0068-a-repository-sweep-chains-the-read-only-surfaces.md), which keeps this surface and adds a
chained posture to it — and
[ADR 0155](0155-a-slice-merge-runs-no-test-suite.md), which deletes `hooks/green-gate.js`, so no hook reads
the fenced blocks and the timing command's backtick span needs no protection from it — and
[ADR 0162](0162-a-test-audit-also-finds-test-gaps.md), which adds a gap audit beside this cost audit, so a
test audit also reports the tests a suite lacks.

**Context.** ADR 0063 made test cost a review lens and rejected "a dedicated test-audit skill" as "a
fourteenth surface with its own drift rows and suite, for what ad-hoc review already has the shape to do".
Its own Consequences name what the lens leaves undone: "Nothing measures whether a suite got faster. The
lens reports a judgment."

Two properties put the rest of the symptom outside a reviewer's reach, and neither is a matter of
attention or of a better prompt.

A reviewer cannot know what a test costs. Duration is the one property of a test invisible to reading and
trivial to measure. *Overweight fixture* names the shape a heavy test usually has, and a test that is
merely slow carries no shape at all.

A reviewer sees one side of a redundant pair. Redundancy is a property of two tests, and `/superdev:review`
resolves a range — a diff, or the standing code under one path. The covering test lives wherever it lives.
Finding the pair needs every test file in one pass, which is a sweep, not a range.

**Decision.** `/superdev:review-tests` is a surface of its own, read-only end to end, outside the implement
chain and outside `/superdev:afk` — the standing shape `/superdev:prose-check`, `/superdev:backlog`, and
`/superdev:publish-kb` already hold. It derives the test tree from the repository's own test command and
states the swept set, runs an optional configured timing command, dispatches `test-auditor` over the whole
tree with the durations, ranks the findings by cost, puts the judgments to the operator for disagreement,
and writes the survivors as an intent for `/superdev:plan`.

The **timing command** is a `## Timing command` section in `docs/agents/verification.md`, holding its
command in a backtick span rather than a fenced block. `hooks/green-gate.js` matches fenced blocks and
takes the first two as the full and focused commands, so an unfenced command is invisible to it. A third
fence would land in the `blocks[1]` slot wherever a repository configures no focused command, and the
merge gate would run the timing command as its focused suite. Absent, a run labels itself `unmeasured` and
reports on structure alone.

Two lenses join `references/review-checklist.md` — *dead test* and *expensive test* — in a
`## Test cost` section that only `test-auditor` is routed to read. `slice-reviewer` reads the anti-pattern
and vulnerability-class lenses, `final-reviewer` reads five, and both lists are pinned by the
`agent-lens-list` drift row. An entry under `## Anti-patterns` reaches a diff-scoped reviewer that holds no
durations, which is the placement failure ADR 0062 records for the orphan lens.

A **dead or ignored test** is a fact: the symbol under test is gone, or the test is skipped. It reports as
one and goes straight to the intent. The remaining findings are judgments, and they enter one
`AskUserQuestion` round, ranked by cost, where a ticked box means the operator disagrees. Findings past
that round's fixed arity reach the intent labelled `unconfirmed`, because `/superdev:plan`'s own interview
is the second gate before any of them is built.

**Why.** The reversal rests on capability, not on cost. ADR 0063's rejection priced a surface against work
ad-hoc review "has the shape to do", and measuring and sweeping are two things that shape excludes. The
price it named is real and is paid: a fourteenth surface, a seventh subagent whose description is permanent
context in every session, and new drift rows.

Read-only end to end is `/superdev:review`'s own ad-hoc rule, not a departure from it. Its three-strike fix
loop is scope mode only and runs against a Definition of Done, a scope branch, and a ledger stage, none of
which an audit has. Handing findings to `/superdev:plan` is what `### Deferred to a plan` already does for
any finding outside a Definition of Done. The agreement pass makes this handoff better than a bare review's:
the intent arrives triaged.

**Considered options.**
- *A third fenced block, with `green-gate.js` reading the full and focused commands by heading instead of
  by position.* Rejected: it creates the trap it then fixes. Reading by name means every repository's
  `verification.md` grows headings for two commands that never needed them, with a positional fallback for
  every file already written, and the widest blast radius in the plan buys a configuration an unfenced
  section reaches with no code change at all.
- *The timing command in `docs/agents/toolchain.md`, beside the lint and release commands.* Rejected: test
  commands stop living in one document, and `toolchain.md` is skipped entirely for a repository with no
  manifest, which would leave it unable to configure timing.
- *Parsing whatever the runner already prints, with no configuration at all.* Rejected: the parse is
  per-runner guesswork, and it reports nothing precisely where a runner's output is thinnest. A configured
  command says exactly what it measures, and its absence is a stated fact rather than a silent failure to
  parse.
- *A `## Test tree` section naming the globs to sweep.* Rejected: a second new configuration section and a
  second setup question, for a set a model reads off the test command and the suite's own layout. The run
  states the swept set as a verdict instead, which is overridable in a word and stale in no file.
- *Batching the agreement pass until every finding carries an explicit judgment.* Rejected: a
  forty-finding suite becomes three rounds of clicking, and operator attention is worst exactly where the
  audit is most useful.
- *Dropping the agreement pass and reporting every labelled finding.* Rejected: it gives up the one thing
  this handoff has over a bare review, which is that the intent reaches `/superdev:plan` already triaged.
- *A `--audit` flag or a test-tree mode on `/superdev:review`.* Rejected a second time. A command that
  sniffs its target to decide whether to run a test suite hides a second command inside the first.
- *A suite-runtime budget with the green-gate enforcing it.* ADR 0063's fourth rejected option, still
  rejected: it needs numbers that do not depend on the machine and an answer to what a breach does.
  Measurement without a gate is the step before it.
- *Fixing the mechanical findings inline and deferring the structural ones.* Rejected: it splits on whether
  a remedy is obvious, where every superdev rule splits on whether the plan asked for it (ADR 0035), and
  the suite is a poor oracle here — deleting a dead test leaves it green whether or not the deletion was
  right.

**Consequences.** A seventh subagent's description loads in every session, whether or not an audit ever
runs.

`test-auditor` reads one test tree in one context. A tree too large for that is not handled, and the
operator narrows with the optional path argument instead.

A run over a repository with no `## Timing command` reports structure only, and every finding it ranks is
ordered by judgment rather than by duration. This repository is that case deliberately: its suite finishes
in seconds, so a ranked cost table would order noise.

`review-checklist.md` gains a section a reader must be routed to. The `agent-lens-list` row pins
`test-auditor`'s own lens sentence, and a placement row keeps *dead test* and *expensive test* out of
`## Anti-patterns`, the same two-sided shape ADR 0062 needed for the orphan lens.
