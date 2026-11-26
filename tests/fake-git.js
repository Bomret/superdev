'use strict';

// fake-git.js: a `git` to put first on PATH that ends a chosen call and hands every other call to the real git by its
// absolute path. `fakeGit({ match, nth, sleep })` writes the script into a temporary directory of its own and returns
// `{ dir, log, env, withPath }`:
//   - `match` is an extended regular expression (`grep -E`) tested against the call's whole argument list joined by spaces.
//   - `nth`, where given, ends only the Nth matching call; a counter file in the fake's own directory counts the matches.
//     Without it every matching call is ended.
//   - `sleep`, where given, makes a matching call `exec` a sleep of that many seconds instead of killing itself, so a
//     bound the caller set is what ends it.
//   - `log` is a file holding one line per call, its arguments joined by spaces.
//   - `env` is `process.env` with the fake's directory first on PATH, for a child process.
//   - `withPath(fn)` runs `fn` with the fake first on this process's own PATH and restores PATH after it.
// The pattern and the counter live in the script alone, so the code under test reads neither. One `process.on('exit')`
// listener removes every directory the helper made.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const made = [];
process.on('exit', () => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

let realGit = null;
const sh = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function fakeGit({ match, nth, sleep }) {
  if (realGit === null) realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fake-git-')));
  made.push(dir);
  const log = path.join(dir, 'calls.log');
  const counter = path.join(dir, 'count');
  const end = sleep ? `exec sleep ${Number(sleep)}` : 'kill -KILL $$';
  const gate = nth
    ? `  n=$(cat ${sh(counter)} 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > ${sh(counter)}\n  [ "$n" -eq ${Number(nth)} ] && ${end}\n`
    : `  ${end}\n`;
  fs.writeFileSync(
    path.join(dir, 'git'),
    `#!/bin/sh\necho "$*" >> ${sh(log)}\nif printf '%s' "$*" | grep -Eq -- ${sh(match)}; then\n${gate}fi\nexec ${sh(realGit)} "$@"\n`,
    { mode: 0o755 }
  );
  const onPath = `${dir}${path.delimiter}${process.env.PATH}`;
  const withPath = (fn) => {
    const saved = process.env.PATH;
    process.env.PATH = `${dir}${path.delimiter}${saved}`;
    try {
      return fn();
    } finally {
      process.env.PATH = saved;
    }
  };
  return { dir, log, env: { ...process.env, PATH: onPath }, withPath };
}

// The calls the fake saw, one argument list per entry.
function calls(log) {
  try {
    return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

module.exports = { fakeGit, calls };
