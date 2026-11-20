'use strict';

// consent.js: the `consent` verb, the operator's carried merge consent for a scope, read from its run trace. It reads the run
// root and writes nothing (ADR 0263, ADR 0266, INV-0196).

const path = require('path');
const { fail } = require('./refusal.js');
const { readTrace } = require('./trace-log.js');
const { readBytes, stateOf, sameState, readSide } = require('./run-digest.js');

// The step events of a trace, in file order, as `{ sub, name }`: `ledger step set|clear|block [<name>]`, and each
// `tamper trace.log` line as `{ sub: 'tamper' }`.
function stepEvents(raw) {
  return readTrace(raw)
    .filter((e) => (e.kind === 'ledger' && e.fields[0] === 'step') || (e.kind === 'tamper' && e.fields[0] === 'trace.log'))
    .map((e) => (e.kind === 'tamper' ? { sub: 'tamper' } : { sub: e.fields[1], name: e.fields[2] }));
}

// True when the latest ship step after the last `step set submit` ended in a `step block` naming ship. A ship step ends at the
// first `step set`, `step clear`, or `step block` after it: a block naming ship carries the consent, and any other end withdraws
// it. A step clear or step set that ends another step leaves the ship step's end as it was. A `tamper trace.log` line after the
// last submit step carries nothing: a writing verb's `checkRun` seals a trace edited outside scope.js again, so the digest no
// longer shows a hand-forged step line, and the tamper line that check records does.
function carried(events) {
  const last = events.map((e) => e.sub === 'set' && e.name === 'submit').lastIndexOf(true);
  if (last < 0) return false;
  if (events.slice(last + 1).some((e) => e.sub === 'tamper')) return false;
  let ship = null; // null: no ship step yet; 'running', 'blocked', or 'ended' for the latest one
  for (const e of events.slice(last + 1)) {
    if (ship === 'running') ship = e.sub === 'block' && e.name === 'ship' ? 'blocked' : 'ended';
    if (e.sub === 'set' && e.name === 'ship') ship = 'running';
  }
  return ship === 'blocked';
}

// `consent --root` prints `carried` or `none`. An absent, empty, or unreadable trace, a trace with no submit step, a trace that
// differs from the digest sidecar, and a trace with a `tamper trace.log` line after the last submit step read `none`. Read-only
// verbs skip `checkRun`, so the digest comparison lives here. The tamper line covers an outside edit a later writing verb sealed.
function verbConsent(root, args) {
  if (args.length) fail(`consent: unrecognized argument "${args[0]}"`);
  const bytes = readBytes(path.join(root, 'trace.log'));
  const sealed = bytes !== null && sameState(readSide(root).trace, stateOf(bytes));
  console.log(sealed && carried(stepEvents(bytes.toString('utf8'))) ? 'carried' : 'none');
}

module.exports = { verbConsent };
