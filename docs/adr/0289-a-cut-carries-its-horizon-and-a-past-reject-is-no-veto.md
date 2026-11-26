# 0289: A cut carries its horizon, and a past reject is no veto

**Status:** Accepted

**Amends:** [ADR 0122](0122-interview-options-are-vetted-before-they-are-offered.md), whose vetting drops an option
whose check fails: a past reject is no failed check.

**Context.** A brainstorm aims at the smallest version that reaches one milestone goal. Its skill called that target
"the MLP", and agents passed the bare abbreviation to operators. `/superdev:plan` routed every dropped approach to an
ADR's `Considered options` and every dropped scope to the epic's non-goals, with nothing saying whether an option
lost for good or only for that run's goal. An ADR is never edited in place, so a cut made for one milestone read as
a project-wide rejection for as long as the ADR stood. `cross-exam.md`'s live-options rule drops an option whose check
fails, and agents read "an ADR rejected this" as a failed check: in 2026-11 transcripts, brainstorms dropped
directions on ADR 0116 and ADR 0234 without asking, and recommendations leaned on ADR 0036 and ADR 0128 rejects the
operator then overrode.

**Decision.** Every cut carries a horizon as the bold lead word of its line: `**Deferred:**` (outside this run goal,
open to any later run) or `**Rejected:**` (wrong whatever the goal, for a durable reason). The intent names its **Run goal** in one
line and records its drops under **Dropped directions**. The agent proposes each horizon, the operator confirms each
`rejected`, and a cut with no horizon or an uncertain one reads as `deferred`. `/superdev:plan` keeps routing by kind and
adds the horizon as a gate: a rejected approach the operator confirmed goes to an ADR's `Considered options`, and a
rejected scope or any deferral goes to the epic's non-goals, or to a single-slice plan's `spec`, led by its horizon. An ADR holds no deferral, in `Considered options` or in a `## Non-goals` section. A past reject a
session meets, whether an `.out-of-scope/` entry, an ADR option, or a non-goal, is no failed check: the option stays
live, cites the reject with its horizon, and the operator decides. An operator's answer travels through the existing
paths: an overturned ADR is superseded or amended in place by revise-in-place, and a reject the operator keeps lands
with its horizon in the plan's own records.

**Considered options.**

- *Rename the abbreviation and add only the reader rule.* It needs no change to how records are written. It lost
  because every new ADR would keep mixing deferrals with rejections, and each reader would infer the horizon from
  context, which is the inference that misfired.
- *Mark the horizon as a trailing tag, `… (deferred)`.* It keeps today's line shapes. It lost because a trailing tag
  is easy to skip, and the horizon is what a later reader must see first.
- *Write an amending ADR each time the reader rule fires on an old reject.* It would ask the operator about each old
  reject once. It lost because it adds a housekeeping ADR per match, matches that change nothing included.
- *Route every confirmed rejection to an ADR, leaving the epic only deferrals.* It drops a routing branch. It
  lost because a rejected scope that fails the ADR test would have no home.
- *Search closed epics' non-goals for past rejects.* It would surface old cuts. It lost because no store seed holds
  that call, and those records hold deferrals, which block nothing.
- *Record deferred scope as triage records.* It would make each deferral visible in the backlog. It lost because it
  floods the backlog with every "not this run" line.

**Consequences.** Accepted ADRs written before this decision carry no horizon, and none is backfilled. The reader
rule covers them, so a matching old option is put to the operator each time a run meets it until a later ADR
supersedes or amends it. The rename of "Rejected directions" ships with no compatibility
shim, by the pre-1.0 rule in `AGENTS.md`.
