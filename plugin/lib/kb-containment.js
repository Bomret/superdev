'use strict';

// kb-containment.js: resolves a staged scope's branch and checks that base contains it, so a publish
// run never ships pages for work no reader can reach.
//
// Publishing pages for a scope whose work no reader can reach is worth a warning, and never a
// block: every containment verdict below only ever refuses (naming what it found) unless `--allow-unmerged`
// overrides it, and `_adhoc` — which carries no branch at all — skips the check entirely. An unreadable
// `code-management.md` is no verdict: it returns `unreadable: true`, which `--allow-unmerged` does not override.
// The refetch is bounded by `code-host.pushTimeoutMs` through the reader in `lib/push.js`, whose default is
// 60000 ms when the key is unset (the bound the `scope.js` push verb's own containment call takes), and not by
// `containment.js`'s 5000 ms `FETCH_TIMEOUT_MS`, which applies only to a caller that passes no bound (INV-0003, INV-0009).

const fs = require('fs');
const path = require('path');
const { readLedgerHeader } = require('./ledger.js');
const { listBranches, shapeMatches } = require('./scope-branch.js');
const { gitSpawn, refResolves } = require('./git-spawn.js');
const { drivePath } = require('./drive-path.js');
const { judgeContainment } = require('./containment.js');
const { pushTimeoutMs } = require('./push.js');
const { readPresent } = require('./refusal.js');

// The shape scan `lib/scope-branch.js` owns, which `hooks/scope-prune.js` applies too: every match over the local and
// remote-tracking names. Returns `{ branch }` (null when none matches), `{ ambiguous }` naming every match when several do, or
// `{ failure }` when git could not list the branches.
function shapeScanBranch(cwd, scope) {
  const listing = listBranches(cwd);
  if (listing.failure) return listing;
  const matches = shapeMatches(new Set([...listing.local, ...listing.remote]), scope);
  if (matches.length > 1) return { ambiguous: matches };
  return { branch: matches.length ? matches[0] : null };
}

// `references/scope-mode.md`'s `## The scope branch`: the ledger's `**Branch:**` line, verified
// before it is trusted — run init writes it before cutting the branch, so a run that died in
// between names one never cut. Falls back to the shape scan for a pre-CLI ledger, a gone/unreadable
// run root, or a line naming a branch that no longer verifies — the steady-state path, since
// `hooks/scope-prune.js` reaps the run root well before most `publish-kb` runs happen. Returns
// `{ branch }`, null when neither route finds one, or the shape scan's `{ ambiguous }` or `{ failure }`.
function resolveScopeBranch(mainCheckout, scope) {
  let ledgerText = null;
  try {
    ledgerText = fs.readFileSync(path.join(mainCheckout, '.superdev', 'scopes', scope, 'ledger.md'), 'utf8');
  } catch {
    ledgerText = null;
  }
  if (ledgerText !== null) {
    const branch = readLedgerHeader(ledgerText, 'Branch');
    if (branch && refResolves(branch, mainCheckout)) return { branch };
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
// rejection: every shipped Remote bullet ("- **Remote**: `origin` (GitHub). Confirm with `git remote -v`.")
// carries a trailing sentence, so rejecting on whitespace would make the bullet unparseable on every
// repo that ships it. `readLedgerHeader`'s own `normalizeHeaderValue` (lib/ledger.js) already cuts a
// single-token header value to its first whitespace-delimited token before stripping markup this way;
// this mirrors that. Absent or unparseable -> null: unlike a missing base branch, a missing remote is
// not a refusal — the caller passes null on, and the containment test judges locally with no refetch (INV-0203).
function parseRemote(docText) {
  if (!docText) return null;
  const m = docText.match(/^-\s*\*\*Remote:?\*\*:?\s*(.+)$/m);
  if (!m) return null;
  const token = m[1].trim().split(/\s+/)[0];
  const value = token.replace(/^`+/, '').replace(/[`.,;:]+$/, '');
  return value || null;
}

// The remote a containment refetch names (INV-0203): `given`, the caller's explicit `--remote`, where one is passed;
// otherwise the `Remote:` value of `docs/agents/code-management.md` at the repository's top level, so a call from a
// subdirectory reads the same document, and the current directory where git cannot name the top level. Null where
// neither names one: the caller then reaches no remote.
function resolveRemote(cwd, given) {
  if (given) return given;
  const top = gitSpawn(['rev-parse', '--show-toplevel'], cwd);
  const root = top.status === 0 && top.stdout.trim() ? drivePath(top.stdout.trim()) : cwd;
  try {
    return parseRemote(fs.readFileSync(path.join(root, 'docs', 'agents', 'code-management.md'), 'utf8'));
  } catch {
    return null;
  }
}

// The check itself. Never throws (an unreadable `code-management.md` is a refusal message with `unreadable: true`, not an
// exception), and never publishes or deletes anything on its own — `run()` decides
// what a refusal means. `{ performed: false }` for `_adhoc`. Otherwise `{ performed: true, ok, ...
// }`: `ok: true` on a contained branch, and on a scope whose branch and run root are both reaped
// (ADR 0071). `ok: false` with a `message` naming the branch (when one
// resolved) and what was found — "no base branch configured", "cannot list branches",
// "no branch resolved", "not contained", or "names no ref this repository can find" (`judgeContainment`'s own
// `'could-not-resolve'`, kept distinct from not-contained per slice #494's interface note, so a
// branch that never existed never reads as one that simply hasn't landed yet).
function checkContainment(mainCheckout, scope) {
  if (scope === '_adhoc') return { performed: false };
  let codeMgmtText = null;
  try {
    codeMgmtText = readPresent(path.join(mainCheckout, 'docs', 'agents', 'code-management.md'), 'utf8');
  } catch (e) {
    if (!e.isRefusal) throw e;
    return { performed: true, ok: false, unreadable: true, message: e.message };
  }
  const base = parseBaseBranch(codeMgmtText);
  if (!base) {
    return { performed: true, ok: false, message: 'docs/agents/code-management.md names no base branch' };
  }
  const resolved = resolveScopeBranch(mainCheckout, scope);
  if (resolved.failure) {
    return { performed: true, ok: false, message: `cannot list branches for scope "${scope}": git for-each-ref ${resolved.failure}` };
  }
  if (resolved.ambiguous) {
    return { performed: true, ok: false, message: `scope "${scope}" is ambiguous: its branch could be ${resolved.ambiguous.join(' or ')}; none holds a ledger **Branch:** line to say which` };
  }
  const branch = resolved.branch;
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
  const verdict = judgeContainment(mainCheckout, base, branch, remote, { fetchTimeoutMs: pushTimeoutMs(mainCheckout) }).verdict;
  if (verdict === 'contained') return { performed: true, ok: true };
  const what = verdict === 'could-not-resolve' ? 'names no ref this repository can find' : `is not contained in ${base}`;
  return { performed: true, ok: false, message: `scope branch "${branch}" ${what}` };
}

module.exports = { parseBaseBranch, parseRemote, resolveRemote, checkContainment };
