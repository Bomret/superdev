#!/usr/bin/env node
'use strict';

// eval-run.js: the eval runner (ADR 0024). Runs every case under evals/ as two arms — one with the
// plugin loaded, one without — on a Claude subscription instead of a metered API key.
//
// The two properties `claude plugin eval` cannot hold at once:
//   isolation — a throwaway HOME, so the baseline arm cannot reach the maintainer's installed copy
//               of superdev (or their global CLAUDE.md, or their other plugins);
//   auth      — CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`, which survives that throwaway HOME.
// ANTHROPIC_API_KEY is scrubbed from every child, so no run can be billed by accident.

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const TOKEN_VAR = 'CLAUDE_CODE_OAUTH_TOKEN';
const KEY_VAR = 'ANTHROPIC_API_KEY';
// Every one of these can reach a billed request or defeat the throwaway-HOME isolation on its own:
// CLAUDE_CONFIG_DIR overrides where the CLI reads its config independently of HOME, so a maintainer
// who has it set would silently load their installed superdev into the baseline arm.
const SCRUB_VARS = [
  KEY_VAR,
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CONFIG_DIR',
];
const ARMS = ['plugin', 'baseline'];
// Judging burns the subscription usage window that is now the run's real budget, so it defaults to
// the cheap model — the same default `claude plugin eval` uses.
const DEFAULT_JUDGE = 'haiku';
// A transcript can reach hundreds of megabytes. The judge reads the tail, which is where a run's
// outcome is, and is told the head was cut so it never treats the cut as evidence of absence.
const JUDGE_INPUT_LIMIT = 400000;
// The ceiling spawnSync enforces on the agent's stdout and on the captured diff. classifyRun() needs
// the value by name, to tell a genuine buffer overflow apart from an agent that exited with no code.
const TRANSCRIPT_MAX_BUFFER = 256 * 1024 * 1024;
// The judge answers one JSON object and needs no tools; a hang here must not stall the whole run with
// no diagnostic, the way the arm spawn is already bounded by its own timeout.
const JUDGE_TIMEOUT_MS = 120 * 1000;

// A run that produced no usable transcript. Distinct from a run that scored 0: one says something
// about the harness, the other about the arm.
class RunError extends Error {}
// A grader that could not be evaluated. Also distinct from a grader that failed: collapsing the two
// is how an instrument quietly starts reporting that the plugin lost.
class GraderError extends Error {}

function fail(msg) {
  process.stderr.write(msg + '\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// case.yaml
// ---------------------------------------------------------------------------

// The cases use a fixed, shallow subset of YAML: scalars, one block scalar (`prompt: |`), and one
// sequence of scalars (`allowed_tools`). Reading those four shapes directly keeps the repo free of a
// YAML dependency, exactly as drift-check.js already reads the same files with plain matching.
function parseCase(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const scalar = (v) => v.trim().replace(/\s+#.*$/, '').replace(/^["'](.*)["']$/, '$1');

  const out = { allowed_tools: [] };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^(\s*)([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    const [, indent, key, rest] = kv;

    // Any block/folded scalar body (`|`, `>-`, …) is consumed here, not just the prompt's —
    // otherwise a prose line like `runs: 5` inside a `description: >-` body would silently
    // overwrite the case's real value.
    const blockMarker = rest.trim().match(/^[|>][+-]?$/);
    if (blockMarker) {
      const body = [];
      const inner = indent.length + 2;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() !== '' && lines[j].search(/\S/) < inner) break;
        body.push(lines[j].slice(inner));
        i = j;
      }
      if (key === 'prompt' && blockMarker[0][0] === '|') {
        out.prompt = body.join('\n').replace(/\s+$/, '') + '\n';
      }
      continue;
    }
    if (key === 'allowed_tools') {
      for (let j = i + 1; j < lines.length; j++) {
        const item = lines[j].match(/^\s*-\s+(.+)$/);
        if (!item) break;
        out.allowed_tools.push(scalar(item[1]));
        i = j;
      }
      continue;
    }
    if (rest.trim() === '') continue;
    if (['name', 'scaffold_script'].includes(key)) out[key] = scalar(rest);
    if (['timeout_seconds', 'runs'].includes(key)) out[key] = Number(scalar(rest));
  }
  return out;
}

// A `*` glob over case names, the same shape `claude plugin eval --case` accepts.
function globMatches(pattern, name) {
  const rx = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return rx.test(name);
}

function discoverCases(root, pattern) {
  const dir = path.join(root, 'evals');
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const cases = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(dir, entry.name, 'case.yaml');
    if (!fs.existsSync(file)) continue;
    const spec = parseCase(fs.readFileSync(file, 'utf8'));
    spec.dir = path.join(dir, entry.name);
    spec.name = spec.name || entry.name;
    if (pattern && !globMatches(pattern, spec.name)) continue;
    cases.push(spec);
  }
  return cases.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// the child process
// ---------------------------------------------------------------------------

// The environment every spawned agent gets. HOME points at a throwaway directory so the child cannot
// read the maintainer's installed plugins, and ANTHROPIC_API_KEY is removed rather than merely left
// unset by the caller — a key inherited from the parent shell would bill the whole run and look
// identical while doing it.
function childEnv(parentEnv, home) {
  const env = { ...parentEnv, HOME: home };
  for (const v of SCRUB_VARS) delete env[v];
  env[TOKEN_VAR] = parentEnv[TOKEN_VAR];
  return env;
}

// The plugin arm loads the working tree as a plugin; the baseline arm loads nothing. That single
// argument is the whole ablation.
// The prompt leads, because `--allowedTools` is variadic and swallows every argument that follows
// it. A prompt pushed last therefore lands inside the tool list, and the CLI exits 1 with "Input must
// be provided either through stdin or as a prompt argument". The plugin arm survived that by accident
// — its `--plugin-dir` ended the variadic list — so the arms differed by two things instead of one,
// and the baseline arm never ran at all.
function armArgs(spec, arm, pluginRoot) {
  const args = ['-p', spec.prompt || '', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions'];
  if (spec.allowed_tools && spec.allowed_tools.length) args.push('--allowedTools', ...spec.allowed_tools);
  if (arm === 'plugin') args.push('--plugin-dir', pluginRoot);
  return args;
}

// Three ways superdev shows up in a transcript. Matched precisely rather than by a bare `superdev`
// occurrence, because the scaffolded repo's own docs/agents/ files can name the plugin as a
// convention without the arm having loaded it.
const MARKERS = [
  ['command', /\/superdev:[a-z-]+/],
  ['subagent', /"subagent_type"\s*:\s*"superdev:[a-z-]+"/],
  ['hook', /superdev[^"]*\/hooks\/[a-z-]+\.js/],
];

function superdevMarkers(transcript) {
  return MARKERS.filter(([, rx]) => rx.test(transcript)).map(([kind]) => kind);
}

// A file-mutating tool call in the stream — the transcript's own evidence that the agent tried to
// change something. Paired with an empty captured diff, that combination means captureDiff missed
// real work rather than the agent doing nothing. Bash is included because every case's allowed_tools
// carries it and a heredoc through Bash is a normal way an agent writes a file.
const MUTATING_TOOL = /"name"\s*:\s*"(Write|Edit|MultiEdit|NotebookEdit|Bash)"/;

function transcriptShowsWork(transcript) {
  return MUTATING_TOOL.test(transcript);
}

function classifyRun({ status, timedOut, overBuffer, transcript }) {
  if (timedOut) return { ok: false, error: 'timed out' };
  // spawnSync reports a maxBuffer overflow as status: null, error.code: 'ENOBUFS' — indistinguishable
  // from "agent exited null" unless named explicitly.
  if (overBuffer) return { ok: false, error: `transcript exceeded the ${TRANSCRIPT_MAX_BUFFER / (1024 * 1024)} MB buffer` };
  if (status !== 0) return { ok: false, error: `agent exited ${status}` };
  if (!transcript || !transcript.trim()) return { ok: false, error: 'empty transcript' };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// running one arm
// ---------------------------------------------------------------------------

function scaffold(spec, workspace) {
  if (!spec.scaffold_script) throw new RunError(`${spec.name}: case.yaml names no scaffold_script`);
  const script = path.join(spec.dir, spec.scaffold_script);
  if (!fs.existsSync(script)) {
    throw new RunError(`${spec.name}: scaffold_script \`${spec.scaffold_script}\` does not resolve (${script})`);
  }
  const r = cp.spawnSync('bash', [script], { cwd: workspace, encoding: 'utf8' });
  if (r.status !== 0) throw new RunError(`${spec.name}: scaffold_script failed: ${(r.stderr || '').trim()}`);

  // Commit the scaffold so the arm's diff shows only what the agent did.
  //
  // The guard here is that the scaffold produced files at all: an empty artifact reported as the
  // agent's own output would read as the agent having done nothing. `git ls-files` asks that
  // directly. A non-zero `commit` is the wrong proxy for it, because a scaffold that runs `git init`
  // and commits its own tree — a legitimate thing for a scaffold to do — leaves nothing staged and
  // exits non-zero on a workspace that is fully populated. `--allow-empty` lets that case through,
  // pinning the diff to a commit whose tree is the scaffold's either way.
  const git = (...args) => {
    const res = cp.spawnSync('git', args, { cwd: workspace, encoding: 'utf8' });
    if (res.status !== 0) throw new RunError(`${spec.name}: git ${args[0]} failed: ${(res.stderr || '').trim()}`);
    return res;
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'eval@localhost');
  git('config', 'user.name', 'eval');
  git('add', '-A');
  if (!git('ls-files').stdout.trim()) throw new RunError(`${spec.name}: scaffold_script produced no files`);
  git('commit', '-qm', 'scaffold', '--allow-empty');
  return git('rev-parse', 'HEAD').stdout.trim();
}

// `git diff <base>` alone never reports an untracked path, and what an agent produces is overwhelmingly
// new files. `add -N` (intent-to-add) marks each one tracked against an empty blob, without touching
// the working tree or committing anything, so the diff that follows carries their full content as an
// addition.
//
// `base` is the scaffold commit `scaffold()` returned, never `HEAD`. HEAD moves when the agent commits
// — and superdev's own playbooks commit per slice — so diffing HEAD would show only what is left
// uncommitted, dropping everything the agent already checked in.
function captureDiff(workspace, base) {
  const git = (...args) => {
    const res = cp.spawnSync('git', ['-C', workspace, ...args], { encoding: 'utf8', maxBuffer: TRANSCRIPT_MAX_BUFFER });
    if (res.status !== 0) throw new RunError(`git ${args[0]} failed: ${(res.stderr || '').trim()}`);
    return res;
  };
  git('add', '-N', '.');

  // Two ways real agent work can sit outside what the diff below can show. Neither leaves the diff
  // empty — superdev's own ledger/plan scratch, or any other untracked bookkeeping in the checkout,
  // fills it — so an empty-diff check alone stays quiet while the diff scores the wrong thing.
  //
  // A commit reachable from some ref other than HEAD (e.g. a slice branch the agent committed to and
  // then left) was never in HEAD's working tree, so `git diff base` never sees it.
  const orphaned = git('log', '--oneline', '--all', '--not', 'HEAD', `${base}..`).stdout.trim();
  if (orphaned) {
    throw new RunError(`work exists outside the captured branch (commit not reachable from HEAD): ${orphaned.split('\n')[0]}`);
  }
  // A nested repository (a worktree the agent created, with its own `.git`) is recorded by `add -N` as
  // a gitlink (mode 160000) rather than its content — `git diff` never descends into one.
  const gitlink = git('ls-files', '-s').stdout.split('\n').find((l) => l.startsWith('160000 '));
  if (gitlink) {
    throw new RunError(`an embedded repository is tracked as a gitlink and cannot reach the diff: ${(gitlink.split('\t')[1] || gitlink).trim()}`);
  }

  return git('diff', base).stdout || '';
}

function runArm(spec, arm, opts) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), `eval-${spec.name}-${arm}-`));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `eval-home-${arm}-`));
  try {
    const scaffoldSha = scaffold(spec, workspace);
    const r = cp.spawnSync(opts.claudeBin || 'claude', armArgs(spec, arm, opts.pluginRoot), {
      cwd: workspace,
      env: childEnv(process.env, home),
      encoding: 'utf8',
      timeout: (spec.timeout_seconds || 900) * 1000,
      maxBuffer: TRANSCRIPT_MAX_BUFFER,
    });
    const transcript = r.stdout || '';
    const outDir = path.join(opts.outDir, spec.name, arm);
    fs.mkdirSync(outDir, { recursive: true });
    // Written before the diff is captured: a captureDiff failure must not cost the transcript, which is
    // the only evidence left to diagnose it with.
    fs.writeFileSync(path.join(outDir, 'transcript.jsonl'), transcript, 'utf8');

    let diff = '';
    let diffError = null;
    try {
      diff = captureDiff(workspace, scaffoldSha);
    } catch (e) {
      diffError = e.message;
    }
    fs.writeFileSync(path.join(outDir, 'diff.patch'), diff, 'utf8');

    let verdict = classifyRun({
      status: r.status,
      timedOut: r.error && r.error.code === 'ETIMEDOUT',
      overBuffer: r.error && r.error.code === 'ENOBUFS',
      transcript,
    });
    if (verdict.ok && diffError) verdict = { ok: false, error: `diff capture failed: ${diffError}` };
    const emptyDespiteWork = transcriptShowsWork(transcript) && !diff.trim();
    return { arm, outDir, transcript, diff, markers: superdevMarkers(transcript), emptyDespiteWork, ...verdict };
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// graders
// ---------------------------------------------------------------------------

// The same `graders/*.md` files `claude plugin eval` reads: YAML frontmatter, criteria prose below.
function readGrader(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new GraderError(`${path.basename(file)}: no \`---\` frontmatter block`);
  const fields = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim().replace(/^["'](.*)["']$/, '$1');
  }
  return {
    name: path.basename(file, '.md'),
    type: fields.type,
    weight: Number(fields.weight),
    focus: fields.focus || fields.target,
    criteria: m[2].trim(),
  };
}

function readGraders(caseDir) {
  const dir = path.join(caseDir, 'graders');
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  } catch {
    return [];
  }
  return files.map((f) => readGrader(path.join(dir, f)));
}

// `files` scores what the agent changed, `trace` scores how it got there. A grader naming anything
// else is a grader this runner cannot honour — reporting it as a failed grader would blame the arm
// for the harness's gap.
function graderInput(grader, arm) {
  if (grader.focus === 'files') return arm.diff;
  if (grader.focus === 'trace') return arm.transcript;
  throw new GraderError(`${grader.name}: unknown focus \`${grader.focus || '(missing)'}\``);
}

function judgePrompt(grader, input) {
  const cut = input.length > JUDGE_INPUT_LIMIT;
  const shown = cut ? input.slice(-JUDGE_INPUT_LIMIT) : input;
  return [
    'You are grading one artifact against one criterion. Answer only with the JSON object.',
    '',
    '## Criterion',
    '',
    grader.criteria,
    '',
    `## Artifact (${grader.focus})`,
    cut ? `[the first ${input.length - JUDGE_INPUT_LIMIT} characters were cut; judge what follows]` : '',
    '',
    shown,
  ].join('\n');
}

const VERDICT_SCHEMA = JSON.stringify({
  type: 'object',
  properties: { passed: { type: 'boolean' }, evidence: { type: 'string' } },
  required: ['passed', 'evidence'],
});

// The judge answers one JSON object and needs no tools, so it gets no permission bypass.
function judgeArgs(model, prompt) {
  return ['-p', '--model', model, '--json-schema', VERDICT_SCHEMA, prompt];
}

// Rooted at the judge's own throwaway home rather than the repo, so an over-privileged judge would
// still have nothing of the repo's working tree to reach. Bounded by JUDGE_TIMEOUT_MS, so a hung judge
// fails loudly instead of stalling the whole run.
function judgeSpawnOpts(env, home) {
  return { cwd: home, env, encoding: 'utf8', timeout: JUDGE_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 };
}

// The judge is told to answer with JSON and pinned to a schema, so a reply that will not parse is a
// glitch rather than a verdict. One retry, then it is a grader error — never a fail.
function parseVerdict(stdout) {
  const text = String(stdout || '').trim();
  const candidates = [text];
  const braced = text.match(/\{[\s\S]*\}/);
  if (braced) candidates.push(braced[0]);
  for (const c of candidates) {
    try {
      const v = JSON.parse(c);
      if (typeof v.passed === 'boolean') return { passed: v.passed, evidence: String(v.evidence || '') };
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

// A criteria block that will not compile is a broken grader, not a failed arm: it says nothing about
// what the agent did. Left unguarded, the SyntaxError escapes gradeOne's GraderError catch and takes the
// whole run down part-way — after real subscription spend, and with the completed arms unscored.
function gradeRegex(grader, input) {
  const pattern = grader.criteria.trim();
  let rx;
  try {
    rx = new RegExp(pattern, 'm');
  } catch (e) {
    throw new GraderError(`${grader.name}: criteria is not a valid regex — ${e.message}`);
  }
  const passed = rx.test(input);
  return { passed, evidence: `pattern \`${pattern}\` ${passed ? 'found' : 'not found'} in ${grader.focus}` };
}

function gradeOne(grader, arm, opts) {
  const base = { name: grader.name, weight: grader.weight, focus: grader.focus };
  try {
    const input = graderInput(grader, arm);
    if (grader.type === 'regex') return { ...base, ...gradeRegex(grader, input) };
    if (grader.type !== 'llm') throw new GraderError(`${grader.name}: type \`${grader.type}\` is not supported`);

    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-judge-'));
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = cp.spawnSync(
          opts.claudeBin || 'claude',
          judgeArgs(opts.judgeModel, judgePrompt(grader, input)),
          judgeSpawnOpts(childEnv(process.env, home), home),
        );
        const verdict = parseVerdict(r.stdout);
        if (verdict) return { ...base, ...verdict };
      }
      throw new GraderError(`${grader.name}: the judge did not return a verdict`);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  } catch (e) {
    if (!(e instanceof GraderError)) throw e;
    return { ...base, error: e.message };
  }
}

// An errored grader is left out of both halves of the fraction. Scoring it as a fail would let a
// harness gap read as a worse arm.
function scoreArm(results) {
  const scored = results.filter((r) => !r.error);
  const total = scored.reduce((n, r) => n + r.weight, 0);
  if (!total) return null;
  return scored.reduce((n, r) => n + (r.passed ? r.weight : 0), 0) / total;
}

function gradeArm(graders, arm, opts) {
  return graders.map((g) => gradeOne(g, arm, opts));
}

// ---------------------------------------------------------------------------
// aggregation and the report
// ---------------------------------------------------------------------------

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// The mean alone invites reading noise as signal: a delta smaller than the spread across runs is not
// a result. Both numbers travel together for that reason.
function summarize(values) {
  if (!values.length) return null;
  return { mean: mean(values), spread: Math.max(...values) - Math.min(...values), n: values.length };
}

function delta(plugin, baseline) {
  if (!plugin || !baseline) return null;
  return plugin.mean - baseline.mean;
}

// One case's runs — every run is a fresh scaffold and a fresh pair of arms — folded into per-grader
// and whole-case numbers. An errored run contributes nothing rather than a zero: averaging a broken
// harness in as a zero would read as a plugin that lost.
function aggregate(name, runs) {
  const graderNames = [];
  for (const r of runs) {
    for (const arm of ARMS) {
      for (const g of (r[arm] && r[arm].graders) || []) if (!graderNames.includes(g.name)) graderNames.push(g.name);
    }
  }
  const pick = (arm, fn) => runs.filter((r) => r[arm] && r[arm].ok).map(fn).filter((v) => v !== null && v !== undefined);

  const graders = graderNames.map((gn) => {
    const per = (arm) =>
      summarize(
        pick(arm, (r) => {
          const g = r[arm].graders.find((x) => x.name === gn);
          return g && !g.error ? (g.passed ? 1 : 0) : null;
        }),
      );
    const p = per('plugin');
    const b = per('baseline');
    const weight = (runs.flatMap((r) => ARMS.flatMap((a) => (r[a] && r[a].graders) || [])).find((g) => g.name === gn) || {}).weight;
    return { name: gn, weight, plugin: p, baseline: b, delta: delta(p, b) };
  });

  // `scoreArm` promises an errored grader is left out of both halves of the fraction, and cannot keep
  // that promise on its own: it is called per arm, before the other arm has been graded. So the
  // comparable score is computed here, where both arms of a run are in hand. A grader that errored on
  // either arm is dropped from both. Left asymmetric, the arms are scored over different weight
  // totals — a plugin arm whose only failing grader errored beats a baseline that still carries it,
  // and the delta reports that arithmetic rather than the plugin.
  const comparableScore = (r, arm) => {
    if (!(r[arm] && r[arm].ok)) return null;
    const errored = new Set(ARMS.flatMap((a) => ((r[a] && r[a].graders) || []).filter((x) => x.error).map((x) => x.name)));
    return scoreArm(r[arm].graders.filter((x) => !errored.has(x.name)));
  };
  const scoreOf = (arm) => summarize(pick(arm, (r) => comparableScore(r, arm)));
  const p = scoreOf('plugin');
  const b = scoreOf('baseline');
  const errors = runs.flatMap((r) => ARMS.map((a) => r[a]).filter((x) => x && !x.ok).map((x) => x.error));

  // superdevMarkers() is the only evidence --plugin-dir actually loaded the plugin and the baseline
  // arm stayed clean. Checked only over runs that completed for that arm — an arm that never ran is
  // already reported through `errors`, not through a broken-ablation claim.
  const okRuns = (arm) => runs.filter((r) => r[arm] && r[arm].ok);
  const anyMarked = (arm) => okRuns(arm).some((r) => r[arm].markers && r[arm].markers.length > 0);
  const pluginOk = okRuns('plugin');
  const baselineOk = okRuns('baseline');
  const markers = { plugin: anyMarked('plugin'), baseline: anyMarked('baseline') };
  const brokenAblation = (pluginOk.length > 0 && !markers.plugin) || (baselineOk.length > 0 && markers.baseline);

  // The sibling signal to brokenAblation: the transcript shows the agent tried to change files, but
  // captureDiff came back empty. That points at the harness, not at the arm having done nothing.
  const anyEmptyDespiteWork = (arm) => okRuns(arm).some((r) => r[arm].emptyDespiteWork);
  const emptyDiffDespiteWork = { plugin: anyEmptyDespiteWork('plugin'), baseline: anyEmptyDespiteWork('baseline') };

  const noScore = !p && !b;
  // "No run completed" and "every grader errored" are different faults with different fixes; collapsing
  // them sends the reader to the wrong one.
  const ranNothing = noScore && !runs.some((r) => (r.plugin && r.plugin.ok) || (r.baseline && r.baseline.ok));
  // An arm that errored in every run leaves the other arm's score with nothing to compare against.
  // `noScore` does not catch it, because one surviving arm still produces a number — and a table
  // showing the plugin arm alone is the most flattering wrong answer this runner can print.
  const armNeverRan = { plugin: pluginOk.length === 0, baseline: baselineOk.length === 0 };
  return {
    case: name,
    runs: runs.length,
    graders,
    score: { plugin: p, baseline: b, delta: delta(p, b) },
    errors,
    markers,
    brokenAblation,
    emptyDiffDespiteWork,
    armNeverRan,
    failed: noScore,
    ranNothing,
  };
}

function fmt(s) {
  return s === null || s === undefined ? '   —  ' : `${s.mean.toFixed(2)}±${s.spread.toFixed(2)}`;
}

function renderTable(aggregates) {
  const out = [];
  for (const a of aggregates) {
    out.push('');
    out.push(`${a.case}  (${a.runs} run${a.runs === 1 ? '' : 's'})`);
    out.push('  GRADER                          W   WITH      WITHOUT   DELTA');
    for (const g of a.graders) {
      const d = g.delta === null ? '  —' : (g.delta >= 0 ? '+' : '') + g.delta.toFixed(2);
      out.push(`  ${g.name.padEnd(30)} ${String(g.weight ?? '?').padEnd(3)} ${fmt(g.plugin).padEnd(9)} ${fmt(g.baseline).padEnd(9)} ${d}`);
    }
    const d = a.score.delta === null ? '  —' : (a.score.delta >= 0 ? '+' : '') + a.score.delta.toFixed(2);
    out.push(`  ${'SCORE'.padEnd(30)} ${''.padEnd(3)} ${fmt(a.score.plugin).padEnd(9)} ${fmt(a.score.baseline).padEnd(9)} ${d}`);
    for (const e of a.errors) out.push(`  ! errored run: ${e}`);
    if (a.failed) out.push(a.ranNothing ? '  ! every run errored — this case scored nothing' : '  ! every grader errored — this case scored nothing');
    if (a.brokenAblation) {
      const bits = [];
      if (!a.markers.plugin) bits.push('the plugin arm shows no superdev markers');
      if (a.markers.baseline) bits.push('the baseline arm shows superdev markers');
      out.push(`  ! broken ablation: ${bits.join(' and ')} — --plugin-dir is not isolating the arms`);
    }
    if (a.emptyDiffDespiteWork.plugin || a.emptyDiffDespiteWork.baseline) {
      const bits = [];
      if (a.emptyDiffDespiteWork.plugin) bits.push('plugin');
      if (a.emptyDiffDespiteWork.baseline) bits.push('baseline');
      out.push(`  ! empty diff despite visible work: the ${bits.join(' and ')} arm's transcript shows tool use but the captured diff is empty`);
    }
    if (a.armNeverRan && (a.armNeverRan.plugin || a.armNeverRan.baseline) && !a.failed) {
      const arm = a.armNeverRan.plugin ? 'plugin' : 'baseline';
      out.push(`  ! the ${arm} arm never completed a run — the other arm's score has nothing to compare against`);
    }
  }
  out.push('');
  out.push('mean±spread across runs. A delta smaller than the spread is not a result.');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

// One line per arm per run. Markers travel here too — they are the only evidence --plugin-dir loaded
// the plugin, and a table printed only at the end is too late to catch a run worth stopping early.
function formatRunLine(name, arm, n, total, r) {
  if (!r.ok) return `${name} run ${n}/${total} · ${arm}: ERROR ${r.error}`;
  const markers = r.markers && r.markers.length ? r.markers.join(',') : 'none';
  return `${name} run ${n}/${total} · ${arm}: score ${r.score === null ? 'n/a' : r.score.toFixed(2)} markers=${markers}`;
}

function parseArgs(argv) {
  const opts = { case: null, judgeModel: DEFAULT_JUDGE };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--case') opts.case = argv[++i];
    else if (argv[i] === '--output-dir') opts.outDir = argv[++i];
    else if (argv[i] === '--judge-model') opts.judgeModel = argv[++i];
    else if (argv[i] === '--runs') opts.runs = Number(argv[++i]);
  }
  return opts;
}

function run(argv, root) {
  const opts = parseArgs(argv);
  if (!process.env[TOKEN_VAR]) {
    fail(
      `${TOKEN_VAR} is not set. Run \`claude setup-token\` and export it — the runner will not fall ` +
        `back to ${KEY_VAR}, because that bills a metered API key.`,
    );
  }
  const cases = discoverCases(root, opts.case);
  if (!cases.length) fail(opts.case ? `no case matches \`${opts.case}\`` : 'no cases found under evals/');

  const outDir = opts.outDir || path.join(root, 'evals', 'results', new Date().toISOString().replace(/[:.]/g, '-'));
  const aggregates = [];
  for (const spec of cases) {
    const graders = readGraders(spec.dir);
    const total = opts.runs || spec.runs || 1;
    const runs = [];
    for (let n = 1; n <= total; n++) {
      const runResult = {};
      for (const arm of ARMS) {
        try {
          const res = runArm(spec, arm, { pluginRoot: path.join(root, 'plugin'), outDir: path.join(outDir, `run-${n}`) });
          const graded = res.ok ? gradeArm(graders, res, opts) : [];
          runResult[arm] = { ok: res.ok, error: res.error, markers: res.markers, graders: graded, score: scoreArm(graded) };
        } catch (e) {
          if (!(e instanceof RunError)) throw e;
          runResult[arm] = { ok: false, error: e.message, graders: [] };
        }
        const r = runResult[arm];
        console.log(formatRunLine(spec.name, arm, n, total, r));
      }
      runs.push(runResult);
    }
    aggregates.push(aggregate(spec.name, runs));
  }

  console.log(renderTable(aggregates));
  fs.mkdirSync(outDir, { recursive: true });
  const resultFile = path.join(outDir, 'result.json');
  fs.writeFileSync(resultFile, JSON.stringify(aggregates, null, 2), 'utf8');
  console.log(`\nresults: ${resultFile}`);
  return aggregates;
}

// A broken ablation, or an empty diff despite visible work, is as much a reason to fail the run as a
// scoreless case: an unattended run that exits 0 while the capture collapsed reports a result that
// never happened.
function shouldFailExit(aggregates) {
  return aggregates.some(
    (a) =>
      a.failed ||
      a.brokenAblation ||
      a.emptyDiffDespiteWork.plugin ||
      a.emptyDiffDespiteWork.baseline ||
      (a.armNeverRan && (a.armNeverRan.plugin || a.armNeverRan.baseline)),
  );
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) return selftest();
  const aggregates = run(argv, process.cwd());
  if (shouldFailExit(aggregates)) process.exitCode = 1;
}

function selftest() {
  const assert = require('assert');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-run-selftest-'));
  try {
    // --- case.yaml reading -------------------------------------------------
    const yaml = [
      'name: ab-plan-edge-case',
      'description: >-',
      '  prose that happens to mention',
      '  runs: 5 and timeout_seconds: 60 inline.',
      'context:',
      '  scaffold_script: scaffold.sh',
      'execution:',
      '  prompt: |',
      '    Plan this feature.',
      '',
      '    Feature: widgets.',
      '  max_turns: 40',
      '  timeout_seconds: 900',
      '  allowed_tools:',
      '    - Read',
      '    - Bash',
      'runs: 3',
      '',
    ].join('\n');
    const spec = parseCase(yaml);
    assert.strictEqual(spec.name, 'ab-plan-edge-case');
    assert.strictEqual(spec.scaffold_script, 'scaffold.sh');
    // both real values survive the `runs:`/`timeout_seconds:` lines inside the description's
    // folded-scalar body — the body is consumed, not key-matched
    assert.strictEqual(spec.runs, 3);
    assert.strictEqual(spec.timeout_seconds, 900);
    assert.deepStrictEqual(spec.allowed_tools, ['Read', 'Bash']);
    assert.ok(spec.prompt.startsWith('Plan this feature.'), 'block scalar starts at its first line');
    assert.ok(spec.prompt.includes('\n\nFeature: widgets.'), 'a blank line inside the block is kept');
    assert.ok(!spec.prompt.includes('max_turns'), 'the block scalar stops at the next key');

    // The repo's own cases must read cleanly — the runner drives them unchanged.
    const real = discoverCases(path.join(__dirname, '..'), null);
    assert.ok(real.length >= 1, 'the repo\'s own evals/ cases are discovered');
    for (const c of real) {
      assert.ok(c.prompt && c.prompt.trim(), `${c.name} has a prompt`);
      assert.ok(c.scaffold_script, `${c.name} names a scaffold_script`);
    }
    assert.deepStrictEqual(
      discoverCases(path.join(__dirname, '..'), 'ab-plan-*').map((c) => c.name).sort(),
      ['ab-plan-edge-case', 'ab-plan-multi-slice', 'ab-plan-multi-slice-primed', 'ab-plan-primed'],
      '--case selects exactly the plan cases',
    );
    assert.strictEqual(discoverCases(path.join(__dirname, '..'), 'nope-*').length, 0, 'a glob matching nothing selects nothing');

    // --- the child environment ---------------------------------------------
    const env = childEnv(
      {
        [KEY_VAR]: 'sk-ant-REAL',
        [TOKEN_VAR]: 'oat-token',
        PATH: '/bin',
        ANTHROPIC_AUTH_TOKEN: 'x',
        ANTHROPIC_BASE_URL: 'https://proxy.example',
        CLAUDE_CODE_USE_BEDROCK: '1',
        CLAUDE_CODE_USE_VERTEX: '1',
        CLAUDE_CODE_USE_FOUNDRY: '1',
        CLAUDE_CONFIG_DIR: '/Users/maintainer/.claude',
      },
      '/tmp/home',
    );
    assert.ok(!(KEY_VAR in env), 'the API key never reaches the child, even when the parent exports one');
    assert.strictEqual(env[TOKEN_VAR], 'oat-token', 'the subscription token is forwarded');
    assert.strictEqual(env.HOME, '/tmp/home', 'the child gets the throwaway HOME');
    assert.strictEqual(env.PATH, '/bin', 'the rest of the environment is inherited');
    assert.ok(!('ANTHROPIC_AUTH_TOKEN' in env), 'an auth-token alternative to the API key is also scrubbed');
    assert.ok(!('ANTHROPIC_BASE_URL' in env), 'a proxied base URL is also scrubbed');
    assert.ok(!('CLAUDE_CODE_USE_BEDROCK' in env), 'a Bedrock billing path is also scrubbed');
    assert.ok(!('CLAUDE_CODE_USE_VERTEX' in env), 'a Vertex billing path is also scrubbed');
    assert.ok(!('CLAUDE_CODE_USE_FOUNDRY' in env), 'a Foundry billing path is also scrubbed');
    assert.ok(
      !('CLAUDE_CONFIG_DIR' in env),
      'CLAUDE_CONFIG_DIR is scrubbed — left set, it overrides HOME and silently defeats the whole isolation',
    );

    // --- the two arms differ by exactly one argument ------------------------
    const s = { name: 'c', prompt: 'do it', allowed_tools: ['Read'] };
    const withPlugin = armArgs(s, 'plugin', '/repo');
    const baseline = armArgs(s, 'baseline', '/repo');
    assert.ok(withPlugin.includes('--plugin-dir'), 'the plugin arm loads the working tree');
    assert.strictEqual(withPlugin[withPlugin.indexOf('--plugin-dir') + 1], '/repo');
    assert.ok(!baseline.includes('--plugin-dir'), 'the baseline arm loads nothing');
    assert.deepStrictEqual(
      withPlugin.filter((a) => a !== '--plugin-dir' && a !== '/repo'),
      baseline,
      'the arms are otherwise identical',
    );
    assert.ok(baseline.includes('--allowedTools') && baseline.includes('Read'), 'the case\'s allowed_tools reach the child');

    // Comparing the two arg arrays against each other cannot see an argument the CLI itself rejects.
    // It did not: `--allowedTools` is variadic, so a prompt pushed after it was swallowed into the tool
    // list, and only the plugin arm survived — its `--plugin-dir` happened to end that list. The
    // baseline arm exited 1 with an empty transcript, and the table reported the plugin arm alone.
    // So this asserts what the CLI would see, on both arms.
    for (const arm of ARMS) {
      const args = armArgs({ name: 'c', prompt: 'the prompt', allowed_tools: ['Read', 'Bash'] }, arm, '/repo');
      const toolsAt = args.indexOf('--allowedTools');
      const promptAt = args.indexOf('the prompt');
      assert.notStrictEqual(promptAt, -1, `the ${arm} arm passes the prompt at all`);
      assert.ok(
        promptAt < toolsAt,
        `the ${arm} arm's prompt precedes the variadic --allowedTools, which would otherwise swallow it`,
      );
    }

    // The same property through a real spawn: a fake CLI records its own argv, and both arms must show
    // the prompt as an argument no variadic flag consumed.
    {
      const argvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-argv-'));
      const recorder = path.join(argvDir, 'fake-claude.sh');
      fs.writeFileSync(
        recorder,
        '#!/bin/bash\nprintf "%s\\n" "$@" > "$ARGV_LOG"\necho \'{"type":"result"}\'\n',
        'utf8',
      );
      fs.chmodSync(recorder, 0o755);
      const caseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-argv-case-'));
      fs.writeFileSync(path.join(caseDir, 'scaffold.sh'), '#!/bin/bash\necho seed > seed.txt\n', 'utf8');
      const spec = {
        name: 'argv', dir: caseDir, scaffold_script: 'scaffold.sh',
        prompt: 'PROMPT_SENTINEL\n', allowed_tools: ['Read', 'Bash'], timeout_seconds: 60,
      };
      for (const arm of ARMS) {
        const log = path.join(argvDir, `${arm}.argv`);
        process.env.ARGV_LOG = log;
        runArm(spec, arm, { claudeBin: recorder, pluginRoot: '/repo', outDir: path.join(argvDir, 'out') });
        const seen = fs.readFileSync(log, 'utf8').split('\n');
        assert.ok(
          seen.some((a) => a.includes('PROMPT_SENTINEL')),
          `the ${arm} arm's child process actually received the prompt`,
        );
      }
      delete process.env.ARGV_LOG;
      fs.rmSync(argvDir, { recursive: true, force: true });
      fs.rmSync(caseDir, { recursive: true, force: true });
    }

    // --- superdev markers ---------------------------------------------------
    assert.deepStrictEqual(superdevMarkers('ran /superdev:plan for you'), ['command']);
    assert.deepStrictEqual(superdevMarkers('{"subagent_type":"superdev:implementer"}'), ['subagent']);
    assert.deepStrictEqual(superdevMarkers('node /x/superdev/0.28.0/hooks/run-lock.js'), ['hook']);
    assert.deepStrictEqual(
      superdevMarkers('the repo conventions mention superdev as a workflow'),
      [],
      'a bare mention of the plugin is not a marker — the scaffold docs name it and the baseline arm reads them',
    );

    // --- a run that produced nothing is an error, not a zero ----------------
    assert.deepStrictEqual(classifyRun({ status: 0, transcript: '{"x":1}' }), { ok: true });
    assert.strictEqual(classifyRun({ status: 0, timedOut: true, transcript: '' }).error, 'timed out');
    assert.strictEqual(classifyRun({ status: 1, transcript: 'x' }).error, 'agent exited 1');
    assert.strictEqual(classifyRun({ status: 0, transcript: '' }).error, 'empty transcript');
    assert.strictEqual(classifyRun({ status: 0, transcript: '   ' }).error, 'empty transcript', 'whitespace is not a transcript');
    assert.strictEqual(
      classifyRun({ status: null, overBuffer: true, transcript: 'x' }).error,
      'transcript exceeded the 256 MB buffer',
      'a maxBuffer overflow is named, not reported as "agent exited null"',
    );

    // --- a missing scaffold spawns nothing -----------------------------------
    assert.throws(
      () => scaffold({ name: 'c', dir: tmp, scaffold_script: 'absent.sh' }, tmp),
      (e) => e instanceof RunError && /does not resolve/.test(e.message),
      'a scaffold_script that does not resolve fails the case by name',
    );

    // --- an empty scaffold fails loudly, not with a silent empty artifact ----
    fs.writeFileSync(path.join(tmp, 'empty.sh'), '', 'utf8');
    const emptyWs = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-empty-scaffold-'));
    try {
      assert.throws(
        () => scaffold({ name: 'c', dir: tmp, scaffold_script: 'empty.sh' }, emptyWs),
        (e) => e instanceof RunError && /produced no files/.test(e.message),
        'a scaffold that adds nothing raises a RunError instead of `|| \'\'` turning it into a silent empty artifact',
      );
    } finally {
      fs.rmSync(emptyWs, { recursive: true, force: true });
    }

    // --- a scaffold that commits its own tree is scaffolded, not failed ------
    // Leaving nothing staged is not the same as producing nothing. Keying the empty-scaffold guard on
    // a non-zero `commit` conflated the two and made every self-committing case unrunnable.
    fs.writeFileSync(
      path.join(tmp, 'self-commit.sh'),
      '#!/bin/bash\nset -e\necho seed > seed.txt\ngit init -q -b main\ngit config user.email s@l\ngit config user.name s\ngit add -A\ngit commit -qm "scaffold commits itself"\n',
      'utf8',
    );
    const selfWs = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-self-commit-'));
    try {
      const sha = scaffold({ name: 'c', dir: tmp, scaffold_script: 'self-commit.sh' }, selfWs);
      assert.match(sha, /^[0-9a-f]{40}$/, 'a scaffold that commits its own tree still yields a base SHA');
      const tracked = cp.spawnSync('git', ['-C', selfWs, 'ls-tree', '--name-only', sha], { encoding: 'utf8' }).stdout;
      assert.ok(tracked.includes('seed.txt'), 'and the base commit carries the scaffold\'s files, so the arm diffs against real content');
    } finally {
      fs.rmSync(selfWs, { recursive: true, force: true });
    }

    // --- diff capture sees new files too, and survives the agent committing (the real capture path) ---
    const dtmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-diff-'));
    try {
      const dgit = (...args) => cp.spawnSync('git', ['-C', dtmp, ...args], { encoding: 'utf8' });
      dgit('init', '-q', '-b', 'main');
      dgit('config', 'user.email', 'eval@localhost');
      dgit('config', 'user.name', 'eval');
      fs.writeFileSync(path.join(dtmp, 'seed.txt'), 'seed\n');
      dgit('add', '-A');
      dgit('commit', '-qm', 'seed');
      const base = dgit('rev-parse', 'HEAD').stdout.trim();

      // the agent commits a change — HEAD moves past `base`, which is the asymmetric half of the bug
      fs.writeFileSync(path.join(dtmp, 'committed.txt'), 'agent committed this\n');
      dgit('add', '-A');
      dgit('commit', '-qm', 'agent commit');

      // ...and also leaves a file untracked
      fs.writeFileSync(path.join(dtmp, 'new-file.txt'), 'agent wrote this\n');

      const capturedDiff = captureDiff(dtmp, base);
      assert.ok(capturedDiff.includes('new-file.txt'), 'an untracked new file appears in the captured diff');
      assert.ok(capturedDiff.includes('agent wrote this'), 'and its content is included, not just its name');
      assert.ok(
        capturedDiff.includes('committed.txt'),
        'a change the agent committed also appears — diffing HEAD alone would miss it once HEAD moved past the scaffold',
      );
      assert.ok(capturedDiff.includes('agent committed this'), 'and its content is included too');
    } finally {
      fs.rmSync(dtmp, { recursive: true, force: true });
    }

    // --- scaffold returns the commit SHA it just made, so the diff can be pinned to it -------------
    const scaffoldWs = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-scaffold-sha-'));
    try {
      fs.writeFileSync(path.join(tmp, 'seed.sh'), '#!/bin/bash\necho seed > seed.txt\n', 'utf8');
      const sha = scaffold({ name: 'c', dir: tmp, scaffold_script: 'seed.sh' }, scaffoldWs);
      assert.match(sha, /^[0-9a-f]{40}$/, 'scaffold returns the commit SHA it just created');
      const headSha = cp.spawnSync('git', ['-C', scaffoldWs, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
      assert.strictEqual(sha, headSha, 'the returned SHA is the scaffold commit, not something else');
    } finally {
      fs.rmSync(scaffoldWs, { recursive: true, force: true });
    }

    // --- a diff-capture failure does not cost the transcript — it is written first ------------------
    const armWs = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-arm-diff-fail-'));
    try {
      fs.writeFileSync(path.join(tmp, 'noop.sh'), '#!/bin/bash\necho work > file.txt\n', 'utf8');
      const fakeClaude = path.join(tmp, 'fake-claude.sh');
      // Simulates an agent that runs `git init` (or similar) inside the workspace: by the time
      // captureDiff runs, `.git` is gone and `git add -N .` exits nonzero.
      fs.writeFileSync(fakeClaude, '#!/bin/bash\nrm -rf .git\necho \'{"type":"result"}\'\n', 'utf8');
      fs.chmodSync(fakeClaude, 0o755);
      const armOutDir = path.join(armWs, 'out');
      const res = runArm(
        { name: 'diff-fail-case', dir: tmp, scaffold_script: 'noop.sh', prompt: 'x', allowed_tools: [] },
        'plugin',
        { claudeBin: fakeClaude, pluginRoot: '/repo', outDir: armOutDir },
      );
      assert.strictEqual(res.ok, false, 'a diff-capture failure still fails the run');
      assert.ok(/diff capture failed/.test(res.error), 'the failure names the diff capture, not a generic error');
      const savedTranscript = fs.readFileSync(path.join(res.outDir, 'transcript.jsonl'), 'utf8');
      assert.ok(savedTranscript.includes('"type":"result"'), 'the transcript is saved even though the diff capture failed');
    } finally {
      fs.rmSync(armWs, { recursive: true, force: true });
    }

    // --- transcriptShowsWork is exercised through the real capture path, not a hand-built fixture ---
    // Every emptyDespiteWork assertion elsewhere in this file feeds aggregate() a fixture with the flag
    // already set. This drives runArm() end to end: a fake `claude` binary emits a mutating tool-call
    // line but never touches the workspace, so emptyDespiteWork has to come from transcriptShowsWork()
    // reading its own output, not from a fixture pretending it already ran.
    const workWs = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-transcript-work-'));
    try {
      fs.writeFileSync(path.join(tmp, 'noop2.sh'), '#!/bin/bash\necho seed > seed2.txt\n', 'utf8');

      const fakeWrite = path.join(tmp, 'fake-claude-write.sh');
      fs.writeFileSync(fakeWrite, '#!/bin/bash\necho \'{"name":"Write"}\'\n', 'utf8');
      fs.chmodSync(fakeWrite, 0o755);
      const writeRes = runArm(
        { name: 'write-no-file', dir: tmp, scaffold_script: 'noop2.sh', prompt: 'x', allowed_tools: [] },
        'plugin',
        { claudeBin: fakeWrite, pluginRoot: '/repo', outDir: path.join(workWs, 'write-out') },
      );
      assert.strictEqual(writeRes.ok, true, 'the run itself succeeds — only the diff is empty');
      assert.strictEqual(writeRes.emptyDespiteWork, true, 'a Write tool call with no filesystem change is caught through the real capture path');

      // A heredoc through Bash is a normal way an agent writes a file, and every case's allowed_tools
      // includes Bash — it must give the same signal as Write/Edit/MultiEdit/NotebookEdit.
      const fakeBash = path.join(tmp, 'fake-claude-bash.sh');
      fs.writeFileSync(fakeBash, '#!/bin/bash\necho \'{"name":"Bash","input":{"command":"cat > f.txt <<EOF\\nhi\\nEOF"}}\'\n', 'utf8');
      fs.chmodSync(fakeBash, 0o755);
      const bashRes = runArm(
        { name: 'bash-no-file', dir: tmp, scaffold_script: 'noop2.sh', prompt: 'x', allowed_tools: [] },
        'plugin',
        { claudeBin: fakeBash, pluginRoot: '/repo', outDir: path.join(workWs, 'bash-out') },
      );
      assert.strictEqual(bashRes.emptyDespiteWork, true, 'a Bash tool call is also mutating work — a heredoc write should not go unsignalled');
    } finally {
      fs.rmSync(workWs, { recursive: true, force: true });
    }

    // --- a capture that misses real work is reported as a run error, not scored quietly -------------
    // Two shapes of the same bug, both exercised through runArm() end to end (real git, real spawn): a
    // fake `claude` that commits the agent's "real" work on a branch other than the one left checked
    // out (a slice branch inside a nested worktree, in the real case), and one that leaves a nested
    // repository behind (a worktree's own `.git`, recorded as a gitlink once `add -N` tracks it). In
    // both, `git diff <base>` alone reports something — the ledger/plan scratch superdev itself leaves
    // in the checkout — so an empty-diff check alone stays quiet while the diff scores the wrong thing.
    const captureWs = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-capture-miss-'));
    try {
      fs.writeFileSync(path.join(tmp, 'noop3.sh'), '#!/bin/bash\necho seed > seed3.txt\n', 'utf8');

      const fakeBranch = path.join(tmp, 'fake-claude-branch.sh');
      fs.writeFileSync(
        fakeBranch,
        [
          '#!/bin/bash',
          'git checkout -q -b slice-branch',
          "echo 'the real work' > real.txt",
          'git add -A',
          "git commit -qm 'agent work on a slice branch'",
          'git checkout -q main',
          "echo scratch > scratch.txt",
          "echo '{\"type\":\"result\"}'",
        ].join('\n'),
        'utf8',
      );
      fs.chmodSync(fakeBranch, 0o755);
      const branchRes = runArm(
        { name: 'branch-case', dir: tmp, scaffold_script: 'noop3.sh', prompt: 'x', allowed_tools: [] },
        'plugin',
        { claudeBin: fakeBranch, pluginRoot: '/repo', outDir: path.join(captureWs, 'branch-out') },
      );
      assert.strictEqual(branchRes.ok, false, 'work committed on a branch other than HEAD fails the run rather than scoring the untracked scratch');
      assert.ok(/diff capture failed/.test(branchRes.error), 'reported the way a run error already is');
      assert.ok(/outside the captured branch/.test(branchRes.error), 'names what happened, not a generic failure');

      const fakeGitlink = path.join(tmp, 'fake-claude-gitlink.sh');
      fs.writeFileSync(
        fakeGitlink,
        [
          '#!/bin/bash',
          'mkdir nested',
          'cd nested',
          'git init -q -b main',
          "git config user.email a@b.c",
          "git config user.name a",
          "echo 'the real work' > real.txt",
          'git add -A',
          "git commit -qm 'agent work inside a nested worktree'",
          'cd ..',
          "echo '{\"type\":\"result\"}'",
        ].join('\n'),
        'utf8',
      );
      fs.chmodSync(fakeGitlink, 0o755);
      const gitlinkRes = runArm(
        { name: 'gitlink-case', dir: tmp, scaffold_script: 'noop3.sh', prompt: 'x', allowed_tools: [] },
        'plugin',
        { claudeBin: fakeGitlink, pluginRoot: '/repo', outDir: path.join(captureWs, 'gitlink-out') },
      );
      assert.strictEqual(gitlinkRes.ok, false, 'a nested repository tracked as a gitlink fails the run rather than scoring an empty pointer');
      assert.ok(/diff capture failed/.test(gitlinkRes.error), 'reported the way a run error already is');
      assert.ok(/embedded repository/.test(gitlinkRes.error), 'names what happened, not a generic failure');
    } finally {
      fs.rmSync(captureWs, { recursive: true, force: true });
    }

    // --- graders -------------------------------------------------------------
    const gdir = path.join(tmp, 'graders');
    fs.mkdirSync(gdir, { recursive: true });
    fs.writeFileSync(path.join(gdir, 'says-banana.md'), '---\ntype: regex\ntarget: trace\nweight: 1\n---\nBANANA\n', 'utf8');
    fs.writeFileSync(path.join(gdir, 'is-observable.md'), '---\ntype: llm\nfocus: files\nweight: 2\n---\nEvery criterion is observable.\n', 'utf8');
    const graders = readGraders(tmp);
    assert.deepStrictEqual(graders.map((g) => g.name), ['is-observable', 'says-banana']);
    assert.strictEqual(graders[0].weight, 2);
    assert.strictEqual(graders[0].focus, 'files');
    assert.strictEqual(graders[1].focus, 'trace', '`target` reads as `focus` — the cases use both spellings');
    assert.strictEqual(graders[0].criteria, 'Every criterion is observable.');

    // The repo's own graders must read cleanly — the runner drives them unchanged.
    for (const c of real) {
      const gs = readGraders(c.dir);
      assert.ok(gs.length >= 1, `${c.name} has graders`);
      for (const g of gs) {
        assert.ok(g.criteria.length > 0, `${c.name}/${g.name} carries criteria prose`);
        assert.ok(['files', 'trace'].includes(g.focus), `${c.name}/${g.name} focuses on files or trace`);
      }
    }

    // focus routing
    const armFixture = { diff: '+++ a diff', transcript: 'said BANANA once' };
    assert.strictEqual(graderInput({ focus: 'files' }, armFixture), '+++ a diff');
    assert.strictEqual(graderInput({ focus: 'trace' }, armFixture), 'said BANANA once');
    assert.throws(
      () => graderInput({ name: 'g', focus: 'workspace' }, armFixture),
      (e) => e instanceof GraderError && /unknown focus `workspace`/.test(e.message),
      'an unresolvable focus is a grader error naming the grader and the focus',
    );

    // a regex grader spawns nothing
    const rx = gradeOne(graders[1], armFixture, { claudeBin: '/nonexistent/claude', judgeModel: DEFAULT_JUDGE });
    assert.strictEqual(rx.passed, true, 'the regex grader matched without any judge');
    assert.strictEqual(rx.weight, 1);
    const rxMiss = gradeOne(graders[1], { ...armFixture, transcript: 'said APPLE' }, { claudeBin: '/nonexistent/claude' });
    assert.strictEqual(rxMiss.passed, false);
    assert.ok(!rxMiss.error, 'a regex grader that does not match failed — it did not error');

    // a regex grader whose criteria will not compile errors too, rather than throwing a SyntaxError
    // past this catch and taking the whole run down with the other arms unscored
    fs.writeFileSync(path.join(gdir, 'bad-regex.md'), '---\ntype: regex\ntarget: trace\nweight: 1\n---\n(\n', 'utf8');
    const badRx = gradeOne(readGrader(path.join(gdir, 'bad-regex.md')), armFixture, {});
    assert.ok(badRx.error && /not a valid regex/.test(badRx.error), 'the malformed regex grader errored');
    assert.strictEqual(badRx.passed, undefined, 'a malformed regex grader has no verdict at all');
    // and it is left out of the score entirely, the way every other errored grader is
    assert.strictEqual(scoreArm([badRx, { weight: 1, passed: true }]), 1, 'an errored grader leaves the score alone');
    fs.rmSync(path.join(gdir, 'bad-regex.md'));

    // an unknown focus is reported as an error, not as a fail
    fs.writeFileSync(path.join(gdir, 'bad-focus.md'), '---\ntype: llm\nfocus: workspace\nweight: 1\n---\nx\n', 'utf8');
    const bad = gradeOne(readGrader(path.join(gdir, 'bad-focus.md')), armFixture, {});
    assert.ok(bad.error && /unknown focus/.test(bad.error), 'the grader errored');
    assert.strictEqual(bad.passed, undefined, 'an errored grader has no verdict at all');
    fs.rmSync(path.join(gdir, 'bad-focus.md'));

    // a judge that never returns parseable JSON errors rather than failing
    const mute = gradeOne(graders[0], armFixture, { claudeBin: '/nonexistent/claude', judgeModel: DEFAULT_JUDGE });
    assert.ok(mute.error && /did not return a verdict/.test(mute.error), 'an unusable judge is a grader error');
    assert.strictEqual(mute.passed, undefined, 'never a fail');

    // verdict parsing, including a judge that wraps its JSON in prose
    assert.deepStrictEqual(parseVerdict('{"passed":true,"evidence":"ok"}'), { passed: true, evidence: 'ok' });
    assert.deepStrictEqual(parseVerdict('Here you go:\n{"passed":false,"evidence":"no"}\n'), { passed: false, evidence: 'no' });
    assert.strictEqual(parseVerdict('I think it passes.'), null, 'prose alone is not a verdict');
    assert.strictEqual(parseVerdict('{"evidence":"missing the verdict"}'), null, 'a reply without `passed` is not a verdict');
    assert.strictEqual(parseVerdict(''), null);

    // the judge is pinned to the cheap model and the schema, and takes an override
    const jargs = judgeArgs('haiku', 'prompt text');
    assert.strictEqual(jargs[jargs.indexOf('--model') + 1], 'haiku');
    assert.ok(jargs.includes('--json-schema'));
    assert.ok(JSON.parse(jargs[jargs.indexOf('--json-schema') + 1]).required.includes('passed'));
    assert.strictEqual(parseArgs([]).judgeModel, DEFAULT_JUDGE, 'the judge defaults to the cheap model');
    assert.strictEqual(parseArgs(['--judge-model', 'sonnet']).judgeModel, 'sonnet', '--judge-model overrides it');
    assert.ok(!jargs.includes('--permission-mode'), 'the judge needs no tools and gets no permission bypass');

    // the judge runs rooted at its own throwaway home, not the repo, and is bounded by a timeout
    const jopts = judgeSpawnOpts({ FOO: '1' }, '/tmp/judge-home');
    assert.strictEqual(jopts.cwd, '/tmp/judge-home', 'the judge is not rooted in the repo working tree');
    assert.strictEqual(jopts.timeout, JUDGE_TIMEOUT_MS, 'a hung judge is bounded, like the arm spawn already is');

    // a long artifact is cut, and the judge is told so
    const long = 'x'.repeat(JUDGE_INPUT_LIMIT + 500);
    const cutPrompt = judgePrompt({ criteria: 'c', focus: 'trace' }, long);
    assert.ok(cutPrompt.includes('characters were cut'), 'the judge is told the head was cut');
    assert.ok(cutPrompt.length < long.length + 2000, 'the artifact is actually cut, not merely annotated');
    assert.ok(!judgePrompt({ criteria: 'c', focus: 'trace' }, 'short').includes('were cut'), 'a short artifact is passed whole');

    // --- weighting -----------------------------------------------------------
    assert.strictEqual(scoreArm([{ weight: 1, passed: true }, { weight: 1, passed: false }]), 0.5);
    assert.strictEqual(
      scoreArm([{ weight: 2, passed: true }, { weight: 1, passed: false }]),
      2 / 3,
      'a weight-2 grader moves the score twice as far as a weight-1 grader',
    );
    assert.strictEqual(
      scoreArm([{ weight: 1, passed: true }, { weight: 3, error: 'unknown focus' }]),
      1,
      'an errored grader leaves the score alone rather than counting as a fail',
    );
    assert.strictEqual(scoreArm([{ weight: 1, error: 'x' }]), null, 'every grader errored — there is no score');

    // every grader scores both arms — a grader run only against the plugin arm would inflate the delta
    const regexOnly = [graders[1]];
    for (const armName of ARMS) {
      const scored = gradeArm(regexOnly, armFixture, { claudeBin: '/nonexistent/claude' });
      assert.strictEqual(scored.length, regexOnly.length, `${armName} arm scored every grader`);
    }

    // --- aggregation across runs ---------------------------------------------
    const armOf = (score, gradersOut, markers = []) => ({ ok: true, graders: gradersOut, score, markers });
    const g = (name, passed, weight = 1) => ({ name, weight, passed });
    const threeRuns = [
      { plugin: armOf(1, [g('a', true)]), baseline: armOf(0, [g('a', false)]) },
      { plugin: armOf(1, [g('a', true)]), baseline: armOf(0, [g('a', false)]) },
      { plugin: armOf(0, [g('a', false)]), baseline: armOf(0, [g('a', false)]) },
    ];
    const agg = aggregate('c', threeRuns);
    assert.strictEqual(agg.runs, 3);
    assert.strictEqual(agg.score.plugin.mean, 2 / 3, 'the reported score is the mean across runs');
    assert.strictEqual(agg.score.plugin.spread, 1, 'the spread across those runs travels with the mean');
    assert.strictEqual(agg.score.plugin.n, 3);
    assert.strictEqual(agg.score.delta, 2 / 3, 'the delta is with-plugin minus baseline');
    assert.strictEqual(agg.graders[0].name, 'a');
    assert.strictEqual(agg.graders[0].plugin.mean, 2 / 3, 'per-grader numbers aggregate the same way');
    assert.strictEqual(agg.graders[0].baseline.mean, 0);
    assert.strictEqual(agg.failed, false);

    // an errored run is excluded from the mean rather than counted as a zero
    const withError = [
      { plugin: armOf(1, [g('a', true)]), baseline: armOf(0, [g('a', false)]) },
      { plugin: { ok: false, error: 'timed out', graders: [] }, baseline: armOf(0, [g('a', false)]) },
    ];
    const aggErr = aggregate('c', withError);
    assert.strictEqual(aggErr.score.plugin.mean, 1, 'the errored run did not drag the mean to 0.5');
    assert.strictEqual(aggErr.score.plugin.n, 1, 'and the run count says the mean rests on one run');
    assert.deepStrictEqual(aggErr.errors, ['timed out'], 'the error is reported, not swallowed');
    assert.strictEqual(aggErr.failed, false, 'one good run is still a scored case');

    // every run errored — the case scored nothing and the command must say so
    const allErrored = aggregate('c', [
      { plugin: { ok: false, error: 'agent exited 1', graders: [] }, baseline: { ok: false, error: 'agent exited 1', graders: [] } },
    ]);
    assert.strictEqual(allErrored.failed, true);
    assert.strictEqual(allErrored.score.plugin, null, 'no runs, no score — not a zero');
    assert.strictEqual(allErrored.ranNothing, true, 'no run completed at all — the true "every run errored" case');

    // a grader that errored on ONE arm is dropped from both halves, or the halves are fractions over
    // different weight totals and the delta reports that instead of the plugin
    const oneArmGraderError = aggregate('c', [
      {
        plugin: armOf(null, [g('kept', true, 2), { name: 'flaky', weight: 1, error: 'judge returned no verdict' }]),
        baseline: armOf(null, [g('kept', true, 2), g('flaky', false)]),
      },
    ]);
    assert.strictEqual(oneArmGraderError.score.plugin.mean, 1, 'the plugin arm scores over the graders both arms could be judged on');
    assert.strictEqual(
      oneArmGraderError.score.baseline.mean,
      1,
      'the baseline drops the grader the plugin arm could not be judged on, instead of being scored 2/3 against the plugin arm\'s 2/2',
    );
    assert.strictEqual(oneArmGraderError.score.delta, 0, 'two arms that agree on every judgeable grader show no delta');
    assert.strictEqual(
      oneArmGraderError.graders.find((x) => x.name === 'flaky').plugin,
      null,
      'the grader row still reports the arm that could not be judged, so the exclusion is visible rather than silent',
    );

    // no run completed vs. every grader errored are different faults with different fixes
    const gradersAllErrored = aggregate('c', [
      {
        plugin: armOf(null, [{ name: 'a', weight: 1, error: 'unknown focus' }]),
        baseline: armOf(null, [{ name: 'a', weight: 1, error: 'unknown focus' }]),
      },
    ]);
    assert.strictEqual(gradersAllErrored.failed, true, 'no score is still a failed case');
    assert.strictEqual(gradersAllErrored.ranNothing, false, 'the runs completed — only the graders errored');

    // an errored grader inside a good run leaves that grader unscored for the run
    const graderErrored = aggregate('c', [
      { plugin: armOf(1, [{ name: 'a', weight: 1, error: 'unknown focus' }]), baseline: armOf(0, [g('a', false)]) },
    ]);
    assert.strictEqual(graderErrored.graders[0].plugin, null, 'a grader that errored every run has no number');
    assert.strictEqual(graderErrored.graders[0].delta, null, 'and therefore no delta');

    // --- markers travel through aggregation and flag a broken ablation --------
    const aggMarked = aggregate('c', [{ plugin: armOf(1, [g('a', true)], ['command']), baseline: armOf(0, [g('a', false)], []) }]);
    assert.deepStrictEqual(aggMarked.markers, { plugin: true, baseline: false }, 'markers are carried per arm, not dropped');
    assert.strictEqual(aggMarked.brokenAblation, false, 'the plugin showed markers and the baseline did not — a real ablation');

    const noPluginMarkers = aggregate('c', [{ plugin: armOf(1, [g('a', true)], []), baseline: armOf(0, [g('a', false)], []) }]);
    assert.strictEqual(noPluginMarkers.brokenAblation, true, 'the plugin arm showed no superdev markers — --plugin-dir may be a no-op');

    const baselineContaminated = aggregate('c', [
      { plugin: armOf(1, [g('a', true)], ['command']), baseline: armOf(0, [g('a', false)], ['hook']) },
    ]);
    assert.strictEqual(baselineContaminated.brokenAblation, true, 'the baseline arm should never show a superdev marker');

    // --- an empty diff despite a transcript showing tool use is reportable, alongside brokenAblation --
    const armOfWork = (score, gradersOut, emptyDespiteWork) => ({ ok: true, graders: gradersOut, score, markers: [], emptyDespiteWork });
    const emptyDespitework = aggregate('c', [
      { plugin: armOfWork(1, [g('a', true)], true), baseline: armOfWork(0, [g('a', false)], false) },
    ]);
    assert.deepStrictEqual(
      emptyDespitework.emptyDiffDespiteWork,
      { plugin: true, baseline: false },
      'the flag is carried per arm, into the aggregate, the same way markers and brokenAblation are',
    );
    const noEmptyDespiteWork = aggregate('c', [
      { plugin: armOfWork(1, [g('a', true)], false), baseline: armOfWork(0, [g('a', false)], false) },
    ]);
    assert.deepStrictEqual(noEmptyDespiteWork.emptyDiffDespiteWork, { plugin: false, baseline: false });

    // --- the table ------------------------------------------------------------
    const table = renderTable([agg, allErrored, gradersAllErrored, noPluginMarkers]);
    assert.ok(/WITH\s+WITHOUT\s+DELTA/.test(table), 'the table names both arms and the delta');
    assert.ok(table.includes('0.67±1.00'), 'each cell carries the mean and the spread');
    assert.ok(table.includes('+0.67'), 'a positive delta is signed');
    assert.ok(table.includes('every run errored'), 'a case where no run completed says so');
    assert.ok(table.includes('every grader errored'), 'a case whose runs succeeded but whose graders all errored says a different thing');
    assert.ok(table.includes('broken ablation'), 'a case whose plugin arm shows no markers is flagged loudly, not scored quietly');
    assert.ok(table.includes('smaller than the spread is not a result'), 'the table states how to read itself');

    // --- per-arm run lines carry markers ---------------------------------------
    assert.strictEqual(
      formatRunLine('c', 'plugin', 1, 3, { ok: true, score: 0.5, markers: ['command'] }),
      'c run 1/3 · plugin: score 0.50 markers=command',
    );
    assert.strictEqual(
      formatRunLine('c', 'baseline', 1, 3, { ok: true, score: null, markers: [] }),
      'c run 1/3 · baseline: score n/a markers=none',
    );
    assert.strictEqual(
      formatRunLine('c', 'plugin', 1, 3, { ok: false, error: 'timed out' }),
      'c run 1/3 · plugin: ERROR timed out',
    );

    // --- an arm that never completed a run leaves nothing to compare against -------
    const onlyPluginRan = aggregate('c', [
      { plugin: armOf(1, [g('a', true)]), baseline: { ok: false, error: 'agent exited 1', graders: [] } },
    ]);
    assert.deepStrictEqual(
      onlyPluginRan.armNeverRan,
      { plugin: false, baseline: true },
      'the arm that never completed a run is named',
    );
    assert.strictEqual(onlyPluginRan.failed, false, 'the surviving arm did produce a score, so the case is not scoreless');
    assert.strictEqual(
      shouldFailExit([onlyPluginRan]),
      true,
      'a run where one arm never ran exits non-zero — a table showing the plugin arm alone is the most flattering wrong answer',
    );
    assert.ok(
      renderTable([onlyPluginRan]).includes('the baseline arm never completed a run'),
      'and the table says which arm is missing',
    );

    // --- a broken ablation is a non-zero exit, the same class as a failed case -----
    const noEDW = { plugin: false, baseline: false };
    assert.strictEqual(shouldFailExit([{ failed: false, brokenAblation: false, emptyDiffDespiteWork: noEDW }]), false, 'a clean run exits zero');
    assert.strictEqual(shouldFailExit([{ failed: true, brokenAblation: false, emptyDiffDespiteWork: noEDW }]), true, 'a failed case still exits non-zero');
    assert.strictEqual(
      shouldFailExit([{ failed: false, brokenAblation: true, emptyDiffDespiteWork: noEDW }]),
      true,
      'a broken ablation exits non-zero too — an unattended run must not report 0 while the A/B collapsed',
    );
    assert.strictEqual(
      shouldFailExit([{ failed: false, brokenAblation: false, emptyDiffDespiteWork: { plugin: true, baseline: false } }]),
      true,
      'an empty diff despite visible work is the same class of collapsed measurement as a broken ablation — it must fail the exit too',
    );

    // --- run counts ------------------------------------------------------------
    assert.strictEqual(parseArgs([]).runs, undefined, 'with no flag the case decides');
    assert.strictEqual(parseArgs(['--runs', '1']).runs, 1, '--runs overrides the case');
    assert.strictEqual(real.find((c) => c.name === 'ab-plan-edge-case').runs, 3, 'the repo\'s cases ask for 3 runs');

    // --- no token, no spawn --------------------------------------------------
    const noToken = { ...process.env };
    delete noToken[TOKEN_VAR];
    const spawned = cp.spawnSync(process.execPath, [__filename], { cwd: path.join(__dirname, '..'), env: noToken, encoding: 'utf8' });
    assert.notStrictEqual(spawned.status, 0, 'the runner exits non-zero with no token');
    assert.ok(spawned.stderr.includes(TOKEN_VAR), 'the message names the missing variable');
    assert.ok(spawned.stderr.includes('setup-token'), 'the message says how to get one');
    assert.ok(!/^\{/m.test(spawned.stdout), 'no agent ran');

    console.log('eval-run selftest ok');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Guarded the way scope.js and kb-patch.js are, so a `require` of this file for one of its functions
// runs no CLI code.
if (require.main === module) main();
