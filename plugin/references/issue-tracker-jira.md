# Slice store: Jira

Slices live as Jira issues. One slice = one issue. Use the Jira REST API (or the `jira` CLI if the
user has it installed); the user records which below.

## Configuration (fill in at setup)

- **Base URL**: `<https://your-domain.atlassian.net>`
- **Project key**: `<PROJ>`
- **Auth**: API token in env var `<JIRA_API_TOKEN>`, user email in `<JIRA_EMAIL>`. Record the env-var
  NAMES here, never the secret values.
- **Issue type for a slice**: `<Story|Task>`
- **Feature label**: one label per feature/scope, `<type>/<slug>` (e.g. `fix/<slug>`), on the root and its
  slices. `<type>` is the **change type** — the Conventional Commits type of the work, per
  `references/scope-mode.md` — and the label doubles as the scope branch name.
- **`depends-on` link type**: `<is blocked by>` (Jira's "Blocks"/"is blocked by" link).
- **Ready status/label**: `<ready-for-agent>` — marks a slice an agent may pick up.
- **Triage label**: `<triage>` — the label a **triage record** carries (*Triage record* below), and the
  only label it carries. Default `triage`.
- **Release signal**: `<released>` — the label on the scope anchor that marks the feature agreed for
  execution (*Release* below).
- **Tooling**: `<rest>` or `<jira CLI>`.
- **Status map**: canonical lifecycle → Jira status + transition — fill in the table below at setup.

## REST conventions (curl)

Auth header: `-u "$JIRA_EMAIL:$JIRA_API_TOKEN"`, `-H "Content-Type: application/json"`.

- **Create a slice issue**:
  `POST <base>/rest/api/3/issue` with `{ "fields": { "project": {"key":"PROJ"}, "summary": "<title>",
  "issuetype": {"name":"Task"}, "description": <ADF body: specification + acceptance checklist>,
  "assignee": {"accountId":"<assignee>"} } }` — omit the `assignee` field entirely when the assignee
  resolves to `none`. Capture the returned `key` (e.g. `PROJ-123`) as this slice's external id.
- **Link a dependency** (`depends-on`):
  `POST <base>/rest/api/3/issueLink` with
  `{ "type": {"name":"Blocks"}, "inwardIssue":{"key":"<this slice>"}, "outwardIssue":{"key":"<blocker>"} }`
  so the slice is "blocked by" its blocker.
- **Record an anchor dependency**: append a `**Blocked by feature:** <blocker-key>` line to the **anchor
  issue's own** description (an ADF body edit) — never the "is blocked by" link above, kept distinct so the
  two relations never collide on one issue.
- **List feature slices**:
  `GET <base>/rest/api/3/search/jql?jql=project=PROJ AND labels="<feature-label>"
  &fields=summary,description,status,labels,issuetype,parent` — `/rest/api/3/search` is deprecated
  (Atlassian is removing it) and `/search/jql` is its documented replacement. **Name the fields.**
  `/search/jql` defaults `fields` to `id`, where the deprecated endpoint defaulted to `*navigable`, so a
  query that omits the parameter returns bare issue IDs with a `200` and nothing to read.
- **Read a slice**: `GET <base>/rest/api/3/issue/<key>?fields=summary,description,status,issuelinks`.
- **Update status**: transition via `POST <base>/rest/api/3/issue/<key>/transitions`
  (`todo` → `in-progress` → `in-review`/`done`). Look up transition ids with
  `GET .../transitions`.

## Field mapping (plan-contract → Jira)

- `id` ↔ Jira issue `key`. Record the slice-id ↔ `PROJ-<n>` mapping in the run ledger so `depends-on`
  resolves to real keys.
- `title` ↔ `summary`.
- `depends-on` ↔ "is blocked by" issue links.
- `spec` ↔ description body ("What to build").
- `acceptance` ↔ a checklist in the description (or sub-tasks).
- `test-applicability` ↔ a label (`behavior`/`mechanical`/`docs`).
- `status` ↔ Jira status.
- **Anchor dependency** (optional) ↔ a `**Blocked by feature:** <key>` line in the **anchor's own**
  description — the Epic on a multi-slice feature, the lone slice issue on a single-slice one. Not the
  "is blocked by" issue link above: that link type already carries slice-level `depends-on`, and reusing
  it for a feature-level relation would make the two indistinguishable on read (`plan-contract.md` →
  *Scope anchor*, ADR 0040).
- global DoD ↔ a parent Epic; slices are children of the Epic. **A single-slice feature has no Epic** —
  the lone slice issue's `acceptance` checklist is the DoD.

## Scope anchor

A feature's scope anchor is its root (`plan-contract.md` → *Scope anchor*): the issue with no parent. On a
multi-slice feature that is the Epic; on a single-slice feature it is the lone slice issue, which has no
Epic Link either (ADR 0017).

- **Recognise one.** A root has no parent: treat an absent `fields.parent` key and a `null` value alike.
  Jira models the Epic relation as parent and child, so a slice always carries one and a root never does.
- **List the candidates.** The feature labels themselves: `GET <base>/rest/api/3/label` (paginated
  `values` array of every label used in the instance), keeping the values whose first segment is a change
  type (`references/scope-mode.md` lists them). Per
  feature label: the **List feature slices** call above, whose `fields` already carry `parent`, `labels`
  and `issuetype` — the three this section's other elements read. JQL's `parent` field supports only `=`,
  `!=`, `IN` and `NOT IN`, not `IS`/`IS NOT`, so no query can filter on a missing parent server-side. The
  call returns every issue under the label, and the roots are the ones with no parent, kept client-side.
- **List the slices beneath it.** The same query already returned the whole feature: the slices are the
  rest of that response — every issue whose `fields.parent.key` equals this anchor's `key` (multi-slice),
  or none at all (single-slice — the anchor is the only issue returned).
- **Tell an anchor that is itself a slice.** It carries a `test-applicability` label — `behavior`,
  `mechanical`, or `docs` — and its issue type is the slice type rather than `Epic`. That is what
  separates a single-slice feature, whose lone slice is its own anchor and is real work, from an Epic
  created and never decomposed, which is not.
- **Read an anchor's dependencies.** The `**Blocked by feature:** <key>` description line the field
  mapping defines, read off the **anchor's own** description — never the "is blocked by" issue link
  **Link a dependency** above writes for a slice, which already carries slice-level `depends-on` and would
  be indistinguishable from it on read. Read the anchor's own `fields.description` with
  `GET <base>/rest/api/3/issue/<key>?fields=description`, or add `description` to the **List feature
  slices** `fields` list. It names another feature's scope anchor (`plan-contract.md` → *Scope anchor*,
  ADR 0040). No such line means no dependency. **Resolve `<key>` to that anchor's own record** with `GET
  <base>/rest/api/3/issue/<key>?fields=labels,status` — `fields.labels` is the blocker's own feature
  label, and `fields.status.name` matching the `<Done>` status the **Status workflow** table above names
  means closed — because a consumer holds the dependency against the blocker's own label and status, not
  the label of the record carrying this line. `/superdev:plan` writes one through the same **Record an
  anchor dependency** description edit above.
- **Ambiguous.** Two or more parentless issues under one feature label. `/superdev:plan` never writes that
  shape, and there is no single Definition of Done to build against, so a consumer reports it instead of
  choosing.

## Assignee

Operator configuration, not a slice field (`plan-contract.md` → *Assignee*; ADR 0010, ADR 0073). The
identifier is a Jira **`accountId`**, read from `.superdev/info.json` under `issue-tracker.assignee`, and
applied to the **Epic and every slice** in the create call, never a follow-up pass. The failure shape below
is the general *Assignee* recovery rule (`plan-contract.md`) made concrete for Jira.

```json
{
  "issue-tracker": { "assignee": "<accountId>" }
}
```

- Jira takes **exactly one** assignee, as `{"accountId": "<id>"}` — unlike the array Forgejo and GitHub
  accept. Two reserved values: `"-1"` assigns the project's default assignee, and `null` unassigns.
- **No file, no `issue-tracker` key, or no `assignee`** → resolve the token's own identity with
  `GET <base>/rest/api/3/myself` and use its `accountId`.
- **`"assignee": "none"`** → omit the `assignee` field entirely. No warning, no error.
- **Assignment is a separate permission.** *Assign Issues* is distinct from *Edit Issues*, so a token that
  can transition an issue may still be unable to assign it. Jira rejects the create outright rather than
  stripping the field: a `400` naming `assignee` (in `errors`, or in `errorMessages` — Jira uses both
  channels). Retry that one create with the `assignee`
  field omitted; report it once per run — the issue exists and nothing is retried more than that one
  time or rolled back.
- To assign an existing issue instead: `PUT <base>/rest/api/3/issue/<key>/assignee` with
  `{ "accountId": "<id>" }`.
- **A leftover `Assignee:` bullet** in this repo's `docs/agents/issue-tracker.md` is configuration nothing
  reads. Report it once per run, naming the file and the move to `.superdev/info.json`.

## Release

`plan-contract.md` → *Release*. The signal is the **release label** from *Configuration*, on the **scope
anchor** — the Epic, or a single-slice feature's lone issue. A **label**, not a status: the status workflow
below transitions the anchor to `in-progress` when the run starts, so a status could not survive the run,
and the ready status/label marks a slice rather than the feature.

- **Apply** (`/superdev:plan`, on a release): `PUT <base>/rest/api/3/issue/<key>` with
  `{ "update": { "labels": [{ "add": "<released>" }] } }` — an add, which leaves the feature label and the
  `test-applicability` label in place.
- **Read** (`/superdev:implement`, `/superdev:afk`): the anchor's `labels` field, which the JQL search that
  found the feature already returns.
- A feature whose anchor lacks the label is unreleased. No status and no other label means it.

## Triage record

`plan-contract.md` → *Triage record*. `/superdev:review` creates one the moment it defers a finding.
On this store it is an ordinary issue in the configured project carrying the **Triage label** from
*Configuration* and nothing else.

- **Create it:** `POST <base>/rest/api/3/issue` with
  `{ "fields": { "project": {"key":"<PROJ>"}, "summary": "<the finding, one line>",
  "issuetype": {"name":"<Story|Task>"}, "description": <ADF body: the finding, why no Definition of Done
  criterion covered it, the date, the feature label, the scope branch, the scope anchor's key, and a
  copy-pasteable /superdev:plan "<the finding>" line>,
  "labels": ["<triage>"] } }`. Omit the `assignee` field entirely: a triage record is created
  **unassigned**, whatever the operator configuration names, because nobody has picked the work up.
  Capture the
  returned `key` as the record's reference — `/superdev:review` puts it in the ledger bullet. No issue
  link and no parent: a triage record belongs to no feature.
- **List the records:**
  `GET <base>/rest/api/3/search/jql?jql=project=PROJ AND (labels="<triage>" OR summary~"\[triage\]") AND
  statusCategory!=Done&fields=summary,description,status,labels` — the same endpoint and the same
  **Name the fields** rule *List feature slices* above states, for the same reason. **The `summary` half
  is what makes the query correct, not a convenience.** The create bullet below falls back to prefixing
  `summary` with `[triage] ` when the project refuses the label, so a listing that queries `labels` alone
  reports an empty backlog on exactly the project configuration that fallback exists for. Deduplicate the
  two halves on the issue `key`: a record written before the project restricted its label field carries
  both.
- **The label needs no creation call.** Jira labels are free-form strings created by use, so the label
  arrives with the issue. **A project configured with a restricted label field rejects the create
  instead** (`400`, the field is not on the create screen): retry once with `labels` omitted, prefixing
  `summary` with `[triage] ` so the record stays findable by text search where the label was refused —
  a project-configuration fix, not a superdev one — and report it.
- **No feature label and no ready status or label.** Those are what `/superdev:afk`'s candidate listing and
  `/superdev:implement`'s slice loading select on, so a triage record carrying either would be picked up as
  work to build. It is a record of unplanned work, not a slice, so it also takes no status transition from
  the status map below.
- **No pull-request URL.** `/superdev:review` runs before `/superdev:ship` opens one, so none exists at
  defer time and the description names none.

## Untriaged item

`CONTEXT.md`'s **Untriaged item** glossary entry: an open issue in the project this instance's own
tooling never wrote — it carries no `<type>/<slug>` label, no `<triage>` label, and no `[triage] `
summary prefix, the same two-halved triage signal *Triage record*'s **List the records** bullet above
names — a label-only check misses exactly the restricted-label-field project that bullet's warning
covers, and would misreport one of that project's own triage records as untriaged.

- **Recognise one.** An open issue whose `fields.labels` carries no label matching `<type>/<slug>` and no
  `<triage>` label, and whose `fields.summary` carries no `[triage] ` prefix.
- **List them.** `GET <base>/rest/api/3/search/jql?jql=project=PROJ AND statusCategory!=Done
  ORDER BY created ASC&fields=summary,labels,created` (paginated, per the
  **Name the fields** rule *List feature slices* above states), keeping only the issues whose
  `fields.labels` and `fields.summary` match the rule above — the summary-prefix half of that match
  happens client-side, where a `[triage] ` prefix check can be made correctly; Jira's `~`/`!~` operator
  is a word match, not a prefix match, and would exclude any issue whose summary merely contains the
  bare word "triage". Jira mixes no pull request into an issue
  search, so no result needs excluding on that account. `ORDER BY created ASC` pages the open-issue set
  oldest first, the order `/superdev:backlog`'s cap wants, so the survey enumerates the full open set
  and then takes the oldest 5 that pass the client-side filter.
- **Read its age.** The issue's `fields.created` timestamp.

## Run state (fill in at setup)

`plan-contract.md` → *Run state*. A Jira issue's `description` field is Atlassian Document Format (ADF) —
a JSON node tree — by default, and `kb-patch.js` performs a **markdown-only** deterministic merge whose
payload boundary is an HTML comment (`<!-- superdev:run-state -->`), which has no ADF node: neither the
section heading nor the markers survive a round trip through the API, so `adopt` would refuse forever on
every anchor this backend ever wrote. This store therefore carries **no snapshot** by default, the same
posture the local-file store takes when its anchor cannot safely carry a mirrored write.

A run on a default Jira instance publishes nothing, adopts nothing, and ticks only `<run-root>/dod.md` —
never the anchor's own Definition of Done checklist.

**Unless your Jira instance stores the description as markdown or wiki markup** — a Jira Server/Data
Center instance configured for wiki markup, or a Jira Cloud app that exposes a plain-text body — the
mechanism is the same as Forgejo's and GitHub's. At setup, confirm which of the two your instance is and
strike the other, so `docs/agents/issue-tracker.md` states one posture, not both — `references/run-init.md`
reads this section for a single yes-or-no answer to "does this store carry a snapshot":

- **Write** (after any ledger write the snapshot would show): `PUT <base>/rest/api/3/issue/<key>` with
  `{ "fields": { "description": <anchor description, folded per ## Publishing run state> } }` — the same
  call and body shape the Epic amendment under *Append mode* below already uses. **Best-effort:** a failed
  write is reported once per run and the run continues; the ledger stays authoritative.
- **Read** (every publish, including run init and adopting a run): `GET <base>/rest/api/3/issue/<key>?fields=description` — the same
  field the **Read an anchor's dependencies** call above already reads — and take the description back
  out of the response.
- **Ticking the anchor's own Definition of Done checklist** (`/superdev:ship`, toggling a description
  `- [ ]` to `- [x]`) is a second sanctioned description edit, beside the Epic amendment under
  *Append mode*.
- **The section is machine-owned.** A deeper subsection an operator adds under `## Run state` — a
  `### Operator notes` heading, say — is replaced along with the rest on the next publish. Keep an
  operator note outside the section.

## Status workflow (fill in at setup)

`/implement` transitions each issue at every lifecycle point (see the plan-contract's *Slice lifecycle &
status*). Record the mapping and the transition to reach each status:

| Canonical | Jira status | Transition name/id |
|---|---|---|
| `in-progress` | `<In Progress>` | `<id>` |
| `in-review` | `<In Review / Testing>` | `<id>` |
| `blocked` | `<Blocked>` (or nearest) | `<id>` |
| `merged` (done) | `<Done>` | `<id>` |

- **Perform a transition**: `POST <base>/rest/api/3/issue/<key>/transitions` with
  `{ "transition": {"id":"<id>"} }`. Discover ids per issue with `GET <base>/rest/api/3/issue/<key>/transitions`.
- The **Epic** moves to *In Progress* when the run starts and to *Done* once every child slice is Done.
  **No Epic** (single-slice feature) — the lone slice issue is the scope anchor: it moves to
  *In Progress* at the start and to *Done* at the end, per its own transitions above.
- If Jira lacks a status (no separate *In Review* or *Blocked*), map it to the nearest one and note the
  collapse here.

## Append mode

`/superdev:plan` can extend a feature that already has issues (`plan-contract.md` → *Append mode*,
ADR 0004).

- **Create only new records; never edit, close, or delete a merged slice.** Append fires new
  `POST <base>/rest/api/3/issue` calls for the new slices alone. It never transitions or edits an issue
  a prior run already merged (no `fields` PUT, no transition to a closed status, no relabel) — except the
  anchor-dependency description line, which migrates to the new Epic issue when append promotes a
  single-slice feature (below) — a merged issue's `key` is a satisfied `depends-on` "is blocked by"
  target for a newly created one, nothing more.
- **Create the Epic first when none exists.** A feature whose lone issue has no `fields.parent` has no
  Epic yet (the single-slice shape, `## Scope anchor` above). Append creates the Epic issue first — its
  description holding the lone slice's `acceptance` checklist as the global DoD — then sets every new
  slice issue's parent to it. The lone existing issue itself is never edited: no DoD copies onto its own
  description, and its `fields.parent` stays unset. **One exception:** when the lone issue carries an
  anchor dependency (a `**Blocked by feature:** <key>` description line), it **migrates to the new Epic
  issue's own description** and is removed from the lone issue — the Epic is the anchor now. Nothing else
  about the lone issue changes.
- **Amend the Epic's own description — the one sanctioned edit.** `PUT <base>/rest/api/3/issue/<epic key>`
  with `{ "fields": { "description": <amended ADF body> } }` folds the interview's new criteria into the
  Epic's Definition of Done in place, and, the same call, deletes a resolved parked question's line from
  the description's Parked questions block. Both are edits to the Epic issue's own description, never to a
  merged slice's issue — the never-edit rule above still holds for every slice.

The `key` is assigned by Jira at creation, already unique and stable, so append names no continuation
rule for `id`.

## When a skill says "write slices to the store"

**≥2 slices** — create the Epic first (global DoD), then one Jira issue per slice, link dependencies,
apply the ready label. When the interview named a prerequisite feature, also write the anchor dependency —
a `**Blocked by feature:** <key>` line — on the Epic issue's own description. **Exactly one slice** — skip
the Epic; create only the slice issue, folding the global DoD into its `acceptance` checklist, and skip the
dependency-link step entirely (a lone slice has no blocker). When the interview named a prerequisite
feature, still write the anchor dependency on that same lone slice issue: the anchor dependency is never
skipped, because the lone slice is the anchor.

## When a skill says "load slices from the store"

JQL-search the feature's issues, read each, and reconstruct slice fields from the mapping above. No Epic
among the results (single-slice feature) → the global DoD is the lone slice issue's own `acceptance`.
