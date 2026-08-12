# Slice store: Forgejo / Codeberg Issues

Slices live as issues on a Forgejo (or Gitea) instance — Codeberg included — one slice = one issue. Use
the Forgejo REST API (or the `tea` CLI if installed).

## Configuration (fill in at setup)

- **Host / owner / repo:** `<https://codeberg.org or your self-hosted Forgejo/Gitea URL>` · `<owner>` /
  `<repo>`. Every `/api/v1/...` path below joins to this Host.
- **Auth:** API token in env var `<GITEA_TOKEN>` (record the name, never the value). Header:
  `Authorization: token $<GITEA_TOKEN>`, `Content-Type: application/json`.
- **Feature label:** one label per feature/scope, `<type>/<slug>` (e.g. `fix/<slug>`), applied to the
  epic + its slices, so the feature's issues are listable. `<type>` is the **change type** — the
  Conventional Commits type of the work, per `references/scope-mode.md` — and the label doubles as the
  scope branch name.
- **Assignee:** `<login>` — the Forgejo login every issue a run creates is assigned to (see
  *Assignee* below). Set to `none` to create issues unassigned; remove the line entirely to fall back to
  whoever the token belongs to.

## Field mapping (plan-contract → Forgejo)

- `id` ↔ the issue **index** (`#<n>`). Record the slice-id ↔ `#<n>` mapping in the run ledger so
  `depends-on` resolves to real indexes.
- `title` ↔ issue title.
- `spec` ↔ issue body ("What to build").
- `acceptance` ↔ a `- [ ]` checklist in the body.
- `test-applicability` ↔ a label: `behavior` | `mechanical` | `docs`.
- `depends-on` ↔ a `**Depends on:** #<n>` line in the issue body (one per blocker). Some Forgejo
  instances have the native issue-dependencies unit **disabled**; when it is, the body line is the source
  of truth `/implement` parses. Check the instance first — `POST .../issues/<index>/dependencies` 404s
  when the unit is off.
- global DoD ↔ an **epic** issue (label `epic`) whose body holds the DoD checklist; slices carry the
  feature label and reference the epic (`#<epic>`).
- **Parked questions** (optional) ↔ a `## Parked questions` section in the epic issue body, same
  body-text pattern as `acceptance`. Epic-only — no equivalent on a single-slice feature's lone issue.
  Advisory only: `/implement` never reads it.
- **Non-goals** (optional) ↔ a `## Non-goals` section in the epic issue body, same body-text pattern as
  **Parked questions** above. Epic-only — no equivalent on a single-slice feature's lone issue. Advisory
  only: `/implement` never reads it.
- **Epic visuals** (optional) ↔ `## Slice graph` and `## Touch map` sections in the epic issue body.
  Forgejo renders mermaid in issue bodies, so the slice graph draws itself in the epic issue. Epic-only
  and advisory, same as parked questions; `plan-contract.md` owns when each is written.
- `status` ↔ open/closed + a status label (see the status map below).

## REST conventions

- **Create an issue:** `POST /api/v1/repos/<owner>/<repo>/issues` with
  `{ "title": "...", "body": "<specification + acceptance checklist>", "labels": [<label ids>],
  "assignees": ["<login>"] }` — omit `assignees` entirely when `Assignee: none`. Capture the returned
  `number` as the slice's `id`. Pass `labels` and `assignees` **at creation** — no separate label or
  assignee POST for the create path.
- **Parallel-safe creation order:** create the epic first (slices reference `#<epic>`), then fire **all
  slice creates in parallel**, then the `depends-on` body-patches in parallel once every `number` is
  known. Only the epic→slices→depends-on ordering is required; within each step the calls are
  independent, so `/plan` issues them concurrently.
- **Record a dependency (`depends-on`):** append a `**Depends on:** #<blocker>` line to the issue body
  when the instance's native `POST .../issues/<index>/dependencies` endpoint 404s (dependencies unit
  disabled); use the native endpoint when it is enabled.
- **List feature slices:** `GET /api/v1/repos/<owner>/<repo>/issues?labels=<type>%2F<feature>&state=all`
  (URL-encode the label's `/`).
- **Read a slice:** `GET /api/v1/repos/<owner>/<repo>/issues/<index>`.
- **Set labels / status:** `POST .../issues/<index>/labels` (add) and
  `PATCH .../issues/<index>` with `{ "state": "closed" }` to close.

## Scope anchor

A feature's scope anchor is its root (`plan-contract.md` → *Scope anchor*). When the instance's
issue-dependencies unit is disabled and no sub-issue relation is used, this store expresses the root with
labels rather than natively: on a multi-slice feature the anchor is the `epic`-labelled issue carrying the
feature label, and on a single-slice feature it is the lone issue carrying that label (ADR 0017).

- **Recognise one.** Among the issues carrying a feature label, the anchor is the one labelled `epic`. If
  none is, and exactly one issue carries the label, that issue is the anchor.
- **List the candidates.** The feature labels themselves: `GET /api/v1/repos/<owner>/<repo>/labels`
  (paginated), keeping the names whose first segment is a change type (`references/scope-mode.md` lists
  them). Per feature label:
  `GET /api/v1/repos/<owner>/<repo>/issues?labels=<type>%2F<feature>&state=open` (URL-encode the label's
  `/`), then apply the rule above to the result.
- **List the slices beneath it.** Use the **List feature slices** call above (`state=all`), not the
  candidate listing: a merged slice is closed, and closing the epic is best-effort, so an anchor left open
  with every slice closed still has slices beneath it and a `state=open` listing would present it as never
  decomposed. On a multi-slice feature the slices are every issue in that response that is not the `epic`;
  a single-slice feature's anchor has none beneath it.
- **Tell an anchor that is itself a slice.** It carries a `test-applicability` label — `behavior`,
  `mechanical`, or `docs`. The epic issue never does. That is what separates a single-slice feature, whose
  lone slice is its own anchor and is real work, from an epic created and never decomposed, which is not.
- **Ambiguous.** No `epic`-labelled issue and two or more issues carrying the same feature label. This
  store has no parent relation to fall back on, so the shape cannot be resolved: `/superdev:plan` never
  writes it, there is no single Definition of Done to build against, and a consumer reports it instead of
  choosing.

## Assignee

Store configuration, not a slice field (`plan-contract.md` → *Assignee*; ADR 0010). The **Assignee**
value above is applied to the **epic and every slice** in the create call, never a follow-up pass. The
two failure shapes below are the general *Assignee* recovery rule (`plan-contract.md`) made concrete for
Forgejo.

- Forgejo's `CreateIssueOption.assignees` is an **array**, so the single configured login is sent as a
  one-element `["<login>"]`. `EditIssueOption.assignees` is the same shape if an issue ever needs it later.
- **No `Assignee` line** in the configuration above → resolve the token's own identity with
  `GET /api/v1/user` and use its `login`.
- **`Assignee: none`** → omit `assignees` entirely. No warning, no error.
- **A login that doesn't exist or isn't a collaborator rejects the whole create**: `422 Assignee does not
  exist` or `422 canBeAssigned` (`ErrUserDoesNotHaveAccessToRepo`). Retry that one create with
  `assignees` omitted; report it once per run.
- **A token without issue-write access silently drops the assignment** (and `labels` with it) — the
  create succeeds but the returned `assignees` is empty or `null`. Read it back from the create response;
  if it's empty while an assignee was configured, report it once per run.
- Either way the issue is created and nothing is retried more than that one time or rolled back.

## Status workflow (Forgejo has open/closed + labels — no custom states)

`/implement` moves each issue at every lifecycle point (see the plan-contract's *Slice lifecycle*):

| Canonical | Forgejo state | How |
|---|---|---|
| `todo` | open + label `ready` | on create |
| `in-progress` | open + label `in-progress` | swap `ready`→`in-progress` on dispatch |
| `in-review` | open + label `in-review` | swap label when per-slice review starts (behavior only) |
| `blocked` | open + label `blocked` | swap label while stuck |
| `merged` (done) | **closed** | `PATCH { "state": "closed" }` after merge |

The **epic** issue: label `in-progress` when the run starts, **closed** once every slice issue is closed.
A **single-slice feature has no epic**: its lone issue is the scope anchor, so the anchor rule wins. It
keeps the `in-progress` label through the merge, and closes once, when `/superdev:ship` runs.
Best-effort — the run ledger drives control flow; if a label/close call fails, log it and continue.

**Lite execution tier** (≤3 slices, see `plan-contract.md`) skips `in-review` for every slice regardless
of `test-applicability` — go straight from `in-progress` to closed once the slice's commit lands on the
scope branch.

## When a skill says "write slices to the store"

**≥2 slices** — create the epic first (global DoD), then one issue per slice, then append each slice's
`**Depends on:** #<n>` body lines (or write the native dependency, when the unit is enabled) once every
`number` is known. **Exactly one slice** — skip the epic; create only the slice issue, folding the global
DoD into its `acceptance` checklist, and skip the depends-on step entirely (a lone slice has no blocker).

## When a skill says "load slices from the store"

List the feature's issues by label (`state=all`), read each, and reconstruct slice fields from the
mapping above — including each slice's blockers, parsed from its `**Depends on:**` body lines (or the
native dependency listing when the unit is enabled). Those per-slice reads are independent: fan them out
in parallel, as the write path does, rather than walking the feature one slice at a time. No `epic`-labelled
issue among the results (single-slice feature) → the global DoD is the lone slice issue's own
`acceptance`.
