'use strict';

// kb-read.js: the read-only `--read <title>` entry, which finds and reads one page and prints its
// body and hash, writing nothing and moving no staged file.
//
// `--read <title>` is a read-only entry point (ADR 0094, INV-0091): `find` then `read`, under the
// same time bound as every other call. It prints `{"title","exists","body","hash"}` on stdout, where
// `hash` is the sha256 of `read`'s stdout normalised for CRLF and a trailing newline, so two reads
// of an unchanged page agree.

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { resolveMainCheckout } = require('./kb-staging.js');
const { classifyBackend, liveTemplates } = require('./kb-backend-config.js');
const { runFind, runVerb, spawnFailure, exited, hashBody } = require('./kb-backend.js');

// A read-only invocation for one page title: `find` then `read`, under the same bound as every
// other backend call. Writes nothing to the backend and moves no staged file. A page `find` does
// not find reads as not existing, and that is a success (exit 0), not a refusal.
function readPage(title, templates) {
  if (!templates.read) return { ok: false, reason: 'no read command configured' };
  const found = runFind(title, templates);
  if (found.verdict === 'unknown') return { ok: false, reason: found.reason, timedOut: found.timedOut };
  if (found.verdict === 'absent') return { ok: true, exists: false };
  const res = runVerb(templates, 'read', { title, found: found.fields });
  if (res.error) return { ok: false, ...spawnFailure('read', res) };
  if (res.status !== 0) return { ok: false, reason: exited('read', res) };
  if (!res.stdout) return { ok: false, reason: 'read returned an empty body' };
  return { ok: true, exists: true, body: res.stdout, hash: hashBody(res.stdout) };
}

// Resolves the backend the same way `run()` does, then runs the read entry and prints its JSON
// report on stdout. Refuses (via `fail`, caught by `main()`) the same way `run()`'s own backend
// resolution does, plus every reason `readPage` names.
function runReadEntry(cwd, title) {
  const mainCheckout = resolveMainCheckout(cwd);
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
  const result = readPage(title, liveTemplates(backend.templates, cwd));
  if (!result.ok) fail(result.reason);
  const out = result.exists
    ? { title, exists: true, body: result.body, hash: result.hash }
    : { title, exists: false, body: null, hash: null };
  console.log(JSON.stringify(out));
}

module.exports = { runReadEntry };
