set -e

# A tiny runnable repo: node's built-in test runner, no dependencies, no
# network. Both ablation arms get the identical starting point — a green
# suite, one existing endpoint, and a README that documents it.
mkdir -p src test docs/agents

cat > package.json <<'DOC'
{
  "name": "widget-api",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
DOC

cat > src/store.js <<'DOC'
const widgets = new Map([
  ["w1", { id: "w1", name: "sprocket", archived: false }],
  ["w2", { id: "w2", name: "flange", archived: false }],
]);

export function get(id) {
  return widgets.get(id);
}

export function put(widget) {
  widgets.set(widget.id, widget);
  return widget;
}
DOC

cat > src/handler.js <<'DOC'
import * as store from "./store.js";

// Routes a request to a response. `path` is the raw pathname, e.g.
// "/widgets/w1"; `method` is the HTTP verb.
export function handle(method, path) {
  const read = path.match(/^\/widgets\/([^/]+)$/);
  if (method === "GET" && read) {
    const widget = store.get(read[1]);
    if (!widget) return { status: 404, body: { error: "not_found" } };
    return { status: 200, body: widget };
  }
  return { status: 404, body: { error: "no_route" } };
}
DOC

cat > test/handler.test.js <<'DOC'
import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../src/handler.js";

test("GET /widgets/:id returns the widget", () => {
  const res = handle("GET", "/widgets/w1");
  assert.equal(res.status, 200);
  assert.equal(res.body.name, "sprocket");
});

test("GET /widgets/:id is 404 for an unknown id", () => {
  const res = handle("GET", "/widgets/nope");
  assert.equal(res.status, 404);
});
DOC

cat > README.md <<'DOC'
# widget-api

An HTTP API over an in-memory widget store. Every endpoint the service serves
is documented here.

## Endpoints

### `GET /widgets/:id`

Returns `200` with the widget as JSON. Returns `404` with
`{"error":"not_found"}` when no widget has that id.
DOC

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

- **Default PR posture:** `push-only` — commit the work on the scope branch and
  merge it into `main` locally. Never attempt a `git push`, a pull request, or
  any network call; there is no remote to reach.
- **Base branch:** `main`.
DOC

cat > docs/agents/documentation.md <<'DOC'
# In-repo documentation convention

`README.md` is the single documentation file. Its `## Endpoints` section
documents every endpoint the service serves: the path, the success response,
and each failure response a caller can observe. It states the current
behaviour only — no changelog, no history.
DOC

cat > docs/agents/verification.md <<'DOC'
# Verification

The repo's test command — arms the merge green-gate:

```sh
npm test
```
DOC

cat > docs/agents/toolchain.md <<'DOC'
# Toolchain

## `.` — ESM JavaScript on Node

- No dependencies and no package manager install step; `node_modules` is absent
  by design and there is no network access.
- Tests: `npm test` (`node --test`), node's built-in runner with
  `node:assert/strict`. No test framework.
- No linter or formatter is configured.
DOC

git init -q -b main
git config user.email evals@example.com
git config user.name "eval scaffold"
git add -A
git commit -qm "chore: widget-api starting point"
