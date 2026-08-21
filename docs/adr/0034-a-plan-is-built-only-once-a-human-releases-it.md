# 0034: A plan is built only once a human releases it

**Status:** Accepted

**Context.** A tracker holds two kinds of open ticket: work agreed for execution, and a backlog of tickets
written but still to be discussed. `/superdev:plan` wrote into that tracker and handed straight off to
`/superdev:implement`, so every plan it wrote was live the moment it existed. `/superdev:afk` then swept
the same tracker unattended and built whatever it found. Nothing anywhere expressed the ordinary team act
of refining a ticket and then releasing it, and the closest existing signal did not mean that: the `ready`
label is the `todo` lifecycle state (`references/plan-contract.md`, *Slice lifecycle & status*), applied at
creation and swapped to `in-progress` on dispatch.

**Decision.** A feature is **released** when a human has said its plan may be built, and the release is a
durable signal on the **scope anchor**, covering every slice beneath it — one act of judgment per feature,
matching the one Definition of Done the anchor carries. `references/plan-contract.md`'s *Release* section
owns the contract; each store document specialises it in its own `## Release` section, the way it already
specialises `## Scope anchor` and `## Append mode` (ADR 0017, ADR 0004). The four commands split the work:

- **`/superdev:setup`** captures **how** a release looks on this backend, and holds the answer to two
  requirements: the signal sits on the anchor, and it survives the lifecycle moves `/superdev:implement`
  makes. A separate label is the default it proposes.
- **`/superdev:plan`** asks **whether**, once the plan is written: release it now, or leave the release to a
  human later.
- **`/superdev:implement`** stops on an unreleased feature, before a run root or a branch exists, and asks
  for confirmation. `--unattended` blocks there.
- **`/superdev:afk`** takes released features only, and passes over an unreleased one — nobody is watching,
  so there is no one to confirm it.

**Why.** The signal is a **label rather than a status** because a status is what the lifecycle moves: the
anchor transitions to `in-progress` when the run starts, so a status-based release would read as unreleased
from the first dispatch onward, and every resumed run would stop on a feature the human already released.
It sits on the **anchor rather than each slice** because release is a judgment about the plan, and asking it
per slice multiplies one decision by the slice count while making a partly-released plan expressible, which
nothing downstream could act on. The **how** belongs in `docs/agents/issue-tracker.md` because a label, a
status and a board column are all real answers and the commands stay tool-agnostic (AGENTS.md, *Backends are
pluggable*). The **whether** belongs in `/superdev:plan` because that is where the plan is fresh, the
slices are on screen, and a human is already in the conversation; asking in `/superdev:implement` instead
would let the agent release the work it is about to build.

**Consequences.** `/superdev:implement`'s confirmation is a real escape hatch, deliberately: an operator
naming a label on the command line is a human judgment of the same kind as the release, so the run proceeds
and the signal stays unapplied, leaving the tracker's own record of what was agreed untouched. The local-file
store renders the contract as *released when written* — there is no board to hold a backlog, and the person
who ran `/superdev:plan` is the person who agreed — so `/superdev:plan` asks nothing there and the gate
costs that store nothing. `/superdev:afk` gains a fifth skip, reported like the two that already wait on a
human. `drift-check.js` grows a `release-contract` check, because both halves of the contract fail silently:
a store document without the section leaves the consumers no signal to read, and a consumer that drops the
reference builds whatever it is handed with every file still valid prose. The `ready` label keeps exactly the
meaning it had.
