# Slice store: Jira

Slices live as Jira issues. One slice = one issue. Use the Jira REST API (or the `jira` CLI if the
user has it installed); the user records which below.

## Configuration (fill in at setup)

- **Base URL**: `<https://your-domain.atlassian.net>`
- **Project key**: `<PROJ>`
- **Auth**: API token in env var `<JIRA_API_TOKEN>`, user email in `<JIRA_EMAIL>`. Record the env-var
  NAMES here, never the secret values.
- **Issue type for a slice**: `<Story|Task>`
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
  `GET <base>/rest/api/3/search?jql=project=PROJ AND labels="<feature-label>"`.
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
