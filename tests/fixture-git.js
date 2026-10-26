'use strict';

// Appends `commit.gpgsign=false` to git's env-injected config, keeping any GIT_CONFIG_* entry the
// environment already carries (e.g. a CI-injected safe.directory). Idempotent across repeated requires.
if (!process.env.GIT_FIXTURE_GPGSIGN) {
  const i = Number(process.env.GIT_CONFIG_COUNT || 0);
  process.env[`GIT_CONFIG_KEY_${i}`] = 'commit.gpgsign';
  process.env[`GIT_CONFIG_VALUE_${i}`] = 'false';
  process.env.GIT_CONFIG_COUNT = String(i + 1);
  process.env.GIT_FIXTURE_GPGSIGN = '1';
}

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// `copyFixture(template, prefix)` copies the fixture directory `template` (built once by the suite) into a new
// directory under the temporary directory and returns that copy's real path, so a macOS `/var` to `/private/var`
// mapping compares equal to what git prints. A copy shares nothing with the template or another copy. Absolute
// paths a fixture records (a remote URL, a linked worktree, a submodule) still name the template: the caller
// rewrites or builds those after the copy.
//
// `templateOnce(build, prefix)` returns a function that yields a suite's fixture template, built once per process: the
// first call makes a new directory under the temporary directory, registers its removal for when the process exits, and
// hands its real path to `build`, which fills it. Every call returns that real path, the `template` argument of
// `copyFixture`.
module.exports = {
  templateOnce(build, prefix = 'fixture-template-') {
    let template;
    return () => {
      if (!template) {
        const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
        process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
        build(dir);
        template = dir;
      }
      return template;
    };
  },
  copyFixture(template, prefix = 'fixture-copy-') {
    const dest = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
    fs.cpSync(template, dest, { recursive: true });
    return dest;
  },
};
