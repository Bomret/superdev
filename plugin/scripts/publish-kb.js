#!/usr/bin/env node
'use strict';

// publish-kb.js: the backend-independent half of publishing a repo's staged knowledge-base pages
// (ADR 0069). Carries `action: upsert`, `action: delete`, and `action: patch` end to end.
// `action: patch` merges one aggregate-page section by heading, via `kb-patch.js`'s `merge()`
// (ADR 0027): the live body comes from `read`, never from `find`, and a backend declaring no
// `read` template leaves every `patch` page staged instead.
//
// A **Staged page** is one `.md` file under `.superdev/kb-pending/<scope>/`, carrying YAML
// frontmatter with a page `title` and an `action` of `upsert`, `patch`, or `delete`, the page body
// below (CONTEXT.md → *Staged page*).
//
// A **Backend command contract** is the five named shell templates — `find`, `read`, `create`,
// `update`, `delete` — declared under `docs/agents/knowledge-base.md`'s `## Commands` section, one
// `### <verb>` subsection each. This script resolves a verb **by heading name, never by position**
// (CONTEXT.md → *Backend command contract*, ADR 0069) and runs it under `/bin/sh -c`, passing every
// value as an environment variable — never interpolated into the command string — so a title
// carrying a quote, a `$`, a backtick, or a newline reaches the backend unchanged and runs no shell
// of its own.
//
// `--read <title>` is a read-only entry point (ADR 0094, INV-0091): `find` then `read`, under the
// same time bound as every other call, writing nothing and moving no staged file. It prints
// `{"title","exists","body","hash"}` on stdout, where `hash` is the sha256 of `read`'s stdout
// normalised for CRLF and a trailing newline, so two reads of an unchanged page agree. A staged
// `upsert` may carry the hash it was built from as a `live-hash` frontmatter key; before an upsert
// replaces an existing page, that recorded hash is checked against the live page, and the upsert is
// refused (staying staged, with the refusal reported per page) when it differs or is absent — unless
// the staged file instead carries a `created-by-publish` marker (ADR 0094, ADR 0076), written just
// before this same run sent it as a `create`: a page found existing under that marker is this run's
// own create landing, and is sent as an `update` with no live-hash check. A recorded `live-hash`
// always wins over the marker: the marker only ever substitutes for a live-hash that was never
// recorded, never overrides one that was.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');
const { SLUG_RE, readLedgerHeader, testContainment } = require('./scope.js');
const { maskFencedLines, merge, headingKeyOf } = require('./kb-patch.js');

function fail(msg) {
  const err = new Error(msg);
  err.isRefusal = true;
  throw err;
}

// --- staging root --------------------------------------------------------------------------
//
// `<run-root>/scopetree` sits INSIDE `.superdev/`, so a checkout-relative
// `.superdev/kb-pending/` resolves one level too deep from a scopetree's own cwd. Resolving
// from the parent of `git rev-parse --path-format=absolute --git-common-dir` reaches the
// repository's main checkout from any cwd, scopetree included (skills/publish-kb/SKILL.md §1).
function resolveMainCheckout(cwd) {
  let gitCommonDir;
  try {
    gitCommonDir = execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd, encoding: 'utf8' },
    ).trim();
  } catch (e) {
    fail(`cannot resolve the repository's main checkout: ${e.message}`);
  }
  return path.dirname(gitCommonDir);
}

// Each subdirectory of the staging root holding at least one `.md` file is one pending scope.
function listPendingScopes(stagingRoot) {
  const counts = new Map();
  let dirents;
  try {
    dirents = fs.readdirSync(stagingRoot, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return counts;
    throw e;
  }
  for (const d of dirents.filter((e) => e.isDirectory())) {
    const n = fs.readdirSync(path.join(stagingRoot, d.name)).filter((f) => f.endsWith('.md')).length;
    if (n > 0) counts.set(d.name, n);
  }
  return counts;
}

// `_adhoc` is the internal literal `/superdev:document` writes for a doc pass outside a live
// scope, not external input, so the scope-slug charset does not apply to it.
function resolveScope(pending, requested) {
  if (requested) {
    if (requested !== '_adhoc' && !SLUG_RE.test(requested)) {
      fail(`--scope "${requested}" fails the scope-slug charset ${SLUG_RE}`);
    }
    if (!pending.has(requested)) fail(`no staged knowledge-base pages under scope "${requested}"`);
    return requested;
  }
  if (pending.size === 0) fail('No staged knowledge-base pages in this repo.');
  if (pending.size === 1) return [...pending.keys()][0];
  const lines = [...pending.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([s, n]) => `  ${s}: ${n} staged page${n === 1 ? '' : 's'}`);
  fail(`more than one pending scope — pass --scope <slug>:\n${lines.join('\n')}`);
}

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

// --- backend config -------------------------------------------------------------------------

const VERBS = ['find', 'read', 'create', 'update', 'delete'];

// Extracts one `## <headingText>` section's body: everything up to the next `## ` heading (or
// EOF). Used for `## Commands` itself.
function extractH2Section(text, headingText) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${headingText}`);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

// Resolution is BY HEADING NAME, never by position: each verb's fenced block is found inside its
// own named `### <verb>` subsection, so a fenced block inserted or removed elsewhere never shifts
// which template a later verb reads (the exact hazard ADR 0069 names in `hooks/green-gate.js`).
function parseCommandsTemplates(sectionText) {
  const lines = sectionText.split('\n');
  const templates = {};
  for (const verb of VERBS) {
    const start = lines.findIndex((l) => l.trim().toLowerCase() === `### ${verb}`);
    if (start === -1) continue;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      if (/^###\s+/.test(lines[i])) {
        end = i;
        break;
      }
    }
    const sub = lines.slice(start + 1, end).join('\n');
    const fence = sub.match(/```[^\n]*\n([\s\S]*?)```/);
    if (fence) templates[verb] = fence[1].replace(/\n$/, '');
  }
  return templates;
}

// Classifies `docs/agents/knowledge-base.md`. `docText === null` means the file is absent, which
// reads the same as a configured `none` backend. `local`/`none` publish nothing (a local backend's
// pages are repository files, ADR 0023) and `unconfigured` is a repo whose knowledge base is a real
// remote backend that has not been migrated to the `## Commands` shape yet.
function classifyBackend(docText) {
  if (docText === null) {
    return { kind: 'none', reason: 'no knowledge-base configuration (docs/agents/knowledge-base.md is absent) — nothing to publish' };
  }
  const m = docText.match(/^- \*\*Backend:\*\*\s*(.+)$/m);
  const firstWord = m ? m[1].trim().split(/\s+/)[0].toLowerCase().replace(/[.,;:]+$/, '') : null;
  if (firstWord === 'local' || firstWord === 'none') {
    return { kind: firstWord, reason: `the knowledge-base backend is ${firstWord} — nothing to publish` };
  }
  const commands = extractH2Section(docText, 'Commands');
  if (commands === null) return { kind: 'unconfigured' };
  return { kind: 'remote', templates: parseCommandsTemplates(commands) };
}

// --- staged page parsing ---------------------------------------------------------------------

// A minimal YAML scalar reader: a double-quoted value is decoded through JSON (double-quoted YAML
// escapes — \", \\, \n — coincide with JSON's), so a title carrying a quote or a real newline
// survives the round trip; a single-quoted value unescapes YAML's `''`; anything else is taken
// verbatim, which already covers a bare `$` or a backtick (neither needs escaping in YAML flow
// scalars, and neither is ever handed to a shell of its own — see runTemplate below).
function parseScalar(raw) {
  const v = raw.trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
    return v.slice(1, -1).replace(/''/g, "'");
  }
  return v;
}

function parseStagedPage(text) {
  const t = text.replace(/\r\n/g, '\n');
  if (!t.startsWith('---\n')) return null;
  const end = t.indexOf('\n---', 3);
  if (end === -1) return null;
  const fm = t.slice(4, end);
  const body = t.slice(t.indexOf('\n', end + 1) + 1);
  const data = {};
  for (const line of fm.split('\n')) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (m) data[m[1]] = parseScalar(m[2]);
  }
  return {
    title: data.title || null,
    action: data.action || null,
    liveHash: data['live-hash'] || null,
    createdByPublish: data['created-by-publish'] || null,
    body,
  };
}

// Writes the `created-by-publish` marker into a staged file's frontmatter, ahead of the `create`
// call it precedes: the staged file still holds every previous byte, and now also names the
// moment this run sent it as a create. A create killed before it returns leaves the marker on
// disk, so a later run's `find` seeing the page land reads it as this run's own retry (ADR 0076)
// rather than someone else's page (INV-0091), with no `read` call needed to tell the two apart.
//
// Atomic write, the way `scope.js`'s `writeLines` writes its ledger: a temp file in the same
// directory, then a rename over the staged file, so a reader never observes a half-written marker.
// Any fs error here (a read-only staging directory, say) is caught and reported rather than thrown:
// `publishUpsert` never sends the `create` it precedes when the marker itself could not be written.
function markStagedCreate(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { ok: false, reason: 'could not write the retry marker' };
  }
  const t = raw.replace(/\r\n/g, '\n');
  if (!t.startsWith('---\n')) return { ok: true };
  const end = t.indexOf('\n---', 3);
  if (end === -1) return { ok: true };
  // Already marked: a retry re-marks ahead of every `create` call it sends, so writing
  // unconditionally would append a fresh line on each one instead of leaving the first attempt's own
  // timestamp alone.
  if (/^created-by-publish:/m.test(t.slice(4, end))) return { ok: true };
  const marked = `${t.slice(0, end)}\ncreated-by-publish: ${new Date().toISOString()}${t.slice(end)}`;
  const tmpFile = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmpFile, marked, 'utf8');
    fs.renameSync(tmpFile, filePath);
    return { ok: true };
  } catch {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // the write itself already failed — a stray temp file must not mask that
    }
    return { ok: false, reason: 'could not write the retry marker' };
  }
}

// --- running a backend template -------------------------------------------------------------

// Every value crosses as an environment variable, never interpolated into the command string, so
// no value can start a shell of its own. `/bin/sh -c <template>` is the only shell invoked.
// ADR 0076. A host that accepts the connection and never answers blocks `spawnSync` for as long as
// the kernel's own TCP connect timeout runs — minutes, per page. The bound lives here rather than in
// the templates, so it covers an operator-written template that carries no `curl --max-time` of its
// own. `scope.js`'s `testContainment` bounds its own `git fetch` the same way.
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
  return spawnSync('/bin/sh', ['-c', template], {
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
  return { reason: `${verb} could not run (${res.error.message})` };
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
  return { verdict: 'unknown', reason: `find exited ${res.status}` };
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
  if (res.status !== 0) return { ok: false, reason: `read exited ${res.status}` };
  if (!res.stdout) return { ok: false, reason: 'read returned an empty body' };
  if (hashBody(res.stdout) !== recordedHash) {
    return { ok: false, reason: 'the live page has changed since this page was staged (live-hash mismatch) — refusing to overwrite it' };
  }
  return { ok: true };
}

function publishUpsert(title, bodyFile, templates, recordedHash, hasCreateMarker, filePath) {
  const found = runFind(title, templates);
  if (found.verdict === 'unknown') return { ok: false, reason: found.reason, timedOut: found.timedOut };
  if (found.verdict === 'absent') {
    if (!templates.create) return { ok: false, reason: 'no create command configured' };
    if (!recordedHash) {
      const marker = markStagedCreate(filePath);
      if (!marker.ok) return { ok: false, reason: marker.reason };
    }
    const res = runTemplate(templates.create, { SUPERDEV_KB_TITLE: title, SUPERDEV_KB_BODY_FILE: bodyFile });
    if (res.error) return { ok: false, ...spawnFailure('create', res) };
    if (res.status !== 0) return { ok: false, reason: `create exited ${res.status}` };
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
  if (res.status !== 0) return { ok: false, reason: `update exited ${res.status}` };
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
  if (res.status !== 0) return { ok: false, reason: `delete exited ${res.status}` };
  return { ok: true, action: 'deleted' };
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
function publishPatch(title, stagedRaw, templates, assumeExists) {
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
    if (res.status !== 0) return { ok: false, reason: `read exited ${res.status}` };
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
      const res = runTemplate(templates.create, { SUPERDEV_KB_TITLE: title, SUPERDEV_KB_BODY_FILE: bodyFile });
      if (res.error) return { ok: false, ...spawnFailure('create', res) };
      if (res.status !== 0) return { ok: false, reason: `create exited ${res.status}` };
      return { ok: true, action: 'created' };
    }
    if (!templates.update) return { ok: false, reason: 'no update command configured' };
    const env = { ...fieldsToEnv(found.fields), SUPERDEV_KB_TITLE: title, SUPERDEV_KB_BODY_FILE: bodyFile };
    const res = runTemplate(templates.update, env);
    if (res.error) return { ok: false, ...spawnFailure('update', res) };
    if (res.status !== 0) return { ok: false, reason: `update exited ${res.status}` };
    return { ok: true, action: 'updated' };
  } finally {
    try {
      fs.rmSync(path.dirname(bodyFile), { recursive: true, force: true });
    } catch {
      // the backend call already landed — a leftover temp dir must not abort the batch either
    }
  }
}

// A best-effort identity for a staged patch body's own section heading, used only to catch two
// sibling files in the same title-group naming the same section before either one is applied —
// merge() itself cannot: once the first has landed, the live page carries that heading exactly
// once, so the second would read as an ordinary replace, not a collision. Real shape validation
// (no heading, more than one section, setext, an unterminated fence) still runs inside merge()
// itself when this file's turn in the chain comes; a body this cannot key (a masking failure, or
// no heading at all) simply returns null and is left to that real validation.
function firstHeadingKey(body) {
  try {
    const lines = body.replace(/\r\n/g, '\n').split('\n');
    const masked = maskFencedLines(lines, 'staged body', 'checked');
    const line = masked.find((l) => /^ {0,3}#{1,6}\s+\S/.test(l));
    return line ? headingKeyOf(line) : null;
  } catch {
    return null;
  }
}

// --- per-file application --------------------------------------------------------------------

function writeTempBody(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-body-'));
  const file = path.join(dir, 'body.md');
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

// Reads and parses one staged file without applying it.
function readStagedEntry(filePath) {
  const filename = path.basename(filePath);
  const raw = fs.readFileSync(filePath, 'utf8');
  return { filename, filePath, raw, parsed: parseStagedPage(raw) };
}

// Applies one staged file, in isolation from any title it might share with another staged file
// (see `processTitleGroup` below, which every multi-file title group goes through instead).
// Deletes the staged file only once its call has landed — a page whose call fails stays staged,
// so a later run retries exactly the pages that did not make it. Never deletes on a malformed
// file.
function processFile(entry, templates) {
  const { filename, filePath, raw, parsed } = entry;
  if (!parsed || !parsed.title || !['upsert', 'patch', 'delete'].includes(parsed.action)) {
    const reason = !parsed
      ? 'no YAML frontmatter'
      : !parsed.title
        ? 'no title'
        : `unknown action "${parsed.action}"`;
    return { filename, kind: 'malformed', reason };
  }
  if (parsed.action === 'patch') {
    const result = publishPatch(parsed.title, raw, templates, false);
    if (!result.ok) return { filename, title: parsed.title, kind: 'left-staged', reason: result.reason, timedOut: result.timedOut };
    return clearStagedFile(filePath, filename, parsed.title, result.action);
  }
  if (parsed.action === 'delete') {
    const result = publishDelete(parsed.title, templates);
    if (!result.ok) return { filename, title: parsed.title, kind: 'left-staged', reason: result.reason, timedOut: result.timedOut };
    return clearStagedFile(filePath, filename, parsed.title, result.action === 'already-absent' ? 'already-absent' : 'deleted');
  }
  // upsert
  const bodyFile = writeTempBody(parsed.body);
  try {
    const result = publishUpsert(parsed.title, bodyFile, templates, parsed.liveHash, !!parsed.createdByPublish, filePath);
    if (!result.ok) return { filename, title: parsed.title, kind: 'left-staged', reason: result.reason, timedOut: result.timedOut };
    return clearStagedFile(filePath, filename, parsed.title, result.action);
  } finally {
    try {
      fs.rmSync(path.dirname(bodyFile), { recursive: true, force: true });
    } catch {
      // the backend call already landed — a leftover temp dir must not abort the batch either
    }
  }
}

// Clears the staged file once its backend call has landed. The call already took effect, so a
// failure here (a read-only staging dir, a permissions error) must not abort the rest of the
// batch: the file is reported published/deleted anyway, just not cleared, naming why a later run
// will still find it staged.
function clearStagedFile(filePath, filename, title, publishedKind) {
  try {
    fs.unlinkSync(filePath);
    return { filename, title, kind: publishedKind };
  } catch (e) {
    return { filename, title, kind: 'cleanup-failed', publishedKind, reason: e.message };
  }
}

// Two or more staged files can legitimately share one title: a `patch` filename is
// `<title-slug>--<section-slug>.md`, so an aggregate page's sections arrive as siblings. This is
// the only place that decides what a shared title means.
//
// - Not every file in the group is `action: patch` → the group is ambiguous (a wholesale rewrite
//   sitting next to a section patch, say), so nothing in it publishes; every filename is reported.
// - Every file is `action: patch` → each is applied in turn, re-reading the live page as it then
//   stands, so the second file's merge sees the first file's own section already landed instead of
//   overwriting it. Two files naming the identical section heading are unresolvable (which one
//   wins is not this script's call) and are both left staged instead of one silently overwriting
//   the other once its sibling has landed.
function processTitleGroup(title, group, templates) {
  if (group.length === 1) return [processFile(group[0], templates)];

  if (!group.every((e) => e.parsed.action === 'patch')) {
    const names = group.map((e) => e.filename).join(', ');
    return group.map((e) => ({
      filename: e.filename,
      title,
      kind: 'left-staged',
      reason: `shares the title "${title}" with ${group.length - 1} other staged file(s), not all action: patch (${names})`,
    }));
  }

  const headingOf = new Map(group.map((e) => [e.filename, firstHeadingKey(e.parsed.body)]));
  const filenamesByHeading = new Map();
  for (const [filename, key] of headingOf) {
    if (key === null) continue;
    if (!filenamesByHeading.has(key)) filenamesByHeading.set(key, []);
    filenamesByHeading.get(key).push(filename);
  }
  const duplicated = new Set();
  for (const names of filenamesByHeading.values()) {
    if (names.length > 1) {
      for (const n of names) duplicated.add(n);
    }
  }

  const results = [];
  let assumeExists = false;
  for (let i = 0; i < group.length; i++) {
    const e = group[i];
    if (duplicated.has(e.filename)) {
      const siblings = filenamesByHeading.get(headingOf.get(e.filename)).filter((n) => n !== e.filename);
      results.push({
        filename: e.filename,
        title,
        kind: 'left-staged',
        reason: `carries the same section heading as ${siblings.join(', ')} — which one wins cannot be resolved`,
      });
      continue;
    }
    const result = publishPatch(title, e.raw, templates, assumeExists);
    if (!result.ok) {
      results.push({ filename: e.filename, title, kind: 'left-staged', reason: result.reason, timedOut: result.timedOut });
      if (result.timedOut) {
        // A host that black-holes one call black-holes the next: carrying on to the next sibling
        // in this same group would burn another full bound per remaining page (ADR 0076). Mark
        // them untried, exactly as the outer loop already marks a later group's pages, and stop
        // here — the group's own result still carries `timedOut`, so the outer loop's own
        // `some(r => r.timedOut)` check keeps carrying the stop outward.
        for (const rest of group.slice(i + 1)) {
          results.push({ filename: rest.filename, kind: 'untried', reason: 'the run stopped after a timeout' });
        }
        break;
      }
      continue;
    }
    assumeExists = true;
    results.push(clearStagedFile(e.filePath, e.filename, title, result.action));
  }
  return results;
}

// Groups every staged file in a scope by title (patch filenames legitimately collide by design)
// and applies each group. A malformed file (no title, so no group to join) is reported on its own.
function processStagedFiles(files, templates) {
  const entries = files.map(readStagedEntry);
  const results = [];
  const groups = new Map();
  for (const e of entries) {
    const { filename, parsed } = e;
    if (!parsed || !parsed.title || !['upsert', 'patch', 'delete'].includes(parsed.action)) {
      const reason = !parsed
        ? 'no YAML frontmatter'
        : !parsed.title
          ? 'no title'
          : `unknown action "${parsed.action}"`;
      results.push({ filename, kind: 'malformed', reason });
      continue;
    }
    if (!groups.has(parsed.title)) groups.set(parsed.title, []);
    groups.get(parsed.title).push(e);
  }
  // ADR 0076. A host that black-holes one call black-holes the next, so carrying on would spend the
  // bound once per staged page and reproduce the very hang the bound removes. The remaining titles
  // are reported untried and stay staged, so the next run retries exactly them. Only a timeout stops
  // the walk: every other failure is per page, as it has always been.
  const remaining = [...groups.entries()];
  while (remaining.length > 0) {
    const [title, group] = remaining.shift();
    const groupResults = processTitleGroup(title, group, templates);
    results.push(...groupResults);
    if (groupResults.some((r) => r.timedOut)) {
      const untried = remaining.flatMap(([, g]) => g).map((e) => e.filename);
      for (const filename of untried) {
        results.push({ filename, kind: 'untried', reason: 'the run stopped after a timeout' });
      }
      break;
    }
  }
  return results;
}

// --- the merge check --------------------------------------------------------------------------
//
// Publishing pages for a scope whose work no reader can reach is worth a warning, and never a
// block: every outcome below only ever refuses (naming what it found) unless `--allow-unmerged`
// overrides it, and `_adhoc` — which carries no branch at all — skips the check entirely.

const CHANGE_TYPES = /^(feat|fix|refactor|docs|perf|test|build|ci|chore|style|revert)$/;

function refResolves(ref, cwd) {
  return spawnSync('git', ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`], {
    cwd,
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  }).status === 0;
}

function branchNamesFrom(cwd) {
  const res = spawnSync('git', ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'], {
    cwd,
    encoding: 'utf8',
  });
  const names = new Set();
  if (res.status !== 0 || !res.stdout) return names;
  for (const raw of res.stdout.split('\n')) {
    const ref = raw.trim();
    if (!ref) continue;
    if (ref.startsWith('refs/heads/')) {
      names.add(ref.slice('refs/heads/'.length));
      continue;
    }
    if (!ref.startsWith('refs/remotes/')) continue;
    const rest = ref.slice('refs/remotes/'.length);
    const cut = rest.indexOf('/');
    if (cut < 1) continue;
    const name = rest.slice(cut + 1);
    if (name !== 'HEAD') names.add(name);
  }
  return names;
}

// The shape scan `hooks/scope-prune.js` applies: a branch whose last segment is `scope` and whose
// leading segment is a change type. Duplicated rather than shared — `hooks/` is the only documented
// runtime consumer of `plugin/scripts/`, never the reverse (root AGENTS.md, Child DOX Index).
function shapeScanBranch(cwd, scope) {
  for (const branch of branchNamesFrom(cwd)) {
    const cut = branch.lastIndexOf('/');
    if (cut < 1) continue;
    if (branch.slice(cut + 1) === scope && CHANGE_TYPES.test(branch.slice(0, cut))) return branch;
  }
  return null;
}

// `references/scope-mode.md`'s `## The scope branch`: the ledger's `**Branch:**` line, verified
// before it is trusted — run init writes it before cutting the branch, so a run that died in
// between names one never cut. Falls back to the shape scan for a pre-CLI ledger, a gone/unreadable
// run root, or a line naming a branch that no longer verifies — the steady-state path, since
// `hooks/scope-prune.js` reaps the run root well before most `publish-kb` runs happen. Returns the
// branch name, or null when neither route finds one.
function resolveScopeBranch(mainCheckout, scope) {
  let ledgerText = null;
  try {
    ledgerText = fs.readFileSync(path.join(mainCheckout, '.superdev', 'scopes', scope, 'ledger.md'), 'utf8');
  } catch {
    ledgerText = null;
  }
  if (ledgerText !== null) {
    const branch = readLedgerHeader(ledgerText, 'Branch');
    if (branch && refResolves(branch, mainCheckout)) return branch;
  }
  return shapeScanBranch(mainCheckout, scope);
}

// `docs/agents/code-management.md`'s `- **Base branch:** <value>` bullet (or the `**Base
// branch**:` spelling a seed template carries) — the base ADR 0053's containment test compares
// against. Absent file or bullet -> null, which the caller refuses on rather than skips. A value
// containing whitespace cannot be a git ref, so an unfilled seed placeholder (e.g. "the branch the
// scope branch was cut from (default `main`)") reads as null too, not as a literal base branch.
function parseBaseBranch(docText) {
  if (!docText) return null;
  const m = docText.match(/^-\s*\*\*Base branch:?\*\*:?\s*(.+)$/m);
  if (!m) return null;
  const value = m[1].trim().replace(/^`+/, '').replace(/[`.,;:]+$/, '');
  if (!value || /\s/.test(value)) return null;
  return value;
}

// `docs/agents/code-management.md`'s `- **Remote:** <value>` bullet, parsed with the same `**Remote**:`
// spelling and backtick/punctuation tolerance as `parseBaseBranch` above, but NOT its whitespace
// rejection: every shipped Remote bullet ("- **Remote:** `origin`. Confirm with `git remote -v`.")
// carries a trailing sentence, so rejecting on whitespace would make the bullet unparseable on every
// repo that ships it. `readLedgerHeader`'s own `normalizeHeaderValue` (scope.js) already cuts a
// single-token header value to its first whitespace-delimited token before stripping markup this way;
// this mirrors that. Absent or unparseable -> null: unlike a missing base branch, a missing remote is
// not a refusal — the caller falls back to `testContainment`'s own `origin` default.
function parseRemote(docText) {
  if (!docText) return null;
  const m = docText.match(/^-\s*\*\*Remote:?\*\*:?\s*(.+)$/m);
  if (!m) return null;
  const token = m[1].trim().split(/\s+/)[0];
  const value = token.replace(/^`+/, '').replace(/[`.,;:]+$/, '');
  return value || null;
}

// The check itself. Never throws, never publishes or deletes anything on its own — `run()` decides
// what a refusal means. `{ performed: false }` for `_adhoc`. Otherwise `{ performed: true, ok, ...
// }`: `ok: true` on a contained branch, and on a scope whose branch and run root are both reaped
// (ADR 0071). `ok: false` with a `message` naming the branch (when one
// resolved) and what was found — "no base branch configured", "no branch resolved", "not
// contained", or "names no ref this repository can find" (`testContainment`'s own
// `'could-not-resolve'`, kept distinct from not-contained per slice #494's interface note, so a
// branch that never existed never reads as one that simply hasn't landed yet).
function checkContainment(mainCheckout, scope) {
  if (scope === '_adhoc') return { performed: false };
  let codeMgmtText = null;
  try {
    codeMgmtText = fs.readFileSync(path.join(mainCheckout, 'docs', 'agents', 'code-management.md'), 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const base = parseBaseBranch(codeMgmtText);
  if (!base) {
    return { performed: true, ok: false, message: 'docs/agents/code-management.md names no base branch' };
  }
  const branch = resolveScopeBranch(mainCheckout, scope);
  if (!branch) {
    // `hooks/scope-prune.js` reaps a shipped scope's branch together with its run root (ADR 0071), and
    // gates that reap on the branch already reading contained in base or gone. So no branch AND no run
    // root is the fully-reaped steady state, not a warning: absence stands beside containment. A run
    // root that survives is the real unreachable case — a run that died before cutting its branch, or a
    // branch an operator deleted while it was still unmerged.
    if (!fs.existsSync(path.join(mainCheckout, '.superdev', 'scopes', scope))) {
      return { performed: true, ok: true };
    }
    return { performed: true, ok: false, message: `no branch resolved for scope "${scope}"` };
  }
  const remote = parseRemote(codeMgmtText);
  const verdict = remote ? testContainment(mainCheckout, base, branch, remote) : testContainment(mainCheckout, base, branch);
  if (verdict === 'contained') return { performed: true, ok: true };
  const what = verdict === 'could-not-resolve' ? 'names no ref this repository can find' : `is not contained in ${base}`;
  return { performed: true, ok: false, message: `scope branch "${branch}" ${what}` };
}

// --- the read entry (ADR 0094) ------------------------------------------------------------------
//
// A read-only invocation for one page title: `find` then `read`, under the same bound as every
// other backend call. Writes nothing to the backend and moves no staged file. A page `find` does
// not find reads as not existing, and that is a success (exit 0), not a refusal.
function readPage(title, templates) {
  if (!templates.read) return { ok: false, reason: 'no read command configured' };
  const found = runFind(title, templates);
  if (found.verdict === 'unknown') return { ok: false, reason: found.reason, timedOut: found.timedOut };
  if (found.verdict === 'absent') return { ok: true, exists: false };
  const env = { ...fieldsToEnv(found.fields), SUPERDEV_KB_TITLE: title };
  const res = runTemplate(templates.read, env);
  if (res.error) return { ok: false, ...spawnFailure('read', res) };
  if (res.status !== 0) return { ok: false, reason: `read exited ${res.status}` };
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
  const result = readPage(title, backend.templates);
  if (!result.ok) fail(result.reason);
  const out = result.exists
    ? { title, exists: true, body: result.body, hash: result.hash }
    : { title, exists: false, body: null, hash: null };
  console.log(JSON.stringify(out));
}

// --- report -----------------------------------------------------------------------------------
//
// A page's body never appears here — every line names a filename/title/reason, never stdout a
// backend returned.
function renderReport(scope, backendKind, results, unmerged = false) {
  const lines = [`scope: ${scope}`, `backend: ${backendKind}`];
  if (unmerged) lines.push('unmerged: the scope branch was not confirmed contained — published with --allow-unmerged');
  for (const r of results) {
    if (r.kind === 'created' || r.kind === 'updated') lines.push(`published (${r.kind}): ${r.title}`);
    else if (r.kind === 'deleted') lines.push(`deleted: ${r.title}`);
    else if (r.kind === 'already-absent') lines.push(`already absent, done: ${r.title}`);
    else if (r.kind === 'cleanup-failed') {
      const label = { created: 'published (created)', updated: 'published (updated)', deleted: 'deleted', 'already-absent': 'already absent, done' }[r.publishedKind];
      lines.push(`${label} but not cleared: ${r.title} — ${r.reason}`);
    }
    else if (r.kind === 'left-staged') lines.push(`left staged: ${r.title} — ${r.reason}`);
    else if (r.kind === 'malformed') lines.push(`malformed frontmatter, left untouched: ${r.filename} — ${r.reason}`);
    else if (r.kind === 'untried') lines.push(`left staged, never tried: ${r.filename} — ${r.reason}`);
  }
  const untried = results.filter((r) => r.kind === 'untried').length;
  if (untried > 0) {
    lines.push(`stopped after a timeout: ${untried} page(s) left untried — retry once the host answers`);
  }
  if (results.length === 0) lines.push('nothing staged for this scope');
  return lines.join('\n');
}

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

// `tests/publish-kb.test.js` requires every function below directly (ADR 0059).
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
