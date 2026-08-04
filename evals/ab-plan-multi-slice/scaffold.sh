set -e

# A repo whose conventions are stated once, identically for both ablation arms:
# the plugin arm reads them as its slice-store config, the no-plugin arm reads
# them as ordinary repo docs. Deliberately generous to the baseline.
mkdir -p docs/agents docs/plans src test

cat > docs/agents/issue-tracker.md <<'DOC'
# Slice store: Local plan files

A feature's plan is a directory of markdown files: `docs/plans/<type>/<feature-slug>/`,
where `<type>` is the Conventional Commits type of the work. The feature label is
`<type>/<feature-slug>`, and it doubles as the scope branch name.

- `00-epic-<summary>.md` — the scope file: global Definition of Done + a
  short description of the feature. Not a slice.
- `NN-<test-applicability>-<summary>.md` (N >= 01) — one slice per file.
  `<test-applicability>` is `behavior` | `mechanical` | `docs`. The
  zero-padded number is the slice `id`; `depends-on` references those
  numbers directly (e.g. `depends-on: [01, 03]`).

Slice file body: `depends-on:`, `test-applicability:`, `status: todo`,
a `## spec` section, and an `## acceptance` section.
DOC

cat > docs/agents/code-management.md <<'DOC'
# Code host: none (local git only)

There is no remote and no code host in this environment.

- **Default PR posture:** `push-only` — commit on the scope branch, never
  attempt a push or a pull request.
- **Base branch:** `main`.
DOC

cat > docs/agents/verification.md <<'DOC'
# Verification

The repo's test command:

```sh
node --test
```
DOC

cat > src/store.js <<'DOC'
// The only persistence layer. Every read goes over the network to the
// datastore process; it can be up, down, or slow.
export async function get(key) {
  throw new Error("not implemented");
}
DOC

cat > README.md <<'DOC'
# widget-api

A small HTTP service over a networked datastore. Endpoints are documented here.

## Endpoints

_None yet._
DOC
