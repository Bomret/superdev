# Slice store plan writes: Jira

The calls `/superdev:plan` makes on Jira and no other command makes: creating a plan's issues, writing the
anchor lines, and extending a feature. `/superdev:setup` writes this seed to
`docs/agents/issue-tracker-plan.md`, filled in with the values of `docs/agents/issue-tracker.md`, whose
rules and calls (**Transport**, **A label-refused create**, **Edit an issue's body**, **ADF lines**,
**Link direction**, the *Repository component* rules) this document uses.

## Plan-only fields

- **Parked questions** (optional) ↔ a `Parked questions` ADF `heading` plus its body in the Epic's
  description. **Non-goals** (optional) ↔ a `Non-goals` `heading` plus its body. **Epic visuals**
  (optional) ↔ a `Slice graph` `heading` plus a `codeBlock` holding the graph, and a `Touch map`
  `heading` plus its body. All are Epic-only and advisory: `/implement` never reads them, and a
  single-slice feature's lone issue has no equivalent. `plan-authoring.md` owns their shape and when each
  is written.

## Creating issues

Every create sends its payload file through the **Transport** rule.

- **Create a slice issue** (the type is one the *Slice* role allows, by id):
  `POST <base>/rest/api/3/issue` with `{ "fields": { "project": {"key":"<PROJ>"}, "summary": "<title>",
  "issuetype": {"id":"<slice type id>"}, "description": <ADF body: specification + acceptance checklist>,
  "labels": ["<feature-label>", "<test-applicability>", "<ready>"], "parent": {"key":"<epic>"},
  "assignee": {"accountId":"<assignee>"}, "components": [{"name":"<component>"}] } }`. `<test-applicability>`
  is `behavior`, `mechanical`, or `docs`; `<ready>` is the *Ready status/label*. Omit `parent` on a
  single-slice feature (the lone slice is the anchor), the `assignee` field when the assignee resolves to
  `none`, and the `components` field when no *Repository component* is configured. Capture the returned
  `key` (e.g. `<PROJ>-123`) as this slice's external id.
- **Create the Epic** (the scope anchor, an issue of the *Scope anchor* role's type, by id): the same
  `POST` with `"summary": "<feature title>"`, `"issuetype": {"id":"<anchor type id>"}`,
  `"description": <ADF body: the global DoD checklist and the plan-only sections>`,
  `"labels": ["<feature-label>"]`, and the `assignee` and `components` fields as the slice create carries
  them. It carries no ready label, no `test-applicability` label, and no `parent`.
- **A label-refused create** is retried once without `labels`, as `docs/agents/issue-tracker.md` states.
- **Link a dependency** (`depends-on`):
  `POST <base>/rest/api/3/issueLink` with
  `{ "type": {"name":"<link type name>"}, "inwardIssue":{"key":"<blocker>"}, "outwardIssue":{"key":"<this slice>"} }`
  so the blocker blocks the slice (**Link direction**). Read the link back once after writing it.

## Anchor lines

Each is an ADF line (**ADF lines**) appended to the **anchor issue's own** description through **Edit an
issue's body**, never an issue link.

- **Record an anchor dependency:** append `**Blocked by feature:** <blocker-anchor-key>`.
- **Record the deploy line:** append `**Deploy:** <target>[, <target>]` (in the operator's answer order)
  or `**Deploy:** none`, revising the line in place on an append that re-answers the deploy question.
- **Record the Repairs line:** append `**Repairs:** <original-anchor-key>` when `/superdev:plan` creates a
  repair, and never edit it afterwards. Nothing is written to the original anchor.
- **Record the Absorbs line:** append `**Absorbs:** <key>[, <key>]` (every absorbed record's key),
  revising the line in place on an append that absorbs more.
- **Record the Intent line:** append `**Intent:** <key>[, <key>]` (every seeding intent record's key),
  revising the line in place on an append seeded from another one.

## Assignee

Operator configuration, not a slice field (`assignee.md` → *Assignee*). The identifier is a Jira
**`accountId`**, read from `.superdev/info.json` under `issue-tracker.assignee`, and applied to the
**anchor and every slice** in the create call, never a follow-up pass.

```json
{
  "issue-tracker": { "assignee": "<accountId>" }
}
```

- Jira takes **exactly one** assignee, as `{"accountId": "<id>"}`. Two reserved values: `"-1"` assigns the
  project's default assignee, and `null` unassigns.
- **No file, no `issue-tracker` key, or no `assignee`** → resolve the token's own identity with
  `GET <base>/rest/api/3/myself` and use its `accountId`.
- **`"assignee": "none"`** → omit the `assignee` field entirely. No warning, no error.
- **Assignment is a separate permission** (*Assign Issues*, distinct from *Edit Issues*). Jira rejects
  the create outright: a `400` naming `assignee` in `errors` or in `errorMessages`. Retry that one create
  with the `assignee` field omitted and every other field, `components` included, kept; report it once
  per run. Nothing is retried more than that one time or rolled back.
- To assign an existing issue instead: `PUT <base>/rest/api/3/issue/<key>/assignee` with
  `{ "accountId": "<id>" }`.

## Definition of Done tags

`/superdev:plan` §6 writes each criterion's tag in `plan-contract.md`'s own notation (a slice `id`,
`scope`, or `docs`) when it creates the Epic. Once every slice issue exists, the controller rewrites each
slice-id tag into its `key`, in the same parallel step as **Link a dependency**, each rewrite a
description edit through **Edit an issue's body** whose producer is
`node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js dod-tags --map-file <path>`, the map file holding one
`<id> <PROJ>-<n>` pair per slice. A tag naming several slices becomes `<PROJ>-<n>, <PROJ>-<m>`, never
bracketed. A `scope` tag stays `scope`, and a `docs` tag `docs`. The controller types no store tag itself.
On an ADF description the verb runs per checklist paragraph, as `dod-line` does in
`docs/agents/issue-tracker.md`'s *Definition of Done ticks*: each `paragraph` whose joined text begins
`[ ]` or `[x]` goes through `dod-tags --line --map-file <path>` on its own file, and the output replaces
that paragraph's content through the same `nodes` filter, so every node stays a `text` node with its
`code` marks and the description stays valid ADF. Any one refusal (an unjudged line whose tag `dod-line`
cannot read, or a slice id the map lacks) prints nothing and stops the whole edit at the gate, so the
description stays as it was. On a markdown or wiki-markup description the verb runs once in its default
body mode.

## Append mode

`/superdev:plan` can extend a feature that already has issues (`plan-authoring.md` → *Append mode*).

- **Create only new records; never edit, close, or delete a merged slice.** Append fires new
  `POST <base>/rest/api/3/issue` calls for the new slices alone. It never transitions or edits an issue
  a prior run merged (no `fields` PUT, no transition to a closed status, no relabel). A merged issue's
  `key` is a satisfied `depends-on` "is blocked by" target for a new one.
- **Create the Epic first when none exists.** A feature whose lone issue has no `fields.parent` has no
  Epic yet. Append creates the Epic first through **Create the Epic**, with the *Scope anchor* role's type
  picked by its "use for" lines, else its default, named by id, and the *Repository component* where one
  is configured, its description holding the lone slice's `acceptance` checklist as the global DoD. Then
  it sets every new slice issue's parent to it. The lone issue is never edited, with one exception: each
  anchor line it carries (`**Blocked by feature:**`, `**Deploy:**`, `**Repairs:**`, `**Absorbs:**`,
  `**Intent:**`) **migrates to the new Epic's own description** and is removed from the lone issue, since
  the Epic is the anchor now.
- **Amend the Epic's own description, the one sanctioned edit.** One edit through **Edit an issue's
  body** folds the interview's new criteria into the Epic's Definition of Done in place, and deletes a
  resolved parked question's line from the description's Parked questions block.

The `key` is assigned by Jira, unique and stable, so append names no continuation rule for `id`.

## When a skill says "write slices to the store"

**≥2 slices**: create the Epic first (global DoD), then one issue per slice, then link the dependencies.
**Exactly one slice**: skip the Epic, create only the slice issue with the global DoD folded into its
`acceptance` checklist, and skip the dependency links. Either way, when the interview named a prerequisite
feature, write the anchor dependency on the anchor: the Epic, or the lone slice issue.
