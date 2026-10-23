#!/usr/bin/env node
'use strict';

// publish-kb.js: the backend-independent half of publishing a repo's staged knowledge-base pages
// (ADR 0069). Carries `action: upsert`, `action: delete`, and `action: patch` end to end.
// `action: patch` merges one aggregate-page section by heading, via `lib/md-sections.js`'s `merge()`
// (ADR 0027): the live body comes from `read`, never from `find`, and a backend declaring no
// `read` template leaves every `patch` page staged instead.
//
// This file is the CLI: it reads the arguments, wires the `lib/kb-*.js` modules together, and prints
// the report. The staging root, the backend configuration, the staged page, the template runner,
// the per-file application, the parent-link edit, the containment check, the read entry, and the
// report each live in their own module there.
//
// `--read <title>` is a read-only entry point (ADR 0094, INV-0091): see `lib/kb-read.js`. A staged
// `upsert` may carry the hash it was built from as a `live-hash` frontmatter key; before an upsert
// replaces an existing page, that recorded hash is checked against the live page, and the upsert is
// refused (staying staged, with the refusal reported per page) when it differs or is absent — unless
// the staged file instead carries a `created-by-publish` marker (ADR 0094, ADR 0130), written just
// before this same run sent it as a `create`: a page found existing under that marker is this run's
// own create landing, and is sent as an `update` with no live-hash check. A recorded `live-hash`
// always wins over the marker: the marker only ever substitutes for a live-hash that was never
// recorded, never overrides one that was.

const fs = require('fs');
const path = require('path');
const { fail } = require('../lib/refusal.js');
const { resolveMainCheckout, listPendingScopes, resolveScope } = require('../lib/kb-staging.js');
const { parseCommandsTemplates, classifyBackend } = require('../lib/kb-backend-config.js');
const { parseStagedPage } = require('../lib/kb-staged-page.js');
const {
  hashBody,
  timeoutMs,
  runTemplate,
  runFind,
  publishUpsert,
  publishDelete,
  publishPatch,
} = require('../lib/kb-backend.js');
const { processFile, processStagedFiles } = require('../lib/kb-apply.js');
const { addParentLink, removeParentLink } = require('../lib/kb-parent-link.js');
const { resolveScopeBranch, parseBaseBranch, parseRemote, checkContainment } = require('../lib/kb-containment.js');
const { readPage, runReadEntry } = require('../lib/kb-read.js');
const { renderReport } = require('../lib/kb-report.js');

// --- CLI ---------------------------------------------------------------------------------------

function run(argv, cwd) {
  const args = argv.slice();
  const ri = args.indexOf('--read');
  if (ri >= 0) {
    const title = args[ri + 1];
    if (!title) fail('--read needs a title');
    return runReadEntry(cwd, title);
  }
  let scope = null;
  const si = args.indexOf('--scope');
  if (si >= 0) {
    scope = args[si + 1];
    if (!scope) fail('--scope needs a value');
  }
  const allowUnmerged = args.includes('--allow-unmerged');

  const mainCheckout = resolveMainCheckout(cwd);
  const stagingRoot = path.join(mainCheckout, '.superdev', 'kb-pending');
  const pending = listPendingScopes(stagingRoot);
  const resolvedScope = resolveScope(pending, scope);

  const docPath = path.join(mainCheckout, 'docs', 'agents', 'knowledge-base.md');
  let docText = null;
  try {
    docText = fs.readFileSync(docPath, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const backend = classifyBackend(docText);
  if (backend.kind === 'local' || backend.kind === 'none') fail(backend.reason);
  if (backend.kind === 'unconfigured') {
    fail(
      `docs/agents/knowledge-base.md carries no "## Commands" section — run /superdev:setup to configure the backend`,
    );
  }

  let unmerged = false;
  const containment = checkContainment(mainCheckout, resolvedScope);
  if (containment.performed && !containment.ok) {
    if (!allowUnmerged) {
      fail(`${containment.message} — nothing published (pass --allow-unmerged to publish anyway)`);
    }
    unmerged = true;
  }

  const scopeDir = path.join(stagingRoot, resolvedScope);
  const files = fs
    .readdirSync(scopeDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const results = processStagedFiles(
    files.map((f) => path.join(scopeDir, f)),
    backend.templates,
  );

  try {
    if (fs.readdirSync(scopeDir).length === 0) fs.rmdirSync(scopeDir);
  } catch {
    // non-empty (a left-staged file, or a stray non-.md file) — leave it
  }

  console.log(renderReport(resolvedScope, backend.kind, results, unmerged));
}

function main() {
  try {
    run(process.argv.slice(2), process.cwd());
  } catch (e) {
    if (!e.isRefusal) throw e;
    process.stderr.write(`publish-kb: ${e.message}\n`);
    process.exit(1);
  }
}

// The `tests/publish-kb*.test.js` suites require every function below directly (ADR 0059).
module.exports = {
  resolveMainCheckout,
  listPendingScopes,
  resolveScope,
  classifyBackend,
  parseCommandsTemplates,
  parseStagedPage,
  runTemplate,
  runFind,
  publishUpsert,
  publishDelete,
  publishPatch,
  processFile,
  processStagedFiles,
  addParentLink,
  removeParentLink,
  resolveScopeBranch,
  parseBaseBranch,
  parseRemote,
  checkContainment,
  timeoutMs,
  hashBody,
  readPage,
  renderReport,
  run,
};

if (require.main === module) main();
