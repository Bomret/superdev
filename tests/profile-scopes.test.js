'use strict';

// Suite for the run profile's scope attribution: which scope a phase segment's arguments and working directories name.

const assert = require('node:assert');
const path = require('node:path');
const { profile } = require('../plugin/scripts/profile.js');
const { cmd, use, result, say, writeTree, enc, alphaTree, tmp, REPO, T0 } = require('./profile-setup.js');

const projectsDir = path.join(tmp(), 'projects');
writeTree(projectsDir, alphaTree(REPO));

// --- no slug: the scope whose segment ended last -------------------------------------------------
{
  const p = profile({ projectsDir, repoRoot: REPO });
  assert.equal(p.slug, 'alpha', 'the document segment in the scopetree session ended last');
}

// --- a free-form argument names no scope --------------------------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'review', 'fix the alpha thing'), say(10, REPO),
    cmd(20, REPO, 'review', 'src/alpha'), say(30, REPO),
    cmd(40, REPO, 'review', 'feat/alpha --unattended'), say(50, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.segments.map((s) => s.start), [T0 + 40000], 'only the feature-label argument attributes the segment');
}

// --- a BASE..branch (or BASE...branch) argument names its right-hand scope -----------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/gamma'), say(5, REPO),
    cmd(10, REPO, 'review', '816f89fe..feat/gamma'), say(20, REPO),
    cmd(30, REPO, 'document', 'b6b86a06...feat/gamma'), say(40, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'gamma' });
  assert.deepEqual(p.segments.map((s) => s.command), ['implement', 'review', 'document'],
    'a two-dot or three-dot range argument names the scope of its right-hand <change-type>/<slug>');
}

// --- an explicitly named scope is never diluted by a leftover cwd from another scope --------------
{
  const OTHER = path.join(REPO, '.superdev', 'scopes', 'other', 'scopetree');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    // the session's cwd lags behind the scope named in the args — a real leftover from a prior
    // command run inside another scope's run root.
    cmd(0, OTHER, 'implement', 'feat/delta'),
    use(5, OTHER, 'b1', 'Bash', { command: 'bun run test' }), result(15, OTHER, 'b1'),
    say(20, OTHER),
  ] } } });
  const delta = profile({ projectsDir: dir, repoRoot: REPO, slug: 'delta' });
  assert.deepEqual(delta.segments.map((s) => s.command), ['implement'], 'the named scope still profiles');
  assert.throws(() => profile({ projectsDir: dir, repoRoot: REPO, slug: 'other' }), /no phase segment/,
    "the named scope's leftover cwd never leaks the segment into the other scope's profile");
}

// --- a lone bare argument names a scope only when otherwise evidenced (a fake scope stays out) ----
{
  const TREE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'scopetree');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    // "audit" is a document mode word, not a scope — no run root named "audit" ever appears.
    cmd(0, REPO, 'document', 'audit'), say(10, REPO),
    // "alpha" is evidenced: a run root under .superdev/scopes/alpha/ appears in this same session.
    cmd(20, REPO, 'review', 'alpha'), say(25, TREE),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.segments.map((s) => s.command), ['review'],
    'the unevidenced bare token "audit" names no scope, so it is left out of every scope\'s profile');
  assert.throws(() => profile({ projectsDir: dir, repoRoot: REPO, slug: 'audit' }), /no phase segment/,
    'a lone bare argument with no evidenced run root never becomes a fake scope');
}
console.log('profile-scopes.test.js ok');
