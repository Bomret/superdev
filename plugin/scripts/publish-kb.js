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
//
// `--help` / `-h` prints the usage and exits 0, reading no repository and calling no backend, except as the
// value of `--read` or `--scope`, where it is data. Any other argument it does not take, or a flag missing its
// value, refuses with the usage before the repository is read.

const fs = require('fs');
const path = require('path');
const { fail, readPresent } = require('../lib/refusal.js');
const { resolveMainCheckout, listPendingScopes, resolveScope } = require('../lib/kb-staging.js');
const { parseCommandsTemplates, classifyBackend, liveTemplates } = require('../lib/kb-backend-config.js');
const { parseStagedPage } = require('../lib/kb-staged-page.js');
const { hashBody, timeoutMs, runFind } = require('../lib/kb-backend.js');
const { processStagedFiles } = require('../lib/kb-apply.js');
const { addParentLink, removeParentLink } = require('../lib/kb-parent-link.js');
const { parseBaseBranch, parseRemote, checkContainment } = require('../lib/kb-containment.js');
const { runReadEntry } = require('../lib/kb-read.js');
const { renderReport } = require('../lib/kb-report.js');

// --- CLI ---------------------------------------------------------------------------------------

const USAGE = [
  'usage: node publish-kb.js [--scope <slug>] [--allow-unmerged]',
  '       node publish-kb.js --read <title>',
  '  (no flag)          publishes the staged pages of the one pending scope to the configured backend',
  '  --scope <slug>     publishes that pending scope; needed when more than one scope is pending',
  '  --allow-unmerged   publishes a scope whose branch is not contained in its base',
  '  --read <title>     prints {"title","exists","body","hash"} for one live page; writes nothing',
  '  --help, -h         this text; reads and publishes nothing',
].join('\n');

// `--help` / `-h` asks for usage unless it is the value of `--read` or `--scope`.
function asksForHelp(argv) {
  return argv.some((a, i) => (a === '--help' || a === '-h') && argv[i - 1] !== '--read' && argv[i - 1] !== '--scope');
}

function run(argv, cwd) {
  if (asksForHelp(argv)) {
    console.log(USAGE);
    return;
  }
  // Every argument is a known flag or the value of one; anything else refuses before the repository is read.
  // The first `--read` and the first `--scope` win on a repeat.
  let read = null;
  let scope = null;
  let allowUnmerged = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--read' || a === '--scope') {
      const value = argv[++i];
      if (!value) fail(`${a} needs ${a === '--read' ? 'a title' : 'a value'}\n${USAGE}`);
      if (a === '--read') read ??= value;
      else scope ??= value;
    } else if (a === '--allow-unmerged') allowUnmerged = true;
    else fail(`unrecognized argument "${a}"\n${USAGE}`);
  }
  if (read !== null) return runReadEntry(cwd, read);

  const mainCheckout = resolveMainCheckout(cwd);
  const stagingRoot = path.join(mainCheckout, '.superdev', 'kb-pending');
  const pending = listPendingScopes(stagingRoot);
  const resolvedScope = resolveScope(pending, scope);

  const docPath = path.join(mainCheckout, 'docs', 'agents', 'knowledge-base.md');
  const docText = readPresent(docPath, 'utf8');
  const backend = classifyBackend(docText);
  if (backend.kind === 'local' || backend.kind === 'none') fail(backend.reason);
  if (backend.kind === 'unconfigured') {
    fail(
      `docs/agents/knowledge-base.md carries no "## Commands" section — run /superdev:setup to configure the backend`,
    );
  }

  const templates = liveTemplates(backend.templates, cwd);

  let unmerged = false;
  const containment = checkContainment(mainCheckout, resolvedScope);
  if (containment.performed && !containment.ok) {
    if (containment.unreadable) fail(`${containment.message} — nothing published`);
    if (!allowUnmerged) {
      fail(`${containment.message} — nothing published (pass --allow-unmerged to publish anyway)`);
    }
    unmerged = true;
  }

  const scopeDir = path.join(stagingRoot, resolvedScope);
  const files = fs.readdirSync(scopeDir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const results = processStagedFiles(
    files.map((f) => path.join(scopeDir, f)),
    templates,
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

module.exports = {
  resolveMainCheckout,
  classifyBackend,
  parseCommandsTemplates,
  parseStagedPage,
  runFind,
  addParentLink,
  removeParentLink,
  parseBaseBranch,
  parseRemote,
  timeoutMs,
  hashBody,
  run,
};

if (require.main === module) main();
