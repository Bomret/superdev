'use strict';

// Suite for plugin/scripts/publish-kb.js: the merge check — a scope branch the base does not contain,
// `--allow-unmerged`, branch resolution through the ledger and the shape scan, the base branch and
// remote bullets of `docs/agents/code-management.md`. Shared fixtures live in tests/publish-kb-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { publishKbPath, git, makeRepo, commandsDoc, writeKbDoc, stagePage, call, withState } = require('./publish-kb-setup');
const { parseBaseBranch, parseRemote } = require(publishKbPath);

// --- the merge check: a scope branch base does not contain refuses, naming the branch and why ---
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'notcontained', 'p.md', 'title: P\naction: upsert');
  // Diverge the branch from main: a commit only the branch carries, never merged into main.
  git(['checkout', '-q', 'feat/notcontained'], repo);
  fs.writeFileSync(path.join(repo, 'branch-only.txt'), 'x\n');
  git(['add', 'branch-only.txt'], repo);
  git(['commit', '-q', '-m', 'branch-only work'], repo);
  git(['checkout', '-q', 'main'], repo);

  const res = call(['--scope', 'notcontained'], repo);
  assert.equal(res.ok, false, 'a not-contained scope branch refuses rather than publishing');
  assert.match(res.err, /feat\/notcontained/, 'the refusal names the branch');
  assert.match(res.err, /not contained/, 'the refusal states what was found');
  assert.ok(
    fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'notcontained', 'p.md')),
    'nothing is published, and the staged page is not deleted',
  );
});

// --- --allow-unmerged publishes a not-contained scope, and the report records it as unmerged ----
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'override', 'p.md', 'title: Override Page\naction: upsert');
  git(['checkout', '-q', 'feat/override'], repo);
  fs.writeFileSync(path.join(repo, 'branch-only.txt'), 'x\n');
  git(['add', 'branch-only.txt'], repo);
  git(['commit', '-q', '-m', 'branch-only work'], repo);
  git(['checkout', '-q', 'main'], repo);

  const res = call(['--scope', 'override', '--allow-unmerged'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /published \(created\): Override Page/, '--allow-unmerged still publishes');
  assert.match(res.out, /unmerged/i, 'the report records that the scope was unmerged');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Override Page'));
});

// --- a contained scope publishes silently: no refusal, no unmerged note in the report -----------
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'clean', 'p.md', 'title: Clean Page\naction: upsert');

  const res = call(['--scope', 'clean'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.doesNotMatch(res.out, /unmerged/i, 'a contained scope carries no unmerged note');
});

// --- no branch resolves while a run root survives: refuses stating nothing resolved -------------
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  // Stage the page by hand, bypassing stagePage's helper, so no `feat/<scope>` branch is ever cut.
  const dir = path.join(repo, '.superdev', 'kb-pending', 'noresolve');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'p.md'), '---\ntitle: P\naction: upsert\n---\nbody.\n');
  // A surviving run root is what makes this the unreachable case rather than the reaped one: the run
  // died before it cut its branch, or an operator deleted the branch while it was still unmerged.
  fs.mkdirSync(path.join(repo, '.superdev', 'scopes', 'noresolve'), { recursive: true });

  const res = call(['--scope', 'noresolve'], repo);
  assert.equal(res.ok, false, 'a scope with no resolvable branch refuses');
  assert.match(res.err, /no branch resolved/, 'states nothing resolved');
  assert.doesNotMatch(res.err, /not contained/, 'never reads as a branch that simply has not landed yet');
  assert.ok(fs.existsSync(path.join(dir, 'p.md')), 'nothing is published or deleted');
});

// --- --allow-unmerged proceeds on an unresolvable branch too, not only a not-contained one -------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  const dir = path.join(repo, '.superdev', 'kb-pending', 'noresolve2');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'p.md'), '---\ntitle: Unresolvable Page\naction: upsert\n---\nbody.\n');
  fs.mkdirSync(path.join(repo, '.superdev', 'scopes', 'noresolve2'), { recursive: true });

  const res = call(['--scope', 'noresolve2', '--allow-unmerged'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /unmerged/i);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Unresolvable Page'));
});

// --- neither branch nor run root survives: the reaped steady state publishes silently ------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  // No branch is ever cut and no run root is written: `hooks/scope-prune.js` reaps both together, and
  // gates that reap on the branch already reading contained in base or gone (ADR 0071). So this is the
  // fully-reaped shipped scope, the steady state a publish meets — absence stands beside containment.
  const dir = path.join(repo, '.superdev', 'kb-pending', 'reaped');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'p.md'), '---\ntitle: Reaped Page\naction: upsert\n---\nbody.\n');

  const res = call(['--scope', 'reaped'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.doesNotMatch(res.out, /unmerged/i, 'a fully-reaped scope carries no unmerged note');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Reaped Page'));
});

// --- _adhoc publishes with no containment check performed at all, even with no base configured ---
withState((stateFile) => {
  const repo = makeRepo();
  fs.rmSync(path.join(repo, 'docs', 'agents', 'code-management.md'));
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, '_adhoc', 'p.md', 'title: Adhoc Page 2\naction: upsert');

  const res = call(['--scope', '_adhoc'], repo);
  assert.ok(res.ok, `expected success despite no base branch configured, got: ${res.err}`);
  assert.doesNotMatch(res.out, /unmerged/i, '_adhoc runs no containment check to report on');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Adhoc Page 2'));
});

// --- a scope whose run root is gone resolves its branch through the scan fallback ----------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'gone', 'p.md', 'title: Gone Root Page\naction: upsert');
  const root = path.join(repo, '.superdev', 'scopes', 'gone');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), '# Ledger\n\n**Branch:** feat/gone\n');
  // `hooks/scope-prune.js` reaps the whole run root well before most `publish-kb` runs happen — no
  // ledger.md survives to read, so resolution has to fall through to the shape scan, which still
  // finds this scope's `feat/gone` branch (cut by `stagePage`'s helper above).
  fs.rmSync(root, { recursive: true, force: true });

  const res = call(['--scope', 'gone'], repo);
  assert.ok(res.ok, `expected success via the scan fallback, got: ${res.err}`);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Gone Root Page'));
});

// --- the ledger's Branch line, once it verifies, is trusted ahead of the shape scan --------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'ledgered', 'p.md', 'title: Ledgered Page\naction: upsert');
  const root = path.join(repo, '.superdev', 'scopes', 'ledgered');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), '# Ledger\n\n**Branch:** feat/ledgered\n');

  const res = call(['--scope', 'ledgered'], repo);
  assert.ok(res.ok, `expected success via the ledger route, got: ${res.err}`);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Ledgered Page'));
});

// --- the ledger's Branch line is what gets tested, not merely consulted then discarded ------------
// The ledger names a branch that verifies AND is contained; a different branch also matches the
// shape scan for this scope, and it is NOT contained. An implementation that read the ledger but
// still fell through to the scan would refuse here — success proves the ledger's branch is the one
// `testContainment` actually ran against.
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'distinguish', 'p.md', 'title: Distinguish Page\naction: upsert'); // cuts feat/distinguish
  git(['branch', 'other/ledger-branch'], repo); // contained: same tip as main right now

  // Diverge the shape-scan candidate (feat/distinguish) from main, so the scan route would refuse.
  git(['checkout', '-q', 'feat/distinguish'], repo);
  fs.writeFileSync(path.join(repo, 'branch-only.txt'), 'x\n');
  git(['add', 'branch-only.txt'], repo);
  git(['commit', '-q', '-m', 'branch-only work'], repo);
  git(['checkout', '-q', 'main'], repo);

  const root = path.join(repo, '.superdev', 'scopes', 'distinguish');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), '# Ledger\n\n**Branch:** other/ledger-branch\n');

  const res = call(['--scope', 'distinguish'], repo);
  assert.ok(res.ok, `expected success via the ledger's contained branch, got: ${res.err}`);
  assert.doesNotMatch(res.out, /unmerged/i, 'the ledger branch is contained, no override needed');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Distinguish Page'));
});

// --- a ledger Branch line naming a branch that was never cut falls back to the shape scan --------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'diedearly', 'p.md', 'title: Died Early Page\naction: upsert');
  const root = path.join(repo, '.superdev', 'scopes', 'diedearly');
  fs.mkdirSync(root, { recursive: true });
  // Run init wrote this line before cutting the branch; the run died before the branch existed.
  fs.writeFileSync(path.join(root, 'ledger.md'), '# Ledger\n\n**Branch:** feat/never-cut\n');

  const res = call(['--scope', 'diedearly'], repo);
  assert.ok(res.ok, `expected success via the scan fallback, got: ${res.err}`);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Died Early Page'));
});

// --- docs/agents/code-management.md with no base branch recorded refuses, never crashes ---------
withState(() => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'docs', 'agents', 'code-management.md'), '# Code host\n\nno base branch bullet here.\n');
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'nobase', 'p.md', 'title: P\naction: upsert');

  const res = call(['--scope', 'nobase'], repo);
  assert.equal(res.ok, false);
  assert.match(res.err, /no base branch/);
  assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'nobase', 'p.md')));
});

// --- an unfilled seed placeholder reads as "not configured", never as a literal base branch -------
withState(() => {
  const repo = makeRepo();
  fs.writeFileSync(
    path.join(repo, 'docs', 'agents', 'code-management.md'),
    '# Code host\n\n- **Base branch**: the branch the scope branch was cut from (default `main`).\n',
  );
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'placeholder', 'p.md', 'title: P\naction: upsert');

  const res = call(['--scope', 'placeholder'], repo);
  assert.equal(res.ok, false);
  assert.match(res.err, /no base branch/, 'names the real problem: nothing configured');
  assert.doesNotMatch(res.err, /not contained in/, 'never reads the unfilled sentence as a base branch');
  assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'placeholder', 'p.md')));
});

// --- parseBaseBranch also decodes the colon-outside-bold spelling both seed templates ship --------
{
  const base = parseBaseBranch('# Code host\n\n- **Base branch**: `develop`.\n');
  assert.equal(base, 'develop');
}

// --- that spelling drives containment too: the parsed value is what gets tested, not `main` -------
withState((stateFile) => {
  const repo = makeRepo();
  fs.writeFileSync(
    path.join(repo, 'docs', 'agents', 'code-management.md'),
    '# Code host\n\n- **Base branch**: `develop`.\n',
  );
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  // `develop` carries a commit `main` never gets; the scope branch is cut from `develop`'s tip, so
  // it is contained in `develop` and NOT in `main` — a pass here only happens if the parsed `develop`
  // value, not `main`, is what containment was tested against.
  git(['branch', 'develop'], repo);
  git(['checkout', '-q', 'develop'], repo);
  fs.writeFileSync(path.join(repo, 'develop-only.txt'), 'x\n');
  git(['add', 'develop-only.txt'], repo);
  git(['commit', '-q', '-m', 'develop-only work'], repo);
  git(['checkout', '-q', '-b', 'feat/altspell'], repo);
  git(['checkout', '-q', 'main'], repo);
  stagePage(repo, 'altspell', 'p.md', 'title: Alt Spelling Page\naction: upsert');

  const res = call(['--scope', 'altspell'], repo);
  assert.ok(res.ok, `expected success via the develop base, got: ${res.err}`);
  assert.doesNotMatch(res.out, /unmerged/i, 'contained in the configured base, no override needed');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Alt Spelling Page'));
});

// --- several branches matching the shape scan: no crash on the ambiguity, whichever one is picked --
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'multi', 'p.md', 'title: Multi Page\naction: upsert'); // cuts feat/multi
  git(['branch', 'fix/multi'], repo); // a second branch also matching the scan shape

  const res = call(['--scope', 'multi'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Multi Page'));
});

// --- parseRemote takes the first token of the `- **Remote:**` bullet, unlike parseBaseBranch's ------
// whitespace rejection: every shipped Remote bullet carries a trailing sentence.
{
  assert.equal(parseRemote('# Code host\n\n- **Remote:** `upstream`.\n'), 'upstream');
  assert.equal(parseRemote('# Code host\n\n- **Remote**: `upstream`.\n'), 'upstream', 'the colon-outside-bold spelling too');
  assert.equal(parseRemote('# Code host\n\nno remote bullet here.\n'), null, 'absent bullet -> null, not a refusal');
  assert.equal(
    parseRemote('# Code host\n\n- **Remote:** `origin`. Confirm with `git remote -v`.\n'),
    'origin',
    'the real shipped bullet shape (docs/agents/code-management.md and both seeds) carries a trailing sentence',
  );
  assert.equal(parseRemote(null), null);
}

// --- checkContainment's refetch uses the remote docs/agents/code-management.md names, not `origin` -
// The scope branch is NOT contained against local `main`, but IS contained against `main` on a remote
// named `other` (a host that squash-merged the work; the operator's clone has not pulled yet). No
// `origin` remote exists at all, so a refetch that (wrongly) defaults to `origin` cannot succeed —
// success here is only reachable by fetching the configured `other` remote. The Remote bullet below
// carries the trailing sentence every shipped one does ("Confirm with `git remote -v`.") rather than a
// bare token, which is exactly the shape that left the previous cycle's fix inert.
withState((stateFile) => {
  const repo = makeRepo();
  fs.writeFileSync(
    path.join(repo, 'docs', 'agents', 'code-management.md'),
    '# Code host\n\n- **Base branch:** `main`.\n- **Remote:** `other`. Confirm with `git remote -v`.\n',
  );
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));

  git(['checkout', '-q', '-b', 'feat/viaremote'], repo);
  fs.writeFileSync(path.join(repo, 'viaremote-only.txt'), 'x\n');
  git(['add', 'viaremote-only.txt'], repo);
  git(['commit', '-q', '-m', 'work on feat/viaremote'], repo);
  git(['checkout', '-q', 'main'], repo);

  const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-remote-'));
  git(['init', '-q', '--bare', '-b', 'main'], remoteDir);
  git(['remote', 'add', 'other', remoteDir], repo);
  git(['push', '-q', 'other', 'main'], repo);

  // Advance the remote's `main` past the scope branch's work (a squash merge), then roll the local
  // `main` back — local containment must fail, remote containment must succeed.
  git(['merge', '--squash', 'feat/viaremote'], repo);
  git(['commit', '-q', '-m', 'feat: viaremote (#1)'], repo);
  git(['push', '-q', 'other', 'main:main'], repo);
  git(['reset', '-q', '--hard', 'HEAD^'], repo);

  stagePage(repo, 'viaremote', 'p.md', 'title: Via Remote Page\naction: upsert');

  const res = call(['--scope', 'viaremote'], repo);
  assert.ok(res.ok, `expected success via the configured remote, got: ${res.err}`);
  assert.doesNotMatch(res.out, /unmerged/i, 'contained after fetching the configured remote, no override needed');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Via Remote Page'));
  fs.rmSync(remoteDir, { recursive: true, force: true });
});

console.log('publish-kb-containment.test.js: all assertions passed');
