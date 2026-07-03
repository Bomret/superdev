# Slice store: Codeberg Issues (Forgejo)

Slices live as Codeberg issues — one slice = one issue — in `bomret/superdev`. Use the Forgejo REST API
(or the `tea` CLI if installed).

## Configuration

- **Host / owner / repo:** `https://codeberg.org` · `bomret` / `superdev`.
- **Auth:** API token in env var `GITEA_TOKEN` (record the name, never the value). Header:
  `Authorization: token $GITEA_TOKEN`, `Content-Type: application/json`.
- **Feature label:** one label per feature/scope (e.g. `feat/self-improvements`) applied to the epic +
  its slices, so the feature's issues are listable.

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
- `status` ↔ open/closed + a status label (see the status map below).

## REST conventions

- **Create an issue:** `POST /api/v1/repos/bomret/superdev/issues` with
  `{ "title": "...", "body": "<spec + acceptance checklist>", "labels": [<label ids>] }`. Capture the
  returned `number` as the slice's `id`.
- **Record a dependency (`depends-on`):** append a `**Depends on:** #<blocker>` line to the issue body
  (the native `POST .../issues/<index>/dependencies` endpoint 404s — dependencies unit disabled).
- **List feature slices:** `GET /api/v1/repos/bomret/superdev/issues?labels=feat/<feature>&state=all`.
- **Read a slice:** `GET /api/v1/repos/bomret/superdev/issues/<index>`.
- **Set labels / status:** `POST .../issues/<index>/labels` (add) and
  `PATCH .../issues/<index>` with `{ "state": "closed" }` to close.

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
