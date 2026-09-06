set -e

# A finished piece of work, waiting to be reviewed.
#
# `main` holds the widget-api starting point. `feat/widget-search` holds two
# slice commits that satisfy their own Definition of Done and leave the suite
# green. Alongside them sits a run root — ledger, DoD, run lock — so a review
# of that branch is a scope review rather than an ad-hoc range.
#
# The work is deliberately CORRECT BUT SHALLOW. Every criterion is met, no
# criterion is met badly, and each one stops at the first thing that passed:
# the search is a linear substring scan, case-sensitive, over an unbounded
# result set. Nothing here is a defect, so a review has nothing Critical and
# nothing Important to report — which is the only condition under which a
# reviewer has room to say anything about how *deeply* the work was done.
#
# Both arms get the identical branch, the identical run root, and the
# identical prompt. The delta is the plugin.

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
  ["w3", { id: "w3", name: "Sprocket Housing", archived: false }],
]);

export function get(id) {
  return widgets.get(id);
}

export function all() {
  return [...widgets.values()];
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

cat > docs/agents/code-management.md <<'DOC'
# Code host: none (local git only)

There is no remote and no code host in this environment.

- **Default PR posture:** `push-only` — there is no remote to reach. Never
  attempt a `git push`, a pull request, or any network call.
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

The repo's test command:

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

# --- the run root: what makes a review of the branch below a scope review ---
#
# Tracked, and committed to `main` before the scope branch is cut — never
# gitignored. An untracked or ignored run root is invisible to `Grep`, which
# is ripgrep-backed and skips both classes, so an arm searching for the
# specification it was told to find comes up empty. Committing it here rather
# than on the scope branch keeps it out of `main..feat/widget-search`, the
# range a review resolves: the run root is scope-review furniture, not part
# of the work under review, and it must read that way to the arm being
# scored on whether it can tell the two apart.

mkdir -p .superdev/scopes/widget-search

cat > .superdev/scopes/widget-search/dod.md <<'DOC'
# Definition of Done — feat/widget-search

Epic: #41 — Search widgets by name

- [ ] `GET /widgets?q=<term>` returns 200 with every widget whose name contains
      the term, under a `results` key.
- [ ] A term matching nothing returns 200 with an empty `results` list, never a
      404.
- [ ] An absent or empty term returns 400, so a caller cannot omit the term to
      see everything.
- [ ] A request target that cannot be parsed, such as `//`, returns 400 rather
      than throwing.
- [ ] Adding a query string to `GET /widgets/:id` still reads that widget.
- [ ] The README's `## Endpoints` section documents the new endpoint, its
      success response, its empty-result behaviour, and each 400 a caller can
      observe.
- [ ] The full suite passes.
DOC

# Placeholder ranges, not real SHAs: nothing in the review path reads this
# column (`plugin/skills/review/SKILL.md` resolves the range from git, and
# reads the ledger only for the slice list), and the run root is committed
# before the commits it would otherwise cite exist.
cat > .superdev/scopes/widget-search/ledger.md <<'DOC'
# Ledger — widget-search

**Stage:** merged
**Branch:** feat/widget-search
**Anchor:** #41 — Search widgets by name

| id | issue | title | type | depends-on | status | range |
|---|---|---|---|---|---|---|
| 01 | #42 | Search the widget store by name | behavior | — | merged | a..b |
| 02 | #43 | Document the search endpoint | docs | 01 | merged | b..c |
DOC

touch .superdev/scopes/widget-search/run.lock

git add -A
git commit -qm "chore: seed the run root"

# --- the scope branch: two slices, already built, already green -------------

git checkout -qb feat/widget-search

cat > src/search.js <<'DOC'
import * as store from "./store.js";

// Every widget whose name contains `term`, compared case-sensitively.
export function search(term) {
  return store.all().filter((w) => w.name.includes(term));
}
DOC

cat >> test/handler.test.js <<'DOC'

test("search finds a widget by a fragment of its name", () => {
  const res = handle("GET", "/widgets?q=sprock");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.results.map((w) => w.id), ["w1"]);
});

test("search matching is case-sensitive, as documented", () => {
  assert.deepEqual(handle("GET", "/widgets?q=Sprocket").body.results.map((w) => w.id), ["w3"]);
  assert.deepEqual(handle("GET", "/widgets?q=sprocket").body.results.map((w) => w.id), ["w1"]);
});

test("search returns an empty list when nothing matches", () => {
  const res = handle("GET", "/widgets?q=nothinglikethis");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.results, []);
});

test("an absent or empty term is a 400, never a whole-store dump", () => {
  assert.equal(handle("GET", "/widgets?q=").status, 400);
  assert.equal(handle("GET", "/widgets").status, 400);
});

test("a stray percent in the term is matched literally, not a crash", () => {
  const res = handle("GET", "/widgets?q=50%");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.results, []);
});

test("an unparseable target is a 400, not a crash", () => {
  assert.equal(handle("GET", "//").status, 400);
  assert.equal(handle("GET", "http://").status, 400);
});

test("a query string on the id route still reads the widget", () => {
  const res = handle("GET", "/widgets/w1?fields=name");
  assert.equal(res.status, 200);
  assert.equal(res.body.id, "w1");
});
DOC

cat > src/handler.js <<'DOC'
import * as store from "./store.js";
import { search } from "./search.js";

// Routes a request to a response. `target` is a request target — a path with
// an optional query string, e.g. "/widgets/w1" or "/widgets?q=sprock".
// `method` is the HTTP verb.
export function handle(method, target) {
  let url;
  try {
    url = new URL(target, "http://widget-api.invalid");
  } catch {
    return { status: 400, body: { error: "bad_target" } };
  }

  if (method === "GET" && url.pathname === "/widgets") {
    const term = url.searchParams.get("q");
    if (!term) return { status: 400, body: { error: "missing_term" } };
    return { status: 200, body: { results: search(term) } };
  }

  const read = url.pathname.match(/^\/widgets\/([^/]+)$/);
  if (method === "GET" && read) {
    const widget = store.get(read[1]);
    if (!widget) return { status: 404, body: { error: "not_found" } };
    return { status: 200, body: widget };
  }

  return { status: 404, body: { error: "no_route" } };
}
DOC

git add -A
git commit -qm "feat(search): add a name search over the widget store"

cat >> README.md <<'DOC'

### `GET /widgets?q=<term>`

Returns `200` with `{"results": [...]}`, every widget whose name contains the
term. Matching is **case-sensitive**: `q=sprocket` does not match a widget
named `Sprocket Housing`. Returns an empty list when nothing matches.

Returns `400` with `{"error":"missing_term"}` when `q` is absent or empty, so
a caller cannot omit the term to see everything. A term that happens to match
every widget's name still returns all of them, the same as any other match.
Returns `400` with `{"error":"bad_target"}` when the request target cannot be
parsed, for example `//`. A stray `%` in the term is matched literally rather
than decoded.
DOC

git add -A
git commit -qm "docs(readme): document the search endpoint"

# Stay on the scope branch. The runner captures the arm's diff against the
# scaffold commit and refuses to score when any ref carries a commit HEAD
# cannot reach (eval-run.js's `work exists outside the captured branch`).
# Ending on `main` puts these two commits exactly there: the scaffold's own
# setup reads as stray agent work, every arm fails capture, and the case scores
# nothing while still spending a full run.
#
# It is also the truer starting point. A real `/superdev:review` runs in the
# scope checkout with the scope branch checked out, which is what this is.
