# Slice store: GitHub Issues

Slices live as GitHub issues — one slice = one issue. Use the GitHub REST API (or the `gh` CLI; see
*Tooling* below).

## Configuration (fill in at setup)

- **Owner / repo:** `<owner>` / `<repo>`.
- **Auth:** API token in env var `<GH_TOKEN>` (record the name, never the value). Headers:
  `Authorization: Bearer $<GH_TOKEN>`, `Accept: application/vnd.github+json`,
  `X-GitHub-Api-Version: 2022-11-28`. Base URL `https://api.github.com` (a GitHub Enterprise Server host
  uses `https://<host>/api/v3`).
- **Feature label:** one label per feature/scope, `<type>/<slug>` (e.g. `fix/<slug>`), applied to the epic
  + its slices, so the feature's issues are listable. `<type>` is the **change type** — the Conventional
  Commits type of the work, per `references/scope-mode.md` — and the label doubles as the scope branch
  name.
- **Assignee**: `<login>` — the GitHub login every issue a run creates is assigned to (see *Assignee*
  below). Set to `none` to create issues unassigned; remove the line entirely to fall back to whoever the
  token belongs to.
- **Tooling**: `<rest>` or `<gh CLI>` (see *Tooling* below).
- **Labels must exist first.** Create the feature label and the status labels (`ready`, `in-progress`,
  `in-review`, `blocked`, plus the `behavior`/`mechanical`/`docs` set) once with
  `POST /repos/<owner>/<repo>/labels` before the first `/plan` run. GitHub's docs don't specify how an
  unknown label name is handled on create, so creating them explicitly keeps the outcome from depending on
  it. Labels are addressed **by name** here, unlike Forgejo's ids, so nothing forces the lookup that would
  otherwise catch a missing one.

## Field mapping (plan-contract → GitHub)

- `id` ↔ the issue **`number`** (`#<n>`). Record the slice-id ↔ `#<n>` mapping in the run ledger.
- `title` ↔ issue title.
- `spec` ↔ issue body ("What to build").
- `acceptance` ↔ a `- [ ]` checklist in the body.
- `test-applicability` ↔ a label: `behavior` | `mechanical` | `docs`.
- `depends-on` ↔ a native **`blocked_by` dependency**, one per blocker
  (`POST .../issues/<number>/dependencies/blocked_by`). Sub-issues model *parent/child*, which is the
  epic relation — a different relation from blocking, and both are used (ADR 0011).
- global DoD ↔ an **epic** issue (label `epic`) whose body holds the DoD checklist; slices carry the
  feature label, reference the epic (`#<epic>`), and are linked to it as **sub-issues**. A single-slice
  feature has **no epic** — the lone slice's `acceptance` checklist is the DoD, and there is no
  sub-issue parent.
- **Parked questions**, **Non-goals**, and **Epic visuals** (all optional) ↔ `## Parked questions`,
  `## Non-goals`, and `## Slice graph`/`## Touch map` sections in the epic issue body — same body-text
  pattern as `acceptance`, epic-only and advisory (`/implement` never reads them; no equivalent on a
  single-slice feature's lone issue). GitHub renders mermaid in issue bodies, so the slice graph draws
  itself in the epic issue; `plan-contract.md` owns their shape and when each is written.
- `status` ↔ open/closed + a status label (see the status map below).

## Scope anchor

A feature's scope anchor is its root (`plan-contract.md` → *Scope anchor*): the feature-labelled issue with
no sub-issue parent. On a multi-slice feature that is the `epic` issue; on a single-slice feature it is the
lone slice, which is nobody's sub-issue either (ADR 0017).

- **Recognise one.** `GET /repos/<owner>/<repo>/issues/<number>/parent` returns `200` with the parent for
  a slice, and `404` when the issue has none. A `404` marks a root.
- **List the candidates.** The feature labels themselves: `GET /repos/<owner>/<repo>/labels` (paginated),
  keeping the names whose first segment is a change type — the **Feature label** shape above. Per feature label:
  `GET /repos/<owner>/<repo>/issues?labels=<type>%2F<feature>&state=open` (URL-encode the label's `/`),
  keeping the issues whose `/parent` is `404`. That endpoint carries the two behaviours **List feature
  slices** below states — it returns pull requests, and it paginates at 30 — and both apply here: a
  feature-labelled pull request is nobody's sub-issue, so an unskipped one presents as a second root and
  triggers the **Ambiguous** report below on a plan that is perfectly well formed. **Cost:** one `/parent`
  call per issue in that response, every sweep iteration — accepted as the simplest correct check; nothing
  caches it.
- **List the slices beneath it.** Use the **List feature slices** call below (`state=all`), not the
  candidate listing: a merged slice is closed, and closing the epic is best-effort, so an anchor left open
  with every slice closed still has slices beneath it and a `state=open` listing would present it as never
  decomposed. The slices are every issue in that response whose `/parent` resolves to this anchor's
  `number` (multi-slice), or none at all (single-slice — the anchor is the only issue under the label).
- **Tell an anchor that is itself a slice.** It carries a `test-applicability` label — `behavior`,
  `mechanical`, or `docs`. An epic never does. That is what separates a single-slice feature, whose lone
  slice is its own anchor and is real work, from an epic created and never decomposed, which is not.
- **Ambiguous.** Two or more roots under one feature label. `/superdev:plan` never writes that shape, and
  there is no single Definition of Done to build against, so a consumer reports it instead of choosing.

## Two identifiers per issue — `number` vs `id`

A GitHub issue carries **both**, and they are not interchangeable:

- **`number`** — the repo-scoped `#<n>` a human sees. This is the slice's `id`, and what `#<epic>`
  references.
- **`id`** — the global database id. **Only** `sub_issue_id` and `issue_id` take this one.

Capture both from the create response. Both relation calls mix them, which is where this goes wrong:

| Call | Path takes | Body takes |
|---|---|---|
| `POST .../issues/<epic-number>/sub_issues` | the epic's **`number`** | `sub_issue_id` = the slice's **`id`** |
| `POST .../issues/<blocked-number>/dependencies/blocked_by` | the blocked slice's **`number`** | `issue_id` = the blocker's **`id`** |

Passing a `number` where an `id` is expected either 404s or links the wrong issue, and the mistake reads
like a typo.

## REST conventions

- **Create an issue:** `POST /repos/<owner>/<repo>/issues` with
  `{ "title": "...", "body": "<specification + acceptance checklist>", "labels": ["<label>", …],
  "assignees": ["<assignee>"] }` — omit `assignees` entirely when `Assignee: none`. Capture the returned
  `number` (the slice's `id`) **and** `id` (for the relation calls). Pass `labels` and `assignees` **at
  creation** — no separate label or assignee POST for the create path.
- **Link a slice to its epic (sub-issue):** `POST /repos/<owner>/<repo>/issues/<epic-number>/sub_issues`
  with `{ "sub_issue_id": <the slice's global id> }`. Skip entirely for a single-slice feature, which has
  no epic. GitHub renders the epic's progress from these links (ADR 0011).
  **Best-effort:** this call needs Issues write, so the same missing permission that drops labels will
  `403`/`404` it. Log it and carry on — the link is display structure, and the **feature label**, not the
  link, is how slices are found.
- **Record a dependency (`depends-on`):**
  `POST /repos/<owner>/<repo>/issues/<blocked-number>/dependencies/blocked_by` with
  `{ "issue_id": <the blocker's global id> }` → `201`.
  **Not best-effort**, unlike every other call here. `depends-on` is the execution DAG, and `/implement`
  cannot detect a lost edge later: it reads blockers from this API, so a slice missing one simply looks
  unblocked and gets run alongside the slice it must follow. The failure has to be loud at write time.
  On **any non-`201`** — permission, missing issue, validation, rate limit, or a transient `5xx` alike:
  name **every** failed edge as a slice-id pair, not just the first, and end `/plan`
  reporting failure. Nothing is deleted or rolled back — the issues that were created stay, and the plan is
  repaired by writing the missing edges, not by starting over. A token lacking Issues write fails every
  edge at once; report that as the single cause rather than one message per edge.
- **Parallel-safe creation order:** create the epic first (slices reference `#<epic>`), then fire **all
  slice creates in parallel**, then the sub-issue links **and** the dependency writes in parallel once
  every slice's `number` and `id` are known. Only the epic→slices→relations ordering is required; within
  each step the calls are independent.
- **List feature slices:** `GET /repos/<owner>/<repo>/issues?labels=feat%2F<feature>&state=all`
  (URL-encode the label's `/`). **Always by label**, epic or not — a single-slice feature has no epic to
  enumerate sub-issues from, so the label is the one listing path that works in both shapes (ADR 0011).
  Two documented behaviours to handle: the endpoint **returns pull requests as well as issues** (skip any
  result carrying a `pull_request` key), and it **paginates at `per_page` 30** (page through it, or a
  feature past 30 slices loads a truncated set).
- **Read a slice:** `GET /repos/<owner>/<repo>/issues/<number>`.
- **Read a slice's blockers:** `GET /repos/<owner>/<repo>/issues/<number>/dependencies/blocked_by` —
  returns issues; map each back to a slice id by its `number`. Paginated, like every list endpoint here.
  **Ignore a blocker whose `number` isn't in the feature's slice set, and report it.** This relation is
  editable from the GitHub UI by anyone with Issues write, so an edge can point outside the feature — a
  cross-feature leftover, or a human clicking "add blocked by". Honouring one would leave `/implement`
  waiting on a slice that never reaches `merged`, stalling the run with nothing to diagnose.
- **Set labels / status:** `POST .../issues/<number>/labels` (add), `PUT .../issues/<number>/labels`
  (replace), and `PATCH .../issues/<number>` with `{ "state": "closed", "state_reason": "completed" }` to
  close a finished slice. Use `"not_planned"` instead when a slice is abandoned rather than delivered.

## Assignee

Store configuration, not a slice field (`plan-contract.md` → *Assignee*; ADR 0010). The **Assignee** value
above is applied to the **epic and every slice** in the create call, never a follow-up pass. The failure
shape below is the general *Assignee* recovery rule (`plan-contract.md`) made concrete for GitHub.

- GitHub's `assignees` is an **array**, so the single configured login is sent as a one-element
  `["<assignee>"]`. The singular `assignee` field is documented as **closing down** — don't use it.
- **No `Assignee` line** in the configuration above → resolve the token's own identity with
  `GET /user` and use its `login`.
- **`Assignee: none`** → omit `assignees` entirely. No warning, no error.
- **A token without push access silently drops the assignment** — and `labels` and `milestone` with it.
  The create **succeeds**, returns `201`, and the returned `assignees` is empty. Nothing is retried or
  rolled back.
- GitHub has **no reject-the-create failure shape** for the assignee: an unassignable login is dropped,
  not refused. The retry-once-without-the-assignee path in `plan-contract.md` applies to trackers that
  reject; it never triggers here.
- **Check the returned `labels`, not just `assignees`.** Labels are sent on every create; an assignee is
  not sent at all under `Assignee: none`, so assignee-based detection is blind in exactly that
  configuration. An empty `labels` array on the response means the labels didn't stick — the documented
  cause is a token without push access — and since the feature label is the only listing path, those
  issues are unfindable. Report it **once** per run, independently of what `Assignee` is set to.

## Status workflow (GitHub has open/closed + labels — no custom states)

`/implement` moves each issue at every lifecycle point (see the plan-contract's *Slice lifecycle*):

| Canonical | GitHub state | How |
|---|---|---|
| `todo` | open + label `ready` | on create |
| `in-progress` | open + label `in-progress` | swap `ready`→`in-progress` on dispatch |
| `in-review` | open + label `in-review` | swap label when per-slice review starts (behavior only) |
| `blocked` | open + label `blocked` | swap label while stuck |
| `merged` (done) | **closed** | `PATCH { "state": "closed", "state_reason": "completed" }` after merge |

The **epic** issue: label `in-progress` when the run starts, **closed** once every slice issue is closed.
A **single-slice feature has no epic**: its lone issue is the scope anchor, so the anchor rule wins. It
keeps the `in-progress` label through the merge, and closes once, when `/superdev:ship` runs.
Best-effort — the run ledger drives control flow; if a label/close call fails, log it and continue.

**Lite execution tier** (≤3 slices, see `plan-contract.md`) skips `in-review` for every slice regardless
of `test-applicability` — go straight from `in-progress` to closed once the slice's commit lands on the
scope branch.

## Tooling — REST or `gh`

REST is the documented path: it returns JSON, so `number` and `id` both come straight off the create
response, which is what the ledger's slice-id mapping and both relation calls need (ADR 0011).

`gh` is a reasonable alternative when it's installed and already authenticated — `gh issue create
--parent <epic-number>` collapses create-and-link into one call, resolving the `sub_issue_id` for you.
Its cost: `gh issue create` prints the issue URL rather than JSON, so the `number` has to be parsed off
the URL and the global `id` fetched separately — and the dependency write needs that `id` regardless.

## Append mode

`/superdev:plan` can extend a feature that already has issues (`plan-contract.md` → *Append mode*,
ADR 0004).

- **Create only new records; never edit, close, or delete a merged slice.** Append fires new
  `POST /repos/<owner>/<repo>/issues` calls for the new slices alone. It never `PATCH`es or closes an
  issue a prior run already merged, and never rewrites its labels, sub-issue link, or `blocked_by`
  dependency — a merged issue's `number` is a satisfied `depends-on` root for a newly created one,
  nothing more.
- **Create the epic first when none exists.** A feature whose lone issue carries the feature label with
  no sub-issue parent has no epic yet (the single-slice shape, `## Scope anchor` above). Append creates
  the epic issue first — its body holding the lone slice's `acceptance` checklist as the global DoD —
  then links every new slice as its sub-issue. The lone existing issue itself is never edited: no epic
  body copies onto it, no sub-issue link is written for it, and it stays nobody's child.
- **Amend the epic's own body — the one sanctioned edit.** `PATCH /repos/<owner>/<repo>/issues/<epic
  number>` with `{ "body": "<amended body>" }` folds the interview's new criteria into the epic's
  Definition of Done in place, and, the same call, deletes a resolved parked question's line from the
  epic's `## Parked questions` section. Both are edits to the epic issue's own body, never to a merged
  slice's issue — the never-edit rule above still holds for every slice.

The `number` is server-assigned at creation, already unique and stable, so append names no continuation
rule for `id`.

## When a skill says "write slices to the store"

**≥2 slices** — create the epic first (global DoD), then one issue per slice, then link each slice as a
sub-issue of the epic and write the `blocked_by` dependencies. **Exactly one slice** — skip the epic;
create only the slice issue, folding the global DoD into its `acceptance` checklist, and skip both
relation calls entirely.

## When a skill says "load slices from the store"

List the feature's issues by label (skipping pull requests, paging to the end), read each, and reconstruct
slice fields from the mapping above — including each slice's blockers from its `dependencies/blocked_by`,
discarding any that fall outside the feature's slice set. Those per-slice reads are independent: fan them
out in parallel, as the write path does, rather than walking the feature one slice at a time. No epic among
the results (single-slice feature) → the global DoD is the lone slice issue's own `acceptance`.
