'use strict';

// kb-containment.js: resolves a staged scope's branch and checks that base contains it, so a publish
// run never ships pages for work no reader can reach.
//
// Publishing pages for a scope whose work no reader can reach is worth a warning, and never a
// block: every outcome below only ever refuses (naming what it found) unless `--allow-unmerged`
// overrides it, and `_adhoc` — which carries no branch at all — skips the check entirely.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { CHANGE_TYPES, readLedgerHeader } = require('./ledger.js');
const { testContainment } = require('./containment.js');
const { refResolves } = require('./git-spawn.js');

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
// leading segment is a change type, the set `lib/ledger.js` owns. The scan itself stays a copy — a script
// requires no hook, and a hook requires only the `lib/` surface scripts/AGENTS.md lists.
function shapeScanBranch(cwd, scope) {
  for (const branch of branchNamesFrom(cwd)) {
    const cut = branch.lastIndexOf('/');
    if (cut < 1) continue;
    if (branch.slice(cut + 1) === scope && CHANGE_TYPES.includes(branch.slice(0, cut))) return branch;
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
// repo that ships it. `readLedgerHeader`'s own `normalizeHeaderValue` (lib/ledger.js) already cuts a
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
    // `hooks/scope-prune.js` reaps a closed scope's branch together with its run root (ADR 0071), and
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

module.exports = { resolveScopeBranch, parseBaseBranch, parseRemote, checkContainment };
