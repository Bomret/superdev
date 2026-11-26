'use strict';

// branch-delete.js: the `branch delete` verb, which deletes a run's scope branch that base contains, locally, as its
// remote-tracking ref, and on the remote, leased on the tip the containment test judged (ADR 0274, INV-0204). The
// remote-tracking ref is deleted only once the remote branch reads deleted or gone.

const fs = require('fs');
const { gitSpawn, resolveCommit } = require('./git-spawn.js');
const { fail } = require('./refusal.js');
const { takeOption, takeRootOption } = require('./options.js');
const { readLines, getHeader } = require('./ledger.js');
const { judgeContainment, refetchMark } = require('./containment.js');
const { resolveRemote } = require('./remote.js');
const { gitCall, lastLine, shownRemote, boundEnded, pushTimeoutMs, CREDENTIAL_RE } = require('./push.js');

// A gate refusal (not contained, undecidable, nothing to judge) deletes nothing and exits 3. A ref kept or failed exits
// 4. A usage refusal exits 1 through `fail`.
const GATE_EXIT = 3;
const KEPT_EXIT = 4;
const DONE_WORDS = ['deleted', 'gone', 'not-reached'];

function parseArgs(args) {
  const opts = {};
  const flags = { '--root': 'root', '--base': 'base', '--remote': 'remote' };
  const ownFlag = (v) => Object.hasOwn(flags, v);
  const rest = [...args];
  while (rest.length) {
    const flag = rest[0];
    if (!ownFlag(flag)) fail(`branch delete: unrecognized argument "${flag}"`);
    // A remote or base is free text that may start with `--` and reaches git as an operand. `--root` is a path.
    opts[flags[flag]] = flag === '--root' ? takeRootOption(rest, 'branch delete: ') : takeOption(rest, flag, 'branch delete: ', ownFlag);
  }
  if (opts.root === undefined) fail('branch delete needs --root <run-root>');
  if (opts.base === undefined) fail('branch delete needs --base <base-ref>');
  if (!fs.existsSync(opts.root) || !fs.statSync(opts.root).isDirectory()) fail(`branch delete: --root "${opts.root}" is not a directory`);
  return opts;
}

// True where `branch` names `base` in any spelling: the bare name, `refs/heads/<name>`, or `<remote>/<name>`.
function namesBase(branch, base, remote) {
  const bare = (s) => s.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\//, '');
  const b = bare(branch);
  const s = bare(base);
  if (b === s) return true;
  return Boolean(remote) && (s === `${remote}/${b}` || b === `${remote}/${s}`);
}

function isNamedRemote(cwd, remote) {
  const r = gitSpawn(['remote'], cwd);
  return r.status === 0 && r.stdout.split('\n').map((l) => l.trim()).includes(remote);
}

function verbBranchDelete(cwd, args) {
  const { root, base, remote: given } = parseArgs(args);
  const branch = getHeader(readLines(root), 'Branch');
  if (!branch) fail(`branch delete: the ledger under ${root} carries no **Branch:** line`);
  const remote = resolveRemote(cwd, given);
  if (namesBase(branch, base, remote)) fail(`branch delete: the **Branch:** line names the base branch ${base}; branch delete never deletes base`);

  const localRef = `refs/heads/${branch}`;
  const named = remote ? isNamedRemote(cwd, remote) : false;
  const trackingRef = named ? `refs/remotes/${remote}/${branch}` : null;
  const localTip = resolveCommit(localRef, cwd);
  const trackingTip = trackingRef ? resolveCommit(trackingRef, cwd) : null;
  const judgedRef = localTip ? localRef : trackingTip ? trackingRef : null;
  if (!judgedRef) {
    console.log([`nothing-to-judge ${branch}`, `neither ${localRef}${trackingRef ? ` nor ${trackingRef}` : ''} is present`, 'nothing deleted'].join('\n'));
    process.exitCode = GATE_EXIT;
    return;
  }
  // The tested tip, captured before any delete: the remote delete is leased on it.
  const tested = localTip || trackingTip;
  const judged = judgeContainment(cwd, base, judgedRef, remote, { fetchTimeoutMs: pushTimeoutMs(cwd) });
  const head = [
    `${judged.verdict} ${branch} ${tested}`,
    `base ${resolveCommit(judged.judgedBase, cwd) || 'unresolved'}`,
    `remote ${remote ? shownRemote(remote) : 'none'}`,
  ];
  if (judged.fallback) head.push('fallback ancestor');
  if (judged.verdict !== 'contained') {
    const mark = refetchMark(judged);
    console.log([...head, ...(mark ? [mark] : []), 'nothing deleted'].join('\n'));
    process.exitCode = GATE_EXIT;
    return;
  }

  // The remote goes first, so the tracking ref is deleted only once the remote branch reads deleted or gone. A kept
  // remote branch keeps its tracking ref as the clone's pointer to it. The printed order stays local, tracking, remote.
  const local = deleteLocal(cwd, branch, localTip);
  const { tracking, remoteLine } = deleteOnRemote(cwd, remote, named, branch, tested, 'remote not-reached no remote is configured or given');
  const lines = [local, tracking, remoteLine];
  console.log([...head, ...lines].join('\n'));
  if (!lines.every((l) => DONE_WORDS.includes(l.split(' ')[1]))) process.exitCode = KEPT_EXIT;
}

function deleteLocal(cwd, branch, tip) {
  if (!tip) return `local gone ${branch}`;
  const r = gitCall(['branch', '-D', '--end-of-options', branch], cwd);
  if (r.status === 0) return `local deleted ${branch} was ${tip}`;
  const reason = lastLine(r);
  const word = /used by worktree|checked out at/.test(r.stderr || '') ? 'kept-checked-out' : 'failed';
  return `local ${word} ${branch}: ${reason}; run by hand: git branch -D ${branch}`;
}

// The remote branch and its remote-tracking ref, as `branch delete` and `prototype push --delete` share them: the
// tracking tip read before the remote delete, the remote branch deleted under a lease on `tested`, and the tracking
// ref deleted only once the remote branch reads deleted or gone. `noRemote` is the remote line where no remote is
// resolved.
function deleteOnRemote(cwd, remote, named, branch, tested, noRemote) {
  const trackingRef = named ? `refs/remotes/${remote}/${branch}` : null;
  const trackingTip = trackingRef ? resolveCommit(trackingRef, cwd) : null;
  const remoteLine = remote ? deleteRemote(cwd, remote, branch, tested) : noRemote;
  const remoteWord = remoteLine.split(' ')[1];
  const tracking = trackingTip && !['deleted', 'gone'].includes(remoteWord)
    ? `tracking not-reached ${trackingRef} is kept beside the remote branch, which reads ${remoteWord}`
    : deleteTracking(remote, named, trackingRef, trackingTip, cwd);
  return { tracking, remoteLine };
}

function deleteTracking(remote, named, ref, tip, cwd) {
  if (!remote) return 'tracking not-reached no remote is configured or given';
  if (!named) return `tracking gone ${shownRemote(remote)} names no configured remote, so it keeps no remote-tracking ref`;
  if (!tip) return `tracking gone ${ref}`;
  const r = gitCall(['update-ref', '-d', '--end-of-options', ref], cwd);
  if (r.status === 0) return `tracking deleted ${ref} was ${tip}`;
  return `tracking failed ${ref}: ${lastLine(r)}; run by hand: git update-ref -d ${ref}`;
}

// The remote branch, read first with a bounded `ls-remote`: absent reads gone, equal to the tested tip is deleted under a
// lease on that tip, and any other tip is kept because it moved.
function deleteRemote(cwd, remote, branch, tested) {
  const ref = `refs/heads/${branch}`;
  const shown = shownRemote(remote);
  const byHand = (tip) => `run by hand: git push --force-with-lease=${ref}:${tip} --delete ${shown} ${ref}`;
  const failed = (call, result, tip) => {
    if (result.signal != null) return `remote timed-out ${shown} ${branch}: the ${call} was ${boundEnded(cwd, result.signal)}; ${byHand(tip)}`;
    const word = CREDENTIAL_RE.test(result.stderr || '') ? 'credential-rejected' : 'failed';
    return `remote ${word} ${shown} ${branch}: ${lastLine(result, remote)}; ${byHand(tip)}`;
  };
  const read = gitCall(['ls-remote', '--end-of-options', remote, ref], cwd, true);
  if (read.signal != null || read.status !== 0) return failed('ls-remote', read, tested);
  const hit = read.stdout.split('\n').map((l) => l.split('\t')).find((p) => p[1] === ref);
  if (!hit) return `remote gone ${shown} ${branch} is already absent`;
  const tip = hit[0].trim();
  if (tip !== tested) return `remote kept-moved ${shown} ${branch} is at ${tip}, past the tested tip ${tested}; ${byHand(tip)}`;
  const pushed = gitCall(['push', `--force-with-lease=${ref}:${tested}`, '--delete', '--end-of-options', remote, ref], cwd, true);
  if (pushed.status === 0 && pushed.signal == null) return `remote deleted ${shown} ${branch} was ${tested}`;
  // Only git's own lease rejection reads moved: a `[rejected]` line with `stale info` or `fetch first`. A `[remote
  // rejected]` line, such as a declining pre-receive hook or a protected branch, reads failed.
  if (pushed.signal == null && /^\s*! \[rejected\].*\((stale info|fetch first)\)/m.test(pushed.stderr || '')) {
    return `remote kept-moved ${shown} ${branch} moved past the tested tip ${tested} before the push: ${lastLine(pushed, remote)}; ${byHand('<its tip>')}`;
  }
  return failed('push', pushed, tested);
}

module.exports = { verbBranchDelete, deleteOnRemote, deleteRemote, DONE_WORDS, GATE_EXIT, isNamedRemote, namesBase, KEPT_EXIT };
