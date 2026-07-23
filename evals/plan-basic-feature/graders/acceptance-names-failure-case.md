---
type: llm
focus: files
weight: 2
---
The diff adds a plan under `docs/plans/<slug>/`: one epic file (`00-epic-*.md`)
and two or more slice files (`NN-<test-applicability>-*.md`), each with an
`## acceptance` section.

The feature intent states only that the service reads from a datastore on every
request; the failure mode — the datastore being unreachable while the service
itself is up — is left for the planner to derive. The intent's own Definition
of Done is deliberately happy-path-only. Judge PASS only if ALL of the
following hold, else FAIL:

- At least one slice file classified `behavior` has an `## acceptance` section
  that names the datastore-unreachable case — what `/health` does when the
  datastore cannot be reached (a distinct status code, a distinct body, or a
  distinct documented response). It is not enough for the `## spec` alone to
  mention it: the criterion has to say what is observable when the failure
  occurs. Any answer counts as long as it is stated — a plan that decides
  `/health` deliberately stays 200 during a datastore outage passes, because
  the rule under test is that the case gets enumerated, not which response it
  gets.
- That criterion is stated as **observable behaviour** — something a caller or
  test could check — not as a proxy count. A criterion of the shape "covers N
  edge cases", "handles all error cases", or "has adequate coverage" FAILS this
  grader even if a failure case is mentioned nearby (`references/plan-contract.md`
  and ADR 0002: named behaviour, never a gameable count).

This grader carries the check that `/superdev:plan` enumerates a behavior
slice's **domain-level** failure and boundary cases into its `acceptance` —
cases derivable from the interview without reading the implementation. Do NOT
fail the plan for omitting implementation-level edges (off-by-one, parser
boundaries, encoding); those belong to the implementer and the reviewers, who
see code the planner never does.
