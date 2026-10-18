'use strict';

// kb-backend.js: runs a backend's command templates under `sh -c` and sends one page through them,
// by `upsert`, `delete`, or `patch`, with the live-body hash guard.
//
// A **Backend command contract** is the five named shell templates — `find`, `read`, `create`,
// `update`, `delete` — declared under `docs/agents/knowledge-base.md`'s `## Commands` section, one
// `### <verb>` subsection each. A verb runs under `sh -c` (`sh` resolved from
// PATH: Git's `sh.exe` on Windows, ADR 0150), passing every value as an environment variable —
// never interpolated into the command string — so a title
// carrying a quote, a `$`, a backtick, or a newline reaches the backend unchanged and runs no shell
// of its own (CONTEXT.md → *Backend command contract*, ADR 0069).

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { merge } = require('./md-sections.js');
const { markStagedCreate } = require('./kb-staged-page.js');

// --- the live-body hash (ADR 0094) -----------------------------------------------------------
//
// The sha256 of a `read` call's stdout, normalised for CRLF line endings and a trailing newline,
// so two reads of an unchanged page agree regardless of which line-ending convention or trailing
// newline the backend happens to hand back on a given call.
function normalizeBody(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n+$/, '');
}

function hashBody(text) {
  return crypto.createHash('sha256').update(normalizeBody(text), 'utf8').digest('hex');
}

// --- running a backend template -------------------------------------------------------------

// Every value crosses as an environment variable, never interpolated into the command string, so
// no value can start a shell of its own. `sh -c <template>` is the only shell invoked.
// ADR 0130. A host that accepts the connection and never answers blocks `spawnSync` for as long as
// the kernel's own TCP connect timeout runs — minutes, per page. The bound lives here rather than in
// the templates, so it covers an operator-written template that carries no `curl --max-time` of its
// own. `lib/containment.js`'s `testContainment` bounds its own `git fetch` the same way.
//
// The override deliberately sits OUTSIDE the `SUPERDEV_KB_` prefix: `fieldsToEnv` forwards every key
// a `find` result carries as `SUPERDEV_KB_<KEY>`, so a backend returning `timeout_ms` would
// otherwise rewrite the bound from the wire. A value that is not a positive integer — empty, a word,
// zero, negative — reads as absent rather than as "no bound" or "kill immediately".
const DEFAULT_TIMEOUT_MS = 30000;

function timeoutMs() {
  const raw = process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS;
  if (!raw || !/^\d+$/.test(raw.trim())) return DEFAULT_TIMEOUT_MS;
  const n = Number(raw.trim());
  return n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

// `spawnSync` reports an exhausted `timeout` as an `ETIMEDOUT` error. A `maxBuffer` overflow and a
// shell that will not start land in the same `error` field and are NOT this: neither says anything
// about the host, so neither stops the batch below.
function timedOut(res) {
  return Boolean(res.error) && res.error.code === 'ETIMEDOUT';
}

function runTemplate(template, env) {
  return spawnSync('sh', ['-c', template], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: timeoutMs(),
    killSignal: 'SIGKILL',
  });
}

// The one reason shape a timeout produces, and the flag that stops the batch. Every `res.error` site
// routes through this so the two never drift apart.
function spawnFailure(verb, res) {
  if (timedOut(res)) return { reason: `${verb} timed out after ${timeoutMs()}ms`, timedOut: true };
  if (res.error.code === 'ENOENT') {
    return { reason: `${verb} could not run: no \`sh\` on PATH (on Windows, install Git for Windows)` };
  }
  return { reason: `${verb} could not run (${res.error.message})` };
}

// A nonzero exit's reason: the exit status plus a bounded tail of the template's stderr, which
// carries the cause a template names before it exits (the login line's missing or ambiguous login).
function exited(verb, res) {
  const tail = String(res.stderr || '').replace(/\s+/g, ' ').trim().slice(-300);
  return tail ? `${verb} exited ${res.status}: ${tail}` : `${verb} exited ${res.status}`;
}

// The `SUPERDEV_KB_` prefix already makes any key harmless to forward (it can never clobber PATH,
// IFS, or LD_PRELOAD), but a key outside `[A-Za-z0-9_]` (a hyphen, a dot, ...) still produces a
// variable name no POSIX shell can address as one token. The key is forwarded regardless — an
// unnamed, open-ended backend deserves the value reaching its environment — but a warning names
// the key and the unreachable variable, since silence would just lose it with no diagnostic.
function fieldsToEnv(fields) {
  const env = {};
  for (const [k, v] of Object.entries(fields)) {
    const varName = `SUPERDEV_KB_${k.toUpperCase()}`;
    if (!/^[A-Za-z0-9_]+$/.test(k)) {
      process.stderr.write(
        `publish-kb: warning: find returned key "${k}", which no shell can address as a variable ` +
          `(${varName} parses as separate tokens) — its value may be unreachable to the backend command\n`,
      );
    }
    env[varName] = String(v);
  }
  return env;
}

// The `find` contract every other verb rests on (ADR 0069):
//   exit 0, JSON object on stdout  → 'found', its keys become SUPERDEV_KB_<KEY> for later verbs
//   exit 3                         → 'absent' — positive absence, the only outcome that may create
//   anything else                  → 'unknown' — the backend could not answer; leave the page staged
function runFind(title, templates) {
  if (!templates.find) return { verdict: 'unknown', reason: 'no find command configured' };
  const res = runTemplate(templates.find, { SUPERDEV_KB_TITLE: title });
  if (res.error) return { verdict: 'unknown', ...spawnFailure('find', res) };
  if (res.status === 3) return { verdict: 'absent' };
  if (res.status === 0) {
    let obj = null;
    try {
      obj = JSON.parse(res.stdout);
    } catch {
      obj = null;
    }
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return { verdict: 'found', fields: obj };
    return { verdict: 'unknown', reason: 'find exited 0 but stdout was not a JSON object' };
  }
  return { verdict: 'unknown', reason: exited('find', res) };
}

// The hash guard on an existing page (ADR 0094, INV-0091): a staged `upsert` replacing a page that
// already exists is checked against the live body it was built from before it is allowed to
// overwrite it. `publishUpsert` skips this only where the page carries a `created-by-publish`
// marker AND no recorded `live-hash` — a marked retry with no hash to check is this run's own
// create landing, and sends `update` directly instead. A recorded `live-hash` is always checked,
// marker or not.
//   a recorded hash that differs from the live body's   -> refuse
//   no recorded hash at all                              -> refuse (nothing to check it against)
//   a recorded hash that matches                          -> proceed
// A backend with no `read` command can never answer the check, so an existing page is refused
// under it regardless of what the staged page recorded.
function checkLiveHash(title, templates, found, recordedHash) {
  if (!recordedHash) {
    return { ok: false, reason: 'no live-hash recorded for an existing page — refusing to overwrite it blind' };
  }
  if (!templates.read) {
    return { ok: false, reason: 'no read command configured — an existing page cannot be checked against its recorded live-hash' };
  }
  const env = { ...fieldsToEnv(found.fields), SUPERDEV_KB_TITLE: title };
  const res = runTemplate(templates.read, env);
  if (res.error) return { ok: false, ...spawnFailure('read', res) };
  if (res.status !== 0) return { ok: false, reason: exited('read', res) };
  if (!res.stdout) return { ok: false, reason: 'read returned an empty body' };
  if (hashBody(res.stdout) !== recordedHash) {
    return { ok: false, reason: 'the live page has changed since this page was staged (live-hash mismatch) — refusing to overwrite it' };
  }
  return { ok: true };
}

// A staged `parent:` names the title of the page a new page is created under (ADR 0109). It is
// resolved through the backend's own `find`, only on create — an update never moves a page. A
// parent that is absent or unanswerable leaves the page staged rather than creating it elsewhere.
function resolveParent(parentTitle, templates) {
  if (!parentTitle) return { ok: true, env: {} };
  // A create template from an earlier seed never reads the id, so the page would land elsewhere.
  if (!templates.create.includes('SUPERDEV_KB_PARENT_ID')) {
    return { ok: false, reason: `the create command never reads SUPERDEV_KB_PARENT_ID, so parent "${parentTitle}" would be ignored — update it from the seed (/superdev:setup check)` };
  }
  const found = runFind(parentTitle, templates);
  if (found.verdict === 'absent') return { ok: false, reason: `parent page "${parentTitle}" not found` };
  if (found.verdict === 'unknown') return { ok: false, reason: `parent page "${parentTitle}": ${found.reason}`, timedOut: found.timedOut };
  if (found.fields.id === undefined) return { ok: false, reason: `parent page "${parentTitle}": find returned no id` };
  return { ok: true, env: { SUPERDEV_KB_PARENT_ID: String(found.fields.id) } };
}

function publishUpsert(title, bodyFile, templates, recordedHash, hasCreateMarker, filePath, parentTitle) {
  const found = runFind(title, templates);
  if (found.verdict === 'unknown') return { ok: false, reason: found.reason, timedOut: found.timedOut };
  if (found.verdict === 'absent') {
    if (!templates.create) return { ok: false, reason: 'no create command configured' };
    const parent = resolveParent(parentTitle, templates);
    if (!parent.ok) return parent;
    if (!recordedHash) {
      const marker = markStagedCreate(filePath);
      if (!marker.ok) return { ok: false, reason: marker.reason };
    }
    const res = runTemplate(templates.create, { SUPERDEV_KB_TITLE: title, SUPERDEV_KB_BODY_FILE: bodyFile, ...parent.env });
    if (res.error) return { ok: false, ...spawnFailure('create', res) };
    if (res.status !== 0) return { ok: false, reason: exited('create', res) };
    return { ok: true, action: 'created' };
  }
  if (recordedHash || !hasCreateMarker) {
    const guard = checkLiveHash(title, templates, found, recordedHash);
    if (!guard.ok) return { ok: false, reason: guard.reason, timedOut: guard.timedOut };
  }
  if (!templates.update) return { ok: false, reason: 'no update command configured' };
  const env = { ...fieldsToEnv(found.fields), SUPERDEV_KB_TITLE: title, SUPERDEV_KB_BODY_FILE: bodyFile };
  const res = runTemplate(templates.update, env);
  if (res.error) return { ok: false, ...spawnFailure('update', res) };
  if (res.status !== 0) return { ok: false, reason: exited('update', res) };
  return { ok: true, action: 'updated' };
}

function publishDelete(title, templates) {
  const found = runFind(title, templates);
  if (found.verdict === 'unknown') return { ok: false, reason: found.reason, timedOut: found.timedOut };
  if (found.verdict === 'absent') return { ok: true, action: 'already-absent' };
  if (!templates.delete) return { ok: false, reason: 'no delete command configured' };
  const env = { ...fieldsToEnv(found.fields), SUPERDEV_KB_TITLE: title };
  const res = runTemplate(templates.delete, env);
  if (res.error) return { ok: false, ...spawnFailure('delete', res) };
  if (res.status !== 0) return { ok: false, reason: exited('delete', res) };
  return { ok: true, action: 'deleted' };
}

function writeTempBody(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-body-'));
  const file = path.join(dir, 'body.md');
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

// Applies one `action: patch` file (ADR 0027, ADR 0069). `merge()` is the only place that ever
// touches page content — pure string in, string out, no subprocess and no temp file — so the
// live page is fetched via `read` and the merged body sent back via `create`/`update` exactly
// like an upsert.
//
// `assumeExists`: true once an earlier file in this file's title-group has already created or
// updated the live page in this run. It is not merely an optimisation — it structurally removes
// `create` from what this call can do, so a `find` that (wrongly) still answers "absent" for a
// page this run just created can never trigger a second, section-wiping create. That guarantee
// holds regardless of what `find` answers, rather than depending on `find` behaving consistently.
function publishPatch(title, stagedRaw, templates, assumeExists, parentTitle) {
  if (templates.bodyFormat && templates.bodyFormat !== 'markdown') {
    return {
      ok: false,
      reason: `the backend's body format is ${templates.bodyFormat}, not markdown — kb-patch.js merges markdown headings, so a patch would append unrendered markdown instead (ADR 0027)`,
    };
  }
  if (!templates.read) return { ok: false, reason: 'no read command configured' };
  const found = runFind(title, templates);
  if (found.verdict === 'unknown') return { ok: false, reason: found.reason, timedOut: found.timedOut };
  if (found.verdict === 'absent' && assumeExists) {
    return {
      ok: false,
      reason: 'find reports the page absent right after this run created it — a stale answer, so nothing is created again',
    };
  }
  const isAbsent = found.verdict === 'absent';
  let liveText = '';
  if (!isAbsent) {
    const env = { ...fieldsToEnv(found.fields), SUPERDEV_KB_TITLE: title };
    const res = runTemplate(templates.read, env);
    if (res.error) return { ok: false, ...spawnFailure('read', res) };
    if (res.status !== 0) return { ok: false, reason: exited('read', res) };
    // A read call answering with no body for a title `find` DID list is a read failure, never an
    // empty live page (ADR 0027's amendment) — treating it as one would create the page from this
    // one section alone, wiping every section already on it.
    if (!res.stdout) return { ok: false, reason: 'read returned an empty body' };
    liveText = res.stdout;
  }

  let merged;
  try {
    merged = merge(liveText, stagedRaw);
  } catch (e) {
    return { ok: false, reason: e.message };
  }

  const bodyFile = writeTempBody(merged);
  try {
    if (isAbsent) {
      if (!templates.create) return { ok: false, reason: 'no create command configured' };
      const parent = resolveParent(parentTitle, templates);
      if (!parent.ok) return parent;
      const res = runTemplate(templates.create, { SUPERDEV_KB_TITLE: title, SUPERDEV_KB_BODY_FILE: bodyFile, ...parent.env });
      if (res.error) return { ok: false, ...spawnFailure('create', res) };
      if (res.status !== 0) return { ok: false, reason: exited('create', res) };
      return { ok: true, action: 'created' };
    }
    if (!templates.update) return { ok: false, reason: 'no update command configured' };
    const env = { ...fieldsToEnv(found.fields), SUPERDEV_KB_TITLE: title, SUPERDEV_KB_BODY_FILE: bodyFile };
    const res = runTemplate(templates.update, env);
    if (res.error) return { ok: false, ...spawnFailure('update', res) };
    if (res.status !== 0) return { ok: false, reason: exited('update', res) };
    return { ok: true, action: 'updated' };
  } finally {
    try {
      fs.rmSync(path.dirname(bodyFile), { recursive: true, force: true });
    } catch {
      // the backend call already landed — a leftover temp dir must not abort the batch either
    }
  }
}

module.exports = {
  hashBody,
  timeoutMs,
  runTemplate,
  spawnFailure,
  exited,
  fieldsToEnv,
  runFind,
  publishUpsert,
  publishDelete,
  publishPatch,
  writeTempBody,
};
