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
- **Assignee**: `<accountId>` — the account every issue a run creates is assigned to (see *Assignee*
  below). `none` creates issues unassigned; omit the line entirely to fall back to whoever the API token
  belongs to.
- **Tooling**: `<rest>` or `<jira CLI>`.
- **Status map**: canonical lifecycle → Jira status + transition — fill in the table below at setup.

## REST conventions (curl)

Auth header: `-u "$JIRA_EMAIL:$JIRA_API_TOKEN"`, `-H "Content-Type: application/json"`.

- **Create a slice issue**:
  `POST <base>/rest/api/3/issue` with `{ "fields": { "project": {"key":"PROJ"}, "summary": "<title>",
  "issuetype": {"name":"Task"}, "description": <ADF body: specification + acceptance checklist>,
  "assignee": {"accountId":"<assignee>"} } }` — omit the `assignee` field entirely when
  `Assignee: none`. Capture the returned `key` (e.g. `PROJ-123`) as this slice's external id.
- **Link a dependency** (`depends-on`):
  `POST <base>/rest/api/3/issueLink` with
  `{ "type": {"name":"Blocks"}, "inwardIssue":{"key":"<this slice>"}, "outwardIssue":{"key":"<blocker>"} }`
  so the slice is "blocked by" its blocker.
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
- **Ambiguous.** Two or more parentless issues under one feature label. `/superdev:plan` never writes that
  shape, and there is no single Definition of Done to build against, so a consumer reports it instead of
  choosing.

## Assignee

Store configuration, not a slice field (`plan-contract.md` → *Assignee*). The **Assignee** value above is
applied to the **Epic and every slice** in the create call, never a follow-up pass. The failure shape
below is the general *Assignee* recovery rule (`plan-contract.md`) made concrete for Jira.

- Jira takes **exactly one** assignee, as `{"accountId": "<id>"}` — unlike the array Forgejo and GitHub
  accept. Two reserved values: `"-1"` assigns the project's default assignee, and `null` unassigns.
- **No `Assignee` line** in the configuration above → resolve the token's own identity with
  `GET <base>/rest/api/3/myself` and use its `accountId`.
- **`Assignee: none`** → omit the `assignee` field entirely. No warning, no error.
- **Assignment is a separate permission.** *Assign Issues* is distinct from *Edit Issues*, so a token that
  can transition an issue may still be unable to assign it. Jira rejects the create outright rather than
  stripping the field: a `400` naming `assignee` (in `errors`, or in `errorMessages` — Jira uses both
  channels). Retry that one create with the `assignee`
  field omitted; report it once per run — the issue exists and nothing is retried more than that one
  time or rolled back.
- To assign an existing issue instead: `PUT <base>/rest/api/3/issue/<key>/assignee` with
  `{ "accountId": "<id>" }`.

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

## When a skill says "write slices to the store"

**≥2 slices** — create the Epic first (global DoD), then one Jira issue per slice, link dependencies,
apply the ready label. **Exactly one slice** — skip the Epic; create only the slice issue, folding the
global DoD into its `acceptance` checklist.

## When a skill says "load slices from the store"

JQL-search the feature's issues, read each, and reconstruct slice fields from the mapping above. No Epic
among the results (single-slice feature) → the global DoD is the lone slice issue's own `acceptance`.
