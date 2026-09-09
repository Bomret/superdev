#!/usr/bin/env node
'use strict';

// adapter.js: the harness adapter (issue #375). Renders the shipped surfaces — the
// plugin/skills/<name>/SKILL.md commands, the plugin/agents/<name>.md subagents, and the
// deterministic guardrails — into another harness's on-disk layout, so a superdev install there
// carries the same chain. The only harness is `opencode`: skills render to
// `.opencode/commands/superdev/<name>.md` (skill `afk` is skipped; `upgrade` renders synthesized,
// OpenCode-native content instead of its Claude-Code-only body, ADR 0052), agents to
// `.opencode/agents/<name>.md`, with the Claude-specific tokens rewritten deterministically, and
// the eight hooks are bridged by a generated OpenCode plugin at `.opencode/plugins/superdev.js`
// (issue #376) that spawns them as `node <plugin-root>/hooks/<hook>.js` with a Claude-shaped
// stdin payload. Exit nonzero with a one-line stderr reason on any refusal, the convention
// scripts/scope.js uses.
//
// Flags: --harness opencode, --plugin-root <abs-path> (default: this script's .., the plugin
// root), --dest <dir>, a repeatable --model-map <alias>=<provider/model>, and --selftest.
// Rendered agent and command frontmatter resolves each surface's `model:` alias through
// --model-map. The CLI fills in a missing alias interactively before it ever renders: it queries
// the OpenCode config for the models available and prompts for a pick, one prompt per still-missing
// alias — an alias --model-map already covers is never asked about. Every rendered
// string scalar is emitted JSON-quoted, so a description carrying `: ` stays valid YAML. A
// command's `allowed-tools:` carries verbatim: OpenCode command frontmatter has no permission
// key, and carrying the field beats dropping it silently.
//
// A render is idempotent: it removes its own generated files before writing —
// .opencode/commands/superdev/ wholesale (a namespaced subdirectory nothing foreign shares),
// .opencode/plugins/superdev.js by name, and, in the shared .opencode/agents/ directory, only the
// files carrying AGENT_MARKER from a past render — and touches nothing else in --dest.
//
// The module is require-able (guarded main), so the drift-check fixture diff and a harness hook
// bridge drive render() in-process instead of spawning the CLI.

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

// Claude `tools:` list entry → the OpenCode `tools:` config key it enables. Edit and Write are
// two distinct OpenCode tool primitives (each its own boolean), unlike the `permission:` config's
// single combined `edit` permission. An entry the table does not know (e.g. WebSearch — OpenCode
// has no matching builtin tool) contributes no key.
const TOOL_MAP = {
  Read: 'read',
  Edit: 'edit',
  Write: 'write',
  Glob: 'glob',
  Grep: 'grep',
  Bash: 'bash',
  WebFetch: 'webfetch',
  Task: 'task',
  Skill: 'skill',
  Question: 'question',
  TodoWrite: 'todowrite',
};

const HARNESSES = ['opencode'];

// The line every rendered agent's frontmatter carries, so a re-render can tell "a stale file this
// adapter wrote in a past render" from "a consumer's own agent that happens to share this
// directory" — .opencode/agents/ is a shared OpenCode directory, unlike the commands render's own
// superdev/ subdirectory. A YAML comment: OpenCode's frontmatter parser accepts and ignores it
// (verified live against opencode 1.18.20 — a probe agent carrying this exact line still resolved
// every other field correctly).
const AGENT_MARKER = '# generated-by: superdev-adapter — a re-render overwrites this file';

// The afk skill drives the chain unattended one anchor at a time; it is a Claude Code Skill-tool
// driver and has no OpenCode command rendering (issue #375). upgrade renders too (see
// renderOpencodeUpgradeCommand below, ADR 0052) — its OpenCode content is synthesized rather than
// skipped, since its Claude-Code-only body is not this skill's only possible rendering.
const SKIPPED_SKILLS = new Set(['afk']);

function fail(msg) {
  const err = new Error(msg);
  err.isRefusal = true;
  throw err;
}

// --- frontmatter -------------------------------------------------------------

// The leading `---` fenced block, read as lines rather than parsed as YAML — the scripts carry no
// dependencies, and every field this adapter reads (`name`, `description`, `tools`, `model`) is a
// single-line scalar. Returns { fields, body } with the body carrying no frontmatter.
function readFrontmatter(text, source) {
  const normalized = text.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) fail(`${source} carries no frontmatter block`);
  const fields = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return { fields, body: normalized.slice(match[0].length) };
}

// --- prose rewrites ----------------------------------------------------------

// The three deterministic rewrites a rendered body gets, applied to the whole rendered file
// (frontmatter descriptions name `/superdev:<cmd>` too, so rewriting only the body would leak the
// token). `${CLAUDE_PLUGIN_ROOT}` becomes the --plugin-root value; `/superdev:<cmd>` becomes
// `/superdev/<cmd>`; a bare `superdev:<agent>` becomes the bare agent name. Both name rewrites are
// restricted to the names discovered under --plugin-root, so a token that is not a real skill or
// agent (an HTML comment marker, a prose example) is never mangled.
function rewriteProse(text, opts) {
  let out = text.split('${CLAUDE_PLUGIN_ROOT}').join(opts.pluginRoot);
  for (const name of opts.skills) {
    out = out.replace(new RegExp(`/superdev:${name}\\b`, 'g'), `/superdev/${name}`);
  }
  for (const name of opts.agents) {
    out = out.replace(new RegExp(`(?<![/\\w-])superdev:${name}\\b`, 'g'), name);
  }
  return out;
}

// --- render targets ----------------------------------------------------------

// A rendered string scalar, JSON double-quoted: YAML's double-quoted flow scalar shares JSON's
// string escaping, so any value — one carrying `: `, ` #`, quotes — stays a single valid scalar.
function yamlString(value) {
  return JSON.stringify(value);
}

// A frontmatter `model:` alias resolved through --model-map, naming the surface on a refusal.
function resolveModel(fields, modelMap, what, name) {
  if (!fields.model) return undefined;
  const model = modelMap.get(fields.model);
  if (model === undefined) {
    fail(`no --model-map entry for model alias '${fields.model}' (${what} ${name})`);
  }
  return model;
}

// Query OpenCode config and extract available model IDs. OpenCode loads configuration from
// multiple sources in precedence order: project config (opencode.json), custom config
// (OPENCODE_CONFIG env var), and global config (~/.config/opencode/opencode.json) — verified
// 2026-09-06 against https://opencode.ai/docs/config/, whose merge order (later overrides earlier)
// runs global, then OPENCODE_CONFIG, then project. Each config
// can specify `model` and `small_model` fields with "provider/model-name" format. Returns an
// array of unique model IDs found, or an empty array if no config is present or readable. Reads
// only those two fields — not the richer `provider.*.models` or `agent.*.model` shapes OpenCode
// config also supports — so the picker's list can be incomplete; the interactive prompt says so
// (see selectModel's own header) rather than presenting a partial list as if it were complete.
// opts: { cwd (default: process.cwd()), env (default: process.env) }
function queryOpenCodeModels(opts) {
  const cwd = (opts && opts.cwd) || process.cwd();
  const env = (opts && opts.env) || process.env;
  const models = new Set();

  const loadConfig = (filePath) => {
    try {
      const text = fs.readFileSync(filePath, 'utf8');
      const config = JSON.parse(text);
      if (config.model && typeof config.model === 'string') models.add(config.model);
      if (config.small_model && typeof config.small_model === 'string') models.add(config.small_model);
    } catch {
      // Ignore read/parse errors — missing or malformed config is not an error
    }
  };

  // Project config: opencode.json in cwd (highest precedence among standard locations)
  loadConfig(path.join(cwd, 'opencode.json'));

  // Custom config: OPENCODE_CONFIG env var
  if (env.OPENCODE_CONFIG) {
    loadConfig(env.OPENCODE_CONFIG);
  }

  // Global config: ~/.config/opencode/opencode.json
  const home = env.HOME || env.USERPROFILE; // USERPROFILE for Windows
  if (home) {
    loadConfig(path.join(home, '.config', 'opencode', 'opencode.json'));
  }

  return Array.from(models).sort();
}

// Confirms `model` is present among `availableModels` (as queryOpenCodeModels() reports them),
// returning it unchanged — or refuses with a message naming the missing model and listing the
// alternatives that are available. Distinct from resolveModel's own "no --model-map entry"
// refusal, which fires before any concrete model name is even known. Performs no I/O itself, so
// nothing is left broken for a caller (slice 02's interactive prompt, or a future resolveModel
// integration) to unwind: the caller re-queries and calls this again once the user has added the
// model to their OpenCode config, and the same call then succeeds. A non-array `availableModels`
// (a caller that skipped queryOpenCodeModels()) is treated as an empty list rather than thrown on.
function requireAvailableModel(model, availableModels) {
  const models = Array.isArray(availableModels) ? availableModels : [];
  if (models.includes(model)) return model;
  const alternatives = models.length
    ? `available models: ${models.join(', ')}`
    : 'no models are configured in your OpenCode setup yet — pass --model-map <alias>=<provider/model> to set it manually';
  fail(`model '${model}' is not available in your OpenCode configuration — ${alternatives}`);
}

// The three frontmatter `model:` aliases the shipped skills and agents carry (verified against
// every plugin/skills/*/SKILL.md and plugin/agents/*.md frontmatter's `model:` field).
const MODEL_ALIASES = ['haiku', 'sonnet', 'opus'];

// Reads one line from `it` — an async iterator over an open readline interface
// (rl[Symbol.asyncIterator]()), shared across every prompt in one resolution pass — after writing
// `question` to `output` itself: async iteration reads raw lines with no built-in prompt the way
// rl.question() has. Rejects when the input closes before a line arrives (EOF — a closed pipe, `<
// /dev/null`, or any non-interactive invocation), so a caller never hangs waiting on an answer that
// will never come. Deliberately not rl.question(): piped input that arrives in one chunk delivers
// every line to readline's internal line handler in one synchronous pass, and rl.question() only
// resolves the *next* line if a question is already pending when that line is processed — any
// question asked afterward, even in the same prompting pass, finds its line already consumed and
// discarded. The async iterator protocol has no such loss: it holds a line until the next
// `it.next()` call actually asks for it (verified against Node's own readline docs: iterating an
// Interface "will always consume the input stream fully," never dropping a buffered line).
async function ask(it, output, question) {
  output.write(question);
  const { value, done } = await it.next();
  if (done) throw new Error('input closed before an answer arrived');
  return value;
}

// Interactively prompts for one alias's model from `models` (as queryOpenCodeModels() reports
// them), re-prompting on an answer that is not a number in range, and returns the pick. Takes an
// already-open `it`/`output` rather than opening its own readline interface, so a caller resolving
// several aliases in one pass (promptForModelMap's own loop, resolveModelMap's per-missing-alias
// loop) shares one interface and one async iterator across every prompt — a fresh interface per
// alias would each buffer and then discard on close whatever the pipe still held for the *next*
// prompt, starving every alias after the first on piped input. Refuses via fail(), naming `alias`
// and pointing at --model-map as the manual override, when the input closes before this alias gets
// an answer.
async function selectModel(alias, models, it, output) {
  output.write(`\nModels named in your OpenCode config, for '${alias}':\n`);
  models.forEach((model, i) => { output.write(`  ${i + 1}) ${model}\n`); });
  let choice;
  while (choice === undefined) {
    let answer;
    try {
      answer = (await ask(it, output, `Select a model for '${alias}': `)).trim();
    } catch {
      fail(`no answer for model alias '${alias}' before input closed — pass --model-map ${alias}=<provider/model> instead`);
    }
    const idx = Number(answer);
    if (Number.isInteger(idx) && idx >= 1 && idx <= models.length) choice = models[idx - 1];
    else output.write(`Enter a number between 1 and ${models.length}.\n`);
  }
  return choice;
}

// Interactively prompts for a model per alias, from the models queryOpenCodeModels found, and
// returns the picks as a Map<alias, model>. Assumes a non-empty `models`: the missing/unavailable
// case is slice 03's job, not this function's (see interfaces.md). Not itself wired into the CLI —
// resolveModelMap() below is, and shares this function's own per-alias selectModel() helper.
// opts: { input (default: process.stdin), output (default: process.stdout) }
async function promptForModelMap(models, opts) {
  const input = (opts && opts.input) || process.stdin;
  const output = (opts && opts.output) || process.stdout;
  const rl = readline.createInterface({ input, output });
  const it = rl[Symbol.asyncIterator]();
  const picks = new Map();
  try {
    for (const alias of MODEL_ALIASES) {
      picks.set(alias, await selectModel(alias, models, it, output));
    }
  } finally {
    rl.close();
  }
  return picks;
}

// plugin/skills/<name>/SKILL.md → .opencode/commands/superdev/<name>.md. The command name comes
// from the filename, so the rendered frontmatter keeps the description, the resolved model when
// the skill pins one, and the allowed-tools list verbatim.
function renderCommand(name, skillPath, modelMap, rewrite) {
  const { fields, body } = readFrontmatter(fs.readFileSync(skillPath, 'utf8'), skillPath);
  if (!fields.description) fail(`${skillPath} carries no description`);
  let frontmatter = `---\ndescription: ${yamlString(fields.description)}\n`;
  const model = resolveModel(fields, modelMap, 'command', name);
  if (model !== undefined) frontmatter += `model: ${model}\n`;
  if (fields['allowed-tools']) frontmatter += `allowed-tools: ${yamlString(fields['allowed-tools'])}\n`;
  frontmatter += '---\n';
  return rewrite(`${frontmatter}\n${body.replace(/^\n+/, '')}`);
}

// plugin/agents/<name>.md → .opencode/agents/<name>.md: description, `mode: subagent`, the model
// alias resolved through --model-map, and the Claude `tools:` allowlist rendered as an OpenCode
// `tools:` map — a leading `"*": false` (quoted: an unquoted `*` is a YAML alias marker) denying
// every tool, then `true` for exactly what the allowlist names, plus `invalid` (see below).
// OpenCode's `tools:` map is last-match-wins, so the wildcard must lead: enumerating eleven known
// keys `false` instead denies only those eleven, reading a twelfth tool id (an MCP tool, a builtin
// OpenCode adds later) as allowed — verified live against opencode 1.18.20 that a leading wildcard
// denies an unenumerated key and that the same wildcard placed last flattens every explicit entry
// after it to false. A bare `permission:` listing of the same tools this map already allows would
// still be inert (ADR 0051) — that config only restricts a tool it explicitly denies, and a bare
// `allow` entry over its allow-by-default baseline restricts nothing. But `tools:` itself is
// converted into a permission rule per key (`read: true` → `read: {"*": "allow"}`), and where the
// frontmatter also carries an explicit `permission:` entry for that same key, the agent-config
// decoder's `Object.assign($, _.permission)` (a shallow assign at the top-level key, not
// `Permission.merge` — that primitive is a plain concat, `(...j) => j.flat()`) replaces the
// `tools:`-derived rule with it rather than appending both (verified live against
// opencode 1.18.20, `opencode debug agent`: deleting only the `"*": "allow"` line from the block
// below removes the `tools:`-derived `{"permission":"read","pattern":"*","action":"allow"}` entry
// from the resolved array entirely, rather than leaving it present but shadowed) — which silently
// defeats OpenCode's own built-in `read: {"*.env": "ask"}` default for every rendered agent, with
// no consumer action involved. `permission:` comes back below for exactly that one pattern-level
// re-assertion (ADR 0054): a faithful copy of OpenCode's own built-in `read` default, blanket
// `"*": "allow"` included — that blanket allow is load-bearing, not decorative, since replacing
// (not appending after) the `tools:`-derived rule means it is now the only thing standing in for
// what `tools: read: true` would otherwise have contributed for that pattern.
function renderAgent(name, agentPath, modelMap, rewrite) {
  const { fields, body } = readFrontmatter(fs.readFileSync(agentPath, 'utf8'), agentPath);
  if (!fields.description) fail(`${agentPath} carries no description`);
  if (!fields.model) fail(`${agentPath} carries no model alias`);
  const model = resolveModel(fields, modelMap, 'agent', name);
  // `invalid` is OpenCode's tool-call repair sink, not a callable tool: confirmed against the
  // installed binary that `experimental_repairToolCall` rewrites a hallucinated or malformed call
  // to `{ toolName: 'invalid' }`, and that `activeTools` filters `invalid` out of the model's own
  // tool schema by construction, so the model can never call it directly. Denying it here buys no
  // security and removes the sink a repaired call lands in — the fallback becomes the executor's
  // "Unknown tool: invalid" error instead of the repair tool's own recoverable result.
  const enabled = new Set(['invalid']);
  if (fields.tools) {
    for (const tool of fields.tools.split(',').map((t) => t.trim()).filter(Boolean)) {
      const key = TOOL_MAP[tool];
      if (key) enabled.add(key);
    }
  }
  let frontmatter = `---\n${AGENT_MARKER}\ndescription: ${yamlString(fields.description)}\nmode: subagent\nmodel: ${model}\ntools:\n  "*": false\n`;
  for (const key of [...enabled].sort()) frontmatter += `  ${key}: true\n`;
  // Only an agent whose own tools: allowlist grants read: true had a `read: {"*": "allow"}`
  // permission rule to lose to the config-merge replace in the first place — appending this block
  // for an agent that never granted read: true would instead grant it, overriding the "*": false
  // wildcard's deny (see the fix commit message for the live-verified failure mode).
  if (enabled.has('read')) {
    frontmatter += 'permission:\n  read:\n    "*": "allow"\n    "*.env": "ask"\n    "*.env.*": "ask"\n    "*.env.example": "allow"\n';
  }
  frontmatter += '---\n';
  return rewrite(`${frontmatter}\n${body.replace(/^\n+/, '')}`);
}

// renderOpencodeUpgradeCommand() emits .opencode/commands/superdev/upgrade.md: OpenCode's real
// upgrade path — a git pull in the plugin's source clone, then a re-render — synthesized directly
// here rather than derived from plugin/skills/upgrade/SKILL.md's body, which drives Claude Code's
// own `claude plugin update` and has no OpenCode equivalent (ADR 0052, amending ADR 0050's outright
// exclusion). The same treatment renderBridge() above already gives the hook-bridge plugin: both
// are pure harness mechanics with no prose in common with their Claude Code counterpart. The model
// alias still resolves from the shipped skill's own frontmatter (`model: haiku` today), so a future
// retier of `upgrade` is inherited here rather than duplicated as a second magic string. The
// "start a new OpenCode session" instruction is verified against OpenCode's own plugin docs
// (https://opencode.ai/docs/plugins/, 2026-09-06): plugin/command/agent files are "loaded at
// startup", with no documented hot-reload, so a fresh session is the correct load point.
function renderOpencodeUpgradeCommand(skillPath, pluginRoot, modelMap) {
  const { fields } = readFrontmatter(fs.readFileSync(skillPath, 'utf8'), skillPath);
  // Kept as a literal `pluginRoot + '/..'` string, never path.dirname(pluginRoot)'s normalized
  // parent: the golden-fixture normalizer (scripts/drift/opencode-fixtures.js) replaces only exact
  // occurrences of the resolved plugin-root string with its `<plugin-root>` placeholder, so a
  // normalized parent path would leak the real machine's absolute path into the committed fixture.
  const repoRoot = `${pluginRoot}${path.sep}..`;
  const adapterPath = path.join(pluginRoot, 'scripts', 'adapter.js');
  // Every entry of the resolved model-map, re-emitted as its own `--model-map` flag: the CLI's
  // parseArgs() has no positional-argument handling (every non-flag argv element is an "unknown
  // flag" refusal), so the re-render must carry no bare subcommand word, and it must carry every
  // alias's resolved value so the re-render never prompts — there is no TTY when a model runs this
  // via the Bash tool, and re-prompting here would also silently discard the operator's original
  // picks. Same JSON-quoting convention as the git/node invocations below.
  const modelMapArgs = [...modelMap]
    .map(([alias, value]) => ` --model-map ${JSON.stringify(`${alias}=${value}`)}`)
    .join('');
  let frontmatter = `---\ndescription: ${yamlString(
    "Pull the latest superdev source and re-render this project's OpenCode surfaces (commands, agents, hook bridge) in place.",
  )}\n`;
  const model = resolveModel(fields, modelMap, 'command', 'upgrade');
  if (model !== undefined) frontmatter += `model: ${model}\n`;
  frontmatter += '---\n';
  const body = [
    '',
    '# superdev upgrade (OpenCode)',
    '',
    "Upgrade this project's rendered superdev surfaces to the latest published source, hands-off.",
    'You (the model) run the two commands below with the Bash tool, checking each one\'s exit',
    'status before moving on. If either command fails, stop and tell the user the upgrade is',
    '**stale/incomplete** instead of continuing to the next step or reporting success.',
    '',
    '## 1. Pull the latest source',
    '',
    '```',
    `git -C ${JSON.stringify(repoRoot)} pull`,
    '```',
    '',
    '## 2. Re-render',
    '',
    '```',
    // --dest "$(pwd)" re-derives the destination at run time rather than baking in this render's
    // own opts.dest: the golden-fixture normalizer above only placeholders exact pluginRoot
    // occurrences, so baking a fixture's own absolute tmp --dest would leak a machine-local path
    // into the committed fixture. $(pwd) resolves to the same directory whenever the command runs
    // from the project root, which is where a rendered OpenCode command always executes.
    `node ${JSON.stringify(adapterPath)} --dest "$(pwd)" --harness opencode${modelMapArgs}`,
    '```',
    '',
    'Re-rendering rewrites every file this adapter generates — every command under',
    '`.opencode/commands/superdev/`, every agent it wrote under `.opencode/agents/`, and',
    '`.opencode/plugins/superdev.js` — to match the pulled source. The command above already',
    "carries this project's resolved model-map, so it re-renders non-interactively with no prompts.",
    '',
    '## 3. Done',
    '',
    "Once both commands have succeeded, report both commands' output, then tell the user to",
    '**start a new OpenCode session** in this project — OpenCode loads commands, agents, and',
    'plugins at startup, with no documented hot-reload, so a running session keeps the old ones',
    'until it restarts.',
    '',
  ].join('\n');
  return frontmatter + body;
}

// --- the OpenCode hook bridge (issue #376) ---------------------------------
//
// renderBridge() emits `.opencode/plugins/superdev.js`: a CommonJS OpenCode plugin that forwards
// OpenCode's plugin events to the eight shipped hooks, spawning each as
// `node <plugin-root>/hooks/<hook>.js` with a Claude-shaped stdin payload, so the guardrails run
// unchanged under OpenCode. Event map verified 2026-08-30 against OpenCode's documentation:
// https://opencode.ai/docs/plugins/ — the plugin directory `.opencode/plugins/`, the hook names
// `tool.execute.before` / `tool.execute.after` with `(input, output)` shaped `input.tool`, the
// `event` hook carrying `event.type`, the session events `session.created` / `session.idle` /
// `session.deleted`, and throw-to-block semantics (its .env example throws to
// refuse a tool call). https://opencode.ai/docs/agents/ — subagents dispatch through the `task`
// tool, whose arguments carry `subagent_type` and no `model`: an OpenCode agent's model lives in
// its own frontmatter, so the bridge resolves model-explicit's `tool_input.model` from the
// rendered `.opencode/agents/<type>.md` instead of the dispatch.
//
// Verified 2026-08-30 by loading a rendered bridge in a real OpenCode install (opencode 1.18.20,
// Bun runtime), which corrected two claims the documentation alone left wrong:
//   - The tool call's arguments reach `tool.execute.before` as `output.args` and
//     `tool.execute.after` as `input.args` — the after-hook's `output` is the tool result
//     (`title` / `output` / `metadata`). The `@opencode-ai/plugin` `Hooks` type pins both shapes.
//   - The loader requires every module export to resolve to a plugin function, and a bare
//     function export fails that check: Bun's CommonJS interop re-exports the function's own
//     `name` and `length` as non-function named exports, so the load dies with "Plugin export is
//     not a function". The v1 plugin shape — an object carrying a string `id` and a `server()`
//     plugin function — passes.
// The same session confirmed the event path end to end: `opencode run` in a rendered dest loaded
// the bridge and fired `session.created`, whose update-check spawn wrote `plugin/.data/.update-check`
// in the baked plugin root. A controller-level `git merge` passed, as it does under Claude — the
// payload carries no `agent_id`, which is what merge-guard requires before it blocks.
const BRIDGE_SHELL_TOOLS = ['bash'];
const BRIDGE_EDIT_TOOLS = ['edit', 'write', 'apply_patch'];
const BRIDGE_TASK_TOOLS = ['task'];
const BRIDGE_SHELL_BEFORE_HOOKS = ['merge-guard', 'run-lock', 'ledger-guard'];
const BRIDGE_SESSION_CREATED = ['session.created'];
const BRIDGE_SESSION_ENDED = ['session.idle', 'session.deleted'];
const BRIDGE_SESSION_END_HOOKS = ['worktree-sweep', 'scope-prune'];

// The four helpers below are serialized verbatim into the generated bridge via
// Function.prototype.toString, so they stay self-contained: the free names they reference
// (PLUGIN_ROOT, spawn, path) are constants the bridge source defines, never adapter.js's own
// scope. They live here, not in the template string, so the selftest exercises the same code the
// bridge ships.

// The spawned hook's environment: the plugin process's own, plus CLAUDE_PLUGIN_ROOT pointing at
// the plugin root baked in at render time — hooks/update-check.js reads it.
function bridgeSpawnEnv(root) {
  return Object.assign({}, process.env, { CLAUDE_PLUGIN_ROOT: root });
}

// A Claude-shaped hook payload, the exact fields the hook scripts parse: `tool_name` (the Claude
// name — `Bash`, `Edit`/`Write`, `Agent`), snake_case `tool_input` (`command`, `file_path`,
// `subagent_type`, `model`), top-level `cwd`, and `agent_id` when the caller is a subagent
// (merge-guard blocks only then).
function buildHookPayload(eventName, toolName, toolInput, cwd, agentId) {
  const payload = { hook_event_name: eventName, cwd };
  if (toolName !== undefined) payload.tool_name = toolName;
  if (toolInput !== undefined) payload.tool_input = toolInput;
  if (agentId) payload.agent_id = agentId;
  return payload;
}

// The block decision a spawn produced, as a reason string, or null to pass through. Two shapes
// block, mirroring Claude: exit code 2 (stderr carries the reason), or a stdout JSON object with
// `hookSpecificOutput.permissionDecision: 'deny'`. Anything else — exit 0, a hook crash, a
// non-JSON notice like update-check's newer-version line — never blocks.
function hookBlockReason(hook, result) {
  if (result.status === 2) {
    return (result.stderr && result.stderr.trim()) || `superdev hook ${hook} refused the call`;
  }
  const out = (result.stdout || '').trim();
  if (out.startsWith('{')) {
    try {
      const decision = JSON.parse(out).hookSpecificOutput;
      if (decision && decision.permissionDecision === 'deny') {
        return decision.permissionDecisionReason || `superdev hook ${hook} denied the call`;
      }
    } catch {
      /* not JSON — a plain-text notice is never a block */
    }
  }
  return null;
}

// Spawn one hook and translate its verdict: a block reason throws, so the deny reaches the model
// the way Claude's exit-2 blocking does; a spawn error or a killed child fails open, the same
// posture Claude takes for a hook that errors. The 600s ceiling mirrors the green-gate entry's
// own timeout in hooks/hooks.json. child_process.spawn (never spawnSync): OpenCode's plugin host
// runs every tool call, hook, and event on one JS thread, so a blocking spawnSync would hold the
// whole session — its TUI, its SSE stream, every concurrent session — for as long as the spawned
// hook runs, and green-gate alone can run the repo's full suite. A Promise wrapper keeps the
// event loop free while the hook runs; the caller awaits it.
function runBridgeHook(hook, payload) {
  return new Promise((resolve) => {
    const child = spawn('node', [path.join(PLUGIN_ROOT, 'hooks', `${hook}.js`)], {
      env: bridgeSpawnEnv(PLUGIN_ROOT),
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => child.kill(), 600000);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', () => finish({ error: true }));
    child.on('close', (code) => finish({ status: code, stdout, stderr }));
    // A hook that exits before ever reading stdin (a require() failure before main() runs, e.g.)
    // turns a payload larger than the pipe buffer into an EPIPE write error; spawnSync's `input`
    // option contained that internally, but a plain child.stdin write does not — an unlistened
    // 'error' here would otherwise escape as an uncaught exception and crash the whole host.
    child.stdin.on('error', () => {});
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  }).then((result) => {
    if (!result || result.error) return;
    const reason = hookBlockReason(hook, result);
    if (reason) throw new Error(reason);
  });
}

// The generated plugin module. Constants and the serialized helpers above come first; the body
// below wires them to OpenCode's events.
function renderBridge(pluginRoot) {
  const constants = [
    `const PLUGIN_ROOT = ${JSON.stringify(pluginRoot)};`,
    `const SHELL_TOOLS = ${JSON.stringify(BRIDGE_SHELL_TOOLS)};`,
    `const EDIT_TOOLS = ${JSON.stringify(BRIDGE_EDIT_TOOLS)};`,
    `const TASK_TOOLS = ${JSON.stringify(BRIDGE_TASK_TOOLS)};`,
    `const SHELL_BEFORE_HOOKS = ${JSON.stringify(BRIDGE_SHELL_BEFORE_HOOKS)};`,
    `const SESSION_CREATED = ${JSON.stringify(BRIDGE_SESSION_CREATED)};`,
    `const SESSION_ENDED = ${JSON.stringify(BRIDGE_SESSION_ENDED)};`,
    `const SESSION_END_HOOKS = ${JSON.stringify(BRIDGE_SESSION_END_HOOKS)};`,
  ].join('\n');
  const helpers = [bridgeSpawnEnv, buildHookPayload, hookBlockReason, runBridgeHook]
    .map((fn) => fn.toString())
    .join('\n\n');
  const body = `
// The calling session is a subagent's when it has a parent — the bridge's stand-in for Claude's
// agent_id, which merge-guard requires before it blocks an integration command. Best-effort:
// an SDK failure reads as the controller, the same direction merge-guard itself takes on a
// missing agent_id.
async function subagentId(ctx, sessionID) {
  try {
    const res = await ctx.client.session.get({ path: { id: sessionID } });
    const session = res && (res.data || res);
    return session && session.parentID ? sessionID : undefined;
  } catch {
    return undefined;
  }
}

// model-explicit's explicit model, read from where OpenCode keeps it: the rendered agent's own
// frontmatter. Unreadable → undefined → the hook blocks, the safe direction.
function configuredModel(cwd, subagentType) {
  try {
    const text = fs.readFileSync(path.join(cwd, '.opencode', 'agents', subagentType + '.md'), 'utf8');
    const match = text.match(/^model:\\s*(\\S+)\\s*$/m);
    return match && match[1];
  } catch {
    return undefined;
  }
}

const SuperdevPlugin = async (ctx) => {
  const cwd = ctx.directory || process.cwd();
  return {
    'tool.execute.before': async (input, output) => {
      const args = (output && output.args) || {};
      if (SHELL_TOOLS.includes(input.tool)) {
        const agentId = await subagentId(ctx, input.sessionID);
        const payload = buildHookPayload('PreToolUse', 'Bash', { command: args.command }, cwd, agentId);
        for (const hook of SHELL_BEFORE_HOOKS) await runBridgeHook(hook, payload);
      } else if (EDIT_TOOLS.includes(input.tool)) {
        const toolName = input.tool === 'write' ? 'Write' : 'Edit';
        // apply_patch is the OpenAI tool: its args carry no filePath, only
        // { callId, operation: { type, path, diff } } — fall back to operation.path.
        const filePath = args.filePath || (args.operation && args.operation.path);
        await runBridgeHook('ledger-guard', buildHookPayload('PreToolUse', toolName, { file_path: filePath }, cwd));
      } else if (TASK_TOOLS.includes(input.tool)) {
        const toolInput = { subagent_type: args.subagent_type, model: args.model || configuredModel(cwd, args.subagent_type) };
        await runBridgeHook('model-explicit', buildHookPayload('PreToolUse', 'Agent', toolInput, cwd));
      }
    },
    'tool.execute.after': async (input, output) => {
      if (!SHELL_TOOLS.includes(input.tool)) return;
      // The after-hook's args live on the input (the output is the tool result), unlike the
      // before-hook's output.args — the @opencode-ai/plugin Hooks type pins both shapes.
      const args = input.args || {};
      await runBridgeHook('green-gate', buildHookPayload('PostToolUse', 'Bash', { command: args.command }, cwd));
    },
    event: async ({ event }) => {
      if (!event || typeof event.type !== 'string') return;
      if (SESSION_CREATED.includes(event.type)) {
        try {
          await runBridgeHook('update-check', buildHookPayload('SessionStart', undefined, undefined, cwd));
        } catch {
          /* a version notice never blocks a session */
        }
      }
      if (SESSION_ENDED.includes(event.type)) {
        for (const hook of SESSION_END_HOOKS) {
          try {
            await runBridgeHook(hook, buildHookPayload('Stop', undefined, undefined, cwd));
          } catch {
            /* a sweep is best-effort and silent, as under Claude */
          }
        }
      }
    },
  };
};

// OpenCode's plugin loader requires every module export to resolve to a plugin function, and a
// bare function default export fails that check: Bun's CJS interop re-exports the function's own
// name/length as non-function named exports, so the load dies with "Plugin export is not a
// function" (observed live — see the header's dated verification). The v1 plugin shape passes:
// a default-exported object carrying a string id and a server() plugin function.
module.exports = { id: 'superdev', server: SuperdevPlugin };
`;
  return [
    `// .opencode/plugins/superdev.js — GENERATED by superdev's plugin/scripts/adapter.js (issue`,
    `// #376). Edit the adapter, not this file; a re-render overwrites it. CommonJS, no JSDoc:`,
    `// OpenCode's plugin loader runs this under its own runtime, and Node's child_process spawn`,
    `// resolves there through node:child_process.`,
    `//`,
    `// Event map verified 2026-08-30 against https://opencode.ai/docs/plugins/ (the`,
    `// tool.execute.before/after and event hooks, the session.created/session.idle/session.deleted`,
    `// event types, throw-to-block) and https://opencode.ai/docs/agents/ (subagents dispatch through`,
    `// the task tool, whose arguments carry subagent_type and no model — an agent's model lives in`,
    `// its frontmatter, which configuredModel below reads back).`,
    `//`,
    `// Verified 2026-08-30 by loading this bridge in a real OpenCode install (opencode 1.18.20, Bun`,
    `// runtime). Two shapes the documentation alone left wrong, both corrected below: the tool`,
    `// arguments arrive as output.args on tool.execute.before and input.args on tool.execute.after,`,
    `// and the module export must be the v1 plugin shape (an object with a string id and a server()`,
    `// function), because a bare function export fails the loader's "Plugin export is not a`,
    `// function" check under Bun's CommonJS interop.`,
    `'use strict';`,
    `const fs = require('node:fs');`,
    `const path = require('node:path');`,
    `const { spawn } = require('node:child_process');`,
    constants,
    helpers,
    body.trimStart(),
  ].join('\n\n');
}

// --- the render --------------------------------------------------------------

function listDirs(dir, what) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') fail(`no ${what} at ${dir} — is --plugin-root a plugin root?`);
    throw e;
  }
  return entries;
}

// The sorted skill directory names under skillsDir (SKIPPED_SKILLS included — callers filter as
// needed) and the sorted agent names under agentsDir (the .md extension stripped). The one shared
// walk render() and usedModelAliases() both need, so a future SKIPPED_SKILLS member or a renamed
// skill-file convention only has one place to change.
function discoverSkillNames(skillsDir) {
  return listDirs(skillsDir, 'skills directory')
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function discoverAgentNames(agentsDir) {
  return listDirs(agentsDir, 'agents directory')
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name.replace(/\.md$/, ''))
    .sort();
}

// The model aliases the plugin root's own skills and agents actually carry — the exact set
// resolveModel() will need a --model-map entry for once render() runs. Only reads frontmatter, so
// it can run before --dest is known.
function usedModelAliases(pluginRoot) {
  const skillsDir = path.join(pluginRoot, 'skills');
  const agentsDir = path.join(pluginRoot, 'agents');
  const aliases = new Set();
  const modelOf = (filePath) => readFrontmatter(fs.readFileSync(filePath, 'utf8'), filePath).fields.model;
  for (const name of discoverSkillNames(skillsDir)) {
    if (SKIPPED_SKILLS.has(name)) continue;
    const skillPath = path.join(skillsDir, name, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      const model = modelOf(skillPath);
      if (model) aliases.add(model);
    }
  }
  for (const name of discoverAgentNames(agentsDir)) {
    const model = modelOf(path.join(agentsDir, `${name}.md`));
    if (model) aliases.add(model);
  }
  return aliases;
}

// Fills in modelMap's missing entries for the model aliases the plugin root's own skills and
// agents actually carry — the ones resolveModel() would otherwise refuse — by querying the
// OpenCode config for what's available (queryOpenCodeModels) and asking the user to pick, one
// prompt per still-missing alias, in canonical order, through selectModel()'s shared per-alias
// prompt. An alias modelMap already covers is left untouched and never reaches the prompt. Every
// missing alias's prompt shares one readline interface, opened once before the loop and closed
// once after it — not one per alias — so a piped multi-line answer (one line per missing alias)
// resolves every alias instead of only the first: a fresh interface per alias would each buffer
// and then discard on close whatever the pipe still held for the next prompt. An empty
// available-models list refuses gracefully — before any readline interface ever opens over the
// input, so that path never touches stdin — instead of prompting with nothing to offer. Each pick
// is still checked with requireAvailableModel before use. opts forwards to queryOpenCodeModels
// (cwd/env) and the interactive prompt (input/output).
async function resolveModelMap(pluginRoot, modelMap, opts) {
  const needed = usedModelAliases(pluginRoot);
  const missing = MODEL_ALIASES.filter((alias) => needed.has(alias) && !modelMap.has(alias));
  if (missing.length === 0) return modelMap;
  const models = queryOpenCodeModels(opts);
  if (models.length === 0) {
    fail(`no models are configured in your OpenCode setup yet — pass --model-map ${missing[0]}=<provider/model> to set '${missing[0]}' manually`);
  }
  const resolved = new Map(modelMap);
  const input = (opts && opts.input) || process.stdin;
  const output = (opts && opts.output) || process.stdout;
  const rl = readline.createInterface({ input, output });
  const it = rl[Symbol.asyncIterator]();
  try {
    for (const alias of missing) {
      const pick = await selectModel(alias, models, it, output);
      // selectModel() only ever returns an entry of `models` itself, so this check can never
      // actually refuse here — it stands as a guard against a future caller that draws `pick` from
      // a different source than the `models` list it is checked against.
      resolved.set(alias, requireAvailableModel(pick, models));
    }
  } finally {
    rl.close();
  }
  return resolved;
}

// render({ harness, pluginRoot, dest, modelMap }) writes the full render target under
// dest/.opencode and returns the sorted list of written paths, relative to dest. It removes its
// own generated files first, so a re-run over the same dest is byte-identical and a renamed or
// skipped surface never leaves a stale file behind. Nothing else under dest is touched — another
// plugin living in .opencode/plugins/ survives, and so does a consumer's own agent file in the
// shared .opencode/agents/ directory (only AGENT_MARKER-tagged files there are ever removed).
function render(opts) {
  // Resolve once so a trailing-separator or relative `--plugin-root` never renders `//` into prose.
  const pluginRoot = path.resolve(opts.pluginRoot);
  const skillsDir = path.join(pluginRoot, 'skills');
  const agentsDir = path.join(pluginRoot, 'agents');

  const skills = discoverSkillNames(skillsDir);
  const agents = discoverAgentNames(agentsDir);
  for (const name of skills) {
    const skillPath = path.join(skillsDir, name, 'SKILL.md');
    if (!SKIPPED_SKILLS.has(name) && !fs.existsSync(skillPath)) {
      fail(`${skillPath} does not exist — every skill directory carries a SKILL.md`);
    }
  }

  const rewrite = (text) => rewriteProse(text, { pluginRoot, skills, agents });

  const commandsDest = path.join(opts.dest, '.opencode', 'commands', 'superdev');
  const agentsDest = path.join(opts.dest, '.opencode', 'agents');
  fs.rmSync(commandsDest, { recursive: true, force: true });
  fs.mkdirSync(commandsDest, { recursive: true });
  fs.mkdirSync(agentsDest, { recursive: true });
  // .opencode/agents/ is a shared OpenCode directory, unlike the namespaced commands subdirectory
  // above — remove only the files this adapter itself wrote in a past render (AGENT_MARKER-tagged
  // in their frontmatter), so a renamed or removed superdev agent still leaves no orphan while a
  // consumer's own agent file survives. The check reads only the frontmatter block, not the whole
  // file: a foreign file whose body merely quotes the marker sentence is not itself tagged.
  for (const entry of fs.readdirSync(agentsDest, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(agentsDest, entry.name);
    const match = fs.readFileSync(full, 'utf8').match(/^---\n([\s\S]*?)\n---\n?/);
    if (match && match[1].includes(AGENT_MARKER)) fs.rmSync(full);
  }

  const written = [];
  for (const name of skills) {
    if (SKIPPED_SKILLS.has(name)) continue;
    const rel = path.join('.opencode', 'commands', 'superdev', `${name}.md`);
    const skillPath = path.join(skillsDir, name, 'SKILL.md');
    const content = name === 'upgrade' && opts.harness === 'opencode'
      ? renderOpencodeUpgradeCommand(skillPath, pluginRoot, opts.modelMap)
      : renderCommand(name, skillPath, opts.modelMap, rewrite);
    fs.writeFileSync(path.join(opts.dest, rel), content);
    written.push(rel);
  }
  for (const name of agents) {
    const rel = path.join('.opencode', 'agents', `${name}.md`);
    fs.writeFileSync(path.join(opts.dest, rel), renderAgent(name, path.join(agentsDir, `${name}.md`), opts.modelMap, rewrite));
    written.push(rel);
  }

  // The hook bridge: one file in .opencode/plugins/, removed and rewritten rather than the whole
  // directory, so a consumer's own plugins beside it survive a re-render.
  const bridgeRel = path.join('.opencode', 'plugins', 'superdev.js');
  const bridgeDest = path.join(opts.dest, bridgeRel);
  fs.rmSync(bridgeDest, { force: true });
  fs.mkdirSync(path.dirname(bridgeDest), { recursive: true });
  fs.writeFileSync(bridgeDest, renderBridge(pluginRoot));
  written.push(bridgeRel);

  return written.sort();
}

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    harness: undefined,
    pluginRoot: path.join(__dirname, '..'),
    dest: undefined,
    modelMap: new Map(),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      i += 1;
      if (i >= argv.length) fail(`${arg} needs a value`);
      return argv[i];
    };
    if (arg === '--harness') opts.harness = value();
    else if (arg === '--plugin-root') opts.pluginRoot = value();
    else if (arg === '--dest') opts.dest = value();
    else if (arg === '--model-map') {
      const raw = value();
      const eq = raw.indexOf('=');
      if (eq === -1) fail(`--model-map takes <alias>=<provider/model> — got '${raw}'`);
      opts.modelMap.set(raw.slice(0, eq), raw.slice(eq + 1));
    } else fail(`unknown flag '${arg}'`);
  }
  if (opts.harness === undefined) opts.harness = 'opencode';
  if (!HARNESSES.includes(opts.harness)) {
    fail(`unknown harness '${opts.harness}' — supported: ${HARNESSES.join(', ')}`);
  }
  if (opts.dest === undefined) fail('missing --dest <dir>');
  return opts;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
    opts.modelMap = await resolveModelMap(opts.pluginRoot, opts.modelMap, { cwd: opts.dest });
    const written = render(opts);
    for (const rel of written) console.log(`rendered ${rel.split(path.sep).join('/')}`);
  } catch (e) {
    if (e.isRefusal) {
      console.error(`adapter: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

// --- selftest ----------------------------------------------------------------

async function selftest() {
  const assert = require('node:assert');
  const os = require('node:os');
  const made = [];
  const tmp = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-'));
    made.push(dir);
    return dir;
  };
  const write = (dir, rel, body) => {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  };
  const refuses = (fn, needle) => {
    assert.throws(fn, (e) => e.isRefusal === true && e.message.includes(needle));
  };
  // A minimal shell-line tokenizer for the round-trip check below: every token this adapter emits
  // is either bare (a flag, a bare word like `opencode`) or JSON-double-quoted (a path, a
  // `alias=value` pair), so splitting on whitespace outside a JSON-quoted run and JSON.parse-ing
  // each quoted token reproduces the argv a real shell would hand to `process.argv`.
  const tokenizeShellLine = (line) => {
    const tokens = [];
    for (const match of line.match(/"(?:[^"\\]|\\.)*"|\S+/g) || []) {
      tokens.push(match.startsWith('"') ? JSON.parse(match) : match);
    }
    return tokens;
  };

  try {
    // The tool-name mapping table.
    assert.equal(TOOL_MAP.Read, 'read');
    assert.equal(TOOL_MAP.Edit, 'edit');
    assert.equal(TOOL_MAP.Write, 'write');
    assert.equal(TOOL_MAP.Glob, 'glob');
    assert.equal(TOOL_MAP.Grep, 'grep');
    assert.equal(TOOL_MAP.Bash, 'bash');
    assert.equal(TOOL_MAP.WebFetch, 'webfetch');
    assert.equal(TOOL_MAP.Task, 'task');
    assert.equal(TOOL_MAP.Skill, 'skill');
    assert.equal(TOOL_MAP.Question, 'question');
    assert.equal(TOOL_MAP.TodoWrite, 'todowrite');

    // The prose rewrites: plugin root, slash-command, bare agent (backticked or not), and the
    // word boundaries that keep near-misses untouched.
    const rewritten = rewriteProse(
      [
        'run node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get stage',
        'then /superdev:plan and `/superdev:implement`, dispatched by /superdev:afk',
        'dispatch `superdev:implementer` and superdev:slice-reviewer here',
        'a /superdev:planet or superdev:implementers token is not a name',
      ].join('\n'),
      { pluginRoot: '/p', skills: ['plan', 'implement', 'afk'], agents: ['implementer', 'slice-reviewer'] },
    );
    assert.ok(rewritten.includes('node "/p/scripts/scope.js" get stage'));
    assert.ok(rewritten.includes('/superdev/plan and `/superdev/implement`, dispatched by /superdev/afk'));
    assert.ok(rewritten.includes('dispatch `implementer` and slice-reviewer here'));
    assert.ok(rewritten.includes('/superdev:planet'));
    assert.ok(rewritten.includes('superdev:implementers'));

    // A full render over a fixture plugin tree.
    const pluginRoot = tmp();
    write(pluginRoot, 'skills/plan/SKILL.md', [
      '---',
      'name: plan',
      'description: Plan a feature. Run before /superdev:implement.',
      'argument-hint: "[an intent]"',
      '---',
      '',
      '# superdev plan',
      '',
      'Read ${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md, then dispatch `superdev:implementer`.',
      'Mentions /superdev:afk stay rewritten even though afk itself is not rendered.',
      '',
    ].join('\n'));
    write(pluginRoot, 'skills/implement/SKILL.md', [
      '---',
      'name: implement',
      'description: Build a plan.',
      '---',
      '',
      'body',
      '',
    ].join('\n'));
    write(pluginRoot, 'skills/afk/SKILL.md', [
      '---',
      'name: afk',
      'description: Drive the chain unattended.',
      '---',
      '',
      'body',
      '',
    ].join('\n'));
    write(pluginRoot, 'skills/upgrade/SKILL.md', [
      '---',
      'name: upgrade',
      'description: Upgrade the plugin via claude plugin update.',
      '---',
      '',
      'Run claude plugin marketplace update superdev, then claude plugin update superdev@superdev.',
      'Restart Claude Code afterward.',
      '',
    ].join('\n'));
    write(pluginRoot, 'skills/setup/SKILL.md', [
      '---',
      'name: setup',
      'description: Configure this repo for superdev: slice store, code host.',
      '---',
      '',
      'body',
      '',
    ].join('\n'));
    write(pluginRoot, 'skills/backlog/SKILL.md', [
      '---',
      'name: backlog',
      'description: Survey the backlog. Read-only.',
      'allowed-tools: Read, Bash',
      'model: sonnet',
      '---',
      '',
      'body',
      '',
    ].join('\n'));
    write(pluginRoot, 'agents/implementer.md', [
      '---',
      'name: implementer',
      'description: Slice implementer. Dispatched by /superdev:implement.',
      'tools: Read, Edit, Write, Bash, WebSearch',
      'model: sonnet',
      '---',
      '',
      'You implement one slice. Read ${CLAUDE_PLUGIN_ROOT}/references/test-selection.md.',
      '',
    ].join('\n'));
    write(pluginRoot, 'agents/final-reviewer.md', [
      '---',
      'name: final-reviewer',
      'description: Fresh-eyes verifier.',
      'tools: Read, Grep',
      'model: opus',
      '---',
      '',
      'Read-only.',
      '',
    ].join('\n'));

    const dest = tmp();
    write(dest, 'unrelated/keep.txt', 'not generated\n');
    const modelMap = new Map([['sonnet', 'acme/sonnet-1'], ['opus', 'acme/opus-1']]);
    const opts = { harness: 'opencode', pluginRoot, dest, modelMap };
    const written = render(opts);

    assert.deepEqual(written, [
      path.join('.opencode', 'agents', 'final-reviewer.md'),
      path.join('.opencode', 'agents', 'implementer.md'),
      path.join('.opencode', 'commands', 'superdev', 'backlog.md'),
      path.join('.opencode', 'commands', 'superdev', 'implement.md'),
      path.join('.opencode', 'commands', 'superdev', 'plan.md'),
      path.join('.opencode', 'commands', 'superdev', 'setup.md'),
      path.join('.opencode', 'commands', 'superdev', 'upgrade.md'),
      path.join('.opencode', 'plugins', 'superdev.js'),
    ]);
    // afk stays excluded — its Skill-tool chain has no OpenCode equivalent (ADR 0050) — while
    // upgrade, the sibling ADR 0050 also excluded, now renders (ADR 0052).
    assert.ok(!written.includes(path.join('.opencode', 'commands', 'superdev', 'afk.md')), 'afk stays excluded');

    // upgrade renders OpenCode-native content, synthesized rather than derived from the skill's own
    // Claude-Code-only body: a real git-pull-then-re-render path, the model alias still resolved
    // through --model-map, and none of the Claude-only commands or restart instruction.
    const upgradeCommand = fs.readFileSync(path.join(dest, '.opencode', 'commands', 'superdev', 'upgrade.md'), 'utf8');
    assert.ok(upgradeCommand.startsWith('---\ndescription:'), 'upgrade.md carries frontmatter');
    assert.ok(upgradeCommand.includes(`git -C ${JSON.stringify(`${pluginRoot}${path.sep}..`)} pull`), 'names a git pull against the baked repo root, as a literal pluginRoot prefix the fixture normalizer can placeholder');
    assert.ok(upgradeCommand.includes('start a new OpenCode session'), 'tells the user to start a new session, the verified OpenCode load point');
    assert.ok(!upgradeCommand.includes('claude plugin'), 'carries no Claude-Code-only command');
    assert.ok(!upgradeCommand.toLowerCase().includes('marketplace'), 'carries no marketplace mention');
    assert.ok(!upgradeCommand.includes('restart Claude Code'), 'carries no Claude-Code restart instruction');
    assert.ok(
      /exit\s+status|exit\s+code/i.test(upgradeCommand) && /stale\/incomplete/.test(upgradeCommand),
      'instructs the model to check each step\'s exit status and stop instead of reporting success over a stale render',
    );

    // The re-render line, round-tripped through the module's own parseArgs() — a plain substring
    // check on the generator's own output would pass by construction and miss both real defects
    // this closes: an emitted `render` positional word (parseArgs has no subcommand handling, so
    // it refuses with "unknown flag 'render'"), and a re-render with no --model-map flags at all
    // (which starves on a prompt with no TTY under the Bash tool).
    const rerenderLine = upgradeCommand.match(/^node .+$/m)[0];
    assert.ok(!/\brender\b/.test(rerenderLine), 'the emitted command carries no stray "render" word — parseArgs has no positional-argument handling');
    const rerenderArgv = tokenizeShellLine(rerenderLine).slice(2); // drop "node" and the adapter.js path itself
    const rerenderOpts = parseArgs(rerenderArgv);
    assert.equal(rerenderOpts.harness, 'opencode');
    assert.equal(rerenderOpts.dest, '$(pwd)', 're-derives the destination at run time from the shell it runs in');
    assert.deepEqual(rerenderOpts.modelMap, modelMap, 're-render carries every resolved model-map entry, so it runs non-interactively and preserves the operator\'s original picks');

    // The synthesized upgrade command's model alias still resolves through --model-map, exactly like
    // every other rendered command — isolated from the shared pluginRoot fixture above (whose own
    // upgrade skill carries no model) so this assertion never perturbs that fixture's other tests,
    // several of which depend on an exact interactive-prompt count.
    {
      const upgradeRoot = tmp();
      write(upgradeRoot, 'skills/upgrade/SKILL.md', [
        '---',
        'name: upgrade',
        'description: Upgrade the plugin via claude plugin update.',
        'model: haiku',
        '---',
        '',
        'Run claude plugin marketplace update superdev.',
        '',
      ].join('\n'));
      fs.mkdirSync(path.join(upgradeRoot, 'agents'), { recursive: true });
      const upgradeDest = tmp();
      const rendered = render({
        harness: 'opencode',
        pluginRoot: upgradeRoot,
        dest: upgradeDest,
        modelMap: new Map([['haiku', 'acme/haiku-1']]),
      });
      assert.ok(rendered.includes(path.join('.opencode', 'commands', 'superdev', 'upgrade.md')));
      const rerendered = fs.readFileSync(path.join(upgradeDest, '.opencode', 'commands', 'superdev', 'upgrade.md'), 'utf8');
      assert.ok(rerendered.includes('model: acme/haiku-1'), "upgrade's haiku alias resolves through --model-map, like any other command");
      const rerenderedLine = rerendered.match(/^node .+$/m)[0];
      const rerenderedOpts = parseArgs(tokenizeShellLine(rerenderedLine).slice(2));
      assert.deepEqual(
        rerenderedOpts.modelMap,
        new Map([['haiku', 'acme/haiku-1']]),
        'a single-alias model-map still round-trips through the emitted re-render command',
      );

      refuses(
        () => render({ harness: 'opencode', pluginRoot: upgradeRoot, dest: tmp(), modelMap: new Map() }),
        "--model-map entry for model alias 'haiku'",
      );
    }

    const command = fs.readFileSync(path.join(dest, '.opencode', 'commands', 'superdev', 'plan.md'), 'utf8');
    assert.ok(command.startsWith('---\ndescription: "Plan a feature. Run before /superdev/implement."\n---\n\n# superdev plan'));
    assert.ok(command.includes(`Read ${pluginRoot}/references/plan-contract.md, then dispatch \`implementer\`.`));
    assert.ok(command.includes('/superdev/afk'));
    assert.ok(!command.includes('argument-hint'));

    // A description carrying `: ` renders as a JSON-quoted YAML scalar, so the frontmatter parses.
    const colonCommand = fs.readFileSync(path.join(dest, '.opencode', 'commands', 'superdev', 'setup.md'), 'utf8');
    assert.ok(colonCommand.startsWith('---\ndescription: "Configure this repo for superdev: slice store, code host."\n---'));

    // A command's model alias resolves through the same --model-map, and its allowed-tools carry.
    const backlogCommand = fs.readFileSync(path.join(dest, '.opencode', 'commands', 'superdev', 'backlog.md'), 'utf8');
    assert.ok(backlogCommand.startsWith('---\ndescription: "Survey the backlog. Read-only."\nmodel: acme/sonnet-1\nallowed-tools: "Read, Bash"\n---'));

    const agent = fs.readFileSync(path.join(dest, '.opencode', 'agents', 'implementer.md'), 'utf8');
    assert.ok(agent.includes('description: "Slice implementer. Dispatched by /superdev/implement."'));
    assert.ok(agent.includes('mode: subagent'));
    assert.ok(agent.includes('model: acme/sonnet-1'));
    // tools: is OpenCode's real per-tool enable/disable gate — its permission: layer overlays an
    // allow-by-default baseline, so an `allow` entry there restricts nothing (verified live against
    // opencode 1.18.20, `opencode debug agent`). A leading `"*": false` denies every tool OpenCode
    // has or ever adds (an MCP tool, a future builtin) before the explicit `true` entries name what
    // the Claude tools: allowlist allows — OpenCode's `tools:` map is last-match-wins, so the
    // wildcard must come first or it flattens every later entry to false (verified live: the same
    // three explicit keys after a trailing `"*": false` all resolved false). `invalid: true` always
    // rides along: it is OpenCode's tool-call repair sink, not a callable tool (see renderAgent).
    assert.ok(agent.includes('tools:\n  "*": false\n  bash: true\n  edit: true\n  invalid: true\n  read: true\n  write: true\n'));
    // The tools: map above converts `read: true` into a `read: {"*": "allow"}` permission rule that
    // silently defeats OpenCode's own built-in `.env` read-ask default (verified live against
    // opencode 1.18.20, `opencode debug agent`). An explicit `permission:` entry for the same key
    // replaces that tools:-derived rule rather than appending after it, so this block re-asserts the
    // built-in default in full — its own `"*": "allow"` included — so it still holds.
    assert.ok(
      agent.includes(
        'permission:\n  read:\n    "*": "allow"\n    "*.env": "ask"\n    "*.env.*": "ask"\n    "*.env.example": "allow"\n',
      ),
      'the .env read guard is restored after the tools: map',
    );
    assert.ok(agent.includes(`Read ${pluginRoot}/references/test-selection.md.`));

    // A read-only agent (Read, Grep only) gets edit and write denied by the wildcard — the defect
    // this fix closes: the four read-only agents (doc-reader, final-reviewer, simplicity-reviewer,
    // slice-reviewer) resolved edit/write/task/webfetch as allowed under the old permission:-only
    // render. No `false` entries beyond the wildcard: an enumerated eleven-key deny list still
    // reads a twelfth, unenumerated tool id as allowed, which the wildcard does not. `invalid`
    // still resolves true even for a read-only agent — it is denied nowhere.
    const reviewer = fs.readFileSync(path.join(dest, '.opencode', 'agents', 'final-reviewer.md'), 'utf8');
    assert.ok(reviewer.includes('tools:\n  "*": false\n  grep: true\n  invalid: true\n  read: true\n'));

    // An agent whose own tools: allowlist carries no Read gets no permission: block at all — the
    // block is a replace-per-key re-assertion of what tools: read: true itself would otherwise have
    // contributed (see renderAgent), so emitting it for an agent that never granted read: true would
    // instead grant read access the "*": false wildcard was denying (verified live against opencode
    // 1.18.20, `opencode debug agent`: a rendered agent with no read: true entry and this block
    // appended anyway resolves tools.read = true; without the block it resolves false).
    {
      const noReadRoot = tmp();
      fs.mkdirSync(path.join(noReadRoot, 'skills'), { recursive: true });
      write(noReadRoot, 'agents/no-read.md', [
        '---',
        'name: no-read',
        'description: An agent with no Read in its tools allowlist.',
        'tools: Grep, Bash',
        'model: sonnet',
        '---',
        '',
        'body',
        '',
      ].join('\n'));
      const noReadDest = tmp();
      render({ harness: 'opencode', pluginRoot: noReadRoot, dest: noReadDest, modelMap: new Map([['sonnet', 'acme/sonnet-1']]) });
      const noReadAgent = fs.readFileSync(path.join(noReadDest, '.opencode', 'agents', 'no-read.md'), 'utf8');
      assert.ok(!noReadAgent.includes('permission:'), 'no permission: block for an agent that never granted read: true');
    }

    // No Claude-only token survives anywhere in the render.
    for (const rel of written) {
      const text = fs.readFileSync(path.join(dest, rel), 'utf8');
      assert.ok(!text.includes('${CLAUDE_PLUGIN_ROOT}'), rel);
      assert.ok(!text.includes('/superdev:'), rel);
      assert.ok(!/(?<![/\w-])superdev:\w/.test(text), rel);
    }

    // Idempotent: a re-run is byte-identical, cleans up a stale superdev-rendered agent (one this
    // adapter wrote in a past render, whose source agent has since been renamed or removed —
    // simulated here by a marker-carrying file the current agent list no longer produces), leaves
    // a consumer's own foreign agent file alone, and leaves unrelated dest content alone —
    // including a consumer's own plugin beside the bridge.
    const before = written.map((rel) => fs.readFileSync(path.join(dest, rel), 'utf8'));
    write(dest, '.opencode/agents/ghost.md', '---\n# generated-by: superdev-adapter — a re-render overwrites this file\ndescription: "ghost"\nmode: subagent\nmodel: acme/sonnet-1\n---\n\nghost\n');
    write(dest, '.opencode/agents/mine.md', 'a consumer\'s own agent, not ours\n');
    // A foreign agent whose body happens to quote the marker sentence (documenting it, say) is
    // not itself frontmatter-tagged — the marker check must look only at the frontmatter block,
    // not the whole file, or a quote like this reads as a stale superdev render and gets deleted.
    write(dest, '.opencode/agents/quoter.md', '---\ndescription: "quotes the marker"\nmode: subagent\nmodel: acme/sonnet-1\n---\n\nSee: `# generated-by: superdev-adapter — a re-render overwrites this file`\n');
    write(dest, '.opencode/plugins/other.js', '// a foreign plugin\n');
    const rewritten2 = render(opts);
    assert.deepEqual(rewritten2, written);
    assert.ok(!fs.existsSync(path.join(dest, '.opencode', 'agents', 'ghost.md')), 'a stale superdev-rendered agent is cleaned');
    assert.equal(fs.readFileSync(path.join(dest, '.opencode', 'agents', 'mine.md'), 'utf8'), 'a consumer\'s own agent, not ours\n', 'a foreign agent file survives a re-render');
    assert.ok(fs.existsSync(path.join(dest, '.opencode', 'agents', 'quoter.md')), 'a foreign agent that merely quotes the marker in its body survives');
    assert.equal(fs.readFileSync(path.join(dest, '.opencode', 'plugins', 'other.js'), 'utf8'), '// a foreign plugin\n');
    assert.equal(fs.readFileSync(path.join(dest, 'unrelated', 'keep.txt'), 'utf8'), 'not generated\n');
    assert.deepEqual(rewritten2.map((rel) => fs.readFileSync(path.join(dest, rel), 'utf8')), before);

    // A trailing slash on the plugin root normalizes away instead of producing `//` paths.
    const slashDest = tmp();
    render({ harness: 'opencode', pluginRoot: pluginRoot + path.sep, dest: slashDest, modelMap });
    const slashed = fs.readFileSync(path.join(slashDest, '.opencode', 'commands', 'superdev', 'plan.md'), 'utf8');
    assert.ok(slashed.includes(`Read ${pluginRoot}/references/plan-contract.md`));
    assert.ok(!slashed.includes(`${pluginRoot}//`));

    // --- the hook bridge (issue #376) ---

    // The event-map constants.
    assert.deepEqual(BRIDGE_SHELL_TOOLS, ['bash']);
    assert.deepEqual(BRIDGE_EDIT_TOOLS, ['edit', 'write', 'apply_patch']);
    assert.deepEqual(BRIDGE_TASK_TOOLS, ['task']);
    assert.deepEqual(BRIDGE_SHELL_BEFORE_HOOKS, ['merge-guard', 'run-lock', 'ledger-guard']);
    assert.deepEqual(BRIDGE_SESSION_CREATED, ['session.created']);
    assert.deepEqual(BRIDGE_SESSION_ENDED, ['session.idle', 'session.deleted']);
    assert.deepEqual(BRIDGE_SESSION_END_HOOKS, ['worktree-sweep', 'scope-prune']);

    // The stdin builder emits the Claude shape the hooks parse, and omits what it has no value for.
    assert.deepEqual(buildHookPayload('PreToolUse', 'Bash', { command: 'ls' }, '/repo', 'a1'), {
      hook_event_name: 'PreToolUse',
      cwd: '/repo',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      agent_id: 'a1',
    });
    assert.deepEqual(buildHookPayload('Stop', undefined, undefined, '/repo'), {
      hook_event_name: 'Stop',
      cwd: '/repo',
    });

    // The spawned child env carries CLAUDE_PLUGIN_ROOT (update-check.js reads it) on top of the
    // plugin process's own environment.
    {
      const env = bridgeSpawnEnv('/plugin/root');
      assert.equal(env.CLAUDE_PLUGIN_ROOT, '/plugin/root');
      assert.equal(env.PATH, process.env.PATH);
    }

    // Block-decision parsing: exit 2 carries the stderr reason, a stdout JSON deny carries its
    // own reason, and everything else passes through.
    assert.equal(hookBlockReason('merge-guard', { status: 0, stdout: '', stderr: '' }), null);
    assert.equal(hookBlockReason('green-gate', { status: 1, stdout: '', stderr: 'crash' }), null, 'a hook crash fails open');
    assert.equal(hookBlockReason('update-check', { status: 0, stdout: 'superdev 9.9 is available\n', stderr: '' }), null, 'a notice is not a block');
    assert.equal(hookBlockReason('merge-guard', { status: 2, stdout: '', stderr: 'denied!\n' }), 'denied!');
    assert.match(hookBlockReason('merge-guard', { status: 2, stdout: '', stderr: '' }), /merge-guard/, 'a bare exit 2 still names the hook');
    const deny = JSON.stringify({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'nope' } });
    assert.equal(hookBlockReason('x', { status: 0, stdout: deny, stderr: '' }), 'nope');
    const bareDeny = JSON.stringify({ hookSpecificOutput: { permissionDecision: 'deny' } });
    assert.match(hookBlockReason('x', { status: 0, stdout: bareDeny }), /denied/, 'a reasonless deny still names the hook');
    const allow = JSON.stringify({ hookSpecificOutput: { permissionDecision: 'allow' } });
    assert.equal(hookBlockReason('x', { status: 0, stdout: allow, stderr: '' }), null);

    // The rendered bridge module, exercised end to end against fake hooks under the fixture
    // plugin root. Every fake appends a marker line carrying its name, the payload's tool_name,
    // and its CLAUDE_PLUGIN_ROOT, so routing, payload shape, and the spawn env are all asserted
    // off the one file.
    const marker = path.join(tmp(), 'bridge-mark');
    const fakeHook = (body) => `let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',(c)=>raw+=c);process.stdin.on('end',()=>{const fs=require('fs');const input=JSON.parse(raw||'{}');fs.appendFileSync(process.env.BRIDGE_MARK,process.argv[1]+' tool='+(input.tool_name||'-')+' root='+process.env.CLAUDE_PLUGIN_ROOT+'\\n');${body}});`;
    write(pluginRoot, 'hooks/merge-guard.js', fakeHook(`if(input.tool_input.command.includes('slow-op')){const start=Date.now();while(Date.now()-start<150){}process.exit(0);}if(input.tool_input.command.includes('merge')){process.stderr.write(raw);process.exit(2);}process.exit(0);`));
    write(pluginRoot, 'hooks/run-lock.js', fakeHook('process.exit(0);'));
    // Mirrors the real hook's decision (plugin/hooks/ledger-guard.js) closely enough to prove the
    // bridge resolves the right target path: block a file_path landing on a scopes ledger.
    write(pluginRoot, 'hooks/ledger-guard.js', fakeHook(
      `if(input.tool_input.file_path&&/\\.superdev\\/scopes\\/[^/]+\\/ledger\\.md$/.test(input.tool_input.file_path)){process.stderr.write('ledger-guard blocked '+input.tool_input.file_path);process.exit(2);}process.exit(0);`,
    ));
    write(pluginRoot, 'hooks/model-explicit.js', fakeHook('process.stderr.write(raw);process.exit(2);'));
    write(pluginRoot, 'hooks/green-gate.js', fakeHook(`if(input.tool_input.command.includes('jsondeny')){process.stdout.write(JSON.stringify({hookSpecificOutput:{permissionDecision:'deny',permissionDecisionReason:'json says no'}}));process.exit(0);}if(input.tool_input.command.includes('merge')){process.stderr.write('gated');process.exit(2);}process.exit(0);`));
    write(pluginRoot, 'hooks/update-check.js', fakeHook('process.exit(0);'));
    write(pluginRoot, 'hooks/worktree-sweep.js', fakeHook('process.exit(0);'));
    write(pluginRoot, 'hooks/scope-prune.js', fakeHook('process.exit(0);'));

    const bridgeDest = tmp();
    render({ harness: 'opencode', pluginRoot, dest: bridgeDest, modelMap });
    const bridgePath = path.join(bridgeDest, '.opencode', 'plugins', 'superdev.js');
    const bridgeText = fs.readFileSync(bridgePath, 'utf8');
    assert.ok(bridgeText.includes(`const PLUGIN_ROOT = ${JSON.stringify(path.resolve(pluginRoot))};`), 'the bridge bakes in the resolved plugin root');
    assert.ok(bridgeText.includes("module.exports = { id: 'superdev', server: SuperdevPlugin };"), 'the bridge default-exports the v1 plugin shape (id + server), the shape OpenCode\u2019s loader requires');
    assert.ok(bridgeText.includes('2026-08-30') && bridgeText.includes('https://opencode.ai/docs/plugins/'), 'the bridge carries the dated event-map verification');
    const { server: SuperdevPlugin } = require(bridgePath);
    const ctx = { directory: bridgeDest }; // no client: subagent detection fails open
    const plugin = await SuperdevPlugin(ctx);
    process.env.BRIDGE_MARK = marker;

    const marks = () => fs.readFileSync(marker, 'utf8');
    const count = (name) => marks().split(`${name}.js`).length - 1;
    const thrown = async (fn) => {
      try {
        await fn();
      } catch (e) {
        return e;
      }
      return null;
    };

    // tool.execute.before on a shell tool runs merge-guard, run-lock, and ledger-guard, each
    // with CLAUDE_PLUGIN_ROOT set to the baked-in plugin root.
    await plugin['tool.execute.before']({ tool: 'bash', sessionID: 's1' }, { args: { command: 'ls' } });
    for (const hook of ['merge-guard', 'run-lock', 'ledger-guard']) {
      assert.ok(marks().includes(`${hook}.js tool=Bash root=${path.resolve(pluginRoot)}`), `${hook} ran with the plugin root in env`);
    }

    // Two concurrent shell-tool calls' hook spawns run in parallel, not serialized behind one
    // another — a single-threaded blocking spawnSync would hold the whole OpenCode plugin host
    // (its TUI, its SSE stream, every concurrent session) for the sum of both hooks' running time.
    // Measured against one call's own elapsed time, not a pinned ceiling: a loaded box is slower
    // in absolute terms, but a serialized pair still costs roughly double a single call, while a
    // parallel pair costs roughly the same as one.
    const soloStart = Date.now();
    await plugin['tool.execute.before']({ tool: 'bash', sessionID: 'solo' }, { args: { command: 'slow-op' } });
    const soloElapsed = Date.now() - soloStart;
    const parallelStart = Date.now();
    await Promise.all([
      plugin['tool.execute.before']({ tool: 'bash', sessionID: 'p1' }, { args: { command: 'slow-op' } }),
      plugin['tool.execute.before']({ tool: 'bash', sessionID: 'p2' }, { args: { command: 'slow-op' } }),
    ]);
    const parallelElapsed = Date.now() - parallelStart;
    assert.ok(
      parallelElapsed < soloElapsed * 1.5,
      `two concurrent bash calls finish near a single call's own time (${parallelElapsed}ms), not roughly double it ` +
        `(${soloElapsed}ms solo), the way a blocking spawnSync would serialize them`,
    );

    // A shell command a hook refuses throws, and the thrown message is the hook's Claude-shaped
    // stdin payload: tool_name Bash, the command, the cwd, and no agent_id without a client.
    const blocked = await thrown(() => plugin['tool.execute.before']({ tool: 'bash', sessionID: 's1' }, { args: { command: 'git merge x' } }));
    assert.ok(blocked, 'a refusing hook blocks the tool call');
    const blockedPayload = JSON.parse(blocked.message);
    assert.equal(blockedPayload.tool_name, 'Bash');
    assert.equal(blockedPayload.tool_input.command, 'git merge x');
    assert.equal(blockedPayload.cwd, bridgeDest);
    assert.equal(blockedPayload.agent_id, undefined);

    // A session with a parentID is a subagent: its agent_id reaches merge-guard.
    const subCtx = { directory: bridgeDest, client: { session: { get: async () => ({ data: { parentID: 'parent' } }) } } };
    const subPlugin = await SuperdevPlugin(subCtx);
    const subBlocked = await thrown(() => subPlugin['tool.execute.before']({ tool: 'bash', sessionID: 'child-1' }, { args: { command: 'git merge x' } }));
    assert.equal(JSON.parse(subBlocked.message).agent_id, 'child-1');

    // File-editing tools route to ledger-guard as Edit/Write, with the ordinary tool's own
    // filePath argument — a write elsewhere passes, one targeting the ledger blocks.
    await plugin['tool.execute.before']({ tool: 'edit', sessionID: 's1' }, { args: { filePath: '/x/a.js' } });
    assert.ok(marks().includes('ledger-guard.js tool=Edit'), 'a non-ledger Edit still runs the hook');
    const ledger = '/repo/.superdev/scopes/demo/ledger.md';
    const writeBlocked = await thrown(() => plugin['tool.execute.before']({ tool: 'write', sessionID: 's1' }, { args: { filePath: ledger } }));
    assert.ok(writeBlocked, 'a Write targeting the ledger is blocked');

    // apply_patch is the OpenAI tool OpenCode bridges through: its args carry no filePath, only
    // `{ callId, operation: { type, path, diff } }` — the bridge must resolve the target from
    // operation.path or the hook never sees the real path and silently passes a ledger write.
    const patchBlocked = await thrown(() => plugin['tool.execute.before'](
      { tool: 'apply_patch', sessionID: 's1' },
      { args: { callId: 'c1', operation: { type: 'update_file', path: ledger, diff: 'x' } } },
    ));
    assert.ok(patchBlocked, 'apply_patch resolves its target from operation.path and still blocks a ledger write');

    // The task tool routes to model-explicit as Agent, with subagent_type and the model read back
    // from the rendered agent's frontmatter (the fake always refuses, so the payload comes back
    // in the thrown message).
    const dispatch = await thrown(() => plugin['tool.execute.before']({ tool: 'task', sessionID: 's1' }, { args: { subagent_type: 'implementer', prompt: 'p' } }));
    const dispatchPayload = JSON.parse(dispatch.message);
    assert.equal(dispatchPayload.tool_name, 'Agent');
    assert.equal(dispatchPayload.tool_input.subagent_type, 'implementer');
    assert.equal(dispatchPayload.tool_input.model, 'acme/sonnet-1', 'the rendered agent frontmatter supplies the explicit model');
    const unrendered = await thrown(() => plugin['tool.execute.before']({ tool: 'task', sessionID: 's1' }, { args: { subagent_type: 'ghost', prompt: 'p' } }));
    assert.equal(JSON.parse(unrendered.message).tool_input.model, undefined, 'no rendered agent → no model → the hook blocks');

    // tool.execute.after on a shell tool runs green-gate: a RED suite (exit 2) throws, a stdout
    // JSON deny throws, a green run passes, and a non-shell tool never reaches the hook. The
    // after-hook's args ride on the input, matching the @opencode-ai/plugin Hooks type.
    const gated = await thrown(() => plugin['tool.execute.after']({ tool: 'bash', sessionID: 's1', args: { command: 'git merge x' } }, { title: '', output: '', metadata: {} }));
    assert.equal(gated && gated.message, 'gated');
    const jsonDenied = await thrown(() => plugin['tool.execute.after']({ tool: 'bash', sessionID: 's1', args: { command: 'jsondeny' } }, { title: '', output: '', metadata: {} }));
    assert.equal(jsonDenied && jsonDenied.message, 'json says no');
    const gatesBefore = count('green-gate');
    await plugin['tool.execute.after']({ tool: 'bash', sessionID: 's1', args: { command: 'ls' } }, { title: '', output: '', metadata: {} });
    assert.equal(count('green-gate'), gatesBefore + 1, 'a green after-hook run still spawns the hook');
    await plugin['tool.execute.after']({ tool: 'edit', sessionID: 's1', args: { filePath: '/x' } }, { title: '', output: '', metadata: {} });
    assert.equal(count('green-gate'), gatesBefore + 1, 'no green-gate spawn for a non-shell tool');

    // Regression: a hook that never reads stdin (a require() failure before main() runs, the
    // documented worktree-sweep/scope-prune shape) must not turn a >64KB command payload into an
    // uncaught EPIPE that crashes the whole plugin host, and a hook's multi-byte stdout/stderr
    // must survive a Buffer chunk boundary uncorrupted. A dedicated, minimal fixture — its own
    // merge-guard/green-gate bodies — so these two hooks' unusual shapes never interact with the
    // shared fixture's git-merge-blocking assertions above.
    {
      const robustRoot = tmp();
      fs.mkdirSync(path.join(robustRoot, 'skills'), { recursive: true });
      fs.mkdirSync(path.join(robustRoot, 'agents'), { recursive: true });
      write(robustRoot, 'hooks/merge-guard.js', 'process.exit(0);\n');
      write(robustRoot, 'hooks/run-lock.js', 'process.exit(0);\n');
      write(robustRoot, 'hooks/ledger-guard.js', 'process.exit(0);\n');
      // exitCode, not exit(2): a forced exit can truncate a large async pipe write before the OS
      // finishes it (a separate, real Node gotcha) — setting exitCode lets Node drain the write
      // naturally, isolating the encoding bug this test targets from that unrelated one.
      write(robustRoot, 'hooks/green-gate.js', "process.stderr.write('\\u2014'.repeat(200000));process.exitCode = 2;");
      const robustDest = tmp();
      render({ harness: 'opencode', pluginRoot: robustRoot, dest: robustDest, modelMap: new Map() });
      const { server: RobustPlugin } = require(path.join(robustDest, '.opencode', 'plugins', 'superdev.js'));
      const robustPlugin = await RobustPlugin({ directory: robustDest });

      // EPIPE: merge-guard here exits before ever reading stdin; a >64KB command must still
      // resolve the call rather than crash the process.
      await robustPlugin['tool.execute.before']({ tool: 'bash', sessionID: 's1' }, { args: { command: 'x'.repeat(200000) } });

      // Encoding: green-gate's >64KB, all-multi-byte stderr must reach the thrown block reason
      // with no replacement characters — a plain per-chunk toString() mangles a character split
      // across a chunk boundary.
      const encodingErr = await thrown(() => robustPlugin['tool.execute.after'](
        { tool: 'bash', sessionID: 's1', args: { command: 'ls' } },
        { title: '', output: '', metadata: {} },
      ));
      assert.ok(encodingErr, 'green-gate exits 2 here unconditionally');
      assert.equal(
        (encodingErr.message.match(/�/g) || []).length,
        0,
        'no replacement characters from a multi-byte split across a chunk boundary',
      );
    }

    // Session events: created → update-check; idle and deleted → worktree-sweep + scope-prune;
    // an unknown event spawns nothing.
    await plugin.event({ event: { type: 'session.created' } });
    assert.equal(count('update-check'), 1);
    await plugin.event({ event: { type: 'session.idle' } });
    await plugin.event({ event: { type: 'session.deleted' } });
    assert.equal(count('worktree-sweep'), 2);
    assert.equal(count('scope-prune'), 2);
    await plugin.event({ event: { type: 'session.updated' } });
    await plugin.event({});
    assert.equal(count('worktree-sweep'), 2, 'unknown and malformed events spawn nothing');

    // CLI integration: the CLI writes the bridge into --dest and reports it.
    {
      const cliDest = tmp();
      const res = require('node:child_process').spawnSync(
        process.execPath,
        [__filename, '--harness', 'opencode', '--plugin-root', pluginRoot, '--dest', cliDest, '--model-map', 'sonnet=acme/sonnet-1', '--model-map', 'opus=acme/opus-1'],
        { encoding: 'utf8' },
      );
      assert.equal(res.status, 0, res.stderr);
      assert.ok(fs.existsSync(path.join(cliDest, '.opencode', 'plugins', 'superdev.js')));
      assert.ok(res.stdout.includes('rendered .opencode/plugins/superdev.js'));
    }

    // CLI integration: a --model-map missing the 'sonnet' alias prompts for exactly that alias —
    // fed via spawnSync's own `input` (the one answer '1\n') — and never prompts for 'opus', which
    // --model-map already covers: only one answer is queued, so a stray second prompt for 'opus'
    // would starve on EOF and the render would fail instead of completing.
    {
      const cliDest2 = tmp();
      write(cliDest2, 'opencode.json', JSON.stringify({ model: 'acme/interactive-sonnet-1' }));
      // The invocation cwd carries no config at all — proves the query reads --dest's own project
      // config, not whatever directory the adapter happens to be invoked from.
      const invocationDir2 = tmp();
      const res2 = require('node:child_process').spawnSync(
        process.execPath,
        [__filename, '--harness', 'opencode', '--plugin-root', pluginRoot, '--dest', cliDest2, '--model-map', 'opus=acme/opus-1'],
        {
          encoding: 'utf8',
          input: '1\n',
          cwd: invocationDir2,
          env: Object.assign({}, process.env, { OPENCODE_CONFIG: '', HOME: invocationDir2 }),
        },
      );
      assert.equal(res2.status, 0, res2.stderr);
      const backlogCommand2 = fs.readFileSync(path.join(cliDest2, '.opencode', 'commands', 'superdev', 'backlog.md'), 'utf8');
      assert.ok(backlogCommand2.includes('model: acme/interactive-sonnet-1'), 'the missing sonnet alias resolves to the interactively picked model');
      const reviewer2 = fs.readFileSync(path.join(cliDest2, '.opencode', 'agents', 'final-reviewer.md'), 'utf8');
      assert.ok(reviewer2.includes('model: acme/opus-1'), 'the opus alias --model-map already covers is never prompted for');
    }

    // Regression: closed/EOF stdin (`< /dev/null`, or any non-interactive invocation) with a
    // --model-map missing an alias must refuse loudly instead of silently exiting 0 having
    // rendered nothing — rl.question's callback never fires once the input has already ended, so
    // the fix must notice the readline interface's own 'close' event instead of waiting on an
    // answer that will never come. A bounded `timeout` turns "hangs forever" into an observable
    // failure (a killed child, `res.signal` set) rather than stalling the whole suite.
    {
      // A real, non-empty OpenCode config in --dest itself: without one, the missing 'sonnet'
      // alias refuses through the separate "no models configured" preflight before the prompt
      // (and the EOF handling) is ever reached — this test is specifically for the prompt's own
      // EOF handling.
      const cliDest3 = tmp();
      write(cliDest3, 'opencode.json', JSON.stringify({ model: 'acme/eof-1' }));
      const eofInvocationDir = tmp(); // no config here — the query reads --dest's, not cwd's
      const res3 = require('node:child_process').spawnSync(
        process.execPath,
        [__filename, '--harness', 'opencode', '--plugin-root', pluginRoot, '--dest', cliDest3],
        {
          encoding: 'utf8',
          input: '',
          cwd: eofInvocationDir,
          env: Object.assign({}, process.env, { OPENCODE_CONFIG: '', HOME: eofInvocationDir }),
          timeout: 5000,
        },
      );
      assert.equal(res3.signal, null, 'the process refuses on its own instead of being killed by the test timeout');
      assert.equal(res3.status, 1, 'EOF/non-interactive input refuses (nonzero exit) instead of hanging or silently exiting 0');
      assert.ok(res3.stderr.includes('sonnet'), 'the refusal names the still-missing alias');
      assert.ok(res3.stderr.includes('--model-map'), 'the refusal mentions --model-map as the escape hatch');
      assert.ok(!fs.existsSync(path.join(cliDest3, '.opencode')), 'a refused render writes nothing to --dest');
    }

    // Regression: piped multi-alias input (2+ aliases missing from --model-map) must resolve every
    // alias, not just the first — the bug routed each alias's prompt through its own fresh
    // `readline` interface, so the first prompt's interface greedily buffered and then discarded
    // the rest of the pipe on close, starving every prompt after it.
    {
      const cliDest4 = tmp();
      write(cliDest4, 'opencode.json', JSON.stringify({ model: 'acme/multi-a', small_model: 'acme/multi-b' }));
      const multiInvocationDir = tmp(); // no config here — the query reads --dest's, not cwd's
      const res4 = require('node:child_process').spawnSync(
        process.execPath,
        [__filename, '--harness', 'opencode', '--plugin-root', pluginRoot, '--dest', cliDest4],
        {
          encoding: 'utf8',
          // Distinct answers per alias ('1' then '2'), not the same line repeated: identical
          // answers can't tell "each prompt consumed its own line" from "one line got replayed
          // for every alias".
          input: '1\n2\n',
          cwd: multiInvocationDir,
          env: Object.assign({}, process.env, { OPENCODE_CONFIG: '', HOME: multiInvocationDir }),
          timeout: 5000,
        },
      );
      assert.equal(res4.status, 0, res4.stderr);
      const backlogCommand4 = fs.readFileSync(path.join(cliDest4, '.opencode', 'commands', 'superdev', 'backlog.md'), 'utf8');
      assert.ok(backlogCommand4.includes('model: acme/multi-a'), "the first missing alias ('sonnet') resolves from the first queued answer");
      const reviewer4 = fs.readFileSync(path.join(cliDest4, '.opencode', 'agents', 'final-reviewer.md'), 'utf8');
      assert.ok(reviewer4.includes('model: acme/multi-b'), "the second missing alias ('opus') resolves from its own, distinct queued answer — the shared readline interface serves both prompts from the one piped input");
    }

    // Regression: the model picker must query the --dest project's own OpenCode config, not
    // whatever directory the adapter happens to be invoked from — README documents "--dest names
    // the project root". Two distinct opencode.json files, one beside the invocation cwd and one
    // in --dest: the offered (and picked) model must come from --dest's config.
    {
      const invocationDir = tmp();
      write(invocationDir, 'opencode.json', JSON.stringify({ model: 'acme/from-invocation-dir' }));
      const cliDest5 = tmp();
      write(cliDest5, 'opencode.json', JSON.stringify({ model: 'acme/from-dest-project' }));
      const homeDir = tmp(); // no config here, so only the two opencode.json files above compete
      const res5 = require('node:child_process').spawnSync(
        process.execPath,
        [__filename, '--harness', 'opencode', '--plugin-root', pluginRoot, '--dest', cliDest5],
        {
          encoding: 'utf8',
          input: '1\n1\n',
          cwd: invocationDir,
          env: Object.assign({}, process.env, { OPENCODE_CONFIG: '', HOME: homeDir }),
          timeout: 5000,
        },
      );
      assert.equal(res5.status, 0, res5.stderr);
      const backlogCommand5 = fs.readFileSync(path.join(cliDest5, '.opencode', 'commands', 'superdev', 'backlog.md'), 'utf8');
      assert.ok(backlogCommand5.includes('model: acme/from-dest-project'), 'the picker offers the --dest project\'s own models, not the invocation directory\'s');
      assert.ok(!backlogCommand5.includes('model: acme/from-invocation-dir'), 'the invocation directory\'s config is never consulted');
    }

    delete process.env.BRIDGE_MARK;

    // Refusals and defaults: a missing harness defaults to opencode, an unknown harness, a
    // missing dest, a malformed --model-map, a model alias with no mapping (named, for a command
    // and for an agent), and a plugin root with no skills directory (named) all refuse.
    assert.equal(parseArgs(['--dest', 'x']).harness, 'opencode');
    refuses(() => parseArgs(['--harness', 'cursor', '--dest', 'x']), "unknown harness 'cursor'");
    refuses(() => parseArgs(['--harness', 'opencode']), 'missing --dest');
    refuses(() => parseArgs(['--harness', 'opencode', '--dest', 'x', '--model-map', 'sonnet']), '<alias>=<provider/model>');
    refuses(
      () => render({ harness: 'opencode', pluginRoot, dest: tmp(), modelMap: new Map([['opus', 'acme/opus-1']]) }),
      "no --model-map entry for model alias 'sonnet' (command backlog)",
    );
    refuses(
      () => render({ harness: 'opencode', pluginRoot, dest: tmp(), modelMap: new Map([['sonnet', 'acme/sonnet-1']]) }),
      "no --model-map entry for model alias 'opus' (agent final-reviewer)",
    );
    refuses(
      () => render({ harness: 'opencode', pluginRoot: tmp(), dest: tmp(), modelMap }),
      'skills directory',
    );

    // requireAvailableModel: a model absent from queryOpenCodeModels()'s own report — distinct
    // from resolveModel's "no --model-map entry" refusal above, which fires before any concrete
    // model name is even known — names the missing model in its refusal.
    refuses(
      () => requireAvailableModel('acme/ghost-1', ['acme/opus-1', 'acme/sonnet-1']),
      "model 'acme/ghost-1' is not available",
    );
    refuses(
      () => requireAvailableModel('acme/ghost-1', ['acme/opus-1', 'acme/sonnet-1']),
      'available models: acme/opus-1, acme/sonnet-1',
    );
    // An empty availableModels list (no OpenCode config found at all) still reads as a helpful
    // sentence, not a dangling "available models: ". The refusal itself is the only effect: a
    // scratch directory the call is handed is untouched, so a caller never has to unwind a
    // partial write before it retries.
    refuses(
      () => requireAvailableModel('acme/ghost-1', []),
      'no models are configured in your OpenCode setup yet',
    );
    {
      const scratch = tmp();
      write(scratch, 'marker.txt', 'untouched');
      const before = fs.readdirSync(scratch).sort();
      refuses(() => requireAvailableModel('acme/ghost-1', []), 'not available');
      assert.deepEqual(fs.readdirSync(scratch).sort(), before, 'requireAvailableModel performs no I/O — nothing to leave broken');
    }
    // Retry: the caller re-queries OpenCode config (queryOpenCodeModels()) after the user adds
    // the model, then calls requireAvailableModel again with the same arguments shape — now the
    // model is among the alternatives, and the call succeeds instead of refusing again.
    assert.equal(
      requireAvailableModel('acme/ghost-1', ['acme/ghost-1', 'acme/opus-1']),
      'acme/ghost-1',
      'once the model is present among the alternatives, the same call succeeds',
    );
    // A non-array availableModels (e.g. a caller that skipped queryOpenCodeModels() and passed
    // undefined) refuses through the same fail() convention instead of throwing a raw TypeError —
    // treated the same as an empty list, since no known available models can be named.
    refuses(
      () => requireAvailableModel('acme/ghost-1', undefined),
      'no models are configured in your OpenCode setup yet',
    );

    // Interactive model-map prompt: prompts for every alias in order, and returns the picks. The
    // fake terminal below feeds the next queued answer only once it sees the prompt that asks for
    // it — a real terminal never hands over the next keystroke before the question is on screen,
    // and readline drops a line typed before anyone asked for it.
    const fakeTerminal = (answers) => {
      const { PassThrough } = require('node:stream');
      const input = new PassThrough();
      const output = new PassThrough();
      let out = '';
      output.on('data', (chunk) => {
        const text = chunk.toString();
        out += text;
        if (/Select a model for/.test(text) && answers.length) input.write(`${answers.shift()}\n`);
      });
      return { input, output, out: () => out };
    };
    {
      const models = ['acme/haiku-1', 'acme/sonnet-1', 'acme/opus-1'];
      const { input, output } = fakeTerminal(['1', '1', '1']);
      const picks = await promptForModelMap(models, { input, output });
      assert.deepEqual([...picks.keys()], ['haiku', 'sonnet', 'opus'], 'prompts for every alias, in order');
    }

    // Every offered model is displayed before each alias is prompted, not just picked blind.
    {
      const models = ['acme/haiku-1', 'acme/sonnet-1', 'acme/opus-1'];
      const { input, output, out } = fakeTerminal(['1', '1', '1']);
      await promptForModelMap(models, { input, output });
      for (const model of models) assert.ok(out().includes(model), `${model} is shown to the user`);
    }

    // A different pick per alias, and a non-numeric, fractional, or out-of-range answer re-prompts
    // instead of resolving to an undefined model. '2.5' pins Number.isInteger specifically: it is a
    // valid, in-range Number, so a parseInt-based rewrite (which truncates it to the integer 2) would
    // wrongly accept it as a pick, rather than rejecting it and re-prompting.
    {
      const models = ['acme/haiku-1', 'acme/sonnet-1', 'acme/opus-1'];
      const { input, output } = fakeTerminal(['banana', '9', '2.5', '2', '3', '1']);
      const picks = await promptForModelMap(models, { input, output });
      assert.equal(
        picks.get('haiku'),
        models[1],
        "the non-numeric answer 'banana', the out-of-range 9, and the fractional 2.5 are rejected, then 2 is accepted",
      );
      assert.equal(picks.get('sonnet'), models[2]);
      assert.equal(picks.get('opus'), models[0]);
    }

    // The selection is returned to the caller as a Map carrying exactly the three aliases — the
    // shape a later resolveModel()-integration slice reads.
    {
      const models = ['acme/haiku-1', 'acme/sonnet-1', 'acme/opus-1'];
      const { input, output } = fakeTerminal(['1', '2', '3']);
      const picks = await promptForModelMap(models, { input, output });
      assert.ok(picks instanceof Map, 'the picks are returned as a Map');
      assert.equal(picks.size, 3, 'exactly one pick per alias, no more, no fewer');
    }

    // resolveModelMap: an alias --model-map already covers never reaches queryOpenCodeModels or the
    // interactive prompt at all — the same map comes back unchanged, and the fake terminal captures
    // no output. This is the CI-safe path: no --model-map entry missing means nothing here ever
    // touches stdin/stdout.
    {
      const root = tmp();
      write(root, 'skills/onlysonnet/SKILL.md', ['---', 'name: onlysonnet', 'description: only sonnet', 'model: sonnet', '---', '', 'body', ''].join('\n'));
      fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
      const covered = new Map([['sonnet', 'acme/sonnet-1']]);
      const { input, output, out } = fakeTerminal([]);
      const resolved = await resolveModelMap(root, covered, { input, output });
      assert.equal(resolved, covered, 'every alias already covered — the same map comes back');
      assert.equal(out(), '', 'no interactive output when nothing is missing');
    }

    // resolveModelMap: an alias missing from --model-map is resolved by querying the OpenCode
    // config and prompting for exactly that alias — a sibling alias --model-map already covers
    // keeps its own value and is never asked about.
    {
      const root = tmp();
      write(root, 'skills/covered/SKILL.md', ['---', 'name: covered', 'description: sonnet, already mapped', 'model: sonnet', '---', '', 'body', ''].join('\n'));
      write(root, 'skills/needsprompt/SKILL.md', ['---', 'name: needsprompt', 'description: opus, missing from --model-map', 'model: opus', '---', '', 'body', ''].join('\n'));
      fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
      const configDir = tmp();
      write(configDir, 'opencode.json', JSON.stringify({ model: 'acme/opus-1', small_model: 'acme/opus-2' }));
      const partial = new Map([['sonnet', 'acme/sonnet-1']]);
      const { input, output, out } = fakeTerminal(['2']);
      const resolved = await resolveModelMap(root, partial, { input, output, cwd: configDir });
      assert.equal(resolved.get('sonnet'), 'acme/sonnet-1', 'the covered alias keeps its --model-map value');
      assert.equal(resolved.get('opus'), 'acme/opus-2', 'the missing alias resolves to the interactively picked model');
      assert.ok(out().includes("in your OpenCode config, for 'opus'"), 'prompts for the missing alias');
      assert.ok(!out().includes("in your OpenCode config, for 'sonnet'"), 'never prompts for the alias --model-map already covers');
    }

    // resolveModelMap: a missing alias with no models to offer (an empty queryOpenCodeModels()
    // report, e.g. no OpenCode config found anywhere) refuses gracefully through
    // requireAvailableModel's own message instead of looping forever on a picker with nothing to
    // pick, or crashing with a raw error — and never opens a readline interface over the input at
    // all, since there is nothing to prompt for.
    {
      const root = tmp();
      write(root, 'skills/needsprompt/SKILL.md', ['---', 'name: needsprompt', 'description: no model configured anywhere', 'model: opus', '---', '', 'body', ''].join('\n'));
      fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
      const emptyConfigDir = tmp(); // no opencode.json here, and no OPENCODE_CONFIG/HOME below
      const { PassThrough } = require('node:stream');
      const noPromptInput = new PassThrough();
      // readline.createInterface attaches a 'data' listener to its input immediately, and
      // rl.close() removes it again — so a post-hoc listenerCount check would pass even for code
      // that opens and then closes an interface. 'newListener' catches the attach itself, whether
      // or not it is later torn down.
      let openedReadline = false;
      noPromptInput.on('newListener', (event) => { if (event === 'data') openedReadline = true; });
      const err = await thrown(() => resolveModelMap(root, new Map(), { cwd: emptyConfigDir, env: {}, input: noPromptInput, output: new PassThrough() }));
      assert.ok(err, 'refuses instead of hanging or crashing when no models are configured');
      assert.equal(err.isRefusal, true);
      assert.ok(err.message.includes('no models are configured in your OpenCode setup yet'));
      assert.equal(openedReadline, false, 'no readline interface is opened over the input when there is nothing to prompt for');
    }

    console.log('adapter.js selftest ok');
  } finally {
    for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  if (process.argv[2] === '--selftest') selftest();
  else main();
}

module.exports = { render, queryOpenCodeModels, requireAvailableModel, promptForModelMap, parseArgs };
