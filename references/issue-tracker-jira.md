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
- **Tooling**: `<rest>` or `<jira CLI>`.

## REST conventions (curl)

Auth header: `-u "$JIRA_EMAIL:$JIRA_API_TOKEN"`, `-H "Content-Type: application/json"`.

- **Create a slice issue**:
  `POST <base>/rest/api/3/issue` with `{ "fields": { "project": {"key":"PROJ"}, "summary": "<title>",
  "issuetype": {"name":"Task"}, "description": <ADF body: spec + acceptance checklist> } }`.
  Capture the returned `key` (e.g. `PROJ-123`) as this slice's external id.
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

- `id` ↔ Jira issue `key`. Record the `S<n>` ↔ `PROJ-<n>` mapping in the run ledger so `depends-on`
  resolves to real keys.
- `title` ↔ `summary`.
- `depends-on` ↔ "is blocked by" issue links.
- `spec` ↔ description body ("What to build").
- `acceptance` ↔ a checklist in the description (or sub-tasks).
- `test-applicability` ↔ a label (`behavior`/`mechanical`/`docs`).
- `status` ↔ Jira status.
- global DoD ↔ a parent Epic; slices are children of the Epic.

## When a skill says "write slices to the store"

Create one Jira issue per slice (Epic first if used), link dependencies, apply the ready label.

## When a skill says "load slices from the store"

JQL-search the feature's issues, read each, and reconstruct slice fields from the mapping above.
