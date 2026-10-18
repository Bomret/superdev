#!/usr/bin/env node
'use strict';

// profile.js — the run profile: where a scope run's wall-clock time went (ADR 0103).
//
//   node profile.js [slug]
//
// Reads the session and subagent transcripts Claude Code writes under
// `${CLAUDE_CONFIG_DIR:-~/.claude}/projects/`, and writes nothing there (INV-0101). The format is
// Claude Code's own and undocumented, so an entry lacking a field read here is reported as
// unrecognized rather than counted. Human wait and idle time never enter a machine total (INV-0102),
// and a tool call with no result carries no duration (INV-0103).

const fs = require('fs');
const path = require('path');
const { mainWorkTree } = require('../lib/main-work-tree.js');
const { SLUG_RE, CHANGE_TYPES } = require('../lib/ledger.js');
const { projectsDirFor, transcriptDirs, readSession } = require('../lib/transcripts.js');
const { commandKeys } = require('../lib/command-keys.js');
const { clip, sessionEvents, segmentsOf, times, REJECTED_INFO } = require('../lib/session-events.js');
const { timeSinks, configuredTests, median } = require('../lib/time-sinks.js');
const { render } = require('../lib/profile-report.js');

const QUIET_MODES = new Set(['auto', 'bypassPermissions']);
// Two more refusal shapes, also carried as the tool_result string in place of a usage object: the
// auto-mode classifier's own denial, and a PreToolUse:Agent hook's own block.
const DENIED_RE = /^Error: Permission for this action was denied by the Claude Code auto mode classifier/;
const BLOCKED_RE = /^Error: PreToolUse:Agent hook error:/;

// Domain shapes (CONTEXT.md):
// - Run profile: { slug, projectsDir, segments: PhaseSegment[], unfinished, unrecognized }
// - Phase segment: { command, args, session, start, end, times: { wall, subagent, tool, hook, human,
//   idle, model }, hooks: { <hook name>: ms }, hookWait: { <hook name>: ms }, promptingMode } — `hooks`
//   sums every hook's own duration, `hookWait` the wait the session had (parallel Stop hooks at their slowest)
// - Human wait: the `human` intervals `sessionEvents` collects; `times.human` is their measure.
// - Idle: the `idle` intervals `sessionEvents` collects; `times.idle` is their measure.

class ProfileError extends Error {}

// The right-hand side of a `BASE..branch` or `BASE...branch` review range, e.g. `816f89fe..feat/x`.
const RANGE_RE = /\.{2,3}([a-z][\w-]*)\/([A-Za-z0-9][\w.-]*)$/;

// The scopes one segment belongs to: named in its arguments, or run under a run root. An argument
// names a scope when it is a whole `<change-type>/<slug>` feature label, a `BASE..branch` (or
// `BASE...branch`) range whose right-hand side is one, or a bare slug given alone that some cwd read
// elsewhere in the transcripts evidences as a real run root — a free-form argument such as a sentence,
// or an unevidenced bare word, names none. Cwd attribution runs only when the arguments name no scope,
// since a named scope's own leftover cwd (a session that has not yet cd'ed into it) never dilutes it.
function scopesOf(seg, ev, repoRoot, evidenced) {
  const toks = seg.args.split(/\s+/).filter((t) => t && !t.startsWith('--'));
  const found = new Set();
  for (const tok of toks) {
    const range = RANGE_RE.exec(tok);
    const [type, slug, extra] = (range ? `${range[1]}/${range[2]}` : tok).split('/');
    if (CHANGE_TYPES.includes(type) && slug && extra === undefined && SLUG_RE.test(slug)) found.add(slug);
  }
  if (found.size) return found;
  if (toks.length === 1 && SLUG_RE.test(toks[0]) && evidenced.has(toks[0])) return new Set([toks[0]]);
  const scopes = path.join(repoRoot, '.superdev', 'scopes') + path.sep;
  for (const { t, cwd } of ev.cwds) {
    if (t < seg.start || t >= seg.end || !cwd.startsWith(scopes)) continue;
    found.add(cwd.slice(scopes.length).split(path.sep)[0]);
  }
  return found;
}

function profile({ projectsDir, repoRoot, slug }) {
  const dirs = transcriptDirs(projectsDir, repoRoot);
  if (!dirs.length) {
    throw new ProfileError(`no transcripts for ${repoRoot} under ${projectsDir}${slug ? ` (scope ${slug})` : ''}`);
  }
  const unrecognized = [];
  // Each session's parsed entries and subagent entries are read once, here, and released as soon as
  // `sessionEvents`/`segmentsOf` have distilled them: `perSession` keeps only that distillate, never
  // the raw `s` a whole 600 MB transcript tree would otherwise hold onto for the rest of the run.
  const perSession = [];
  // Every single-key Bash call's duration in every session read, by key: the weights a compound call
  // of the profiled scope splits by. Numbers only, so the raw entries stay releasable.
  const solo = new Map();
  let recognized = 0;
  for (const dir of dirs) {
    for (const n of fs.readdirSync(dir)) {
      if (!n.endsWith('.jsonl')) continue;
      const s = readSession(path.join(dir, n), unrecognized);
      recognized += s.entries.length;
      const ev = sessionEvents(s);
      for (const b of ev.bash) {
        const keys = commandKeys(b.command);
        b.keys = keys;
        if (keys.length === 1) {
          if (!solo.has(keys[0])) solo.set(keys[0], []);
          solo.get(keys[0]).push(b.ms);
        }
      }
      perSession.push({ ev, segs: segmentsOf(s) });
    }
  }
  if (!recognized) {
    throw new ProfileError(`format not recognized: no transcript entry under ${dirs.join(', ')} carries the fields the run profile reads`);
  }
  // A run root seen as a cwd anywhere in the transcripts read, whatever the segment — the evidence a
  // lone bare argument needs before it can name a scope (a fake scope such as "audit" or "staged"
  // otherwise never appears as a cwd, so it never qualifies).
  const scopesDir = path.join(repoRoot, '.superdev', 'scopes') + path.sep;
  const evidenced = new Set();
  for (const { ev } of perSession) {
    for (const { cwd } of ev.cwds) if (cwd.startsWith(scopesDir)) evidenced.add(cwd.slice(scopesDir.length).split(path.sep)[0]);
  }
  const all = [];
  for (const { ev, segs } of perSession) {
    for (const seg of segs) all.push({ seg, ev, scopes: scopesOf(seg, ev, repoRoot, evidenced) });
  }
  let target = slug;
  if (!target) {
    const latest = all.filter((x) => x.scopes.size).sort((a, b) => b.seg.end - a.seg.end)[0];
    target = latest && [...latest.scopes].sort()[0];
  }
  const mine = all.filter((x) => target && x.scopes.has(target)).sort((a, b) => a.seg.start - b.seg.start);
  if (!mine.length) {
    throw new ProfileError(`no phase segment for ${slug ? `scope ${slug}` : 'any scope'} in ${dirs.join(', ')}`);
  }
  const segments = [];
  const unfinished = [];
  const groups = new Map();
  const dispatches = [];
  const calls = []; // every Bash call of the profiled scope's segments, with the keys it ran
  mine.forEach(({ seg, ev }, i) => {
    const inSeg = (t) => t >= seg.start && t < seg.end;
    const mode = ev.modes.find((m) => inSeg(m.t) && !QUIET_MODES.has(m.mode));
    segments.push({ ...seg, ...times(seg, ev), promptingMode: mode ? mode.mode : null });
    for (const u of ev.unfinished) if (inSeg(u.t)) unfinished.push({ segment: i, tool: u.tool, t: u.t });
    for (const b of ev.bash) {
      if (!inSeg(b.t)) continue;
      const keys = b.keys;
      if (keys.length) calls.push({ keys, command: b.command, ms: b.ms, start: b.start, bg: b.bg, human: clip(ev.human, b.start, b.start + b.ms) });
    }
    for (const d of ev.dispatches) {
      if (!inSeg(d.t)) continue;
      const info = d.info || {};
      const num = (k) => (typeof info[k] === 'number' ? info[k] : null);
      // A background (run_in_background) dispatch's own result carries no figures at all — they
      // arrive later in a task-notification entry, keyed by this dispatch's tool-use id.
      const note = ev.notifications.get(d.id);
      const duration = num('totalDurationMs') ?? (note ? note.durationMs : null);
      const toolUses = num('totalToolUseCount') ?? (note ? note.toolUses : null);
      const tokens = num('totalTokens') ?? (note ? note.tokens : null);
      // A failed or killed dispatch's own notification carries a status and no usage at all — a real
      // result, never "not yet notified" and never a zero duration (INV-0101). A dispatch rejected at
      // the permission prompt, denied by the auto-mode classifier, or blocked by a PreToolUse:Agent
      // hook carries no notification at all, only its own tool_result's fixed or prefixed string
      // .
      const status = note && (note.status === 'failed' || note.status === 'killed') ? note.status :
        d.info === REJECTED_INFO ? 'rejected' :
        typeof d.info === 'string' && DENIED_RE.test(d.info) ? 'denied' :
        typeof d.info === 'string' && BLOCKED_RE.test(d.info) ? 'blocked' : null;
      // A background dispatch's own result never carries these figures by design (ADR 0103): its own
      // notification just has not arrived yet, which is not a format problem.
      const pending = duration === null && !status && info.status === 'async_launched';
      if (duration === null && !pending && !status) {
        unrecognized.push({ file: d.file, line: 0, reason: `Agent result for "${d.meta.description || d.id}" has no totalDurationMs` });
      }
      const span = clip([[d.start, d.end]], seg.start, seg.end);
      dispatches.push({
        agentType: d.meta.agentType || null, description: d.meta.description || null, duration,
        toolUses, tokens, segment: i, start: d.start, end: d.end, batch: null, slowest: false, pending, status,
        span, human: span.length ? clip(ev.human, span[0][0], span[0][1]) : [],
      });
    }
  });
  // A key's weight is the median duration of its single-key calls across the repository's transcripts;
  // a compound call's time splits by the weights of its keys, so the per-key totals sum to the Bash time
  // of every call that ran a command.
  const weight = new Map();
  for (const [k, xs] of solo) weight.set(k, median(xs));
  for (const c of calls) {
    const known = c.keys.filter((k) => weight.has(k)).map((k) => weight.get(k));
    const fill = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
    const ws = c.keys.map((k) => (weight.has(k) ? weight.get(k) : fill));
    const sum = ws.reduce((a, b) => a + b, 0);
    c.shares = c.keys.map((k, j) => (sum > 0 ? ws[j] / sum : 1 / c.keys.length));
    c.keys.forEach((k, j) => {
      const g = groups.get(k) || { command: k, count: 0, total: 0 };
      g.count += 1;
      g.total += sum > 0 ? (c.ms * ws[j]) / sum : c.ms / c.keys.length;
      groups.set(k, g);
    });
  }
  dispatches.sort((a, b) => a.start - b.start);
  // Dispatches whose time ranges overlap form a parallel batch; its longest is the one the run waited for.
  let batch = 0;
  for (let i = 0; i < dispatches.length; ) {
    let j = i + 1;
    let reach = dispatches[i].end;
    while (j < dispatches.length && dispatches[j].start < reach) reach = Math.max(reach, dispatches[j++].end);
    if (j - i > 1) {
      batch += 1;
      const members = dispatches.slice(i, j);
      for (const d of members) d.batch = batch;
      members.reduce((m, d) => ((d.end - d.start) > (m.end - m.start) ? d : m)).slowest = true;
    }
    i = j;
  }
  const commands = [...groups.values()].sort((a, b) => b.total - a.total);
  const { machine, sinks } = timeSinks(segments, calls, dispatches, configuredTests(repoRoot));
  return { slug: target, projectsDir, dirs, segments, unfinished, unrecognized, commands, dispatches, machine, sinks };
}

function main() {
  const slug = process.argv[2];
  if (slug !== undefined && !SLUG_RE.test(slug)) {
    process.stderr.write(`profile: "${slug}" is not a scope slug\n`);
    process.exit(2);
  }
  const repoRoot = mainWorkTree(process.cwd()) || process.cwd();
  try {
    process.stdout.write(render(profile({ projectsDir: projectsDirFor(process.env), repoRoot, slug })));
  } catch (err) {
    if (!(err instanceof ProfileError)) throw err;
    process.stderr.write(`profile: ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { profile, render, ProfileError, projectsDirFor };

if (require.main === module) main();
