# Slice store: Codeberg Issues (Forgejo)

Slices live as Codeberg issues — one slice = one issue — in `bomret/superdev`. Use the Forgejo REST API
(or the `tea` CLI if installed).

## Configuration

- **Host / owner / repo:** `https://codeberg.org` · `bomret` / `superdev`.
- **Auth:** API token in env var `GITEA_TOKEN` (record the name, never the value). Header:
  `Authorization: token $GITEA_TOKEN`, `Content-Type: application/json`.
- **Feature label:** one label per feature/scope (e.g. `feat/self-improvements`) applied to the epic +
  its slices, so the feature's issues are listable.
- **Assignee:** `bomret` — the Codeberg login every issue a run creates is assigned to (see
  *Assignee* below). Set to `none` to create issues unassigned; remove the line entirely to fall back to
  whoever `GITEA_TOKEN` belongs to.

## Field mapping (plan-contract → Forgejo)

- `id` ↔ the issue **index** (`#<n>`). Record the slice-id ↔ `#<n>` mapping in the run ledger so
  `depends-on` resolves to real indexes.
- `title` ↔ issue title.
- `spec` ↔ issue body ("What to build").
- `acceptance` ↔ a `- [ ]` checklist in the body.
- `test-applicability` ↔ a label: `behavior` | `mechanical` | `docs`.
- `depends-on` ↔ a `**Depends on:** #<n>` line in the issue body (one per blocker). Forgejo's native
  issue-dependencies unit is **disabled** on this repo, so the body line is the source of truth `/implement`
  parses.
- global DoD ↔ an **epic** issue (label `epic`) whose body holds the DoD checklist; slices carry the
  feature label and reference the epic (`#<epic>`).
- **Parked questions** (optional) ↔ a `## Parked questions` section in the epic issue body, same
  body-text pattern as `acceptance`. Epic-only — no equivalent on a single-slice feature's lone issue.
  Advisory only: `/implement` never reads it.
- **Non-goals** (optional) ↔ a `## Non-goals` section in the epic issue body, same body-text pattern as
  **Parked questions** above. Epic-only — no equivalent on a single-slice feature's lone issue. Advisory
  only: `/implement` never reads it.
- **Epic visuals** (optional) ↔ `## Slice graph` and `## Touch map` sections in the epic issue body.
  Codeberg renders mermaid in issue bodies, so the slice graph draws itself in the epic issue. Epic-only
  and advisory, same as parked questions; `plan-contract.md` owns when each is written.
- `status` ↔ open/closed + a status label (see the status map below).

## REST conventions

- **Create an issue:** `POST /api/v1/repos/bomret/superdev/issues` with
  `{ "title": "...", "body": "<specification + acceptance checklist>", "labels": [<label ids>],
  "assignees": ["bomret"] }` — omit `assignees` entirely when `Assignee: none`. Capture the returned
  `number` as the slice's `id`. Pass `labels` and `assignees` **at creation** — no separate label or
  assignee POST for the create path.
- **Parallel-safe creation order:** create the epic first (slices reference `#<epic>`), then fire **all
  slice creates in parallel**, then the `depends-on` body-patches in parallel once every `number` is
  known. Only the epic→slices→depends-on ordering is required; within each step the calls are
  independent, so `/plan` issues them concurrently.
- **Record a dependency (`depends-on`):** append a `**Depends on:** #<blocker>` line to the issue body
  (the native `POST .../issues/<index>/dependencies` endpoint 404s — dependencies unit disabled).
- **List feature slices:** `GET /api/v1/repos/bomret/superdev/issues?labels=feat/<feature>&state=all`.
- **Read a slice:** `GET /api/v1/repos/bomret/superdev/issues/<index>`.
- **Set labels / status:** `POST .../issues/<index>/labels` (add) and
  `PATCH .../issues/<index>` with `{ "state": "closed" }` to close.

## Assignee

Store configuration, not a slice field (`plan-contract.md` → *Assignee*; ADR 0010). The **Assignee**
value above is applied to the **epic and every slice** in the create call, never a follow-up pass. The
two failure shapes below are the general *Assignee* recovery rule (`plan-contract.md`) made concrete for
Forgejo.

- Forgejo's `CreateIssueOption.assignees` is an **array**, so the single configured login is sent as a
  one-element `["bomret"]`. `EditIssueOption.assignees` is the same shape if an issue ever needs it later.
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
Best-effort — the run ledger drives control flow; if a label/close call fails, log it and continue.

**Lite execution tier** (≤3 slices, see `plan-contract.md`) skips `in-review` for every slice regardless
of `test-applicability` — go straight from `in-progress` to closed once the slice's commit lands on the
scope branch.
