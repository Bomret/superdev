# 0114: The slice review reads the progress log only after its blind pass

**Status:** Accepted

**Amended by:** [ADR 0117](0117-the-run-trace-is-hook-written-evidence.md), which adds the
run trace to the blind pass, because hooks write it and the implementer does not.

**Context.** In the full tier, `implement-full.md` dispatched `slice-reviewer` with the implementer's
report inline. The report states the implementer's status, says the suite is green, and marks each
listed criterion met. The reviewer's only defense against that account was the **Judge discipline**
instruction. *The Prompt Report* (Schulhoff et al., arXiv 2406.06608v6, §5.2.2) finds that an assertion
inside a prompt shifts a model's judgment, and that an instruction alone mitigates this only partly. A
dispatch arrives as one prompt, so no instruction can make a reviewer judge before it reads text the
dispatch already holds. ADR 0020 met the same problem for `final-reviewer` and the Definition of Done.

The output template also put the verdict line first, ahead of the findings that decide it. A subagent
inherits the session's extended-thinking setting, so the order matters when session thinking is off.
Verified 2026-10-03 against https://code.claude.com/docs/en/sub-agents: "As of v2.1.198, subagents also
inherit the main conversation's extended thinking configuration … There is no per-subagent thinking
setting."

No incident caused this change. The local progress logs held about 45 slice-reviewer verdicts and no
data that could show a false pass.

**Decision.** The slice-reviewer dispatch hands the slice's **Progress log** path and never the
implementer's report text. The reviewer settles a verdict in a **Blind pass** over the specification,
the acceptance criteria, and the diff, Lens 2's own suite run included. Then it opens the progress log.
Reading the log can add a finding or raise a finding's severity, and it never withdraws or downgrades
one. Every addition, every raise, and on a re-review every earlier finding's state (closed or still
open) goes into a section of its own after the blind findings, and the verdict line comes last.

The reviewer appends its full findings to the progress log, so a re-review reads the earlier findings
there, after its own blind pass. The scope's deferred findings still arrive in the re-review dispatch,
because the reviewer must leave them out of the list it writes blind.

The dependency check follows the same rule. A dependency the diff adds, with no verification record for
its exact package name in the progress log, is a Critical finding the reviewer adds after reading. The
check reaches `slice-reviewer` alone, because no other review agent receives a progress log.

**Considered options**

- **Withhold the report entirely.** The reviewer never opens the log and appends to it blind. It loses
  because nobody checks the implementer's own doubts independently, and its enforcement is no stronger:
  both shapes rest on prose that tells the reviewer when to open the file.
- **Concerns as pointers in the dispatch.** The controller forwards the concerns and shortcuts and drops
  the status and the "met" lines. It loses because the pointers arrive before the blind pass and anchor it
  on the spots they name.
- **A controller path that declines a finding the report explains.** It loses because the controller
  reads the same report, so the bias returns at that step. A justified deviation from the specification
  goes through a specification change.
- **The earlier findings in the re-review dispatch.** It loses because the dispatch would presuppose the
  fixes.
- **The verdict line last, and nothing else.** It loses because the report stays inline, and the change
  helps only when session thinking is off.

**Consequences.** Superdev measures no prompt change (ADR 0071), so nothing shows that the change helps.
The order is enforced by prose and by drift rows on both the agent body and the dispatch. Nothing
mechanical stops a reviewer from opening the log early. A deviation the report justifies costs a fix
cycle. The lite tier and an ad-hoc review get no dependency check. A dependency added by the
scope-level fix loop of `/superdev:review` on a full-tier run also escapes it: no slice-reviewer sees
that diff, and the final-reviewer's lens list excludes the section. A degraded inline review after a denied
`slice-reviewer` dispatch is not blind, because the controller already holds the implementer's report. It
applies the dependency check and the one-way rule.
