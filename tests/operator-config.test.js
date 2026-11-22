'use strict';

// Fixture repositories commit regardless of the maintainer's global git config.
require('./fixture-git');

// Suite for plugin/lib/operator-config.js's `operatorBoundMs` (ADR 0207): the parse rules of an operator bound, called in
// process against temporary repositories. A missing file, invalid JSON, a missing section, and a missing key give the
// fallback silently. A whole number from 1 to 2147483647 is the bound. Every other value gives the fallback and is named
// once on stderr, silent after, because the module notes each `<section>.<key>` once per process; each rejected value
// therefore reads its own key. One case reads the file from a linked worktree, so the main working tree's file is what
// counts. Each caller's section, key, and default are proven by that caller's own suite.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { operatorBoundMs } = require('../plugin/lib/operator-config.js');

const made = [];
const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'ignore' });

// A repository with one commit, and `info` written to its `.superdev/info.json` as given: a string verbatim, an object as JSON,
// `undefined` as no file.
function repoWith(info) {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'operator-config-')));
  made.push(repo);
  git(['init', '-q', '-b', 'main'], repo);
  git(['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], repo);
  if (info !== undefined) {
    fs.mkdirSync(path.join(repo, '.superdev'));
    fs.writeFileSync(path.join(repo, '.superdev', 'info.json'), typeof info === 'string' ? info : JSON.stringify(info));
  }
  return repo;
}

// `operatorBoundMs` with `process.stderr.write` captured, and restored whatever the call does.
function read(cwd, section, key, fallback = 30000) {
  const err = [];
  const orig = process.stderr.write;
  process.stderr.write = (chunk) => {
    err.push(String(chunk));
    return true;
  };
  try {
    return { ms: operatorBoundMs(cwd, section, key, fallback), err: err.join('') };
  } finally {
    process.stderr.write = orig;
  }
}

try {
  // #silent-fallback: no file, invalid JSON, no section, and no key give the fallback and say nothing.
  for (const [label, info] of [['no file', undefined], ['invalid JSON', '{nope'], ['no section', {}], ['no key', { s: {} }]]) {
    assert.deepStrictEqual(read(repoWith(info), 's', 'k', 1234), { ms: 1234, err: '' }, label);
  }

  // #valid-range: both ends of the range set the bound, silently.
  for (const ms of [1, 2147483647]) {
    assert.deepStrictEqual(read(repoWith({ s: { k: ms } }), 's', 'k'), { ms, err: '' }, `${ms} sets the bound`);
  }

  // #rejected: each rejected value gives the fallback and is named once on stderr, under its own key.
  const rejected = [['string', '250'], ['fraction', 1.5], ['zero', 0], ['negative', -5], ['null', null], ['object', {}], ['above', 2147483648]];
  for (const [key, value] of rejected) {
    const repo = repoWith({ s: { [key]: value } });
    const got = read(repo, 's', key);
    assert.equal(got.ms, 30000, `${JSON.stringify(value)} reads as absent`);
    assert.equal((got.err.match(new RegExp(`s\\.${key} is not a whole number`, 'g')) || []).length, 1, `${JSON.stringify(value)} is named once: ${got.err}`);
    assert.match(got.err, /from 1 to 2147483647; the default 30000 ms applies/);
    assert.deepStrictEqual(read(repo, 's', key), { ms: 30000, err: '' }, `${JSON.stringify(value)}: silent after the first reading`);
  }

  // #worktree: a linked worktree reads the main working tree's file, and its own copy of the path counts for nothing.
  {
    const repo = repoWith({ s: { k: 4321 } });
    const wt = path.join(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'operator-config-wt-'))), 'tree');
    made.push(path.dirname(wt));
    git(['worktree', 'add', '-q', '--detach', wt], repo);
    fs.mkdirSync(path.join(wt, '.superdev'));
    fs.writeFileSync(path.join(wt, '.superdev', 'info.json'), JSON.stringify({ s: { k: 99 } }));
    assert.deepStrictEqual(read(wt, 's', 'k'), { ms: 4321, err: '' }, 'the worktree reads the main checkout\'s value');
  }
} finally {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
}
console.log('operator-config: ok');
