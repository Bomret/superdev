# 0130: A backend command runs under a time bound, and a timeout stops the batch

**Status:** Accepted

**Context.** ADR 0069 made the knowledge-base backend five shell command templates that
`plugin/scripts/publish-kb.js` runs under `/bin/sh -c`. It bounded none of them. The `find` contract
enumerates three ways a call fails to answer — a transport error, a rejected credential, output that is
not a JSON object — and every one of them fails fast. A host that accepts the connection and then answers
nothing is a fourth mode, and it blocks `spawnSync` for as long as the kernel's own TCP timeout runs:
minutes, per page, with no output. `plugin/scripts/scope.js` had already ruled that unacceptable for its
own `git fetch` and bounded it; the backend half never got the same treatment. `/superdev:setup`'s `find`
probe runs the same unbounded call against the same host.

**Decision.** Every backend command runs under a **30-second bound**, applied at the spawn in
`publish-kb.js` rather than in the templates, so it covers an operator-written template that will never
grow a `curl --max-time` of its own. `/superdev:setup`'s probe step runs under the same bound.
`SUPERDEV_PUBLISH_KB_TIMEOUT_MS` overrides it — deliberately outside the `SUPERDEV_KB_` prefix, which
`fieldsToEnv` forwards from a `find` result and which a backend returning a `timeout_ms` key would
otherwise rewrite.

**A timeout stops the batch.** A host that black-holes one call black-holes the next, so carrying on
per page would spend the bound once per staged page and reproduce the hang this decision removes. The
timed-out page reports its own reason, the untried pages are named, and every one of them stays staged.
Only a timeout stops the batch: a `maxBuffer` overflow or a shell that will not start keeps the existing
per-page behaviour, since neither says anything about the host.

**Consequences.** A publish against a dead host now ends in roughly one bound instead of one per page.
The stop is a deliberate exception to "one page's failure never stops the rest", which every other
failure still follows. A write killed mid-flight leaves the page in a state this run cannot observe, and
that is safe to retry rather than something to reconcile: the next run's `find` turns a landed-but-killed
`create` into an `update`, a landed `delete` into `already-absent`, and a `patch` re-merges by heading.
An operator whose wiki is legitimately slower than the bound raises it through the environment variable
rather than through a config surface `/superdev:setup` would have to write and probe.

**Considered options.** Bounding the shipped templates with `curl --max-time` instead: rejected because
it leaves exactly the case ADR 0069 opened — an operator-written template — unbounded. Per-verb bounds:
rejected as four numbers to justify where the failure being fixed is indifferent to which verb hit it.
An operator-configurable bound in `docs/agents/knowledge-base.md`: rejected as a new config surface for
a value that has no reason to vary between repositories.

**Note (2026-09-25, ADR 0094).** A retried create is recognised by a `created-by-publish` marker,
written into the staged file before the create call, rather than by comparing content. A retried create
that landed as staged, and carries no recorded `live-hash`, publishes as an update with no further check.
A page whose live body differs from the staged body is refused rather than updated, marker or not, where
the staged file also carries a `live-hash`.
