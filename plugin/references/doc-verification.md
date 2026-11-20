# Doc-verification discipline

**A claim is a guess until checked.** Applies to every claim about how a third-party library, API, product, or service
behaves. Treat it as an unverified assumption until its own documentation confirms it. Surface a remembered behaviour,
and never build on it silently.

## When it applies

**A load-bearing claim.** Applies to a claim a plan, slice, ADR, or line of code depends on being right. It needs
verification: an unfamiliar or less-common API, a version-sensitive behaviour, an auth or security semantic, a rate
limit or quota, a service's request or response shape, a product's actual workflow or constraint.

**Well-known behaviour.** Applies to well-known, stable behaviour: stdlib basics, language semantics. It needs no
check. Reserve the check for claims that could plausibly be wrong or outdated.

## How to verify

**The source.** Applies to every check. Fetch the thing's **official** documentation (vendor site, README, official
API reference, changelog) through `WebFetch` or `WebSearch`. Follow every claim back to the source that owns it:
official docs, source code, specs, first-party APIs. A blog post, a forum answer, or a Stack Overflow thread is never
the primary source.

**The citation.** Applies to every verified claim. State what you verified and where: a doc URL cited inline, in the
interview response, the plan or slice text, or, for the implementer, the progress-log line for that increment. An
unverified assumption is always flagged as unverified.

**The outcome.** Applies to every fetch.

- **Docs confirm the assumption** → proceed, citation noted.
- **Docs contradict the assumption** → surface it immediately, as a cross-exam contradiction: "the docs say X, the
  plan assumes Y — which holds?"
- **Docs unreachable** (offline, no such docs exist) → say so explicitly, and flag the claim as unverified.

**Mid-interview.** Applies to a load-bearing claim during an interview. Dispatch the fetch to a background sub-agent
and keep going. Only the decisions downstream of the claim wait for its report (`cross-exam.md`'s **Find facts
concurrently**).

**A claim several slices share.** Applies when several slices depend on one verified claim. Write the findings to a
short cited markdown note where the repository keeps such notes.

**Redact.** Applies to every fetched artifact you quote. Write `<REDACTED>` over auth headers and tokens, and quote
only the lines that carry the signal.
