'use strict';

// push.js: the `push` verb, which puts a run's scope branch on the remote in the push mode the remote tip decides (ADR 0167, INV-0169).

const { gitSpawn, resolveCommit } = require('./git-spawn.js');
const { fail } = require('./refusal.js');
const { takeOption, takeRootOption } = require('./options.js');
const { readLines, getHeader } = require('./ledger.js');
const { judgeContainment } = require('./containment.js');
const { operatorBoundMs } = require('./operator-config.js');

// A pushed outcome exits 0. Every outcome that pushed nothing exits with this status, apart from the 1 a usage
// refusal (`fail`) exits with, so a caller tells "the push did not happen" from "the call was wrong".
const NOT_PUSHED_EXIT = 3;

// Every network call carries this bound and a kill signal (INV-0009), the containment test's refetch of base
// included. A healthy fetch or push of a scope branch takes seconds. The operator configuration's `code-host.pushTimeoutMs`
// sets it (ADR 0207); `cwd` is any checkout of the repository.
const DEFAULT_TIMEOUT_MS = 60000;
const pushTimeoutMs = (cwd) => operatorBoundMs(cwd, 'code-host', 'pushTimeoutMs', DEFAULT_TIMEOUT_MS);
// How a network call its bound ended reads: the bound in milliseconds and the key that sets it, so the operator knows where to raise it.
const boundEnded = (cwd, signal) => `ended by its own bound of ${pushTimeoutMs(cwd)} ms (code-host.pushTimeoutMs in .superdev/info.json; signal ${signal})`;

// Git's own wording when the host rejects or never receives a credential: HTTP authentication, a prompt the
// disabled terminal could not show, an HTTP 401 or 403, and an SSH key the host refused. Every other failed fetch
// reads as an unreachable remote.
const CREDENTIAL_RE = /Authentication failed|could not read (Username|Password)|terminal prompts disabled|returned error: 40[13]|Permission denied \(|Access denied/i;

// Every git call: no credential prompt, and the C locale, so the stderr the outcome is read from is git's own
// English text.
function gitCall(args, cwd, network) {
  const opts = { env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' }, stdio: ['ignore', 'pipe', 'pipe'] };
  if (network) Object.assign(opts, { timeout: pushTimeoutMs(cwd), killSignal: 'SIGKILL' });
  return gitSpawn(args, cwd, opts);
}

function parseArgs(args) {
  const opts = {};
  const flags = { '--root': 'root', '--remote': 'remote', '--base': 'base' };
  const ownFlag = (v) => Object.hasOwn(flags, v);
  const rest = [...args];
  while (rest.length) {
    const flag = rest[0];
    if (!ownFlag(flag)) fail(`push: unrecognized argument "${flag}"`);
    // A remote or base is free text that may start with `--` and reaches git as an operand; `--root` is a path, so any option-shaped word refuses.
    opts[flags[flag]] = flag === '--root' ? takeRootOption(rest, 'push: ') : takeOption(rest, flag, 'push: ', ownFlag);
  }
  for (const flag of Object.keys(flags)) if (opts[flags[flag]] === undefined) fail(`push needs ${flag} <value>`);
  return opts;
}

function report(word, lines) {
  console.log([word, ...lines].join('\n'));
  if (word !== 'pushed' && word !== 'overwritten') process.exitCode = NOT_PUSHED_EXIT;
}

function verbPush(cwd, args) {
  const { root, remote, base } = parseArgs(args);
  const branch = getHeader(readLines(root), 'Branch');
  if (!branch) fail(`push: the ledger under ${root} carries no **Branch:** line`);
  const ref = `refs/heads/${branch}`;
  // The verb pushes only the scope branch, never base, whichever way --base spells it.
  if ([branch, ref, `${remote}/${branch}`].includes(base)) fail(`push: the **Branch:** line names the base branch ${base}; push never pushes base`);
  const local = resolveCommit(ref, cwd);
  if (!local) fail(`push: the branch ${branch} does not resolve to a commit`);
  // Run by hand on any outcome that pushed nothing. A plain push never overwrites: the remote rejects a push that
  // is no fast-forward.
  const shown = shownRemote(remote);
  const byHand = `run by hand: git push -u ${shown} ${branch}`;

  const fetched = gitCall(['fetch', '--no-tags', '--end-of-options', remote, ref], cwd, true);
  // A fetch its own bound ended carries no verdict (INV-0009), whatever stderr it left.
  if (fetched.signal != null) return report('timed-out', [`the fetch of ${shown} ${branch} was ${boundEnded(cwd, fetched.signal)}`, byHand]);
  if (fetched.status !== 0) {
    const stderr = fetched.stderr || '';
    if (/couldn't find remote ref/.test(stderr)) return push(cwd, remote, ref, [], 'pushed', byHand);
    return report(failedFetchWord(fetched), [lastLine(fetched, remote), byHand]);
  }
  // The remote tip as a full commit id, read off FETCH_HEAD at once: the bare branch name resolves to the local
  // branch first, and a later fetch overwrites FETCH_HEAD.
  const tip = resolveCommit('FETCH_HEAD', cwd);
  if (!tip) return report('unreachable', [`the fetch of ${shown} ${branch} left no commit to judge`, byHand]);
  if (gitCall(['merge-base', '--is-ancestor', '--end-of-options', tip, local], cwd).status === 0) {
    return push(cwd, remote, ref, [], 'pushed', byHand);
  }
  // The containment test receives the resolved id, never the branch name (ADR 0167), and its refetch of base
  // carries this verb's own bound.
  const judged = judgeContainment(cwd, base, tip, remote, { fetchTimeoutMs: pushTimeoutMs(cwd) });
  if (judged.verdict === 'contained') {
    // The lease names the exact tip judged: a remote that moved since rejects the push (INV-0169).
    return push(cwd, remote, ref, [`--force-with-lease=${ref}:${tip}`], 'overwritten', byHand);
  }
  // A refetch of base that its bound ended or that failed leaves the local verdict standing, which is no
  // refusal this verb made (INV-0009).
  const refetch = judged.refetch;
  if (refetch && refetch.signal != null) return report('timed-out', [`the fetch of ${shown} ${base} was ${boundEnded(cwd, refetch.signal)}`, byHand]);
  if (refetch && refetch.status !== 0) return report(failedFetchWord(refetch), [lastLine(refetch, remote), byHand]);
  // The commits listed are those the base containment judged against does not hold: the refetched base, never a
  // stale local one.
  const ahead = gitCall(['log', '--oneline', '--no-decorate', '--end-of-options', `${judged.judgedBase}..${tip}`], cwd);
  const commits = ahead.status === 0 ? ahead.stdout.split('\n').filter(Boolean) : [`(could not list ${base}..${tip})`];
  return report('refused', [
    `the remote ${shown} ${branch} at ${tip} carries commits base ${base} does not hold:`,
    ...commits.map((c) => `  ${c}`),
    byHand,
  ]);
}

function push(cwd, remote, ref, flags, word, byHand) {
  const pushed = gitCall(['push', '-u', ...flags, '--end-of-options', remote, `${ref}:${ref}`], cwd, true);
  if (pushed.signal != null) return report('timed-out', [`the push was ${boundEnded(cwd, pushed.signal)}`, byHand]);
  if (pushed.status === 0) return report(word, [`${shownRemote(remote)} ${ref.slice('refs/heads/'.length)}`]);
  return report('push-failed', [lastLine(pushed, remote), byHand]);
}

// The outcome of a fetch that failed with a status of its own, the branch fetch or the refetch of base: a rejected
// credential when git's stderr says so, an unreachable remote otherwise.
function failedFetchWord(result) {
  return CREDENTIAL_RE.test(result.stderr || '') ? 'credential-rejected' : 'unreachable';
}

// How a remote prints in any output line: its name, or `<remote>` where it is a URL, so no output shows a remote URL
// or a credential: a remote may be given as a URL, and a URL may carry a token.
const shownRemote = (remote) => (remote && !/:\/\/|@/.test(remote) ? remote : '<remote>');

// Git's last stderr line names why a call failed, with every URL in it replaced by the remote as it prints: git
// prints the URL it could not reach.
const URL_RE = /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s'"]+|[^\s'"@/]+@[^\s'":/]+:[^\s'"]+/g;
function lastLine(result, remote) {
  const lines = (result.stderr || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return `git exited ${result.status}`;
  return lines[lines.length - 1].replace(URL_RE, shownRemote(remote));
}

module.exports = { verbPush, gitCall, lastLine, shownRemote, boundEnded, pushTimeoutMs, CREDENTIAL_RE };
