# Doc-verification discipline

Any claim about how a third-party library, API, product, or service behaves is a **guess** until it's
checked against that thing's own documentation. Training data goes stale and APIs drift between versions —
treat a remembered behavior the same way you'd treat an unverified assumption from the user: surface it,
don't build on it silently.

## When it applies

A claim is **load-bearing** — and needs verification — when a plan, slice, ADR, or line of code depends on
it being right: an unfamiliar or less-common API, a version-sensitive behavior, an auth/security semantic, a
rate limit or quota, a service's request/response shape, a product's actual workflow or constraint.

It does **not** apply to well-known, stable behavior (stdlib basics, language semantics) — verifying that
`Array.prototype.map` exists would be ceremony, not rigor. Reserve the check for claims that could plausibly
be wrong or outdated.

## How to verify

Fetch the thing's **official** documentation (vendor site, README, official API reference, changelog) via
`WebFetch`/`WebSearch` — not a blog post, forum answer, or Stack Overflow thread as the primary source.
State what you verified and where: a doc URL cited inline (in the interview response, the plan/slice text,
or — for the implementer — the progress-log line for that increment). An unverified assumption presented as
fact is worse than one flagged as unverified.

- **Docs confirm the assumption** → proceed, citation noted.
- **Docs contradict the assumption** → surface it immediately, the same way a cross-exam contradiction gets
  surfaced: "the docs say X, the plan assumes Y — which holds?"
- **Docs unreachable** (offline, no such docs exist) → say so explicitly and flag the claim as unverified
  rather than presenting it with false confidence.
