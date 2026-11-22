'use strict';

// options.js: the shared reader of one value-taking option, and of `--root` through the Git Bash drive-path rule (ADR 0150).

const { fail } = require('./refusal.js');
const { drivePath } = require('./drive-path.js');

// Removes `flag` and its value from `args` and returns the value, or undefined where `flag` is absent. A missing or empty value, a value
// that starts with `--` (another option), and a second occurrence of `flag` refuse with one line naming `flag`, after `prefix`.
// `isFlag` replaces the test for a value that is another option, for an option whose value is free text that may start with `--`.
function takeOption(args, flag, prefix = '', isFlag = (v) => v.startsWith('--')) {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (value === undefined || value === '' || isFlag(value)) fail(`${prefix}${flag} needs a value`);
  if (args.indexOf(flag, i + 2) >= 0) fail(`${prefix}${flag} given twice`);
  args.splice(i, 2);
  return value;
}

// `takeOption` for `--root`: the value read as the path a Windows Node process reaches, so the run it names is the same run whichever shell spelled it.
function takeRootOption(args, prefix = '') {
  const value = takeOption(args, '--root', prefix);
  return value === undefined ? undefined : drivePath(value);
}

module.exports = { takeOption, takeRootOption };
