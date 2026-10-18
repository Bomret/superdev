'use strict';

// collisions.js: the numbering-collision finder (ADR 0126, INV-0134), which reads git and compares ADR numbers and invariant ids across refs.

const path = require('path');
const { gitSpawn, refResolves } = require('./git-spawn.js');

// An ADR number, in one `docs/adr` directory, or an invariant id in `docs/invariants.md`, that the
// branch added since `rangeBase` (a file renamed into the number counts as added) and that `base`
// already holds under another path, unless base kept that path from `rangeBase` and the branch no
// longer holds it (the scope's slug-only rename, or its replacement of the ADR, is none; a file base
// renamed or added is a different ADR, so both sides renaming one ADR to two paths collides), or, for
// an invariant, with other entry text. Two files with one
// number and different slugs never conflict in git, so only comparing numbers finds them. Reads git
// only and writes nothing. Each collision gets its own next free number, above every number its home
// carries on `base`, on `branch`, and on every `also` ref (other live plan runs).

const ADR_FILE_RE = /^(\d{4})-[^/]*\.md$/;
const INV_HEADING_RE = /^###\s+INV-(\d{4})\s*$/gm;
const REGISTER = 'docs/invariants.md';

// The refusal of the `collisions` and `citations` verbs: exit code 2, apart from the verdict codes 0 and 1.
function collisionRefusal(msg) {
  const err = new Error(msg);
  err.isRefusal = true;
  err.exitCode = 2;
  return err;
}

// Every ADR file in `ref`, as { home, number, file }: a file named NNNN-*.md directly inside a
// directory whose path is `docs/adr` or ends in `/docs/adr`.
function adrFiles(ref, cwd) {
  const r = gitSpawn(['ls-tree', '-r', '-z', '--name-only', '--end-of-options', ref], cwd);
  if (r.status !== 0) throw collisionRefusal(`collisions: cannot list the tree of "${ref}"`);
  const out = [];
  for (const file of r.stdout.split('\0')) {
    const home = path.posix.dirname(file);
    const m = path.posix.basename(file).match(ADR_FILE_RE);
    if (m && (home === 'docs/adr' || home.endsWith('/docs/adr'))) out.push({ home, number: m[1], file });
  }
  return out;
}

// The invariant entries `ref`'s register carries, id → entry text (its heading up to the next
// heading); an absent register carries none.
function registerEntries(ref, cwd) {
  const r = gitSpawn(['show', '--end-of-options', `${ref}:${REGISTER}`], cwd);
  const entries = new Map();
  if (r.status !== 0) return entries;
  for (const m of r.stdout.matchAll(INV_HEADING_RE)) {
    const rest = r.stdout.slice(m.index + m[0].length);
    const end = rest.search(/^#/m);
    entries.set(m[1], (end < 0 ? rest : rest.slice(0, end)).trim());
  }
  return entries;
}

function findCollisions(cwd, { base, branch, rangeBase, also = [] }) {
  for (const ref of [base, branch, rangeBase, ...also]) {
    if (!refResolves(ref, cwd)) throw collisionRefusal(`collisions: "${ref}" resolves to no commit`);
  }
  // Every ADR path the branch added since rangeBase; a file renamed into a number counts as added.
  // The pathspecs keep the diff to ADR files, so a large base diff costs nothing here.
  const r = gitSpawn(['diff', '-z', '--name-only', '--no-renames', '--diff-filter=A', '--end-of-options', rangeBase, branch, '--', ':(glob)docs/adr/*.md', ':(glob)**/docs/adr/*.md'], cwd);
  if (r.status !== 0) throw collisionRefusal(`collisions: cannot diff "${rangeBase}" against "${branch}"`);
  const addedSet = new Set(r.stdout.split('\0').filter(Boolean));
  // A base file at a path rangeBase already held is one base kept: when the branch no longer holds
  // that path, the scope deleted or renamed it, and after the merge only the scope's file holds the
  // number, so it is no partner. Every other base file at the number is a different ADR.
  const rangeBasePaths = new Set(adrFiles(rangeBase, cwd).map((a) => a.file));
  const branchAdrs = adrFiles(branch, cwd);
  const branchPaths = new Set(branchAdrs.map((a) => a.file));
  const replaced = (theirs) => rangeBasePaths.has(theirs.file) && !branchPaths.has(theirs.file);
  const baseAdrs = adrFiles(base, cwd);
  const everyAdr = [baseAdrs, branchAdrs, ...also.map((ref) => adrFiles(ref, cwd))].flat();
  const highest = new Map();
  for (const a of everyAdr) highest.set(a.home, Math.max(highest.get(a.home) || 0, Number(a.number)));
  const pad = (n) => String(n).padStart(4, '0');
  const found = [];
  for (const mine of branchAdrs.filter((a) => addedSet.has(a.file))) {
    const theirs = baseAdrs.find((a) => a.home === mine.home && a.number === mine.number && a.file !== mine.file && !replaced(a));
    if (!theirs) continue;
    const next = highest.get(mine.home) + 1;
    highest.set(mine.home, next);
    found.push({ kind: 'adr', home: mine.home, number: mine.number, scopePath: mine.file, basePath: theirs.file, next: pad(next) });
  }
  const baseEntries = registerEntries(base, cwd);
  const before = registerEntries(rangeBase, cwd);
  const branchEntries = registerEntries(branch, cwd);
  const alsoIds = also.flatMap((ref) => [...registerEntries(ref, cwd).keys()]);
  let top = Math.max(0, ...[...baseEntries.keys(), ...branchEntries.keys(), ...alsoIds].map(Number));
  // An entry identical on both sides is one taken in from base, the invariant analogue of the same path.
  const collides = ([id, text]) => !before.has(id) && baseEntries.has(id) && baseEntries.get(id) !== text;
  for (const entry of branchEntries) {
    if (!collides(entry)) continue;
    const [id] = entry;
    top += 1;
    found.push({ kind: 'inv', home: REGISTER, number: `INV-${id}`, scopePath: REGISTER, basePath: REGISTER, next: `INV-${pad(top)}` });
  }
  return found;
}

module.exports = { collisionRefusal, findCollisions };
