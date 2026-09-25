# 0094: The doc pass reads the knowledge base and never writes to it

**Status:** Accepted

This record amends the documentation-pass half of ADR 0023.

**Context.** ADR 0023 keeps `/superdev:document` from calling a remote knowledge-base backend, so the
doc pass stages pages under `.superdev/kb-pending/<scope>/` and `/superdev:publish-kb` sends them. The
rule has two reasons. A write claims a feature exists before a human decides it has reached its readers,
and the doc pass needs no credential. The rule forbids every call, including a read.

An `upsert` replaces a whole non-aggregate page. A doc pass that cannot read the live page either
rewrites it blind or leaves it stale. On `feat/dod-ticked-while-working` five stale pages were found only
by reading every page.

**Decision.** The doc pass may read a remote knowledge base and never writes to it. It reads through the
`find` and `read` verbs of the backend command contract that `/superdev:publish-kb` already resolves
(ADR 0069), under the same time bound as every backend call (ADR 0076). A read publishes nothing, so the
first reason of ADR 0023 does not apply to it.

Two guards keep the read from turning into a new failure:

- **No read, no upsert.** When the doc pass cannot read an existing non-aggregate page, it stages no
  `upsert` for that page. The causes are no credential, no `read` verb in the configured backend, or no
  reach. The pass records a `**Degraded:**` entry that names the page as not reconciled. An environment
  with no credential still works, and it reports the gap instead of hiding it.
- **Stale read, no upsert.** A staged `upsert` records the sha256 of the live body `read` returned,
  normalised for line endings and the trailing newline, so two reads of an unchanged page agree.
  `/superdev:publish-kb` refuses to upsert over a page whose live body no longer matches that hash, and
  reports the refusal per page. A staged `upsert` with no recorded hash creates a page that does not
  exist yet, and is refused when the page exists: a writer that misjudged an existing page as new would
  otherwise replace it blind. The one exception is the writer's own retry: before publish-kb sends a
  hashless create, it writes a `created-by-publish` marker into the staged file, and a later run whose
  `find` locates that same page sends an `update` instead of refusing it (ADR 0076).

`/superdev:plan` still reaches no backend, read or write: at plan time nothing is built, so there is
nothing to reconcile.

**Considered options.**

- *`patch` for every page kind (extending ADR 0027).* A section patch is still written blind, because
  the writer never sees the section's live text.
- *publish-kb merges an upsert against the live body at publish time.* The merge cannot find the stale
  pages. Only a reader of every page finds those.
- *Keep the rule and leave pages stale.* The gap stays silent, which is the failure this record removes.
- *Compare the staged body's hash to the live body to recognise a retried create.* A backend that
  rewrites the body it stores (added metadata, reformatted markup) never matches, and a backend with no
  `read` verb (Confluence) can never answer the check at all. Either shape would refuse a retry forever.

**Consequences.** The doc pass may use a knowledge-base credential when one is present, and it degrades
honestly when one is absent. The hash couples a staged page to the live body it saw, so a page edited
by hand after the doc pass stays unchanged until a new doc pass reads it again. A page staged before
this record carries no hash, so it is refused where its page already exists, and is re-staged by a new
doc pass or published with a release that predates this record. A recorded hash always wins over the
marker: the marker substitutes for a hash only where none was recorded, and is never checked where one
was. The accepted ceiling is the title collision the marker's own retry recognition cannot rule out: the
title is the backend's only identity key, so a page someone else creates independently, under the same
title, inside the retry window, is read as this publish's own create landing.
