'use strict';

// scope-branch.js: the shape rule that names a scope's branch, the branch listing it reads, and the `branch` verb that prints one verdict (ADR 0263, INV-0196).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { CHANGE_TYPES, readLedgerHeader } = require('./ledger.js');
const { fail } = require('./refusal.js');

// The shape rule: a scope branch is `<type>/<scope>`, the leading segment a change type and the last segment the scope's slug.
// Returns every match of `names` in iteration order. `slice/<scope>/<id>` never matches: its last segment is the slice id.
function shapeMatches(names, scope) {
  const out = [];
  for (const name of names) {
    const cut = name.lastIndexOf('/');
    if (cut < 1) continue;
    if (name.slice(cut + 1) === scope && CHANGE_TYPES.includes(name.slice(0, cut))) out.push(name);
  }
  return out;
}

// The branch names `git for-each-ref` lists: `{ local, remote }` as sets of bare names (a remote-tracking name has its remote
// dropped, and `<remote>/HEAD` is no branch), or `{ failure }` naming how git could not list them. A failed listing is no listing
// of zero branches (INV-0194, INV-0043). Exit 0 with no output lists none. spawnSync also sets `error` on a git that started,
// such as ENOBUFS past maxBuffer, so only ENOENT and EACCES read as git unable to start.
function listBranches(cwd) {
  const res = spawnSync('git', ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'], { cwd, encoding: 'utf8' });
  if (res.error) {
    const how = ['ENOENT', 'EACCES'].includes(res.error.code) ? 'could not start' : 'failed';
    return { failure: `${how} (${res.error.code || res.error.message})` };
  }
  if (res.status === null) return { failure: `was ended by signal ${res.signal}` };
  if (res.status !== 0) return { failure: `exited with status ${res.status}` };
  const local = new Set();
  const remote = new Set();
  for (const raw of res.stdout.split('\n')) {
    const ref = raw.trim();
    if (ref.startsWith('refs/heads/')) {
      local.add(ref.slice('refs/heads/'.length));
      continue;
    }
    if (!ref.startsWith('refs/remotes/')) continue;
    const rest = ref.slice('refs/remotes/'.length);
    const cut = rest.indexOf('/');
    if (cut < 1) continue;
    const name = rest.slice(cut + 1);
    if (name !== 'HEAD') remote.add(name);
  }
  return { local, remote };
}

// The scope's branch verdict as data, for the run root `root` (its directory name is the scope slug), read in `cwd`:
// `{ verdict: 'ledger', branch }` when the ledger's `**Branch:**` line names a local branch (a tag, a SHA, or a name never cut does not),
// else the shape scan over local and remote-tracking names: `guess` (one match), `guess-remote` (one match, remote-tracking only),
// `ambiguous` with `branches` (several), `none`; `{ verdict: 'git-failed', reason }` when the listing fails.
function resolveScopeBranch(cwd, root) {
  const listing = listBranches(cwd);
  if (listing.failure) return { verdict: 'git-failed', reason: listing.failure };
  let ledgerBranch = null;
  try {
    ledgerBranch = readLedgerHeader(fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'), 'Branch');
  } catch {
    ledgerBranch = null;
  }
  if (ledgerBranch && listing.local.has(ledgerBranch)) return { verdict: 'ledger', branch: ledgerBranch };
  const matches = shapeMatches(new Set([...listing.local, ...listing.remote]), path.basename(root));
  if (matches.length === 0) return { verdict: 'none' };
  if (matches.length > 1) return { verdict: 'ambiguous', branches: matches };
  return { verdict: listing.local.has(matches[0]) ? 'guess' : 'guess-remote', branch: matches[0] };
}

// `branch --root <run-root>` prints one line: `ledger <b>`, `guess <b>`, `guess-remote <b>`, `ambiguous <b> <b>…`, `none`, or
// `git-failed <reason>`. It reads the ledger and git and writes nothing; every verdict exits 0 and the caller judges it.
function verbBranch(cwd, args) {
  const i = args.indexOf('--root');
  if (i < 0) fail('missing --root <run-root> (the absolute run-root path)');
  const root = args[i + 1];
  if (!root) fail('--root needs a path');
  const rest = args.filter((_, j) => j !== i && j !== i + 1);
  if (rest.length) fail(`branch: unrecognized argument "${rest[0]}"`);
  const r = resolveScopeBranch(cwd, root);
  console.log(r.verdict === 'ambiguous' ? `ambiguous ${r.branches.join(' ')}` : r.verdict === 'git-failed' ? `git-failed ${r.reason}` : r.branch ? `${r.verdict} ${r.branch}` : r.verdict);
}

module.exports = { shapeMatches, listBranches, resolveScopeBranch, verbBranch };
