#!/usr/bin/env node
'use strict';

// scope.js: the run-state CLI (ADR 0022). Owns every ledger.md write and read in the chain.
// Verbs: open, init, stage, step, slice, degraded, unresolved, deferred, minors, docs, pr, deploy, suite, base, get, status,
// publish, adopt, trace, collisions, citations, source-set, push, root, staging, dod-line, dod-tags; `main()` also runs test and fail-to-pass. Exit
// nonzero with a one-line stderr reason on any refusal. hooks/ledger-guard.js makes this the only
// ledger write path.
// `root` and `dod-line` touch no ledger: `root` resolves a run root's absolute
// path, anchored to the repository's main working tree regardless of which checkout invoked it (ADR
// 0080); `dod-line` edits one Definition-of-Done checklist line handed to it on stdin, on behalf of a
// store seed's own fetch/write pair (references/dod-ticks.md, INV-0014).

const fs = require('fs');
const path = require('path');

// The modules in `../lib/` hold the verbs and their vocabulary: the ledger primitives, the refusal helper, the
// verification readers, the git spawn, the containment test, the main-working-tree resolver, the run
// trace reader and writer, the collision finder, the verbs themselves, and the usage text. This file keeps the
// CLI switch, the verbs `root`, `trace`, and `collisions`, and the exports.
const { fail } = require('../lib/refusal.js');
const { SLUG_RE, readLines, getHeader, readLedgerHeader, inProgressSlices } = require('../lib/ledger.js');
const { isTestPath, verificationCommandsOf } = require('../lib/verification.js');
const { testContainment, baseHistoryHasPatch } = require('../lib/containment.js');
const { mainTreePath } = require('../lib/main-work-tree.js');
const { appendTrace, readTrace } = require('../lib/trace-log.js');
const { collisionRefusal, findCollisions } = require('../lib/collisions.js');
const { verbInit, verbStage, verbStep, verbSlice } = require('../lib/ledger-lifecycle.js');
const {
  BULLET_STDIN_SUBS, resolveBulletText, verbDegraded, verbUnresolved, verbDeferred, verbMinors, verbDocs, verbPr, verbDeploySet, verbDeployGet,
} = require('../lib/ledger-records.js');
const { verbDodLine } = require('../lib/dod-line.js');
const { verbDodTags } = require('../lib/dod-tags.js');
const { verbSuite, verbSuiteRerun, verbSuiteReusable, verbBaseSet, verbBaseResolve, verbGet } = require('../lib/suite-base-get.js');
const { publishText, verbPublish, verbAdopt } = require('../lib/run-state.js');
const { verbStatus, verbStaging } = require('../lib/status.js');
const { endRun, watchMain } = require('../lib/run-supervision.js');
const { verbTest } = require('../lib/test-verb.js');
const { verbFailToPass } = require('../lib/fail-to-pass.js');
const { verbCitations } = require('../lib/citations.js');
const { verbSourceSet } = require('../lib/source-set.js');
const { verbPush } = require('../lib/push.js');
const { pushRunState, fetchRunState, deleteRunState } = require('../lib/run-state-ref.js');
const { verbDodMerge } = require('../lib/dod-merge.js');
const { verbOpen } = require('../lib/plan-open.js');
const { verbDiscard } = require('../lib/discard.js');
const { usage } = require('../lib/usage.js');

// --- root: the verbs over `lib/main-work-tree.js`'s run-root resolver (ADR 0080) -----------------

function verbRoot(cwd, slug) {
  console.log(mainTreePath(cwd, 'root', 'scopes', slug));
}

// --- trace: the verb over `lib/trace-log.js`'s reader (ADR 0117, INV-0117) -------------------

function verbTrace(root, slice) {
  let raw = '';
  try {
    raw = fs.readFileSync(path.join(root, 'trace.log'), 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  let lines = raw.split('\n').filter(Boolean);
  if (slice) lines = lines.filter((l) => readTrace(l)[0].slice === slice);
  console.log(lines.length ? lines.join('\n') : 'no trace: this run has recorded no events');
}

// --- collisions: the verbs over `lib/collisions.js`'s finder (ADR 0126, INV-0134) ---------------

function verbCollisions(cwd, args) {
  const flags = { '--base': 'base', '--branch': 'branch', '--range-base': 'rangeBase' };
  const opts = { also: [] };
  for (let i = 0; i < args.length; ) {
    const flag = args[i];
    if (flag !== '--also' && !flags[flag]) { i++; continue; }
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw collisionRefusal(`collisions: ${flag} needs a value`);
    const value = args.splice(i, 2)[1];
    if (flag !== '--also' && opts[flags[flag]]) throw collisionRefusal(`collisions: ${flag} given twice`);
    if (flag === '--also') opts.also.push(value);
    else opts[flags[flag]] = value;
  }
  const missing = Object.keys(flags).find((f) => !opts[flags[f]]);
  if (missing) throw collisionRefusal(`collisions needs ${missing} <ref>`);
  if (args.length) throw collisionRefusal(`collisions: unrecognized argument "${args[0]}"`);
  const found = findCollisions(cwd, opts);
  for (const c of found) console.log([c.kind, c.home, c.number, c.scopePath, c.basePath, 'next', c.next].join(' '));
  if (found.length) process.exitCode = 1;
}

// --- CLI ---------------------------------------------------------------------

function takeRoot(args) {
  const i = args.indexOf('--root');
  if (i < 0) fail('missing --root <run-root> (the absolute run-root path)');
  const root = args[i + 1];
  if (!root) fail('--root needs a path');
  args.splice(i, 2);
  return root;
}

function run(argv, cwd, stdinJson) {
  const args = argv.slice();
  const verb = args.shift();
  // Set by a ledger-writing verb once its write succeeded; a refused verb throws before it is set.
  let ledgerEvent = null;
  // Set by a step end (`step clear`, `step block`) once its ledger write succeeded: the run root to send (ADR 0202).
  let handoffRoot = null;
  switch (verb) {
    // Writes the ledger and the trace itself, and traces the `init` and `step set plan` it makes (lib/plan-open.js).
    case 'open':
      verbOpen(cwd, args);
      break;
    case 'init':
      if (!args[0]) fail('init needs a <type>/<slug> label');
      ledgerEvent = { root: verbInit(cwd, args[0], args[1], stdinJson), fields: ['init', args[0], args[1]] };
      break;
    case 'stage': {
      const root = takeRoot(args);
      // A stage write that closes the standing step is a step end, so it sends the run-state ref (ADR 0206).
      // `closed` sends nothing: wrap-up deleted the ref before it, and a closed run hands nothing off.
      if (verbStage(root, args[0], args[1]) && args[1] !== 'closed') handoffRoot = root;
      ledgerEvent = { root, fields: ['stage', args[0], args[1]] };
      break;
    }
    case 'step': {
      const root = takeRoot(args);
      const changed = verbStep(root, args[0], args[1]);
      // `block` names the standing step, which the ledger holds.
      if (changed) ledgerEvent = { root, fields: ['step', args[0], ...(args[0] === 'block' ? [getHeader(readLines(root), 'Step')] : args[1] ? [args[1]] : [])] };
      if (changed && (args[0] === 'clear' || args[0] === 'block')) handoffRoot = root;
      break;
    }
    case 'slice': {
      const root = takeRoot(args);
      let range;
      const ri = args.indexOf('--range');
      if (ri >= 0) {
        range = args[ri + 1];
        if (!range) fail('--range needs a value');
        args.splice(ri, 2);
      }
      if (!args[0] || !args[1]) fail('slice needs <id> <status>');
      verbSlice(root, args[0], args[1], range);
      ledgerEvent = { root, slice: args[0], fields: ['slice', args[0], args[1], ...(range ? [range] : [])] };
      break;
    }
    case 'degraded': {
      const root = takeRoot(args);
      const sub = args[0];
      verbDegraded(root, sub, resolveBulletText(sub, args.slice(1), stdinJson));
      ledgerEvent = { root, fields: ['degraded', sub] }; // bullet text is free text and stays out of the trace
      break;
    }
    case 'unresolved': {
      const root = takeRoot(args);
      const sub = args[0];
      const changed = verbUnresolved(root, sub, resolveBulletText(sub, args.slice(1), stdinJson));
      if (changed) ledgerEvent = { root, fields: ['unresolved', sub] }; // bullet text is free text and stays out of the trace
      break;
    }
    case 'deferred': {
      const root = takeRoot(args);
      const sub = args[0];
      verbDeferred(root, sub, resolveBulletText(sub, args.slice(1), stdinJson));
      ledgerEvent = { root, fields: ['deferred', sub] }; // bullet text is free text and stays out of the trace
      break;
    }
    case 'minors': {
      const root = takeRoot(args);
      const changed = verbMinors(root, args[0], args[1], args.length);
      if (changed) ledgerEvent = { root, fields: ['minors', args[0]] }; // the slice id stays out of the trace
      break;
    }
    case 'docs': {
      const root = takeRoot(args);
      const changed = verbDocs(root, args[0], args[1]);
      if (changed) ledgerEvent = { root, fields: ['docs', args[0], ...(args[1] ? [args[1]] : [])] };
      break;
    }
    case 'pr': {
      const root = takeRoot(args);
      const changed = verbPr(root, args[0], args[1]);
      if (changed) ledgerEvent = { root, fields: ['pr', args[0], ...(args[1] ? [args[1]] : [])] };
      break;
    }
    case 'deploy': {
      const root = takeRoot(args);
      const sub = args[0];
      if (sub === 'get') {
        verbDeployGet(root);
        break;
      }
      if (sub !== 'set') fail(`unknown deploy subcommand "${sub}" — use set|get`);
      let exitCode;
      const ei = args.indexOf('--exit');
      if (ei >= 0) {
        exitCode = args[ei + 1];
        if (exitCode === undefined) fail('--exit needs a value');
        args.splice(ei, 2);
      }
      verbDeploySet(root, args[1], args[2], exitCode);
      ledgerEvent = { root, fields: ['deploy', 'set', args[1], args[2], ...(exitCode !== undefined ? ['--exit', exitCode] : [])] };
      break;
    }
    case 'suite': {
      const root = takeRoot(args);
      let whole = false;
      const wi = args.indexOf('--whole');
      if (wi >= 0) {
        whole = true;
        args.splice(wi, 1);
      }
      if (args[0] === 'reusable') {
        let branch;
        const bi = args.indexOf('--branch');
        if (bi >= 0) {
          branch = args[bi + 1];
          if (!branch) fail('--branch needs a value');
          args.splice(bi, 2);
        }
        if (!branch) fail('suite reusable needs --branch <branch>');
        let base;
        const bsi = args.indexOf('--base');
        if (bsi >= 0) {
          base = args[bsi + 1];
          if (!base) fail('--base needs a value');
          args.splice(bsi, 2);
        }
        // Everything but the leading `reusable` must already be stripped — an unrecognized flag (a
        // mistyped `--whole`) left over here would silently drop the whole-repo gate instead of
        // refusing it, and a no-kind record would then pass a `--whole` check it must fail (INV-0017).
        if (args.length > 1) fail(`suite reusable: unrecognized argument "${args[1]}"`);
        verbSuiteReusable(cwd, root, branch, whole, base);
        break;
      }
      if (args[0] === 'rerun') {
        if (whole) fail('suite rerun: --whole is not an option of rerun');
        if (args.length > 3) fail(`suite rerun: unrecognized argument "${args[3]}"`);
        verbSuiteRerun(cwd, root, args[1], args[2]);
        ledgerEvent = { root, fields: ['suite', 'rerun', args[1], args[2]] };
        break;
      }
      // `set <result> <sha>` is the whole shape — an unrecognized fourth token (a mistyped `--whole`,
      // or `--kind whole`) must refuse rather than silently write a no-kind record.
      if (args.length > 3) fail(`suite ${args[0]}: unrecognized argument "${args[3]}"`);
      verbSuite(cwd, root, args[0], args[1], args[2], whole);
      ledgerEvent = { root, fields: ['suite', args[0], args[1], args[2], ...(whole ? ['--whole'] : [])] };
      break;
    }
    case 'base': {
      const root = takeRoot(args);
      const take = (flag) => {
        const i = args.indexOf(flag);
        if (i < 0) return undefined;
        const v = args[i + 1];
        if (!v) fail(`${flag} needs a value`);
        args.splice(i, 2);
        return v;
      };
      if (args[0] === 'resolve') {
        const branch = take('--branch');
        const base = take('--base');
        if (!branch) fail('base resolve needs --branch <branch>');
        if (!base) fail('base resolve needs --base <base-ref>');
        if (args.length > 1) fail(`base resolve: unrecognized argument "${args[1]}"`);
        verbBaseResolve(cwd, root, branch, base);
        break;
      }
      if (args[0] !== 'set') fail(`unknown base subcommand "${args[0]}" — use set|resolve`);
      if (args.length > 2) fail(`base set: unrecognized argument "${args[2]}"`);
      verbBaseSet(cwd, root, args[1]);
      ledgerEvent = { root, fields: ['base', 'set', args[1]] };
      break;
    }
    case 'discard': {
      const root = takeRoot(args);
      if (args.length) fail(`discard: unrecognized argument "${args[0]}"`);
      verbDiscard(cwd, root);
      break;
    }
    case 'get': {
      const root = takeRoot(args);
      verbGet(root, args[0]);
      break;
    }
    case 'status':
      verbStatus(cwd);
      break;
    case 'publish': {
      const root = takeRoot(args);
      verbPublish(root);
      break;
    }
    case 'adopt': {
      const root = takeRoot(args);
      verbAdopt(root, stdinJson, args.includes('--shipped'));
      console.log(fetchRunState(root, cwd));
      ledgerEvent = { root, fields: ['adopt'] };
      break;
    }
    case 'trace': {
      const root = takeRoot(args);
      const si = args.indexOf('--slice');
      if (si >= 0 && !args[si + 1]) fail('--slice needs an id');
      verbTrace(root, si >= 0 ? args[si + 1] : undefined);
      break;
    }
    // No --root: collisions reads git only and touches no ledger (ADR 0126).
    case 'collisions':
      verbCollisions(cwd, args);
      break;
    // No --root: root resolves the run-root path itself, from cwd (ADR 0080).
    case 'root':
      verbRoot(cwd, args[0]);
      break;
    // No --root: staging resolves a staging directory, not a run root, and touches no ledger (ADR 0119).
    case 'staging':
      verbStaging(cwd, args);
      break;
    // No --root: citations reads git only and touches no ledger (ADR 0156).
    case 'citations':
      verbCitations(cwd, args);
      break;
    // No --root: source-set reads git only and touches no ledger (ADR 0162).
    case 'source-set':
      verbSourceSet(cwd, args);
      break;
    // Reads the ledger's branch and writes nothing to it (ADR 0167); `verbPush` takes `--root` itself.
    case 'push':
      verbPush(cwd, args);
      break;
    // Deletes the run-state ref of a run root from the remote (ADR 0202); best-effort, always exits 0.
    case 'run-state':
      if (args[0] !== 'delete') fail('run-state: expected "delete"\n' + usage());
      console.log(deleteRunState(takeRoot(args), cwd));
      break;
    // dod-merge writes dod.md alone: no ledger, no store call (references/dod-ticks.md, ADR 0206).
    case 'dod-merge':
      verbDodMerge(takeRoot(args), stdinJson);
      break;
    // No --root: dod-line touches no ledger, and makes no store call (references/dod-ticks.md).
    case 'dod-line':
      verbDodLine(args, stdinJson);
      break;
    // No --root: dod-tags rewrites and checks criterion tags on stdin, no ledger, no store call (ADR 0209).
    case 'dod-tags':
      verbDodTags(args, stdinJson);
      break;
    default:
      fail('unknown verb "' + (verb || '') + '"\n' + usage());
  }
  if (ledgerEvent) appendTrace(ledgerEvent.root, { slice: ledgerEvent.slice, kind: 'ledger', fields: ledgerEvent.fields });
  if (handoffRoot) console.log(pushRunState(handoffRoot, cwd));
}

// True for `unresolved add -`, `deferred add -`, and `degraded add -` (any `--root <path>` position
// tolerated), which is what tells `main()` to wait on stdin before dispatching — the same sentinel
// `resolveBulletText` reads once the ledger root is known.
const BULLET_STDIN_VERBS = ['degraded', 'unresolved', 'deferred'];
function isBulletStdinInvocation(argv) {
  if (!BULLET_STDIN_VERBS.includes(argv[0])) return false;
  const rest = argv.slice(1);
  const ri = rest.indexOf('--root');
  if (ri >= 0) rest.splice(ri, 2);
  return rest.length === 2 && BULLET_STDIN_SUBS.includes(rest[0]) && rest[1] === '-';
}

// `--help` / `-h` asks for usage unless it is the value of a flag that takes one or the text of a bullet
// verb (`unresolved add -h`): those are data, and usage text standing in for them would be written on.
const VALUE_FLAGS = ['--root', '--range', '--exit', '--branch', '--slice', '--match', '--match-file', '--note', '--note-file', '--verdict', '--map-file'];
function asksForHelp(argv) {
  // After `test --` every word belongs to the command.
  if (argv[0] === 'test' && argv.includes('--')) argv = argv.slice(0, argv.indexOf('--'));
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (VALUE_FLAGS.includes(argv[i])) i++;
    else rest.push(argv[i]);
  }
  if (BULLET_STDIN_VERBS.includes(rest[0]) && BULLET_STDIN_SUBS.includes(rest[1]) && rest[2] !== '-') rest.length = 2; // `-` reads stdin: no text on the command line
  return rest.includes('--help') || rest.includes('-h');
}

// The verbs `run()` hands the whole stdin text to; `main()` reads stdin for these alone, plus a bullet verb given `-`.
const STDIN_VERBS = ['init', 'adopt', 'dod-line', 'dod-tags', 'dod-merge'];

function main() {
  const argv = process.argv.slice(2);
  // Checked before any verb reads stdin, so `dod-line --help` and its stdin siblings never wait on input.
  if (asksForHelp(argv)) {
    console.log(usage());
    return;
  }
  const needsStdin = STDIN_VERBS.includes(argv[0]) || isBulletStdinInvocation(argv);
  const go = (stdinJson) => {
    // A refusal prints its message and exits nonzero; any other error is a bug and propagates.
    const settle = (e) => {
      if (e.isRefusal) {
        process.stderr.write(e.message + '\n');
        process.exit(e.exitCode || 1);
      }
      throw e;
    };
    try {
      if (argv[0] === 'test') verbTest(process.cwd(), argv.slice(1));
      else if (argv[0] === 'fail-to-pass') verbFailToPass(process.cwd(), argv.slice(1)).catch(settle);
      else run(argv, process.cwd(), stdinJson);
      // Let the process exit naturally on success, so stdout is guaranteed to flush first;
      // a refusal still exits nonzero below.
    } catch (e) {
      settle(e);
    }
  };
  if (needsStdin) {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => go(raw));
  } else {
    go('');
  }
}

// The CLI runs only when this file is executed directly. The hooks and sibling scripts require the modules in
// `../lib/` instead (ADR 0151). An unguarded `main()` parses the *caller's* argv: measured, a requiring
// process dies with `unknown verb ""` and exit 1 before its own first statement, because a refusal calls
// process.exit. Had the caller's argv happened to start with `init`, the same path waits on stdin
// instead and hangs. Either way the require, not the CLI, is what fails.
module.exports = { endRun, watchMain, verificationCommandsOf, appendTrace, readTrace, readLedgerHeader, inProgressSlices, isTestPath, run, publishText, SLUG_RE, testContainment, baseHistoryHasPatch, findCollisions };

if (require.main === module) main();
