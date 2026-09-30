# 0107: Setup reconciles a config document with its current seed

**Status:** Accepted

**Context.** `/superdev:setup` writes `docs/agents/issue-tracker.md` and `docs/agents/code-management.md`
from a seed only on a backend switch. A re-run reconciles `toolchain.md`, the knowledge base's
`## Commands`, and `deployment.md`, and no other document. `/superdev:setup check` compares each document's
facts against the repository, never against the seed. A consumer configured on an older release therefore
never receives the sections and rules later seeds add, and `check` reports its documents consistent. One
Jira-and-Forgejo consumer on 0.56.0 lacked `## Triage record`, `## Untriaged item`, `## Run state`,
`## Merge`, and `## Rejected requests`, and still carried a stale base computation and a stale
`## Degrade` rule. The gap surfaced only when a consumer skill read a missing section.

**Decision.** Setup compares each config document with the seed for the backend the document records.

1. The comparison matches sections by concept, never by exact heading. A seed section with no matching
   document section is a **seed gap**. So is a seed rule that a matched section lacks or contradicts. A
   fill-in value against a seed placeholder, setup-facing instruction text, and a section only the
   document carries are no gap.
2. `/superdev:setup check` keeps its three verdicts about repository facts. Under each present document it
   lists the seed gaps, and names the plugin version whose seeds it compared against. It stays read-only.
   A document with no seed (an "Other" prose backend, a `None` knowledge base, a `documentation.md`
   recording the user's own convention, `toolchain.md`, `verification.md`) reports that it has no seed to compare.
3. A plain `/superdev:setup` re-run offers every seed gap of a document whose backend stays the same.
   `deployment.md` joins it, and its targets keep their delta rule. A re-run with no seed gap asks nothing. The
   operator applies the gap, records it as a **seed deviation**, or leaves it for later. A gap whose seed
   text carries a fill-in asks the question the fresh setup path asks for it. Nothing is written without
   the operator's choice for that gap (INV-0107).
4. A seed deviation is a bullet in the document's own `## Seed deviations` section, naming the seed rule
   and the operator's reason. `check` and later re-runs list it as recorded, never as a gap. A backend
   switch writes the new seed fresh and drops the old deviations.
   A bullet that names no rule in the current seed is a **stale deviation**: `check` lists it by bullet
   text, never as a gap and never deletes it, and a re-run offers to drop it or keep it, writing nothing
   without the operator's choice. A kept stale deviation is offered again on every later re-run, until the
   operator drops it.
5. `/superdev:sweep`'s config leg treats a seed gap as a judgment, because a gap can be deliberate.

**Considered options.**

- **An exact heading diff in a script.** Rejected. It is deterministic and testable, but consumer documents
  rename headings (`## Outline` for the Confluence seed's `## Audience, language & outline`), so it
  reports false gaps. It also misses every stale rule inside a present section.
- **Missing sections only.** Rejected. It misses the stale base computation, the stale `## Degrade` rule,
  and bullets a later seed added under a present section.
- **A fourth `check` verdict, or folding seed gaps into drift.** Rejected. A document can be drifted and
  behind its seed at once. Drift is a fact about the repository, and sweep would write a deliberate
  deviation into its intent without asking.
- **A new `setup update` argument.** Rejected. The plain re-run is already the reconcile entrance for
  toolchain, `## Commands`, and deployment.
- **Declines recorded in `.superdev/info.json`, or not recorded at all.** Rejected. The file is
  per-operator and git-ignored, so a teammate sees the deviation as a gap again. Not recording raises the
  same deliberate deviation on every check, sweep, and re-run.

**Consequences.** The seed-gap report is agent judgment, so it can carry a false positive that the
operator dismisses by recording a deviation. A deviation bullet never takes a configuration-key shape
(`- **Backend:**`, `- **Body format:**`), because `scripts/publish-kb.js` matches those anywhere in
`knowledge-base.md`.
