'use strict';

// time-sinks.js: applies the fixed rules that name the causes holding at least 20% of a scope's
// machine time (ADR 0143, INV-0148, INV-0149).

const { verificationCommands } = require('./verification.js');
const { commandKeys, splitStatements, stripMultilineBodies } = require('./command-keys.js');
const { measure, clip } = require('./session-events.js');
const { dur, plural } = require('./profile-report.js');

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// --- time sinks (ADR 0143) ---------------------------------------------------------------------
// Domain shape (CONTEXT.md): Time sink — { name, ms, detail, lever }. Every sink comes from a rule
// below (INV-0148); a lever names only something the operator controls, or says there is none
// (INV-0149). Human wait and idle enter no machine figure and not the denominator (INV-0102).
const TEST_KEY = /^scope\.js (?:test |fail-to-pass$)/;
const REVIEW_TESTS_LEVER = 'Lever: `/superdev:review-tests`, to find the tests that cost more than they prove.';
const NO_LEVER = 'The repository holds no lever for it.';

// A statement's command words, past its pipeline's later stages, redirections, variable assignments,
// and a leading `time`, joined by single spaces: the text a configured verification command is matched against.
const statementWords = (statement) => statement.split('|')[0].trim().split(/\s+/)
  .filter((w) => w && !/^\d*[<>]/.test(w) && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w))
  .filter((w, i, ws) => !(w === 'time' && ws.slice(0, i).every((x) => x === 'time'))).join(' ');

// The repository's configured verification commands, run directly rather than through `scope.js test`:
// the function returned decides, from the text of a Bash call's statement under `key`, the runner mode
// that statement ran, or null for no test run. A statement matching the focused command, its `{paths}`
// standing for one or more words, is `focused`; one equal to the full or whole command is `full` or
// `whole`. Any other statement sharing a configured command's key did not narrow, so it is `whole` when
// the key is the whole command's alone, and `full` otherwise.
// simplicity: a command that keys to more than one key (a compound fence) marks none of them, and the
// match is literal on words, so a run quoting a word differently or adding a flag before `{paths}` reads
// as a wide run; parse the fences properly if a real focused run is counted wide.
function configuredTests(repoRoot) {
  const cmds = verificationCommands(repoRoot);
  const keyModes = new Map();
  for (const mode of ['focused', 'whole', 'full']) {
    const keys = cmds[mode] ? commandKeys(cmds[mode]) : [];
    if (keys.length === 1) keyModes.set(keys[0], [...(keyModes.get(keys[0]) || []), mode]);
  }
  const text = (mode) => (cmds[mode] ? statementWords(cmds[mode]) : null);
  const focused = text('focused') && new RegExp(`^${text('focused').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{paths\\\}/g, '\\S+(?: \\S+)*')}$`);
  return (command, key) => {
    const own = splitStatements(stripMultilineBodies(command)).find((s) => commandKeys(s)[0] === key);
    const words = own ? statementWords(own.replace(/^\s*[({]+/, '')) : '';
    if (focused && focused.test(words)) return 'focused';
    if (words === text('full')) return 'full';
    if (words === text('whole')) return 'whole';
    const modes = keyModes.get(key);
    if (!modes) return null;
    return modes.length === 1 && modes[0] === 'whole' ? 'whole' : 'full';
  };
}

function timeSinks(segments, calls, dispatches, configured) {
  const sum = (k) => segments.reduce((n, s) => n + s.times[k], 0);
  const human = sum('human');
  const idle = sum('idle');
  const machine = sum('wall') - human - idle;
  const sinks = [];
  // A machine-time sink holds at least 20% of machine time, compared unrounded.
  const add = (name, ms, detail, lever) => { if (machine > 0 && ms * 5 >= machine) sinks.push({ name, ms, detail, lever }); };

  // Test runs and other commands, each call's share less the human wait it spans. A command's share also
  // leaves out the time it overlaps a background test run, so a loop polling one counts toward test runs.
  // A test run is a `scope.js test`/`fail-to-pass` call or a direct run of a configured verification command.
  // A configured run joins the row of its runner mode, so `test full` holds every full run however it ran.
  const testRow = (c, k) => {
    if (TEST_KEY.test(k)) return k;
    const mode = configured(c.command, k);
    return mode && `scope.js test ${mode}`;
  };
  const modeOf = (k) => k.replace(/^scope\.js test /, '');
  const bgTests = calls.filter((c) => c.bg && c.keys.some((k) => testRow(c, k)));
  const modes = new Map();
  const other = new Map();
  for (const c of calls) {
    const end = c.start + c.ms;
    const humanMs = measure(c.human);
    const bgIv = bgTests.filter((b) => b !== c).flatMap((b) => clip([[b.start, b.start + b.ms]], c.start, end));
    const coveredMs = measure([...c.human, ...bgIv]);
    c.keys.forEach((k, j) => {
      const row = testRow(c, k);
      if (row) {
        if (!modes.has(row)) modes.set(row, []);
        modes.get(row).push((c.ms - humanMs) * c.shares[j]);
      } else {
        const g = other.get(k) || { count: 0, ms: 0 };
        g.count += 1;
        g.ms += (c.ms - coveredMs) * c.shares[j];
        other.set(k, g);
      }
    });
  }
  if (modes.size) {
    const all = [...modes.values()].flat();
    const total = all.reduce((a, b) => a + b, 0);
    const per = [...modes.keys()].sort().map((k) => {
      const xs = modes.get(k);
      return `${k.replace(/^scope\.js /, '')} ${xs.length}×, ${dur(xs.reduce((a, b) => a + b, 0))}, median ${dur(median(xs))}`;
    });
    const ofMode = (...ms) => [...modes].filter(([k]) => ms.includes(modeOf(k))).flatMap(([, xs]) => xs);
    const focused = ofMode('focused');
    const wide = ofMode('full', 'whole');
    const narrowed = !(focused.length && wide.length && median(focused) * 5 >= median(wide) * 4);
    add('test runs', total, `${plural(all.length, 'run', 'runs')}, ${dur(total)}; ${per.join('; ')}`, narrowed ? REVIEW_TESTS_LEVER
      : 'Lever: the focused command in `docs/agents/verification.md`, which did not narrow for this change set.');
  }
  for (const [k, g] of other) add(`command: ${k}`, g.ms, `${g.count}×, ${dur(g.ms)}`, NO_LEVER);

  const prompting = segments.map((s, i) => ({ s, i })).filter(({ s }) => s.promptingMode);
  if (prompting.length) {
    const ms = prompting.reduce((n, { s }) => n + s.times.tool, 0);
    const where = prompting.map(({ s, i }) => `#${i + 1} ${s.command} (${s.promptingMode})`).join(', ');
    add('permission mode', ms, `tool time in ${where}; approval waits are inside this time`, 'Lever: the permission mode.');
  }

  add('model time', sum('model'), `the model's own time across every phase`, NO_LEVER);
  const byType = new Map();
  for (const d of dispatches) {
    const t = d.agentType || '?';
    const g = byType.get(t) || { count: 0, span: [], human: [] };
    g.count += 1;
    g.span.push(...d.span);
    g.human.push(...d.human);
    byType.set(t, g);
  }
  for (const [t, g] of byType) add(`subagent time: ${t}`, measure(g.span) - measure(g.human), plural(g.count, 'dispatch', 'dispatches'), NO_LEVER);
  const byHook = new Map();
  for (const s of segments) for (const [n, ms] of Object.entries(s.hookWait)) byHook.set(n, (byHook.get(n) || 0) + ms);
  for (const [n, ms] of byHook) add(`hook time: ${n}`, ms, `across every phase`, NO_LEVER);

  if (human + idle > machine) {
    sinks.push({
      name: 'human wait and idle', ms: human + idle, lever: NO_LEVER,
      detail: `human wait ${dur(human)} and idle ${dur(idle)} exceed machine time ${dur(machine)}; this time was not machine time`,
    });
  }
  sinks.sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name));
  return { machine, sinks };
}

module.exports = { timeSinks, configuredTests, median };
