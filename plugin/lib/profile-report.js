'use strict';

// profile-report.js: renders a run profile as the printed report and holds the duration and plural
// formatting the report and the time sinks share (ADR 0103).

const plural = (k, one, many) => `${k} ${k === 1 ? one : many}`;

// --- report ------------------------------------------------------------------------------------
function dur(ms) {
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
}
const clock = (t) => new Date(t).toISOString().replace('T', ' ').slice(0, 19);

function render(p) {
  const cols = ['wall', 'subagent', 'tool', 'hook', 'model', 'human', 'idle'];
  const rows = p.segments.map((s, i) => [String(i + 1), s.command, clock(s.start), ...cols.map((c) => dur(s.times[c]))]);
  const head = ['#', 'phase', 'start (UTC)', ...cols.map((c) => (c === 'human' ? 'human wait' : c))];
  const width = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r) => '  ' + r.map((c, i) => (i < 3 ? c.padEnd(width[i]) : c.padStart(width[i]))).join('  ');
  const out = [`Run profile — ${p.slug}`, `Transcripts: ${p.dirs.join(', ')}`, '', 'Phases', line(head), ...rows.map(line)];
  out.push('', 'Human wait is time spent waiting for the operator, and is in no other column.');
  out.push('Idle is time nothing was running until something other than a typed prompt woke the session, and is in no other column.');
  out.push('A hook that records no duration stays inside the tool or model time around it.');
  p.segments.forEach((s, i) => {
    const hooks = Object.entries(s.hooks).map(([n, ms]) => `${n} ${dur(ms)}`);
    if (hooks.length) out.push(`  #${i + 1} hooks: ${hooks.join(', ')}`);
    if (s.promptingMode) out.push(`  #${i + 1} ran in permission mode ${s.promptingMode}: tool times include approval waits.`);
  });
  if (p.commands.length) {
    out.push('', 'Repeated commands (Bash, orchestrator and subagents)');
    for (const c of p.commands.slice(0, 15)) out.push(`  ${dur(c.total).padStart(7)}  ${String(c.count).padStart(3)}×  ${c.command}`);
    if (p.commands.length > 15) out.push(`  … and ${p.commands.length - 15} more`);
    out.push("  A compound call's time is shared among its commands by each command's median solo run across the repository's transcripts.");
    out.push('  A background call counts from its launch to its completion and can overlap other rows.');
  }
  if (p.dispatches.length) {
    out.push('', 'Dispatches');
    for (const d of p.dispatches) {
      const mark = d.batch === null ? '' : `  batch ${d.batch}${d.slowest ? ', slowest: waited for' : ''}`;
      const n = (v, unit) => (v === null ? '?' : `${v}${unit}`);
      const label = d.duration !== null ? dur(d.duration) : d.status || (d.pending ? 'not yet notified' : '? (unrecognized)');
      out.push(`  #${d.segment + 1} ${d.agentType || '?'} — ${d.description || '?'}: ${label}, ${n(d.toolUses, ' tools')}, ${n(d.tokens, ' tokens')}${mark}`);
    }
  }
  if (p.unfinished.length) {
    out.push('', 'Unfinished calls (no result, no duration):');
    for (const u of p.unfinished) out.push(`  #${u.segment + 1} ${u.tool}, started ${clock(u.t)}`);
  }
  if (p.unrecognized.length) {
    out.push('', `Unrecognized entries (${p.unrecognized.length}, not counted):`);
    for (const u of p.unrecognized.slice(0, 5)) out.push(`  ${u.file}:${u.line} — ${u.reason}`);
    if (p.unrecognized.length > 5) out.push(`  … and ${p.unrecognized.length - 5} more`);
  }
  out.push('', `Time sinks — machine time ${dur(p.machine)}; a machine-time sink holds at least 20% of it`);
  if (!p.sinks.length) out.push('  No dominant cause was found.');
  for (const s of p.sinks) out.push(`  ${dur(s.ms)}  ${s.name}: ${s.detail}`, `  ${s.lever}`);
  if (p.unfinished.length || p.unrecognized.length) {
    out.push(`  These figures exclude ${plural(p.unfinished.length, 'unfinished call', 'unfinished calls')} and ${plural(p.unrecognized.length, 'unrecognized entry', 'unrecognized entries')}.`);
  }
  return out.join('\n') + '\n';
}

module.exports = { render, dur, plural };
