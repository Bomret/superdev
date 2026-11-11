'use strict';

// run-state-ref.js: the run-state push, which puts a run root's trace, reports, interface file, and dod.md on
// `refs/superdev/<scope>` of the remote when a step ends (ADR 0202, INV-0179).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { gitSpawn } = require('./git-spawn.js');
const { gitCall, lastLine, boundEnded } = require('./push.js');
const { parseRemote } = require('./kb-containment.js');
const { mergeDod } = require('./dod-merge.js');
const { readBytes, stateOf, readSide, writeSide, withRunLock } = require('./run-digest.js');

// dod.md rides the ref because implement's ticks never reach the anchor, the copy adopt reads first. The unpack
// merges it into a local dod.md rather than replacing it (ADR 0206).
// `trace.digest` is `<size> <sha256>` of the pushed `trace.log`; the unpack moves it into the run's digest sidecar.
const TRACE_DIGEST = 'trace.digest';
const HANDOFF_ITEMS = ['trace.log', TRACE_DIGEST, 'reports', 'interfaces.md', 'dod.md'];

// The remote ref of a scope, or null where git cannot use the scope as a ref name.
function refName(scope) {
  const ref = `refs/superdev/${scope}`;
  return scope && !scope.startsWith('-') && gitCall(['check-ref-format', ref], process.cwd()).status === 0 ? ref : null;
}

// The `Remote:` value of the repository's `docs/agents/code-management.md`: `{ remote }`, or `{ note }` naming why none.
function resolveRemote(repo) {
  let text;
  try {
    text = fs.readFileSync(path.join(repo, 'docs', 'agents', 'code-management.md'), 'utf8');
  } catch {
    return { note: 'no docs/agents/code-management.md' };
  }
  // The same reader the containment check uses: it takes both `**Remote:**` and the seeds' `**Remote**:`.
  const remote = parseRemote(text);
  return remote ? { remote } : { note: 'docs/agents/code-management.md has no Remote: value' };
}

// The local ref holding the tip this machine last pushed or fetched for a scope's run-state ref. The remote
// segment is a short hash of the `Remote:` value, because a URL is no valid ref component.
const seenRef = (remote, scope) => `refs/superdev-seen/${crypto.createHash('sha1').update(remote).digest('hex').slice(0, 12)}/${scope}`;

function lastSeenTip(repo, remote, scope) {
  const r = gitCall(['rev-parse', '--verify', '--quiet', '--end-of-options', seenRef(remote, scope)], repo);
  return r.status === 0 ? r.stdout.trim() : null;
}

function recordSeenTip(repo, remote, scope, tip) {
  return gitCall(['update-ref', seenRef(remote, scope), tip], repo).status === 0;
}

// Git run with `input` on stdin.
function gitIn(args, repo, input) {
  return gitSpawn(args, repo, { input, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, LC_ALL: 'C' } });
}

function must(result) {
  if (result.status !== 0) throw new Error(lastLine(result));
  return result.stdout.trim();
}

const treeOf = (lines, repo) => must(gitIn(['mktree'], repo, lines.map((l) => l + '\n').join('')));

// The `mktree` line of one file or directory, written to the object database only; null for anything else.
function entryFor(full, name, repo) {
  let st;
  try {
    st = fs.lstatSync(full);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  if (st.isDirectory()) {
    const lines = fs.readdirSync(full).map((n) => entryFor(path.join(full, n), n, repo)).filter(Boolean);
    return `040000 tree ${treeOf(lines, repo)}\t${name}`;
  }
  // Symlinks and other special files are skipped; every file is recorded as mode 100644.
  if (!st.isFile()) return null;
  return `100644 blob ${must(gitCall(['hash-object', '-w', '--', full], repo))}\t${name}`;
}

// One parentless commit of the handoff items that exist in `root`, built with plumbing only: no checkout's
// working tree, index, or HEAD changes (INV-0179).
function buildCommit(root, repo, scope) {
  const lines = HANDOFF_ITEMS.filter((n) => n !== 'trace.log' && n !== TRACE_DIGEST).map((n) => entryFor(path.join(root, n), n, repo)).filter(Boolean);
  // The trace's digest rides beside it, taken from the very bytes the commit holds, so the two match whatever an appender
  // writes meanwhile (ADR 0225). The run's own sidecar stays local.
  const trace = readBytes(path.join(root, 'trace.log'));
  if (trace !== null) {
    const state = stateOf(trace);
    lines.push(`100644 blob ${must(gitIn(['hash-object', '-w', '--stdin'], repo, trace))}\ttrace.log`);
    lines.push(`100644 blob ${must(gitIn(['hash-object', '-w', '--stdin'], repo, `${state.size} ${state.sha256}\n`))}\t${TRACE_DIGEST}`);
  }
  const tree = treeOf(lines, repo);
  return must(gitCall(['-c', 'user.name=superdev', '-c', 'user.email=superdev@localhost', 'commit-tree', tree, '-m', `run state of ${scope}`], repo));
}

// Puts the run root's handoff items on the remote ref. Best-effort: returns one report line, never throws.
function pushRunState(root, cwd) {
  try {
    const scope = path.basename(path.resolve(root));
    const top = gitCall(['rev-parse', '--show-toplevel'], cwd);
    if (top.status !== 0) return 'run-state: not sent, no git repository';
    const repo = top.stdout.trim();
    const ref = refName(scope);
    if (!ref) return `run-state: not sent, "${scope}" is no usable ref name`;
    const { remote, note } = resolveRemote(repo);
    if (!remote) return `run-state: not sent, ${note}`;
    const tip = buildCommit(root, repo, scope);
    const seen = lastSeenTip(repo, remote, scope);
    const sent = gitCall(['push', `--force-with-lease=${ref}:${seen || ''}`, '--end-of-options', remote, `${tip}:${ref}`], repo, true);
    if (sent.signal != null) return `run-state: not sent, the call was ${boundEnded(repo, sent.signal)}`;
    if (sent.status !== 0) {
      const stale = /stale info|rejected|fetch first/i.test(sent.stderr || '');
      return `run-state: ${stale ? 'refused, the remote ref moved since this machine last saw it' : 'not sent'}: ${lastLine(sent)}`;
    }
    const recorded = recordSeenTip(repo, remote, scope, tip);
    return `run-state: sent to ${remote} ${ref}${recorded ? '' : ' (recording the seen tip failed, the next send will refuse)'}`;
  } catch (e) {
    return `run-state: not sent: ${e.message}`;
  }
}

const lstatOrNull = (p) => {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
};

// Why a `git ls-tree -r -z` entry may not be unpacked, or null. Only regular files are written: a symlink, a
// submodule, an absolute path, or a path with an empty, `.`, `..`, or `.git` segment refuses the whole ref.
function entryRefusal({ mode, type, name }) {
  const segments = name.split('/');
  if (mode !== '100644' && mode !== '100755') return `${name}: mode ${mode} is no regular file`;
  if (type !== 'blob') return `${name}: ${type} entry`;
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.includes('\\')) return `${name}: absolute or drive path`;
  if (segments.some((s) => s === '' || s === '.' || s === '..' || s.toLowerCase() === '.git')) return `${name}: path segment leads outside the run root`;
  return null;
}

// Moves the unpacked `trace.digest` into the run's sidecar as the digest of the unpacked `trace.log`, so the first check of an
// adopted run reports no tamper (ADR 0225). A ref with no `trace.digest` clears the trace's digest, and the first check seals the trace.
function sealUnpackedTrace(root) {
  const file = path.join(root, TRACE_DIGEST);
  const text = readBytes(file);
  const m = text && /^(\d+) ([0-9a-f]{64})\n?$/.exec(text.toString('utf8'));
  withRunLock(root, () => {
    const side = readSide(root);
    if (m) side.trace = { size: Number(m[1]), sha256: m[2] };
    else delete side.trace;
    writeSide(root, side);
  });
  fs.rmSync(file, { force: true });
}

// Fetches the scope's run-state ref and unpacks its handoff items into `root`, then records the fetched tip as
// this machine's last-seen tip. A local trace.log or reports/ keeps and skips the unpack with no tip recorded, so
// the next send refuses. Best-effort: returns one report line, never throws.
function fetchRunState(root, cwd) {
  try {
    const scope = path.basename(path.resolve(root));
    const top = gitCall(['rev-parse', '--show-toplevel'], cwd);
    if (top.status !== 0) return 'run-state: not fetched, no git repository';
    const repo = top.stdout.trim();
    const ref = refName(scope);
    if (!ref) return `run-state: not fetched, "${scope}" is no usable ref name`;
    const { remote, note } = resolveRemote(repo);
    if (!remote) return `run-state: not fetched, ${note}`;
    const local = ['trace.log', 'reports'].filter((n) => lstatOrNull(path.join(root, n)));
    if (local.length) return `run-state: kept the local ${local.join(' and ')}, unpack skipped, dod.md stays the local copy; the next send refuses until the remote ref is read`;
    const got = gitCall(['fetch', '--end-of-options', remote, ref], repo, true);
    if (got.signal != null) return `run-state: not fetched, the call was ${boundEnded(repo, got.signal)}`;
    if (got.status !== 0) {
      return /couldn't find remote ref/i.test(got.stderr || '')
        ? `run-state: not fetched, no ${ref} on ${remote}`
        : `run-state: not fetched: ${lastLine(got)}`;
    }
    const tip = must(gitCall(['rev-parse', '--verify', 'FETCH_HEAD^{commit}'], repo));
    const listed = gitCall(['ls-tree', '-r', '-z', '--full-tree', tip], repo).stdout.split('\0').filter(Boolean).map((e) => {
      const tab = e.indexOf('\t');
      const [mode, type, sha] = e.slice(0, tab).split(' ');
      return { mode, type, sha, name: e.slice(tab + 1) };
    });
    for (const e of listed) {
      const why = entryRefusal(e);
      if (why) return `run-state: not fetched, refused tree entry ${why}`;
    }
    const keptInterfaces = lstatOrNull(path.join(root, 'interfaces.md')) !== null;
    const wanted = listed
      .filter((e) => !(keptInterfaces && e.name === 'interfaces.md'))
      .filter((e) => HANDOFF_ITEMS.some((n) => e.name === n || e.name.startsWith(n + '/')));
    let dodNote = '';
    const blobs = wanted.map((e) => {
      const r = gitSpawn(['cat-file', 'blob', e.sha], repo, { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] });
      if (r.status !== 0) throw new Error(`cannot read ${e.name}`);
      if (e.name !== 'dod.md') return { name: e.name, data: r.stdout };
      // The local dod.md, written from the anchor, decides the criteria; the ref's copy fills its noteless lines.
      const localDod = lstatOrNull(path.join(root, 'dod.md')) ? fs.readFileSync(path.join(root, 'dod.md'), 'utf8') : null;
      if (localDod === null) {
        dodNote = '; dod.md taken from the ref';
        return { name: e.name, data: r.stdout };
      }
      const { text, kept } = mergeDod(localDod, r.stdout.toString('utf8'));
      dodNote = `; dod.md merged into the local copy, ${kept} verdict${kept === 1 ? '' : 's'} from the ref`;
      return { name: e.name, data: Buffer.from(text, 'utf8') };
    });
    // Unpack into a staging directory, then rename each top-level item into place, so a write error leaves no partial unpack.
    fs.mkdirSync(root, { recursive: true });
    // A killed adopt leaves its staging directory behind; clear every one before staging anew.
    for (const n of fs.readdirSync(root)) {
      if (n.startsWith('.run-state-')) fs.rmSync(path.join(root, n), { recursive: true, force: true });
    }
    const stage = fs.mkdtempSync(path.join(root, '.run-state-'));
    try {
      for (const b of blobs) {
        const dest = path.join(stage, ...b.name.split('/'));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, b.data, { flag: 'wx' });
      }
      // simplicity: the renames are not atomic as a set. A failure part-way leaves the items already renamed in place; a killed process leaves its .run-state-* directory, which the next adopt removes.
      for (const n of fs.readdirSync(stage)) fs.renameSync(path.join(stage, n), path.join(root, n));
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
    sealUnpackedTrace(root);
    const recorded = recordSeenTip(repo, remote, scope, tip);
    const kept = keptInterfaces && listed.some((e) => e.name === 'interfaces.md') ? '; kept the local interfaces.md, the next send overwrites the remote copy' : '';
    return `run-state: fetched ${blobs.length} files from ${remote} ${ref}${dodNote}${kept}${recorded ? '' : ' (recording the seen tip failed, the next send will refuse)'}`;
  } catch (e) {
    return `run-state: not fetched: ${e.message}`;
  }
}

// Deletes the run-state ref from the remote, with no lease, and clears the local seen ref. Best-effort: returns one
// report line, never throws. A ref already gone, or no `Remote:` value, is no error.
function deleteRunState(root, cwd) {
  try {
    const scope = path.basename(path.resolve(root));
    const top = gitCall(['rev-parse', '--show-toplevel'], cwd);
    if (top.status !== 0) return 'run-state: not deleted, no git repository';
    const repo = top.stdout.trim();
    const ref = refName(scope);
    if (!ref) return `run-state: not deleted, "${scope}" is no usable ref name`;
    const { remote, note } = resolveRemote(repo);
    if (!remote) return `run-state: not deleted, ${note}`;
    const sent = gitCall(['push', '--delete', '--end-of-options', remote, ref], repo, true);
    if (sent.signal != null) return `run-state: not deleted, the call was ${boundEnded(repo, sent.signal)}`;
    const absent = sent.status !== 0 && /remote ref does not exist/i.test(sent.stderr || '');
    if (sent.status !== 0 && !absent) return `run-state: not deleted: ${lastLine(sent)}`;
    gitCall(['update-ref', '-d', seenRef(remote, scope)], repo);
    return absent ? `run-state: no ref ${ref} on ${remote}` : `run-state: deleted ${remote} ${ref}`;
  } catch (e) {
    return `run-state: not deleted: ${e.message}`;
  }
}

module.exports = { pushRunState, fetchRunState, deleteRunState };
