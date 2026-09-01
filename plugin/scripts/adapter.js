#!/usr/bin/env node
'use strict';

// adapter.js: the harness adapter (issue #375). Renders the shipped surfaces — the
// plugin/skills/<name>/SKILL.md commands, the plugin/agents/<name>.md subagents, and the
// deterministic guardrails — into another harness's on-disk layout, so a superdev install there
// carries the same chain. The only harness is `opencode`: skills render to
// `.opencode/commands/superdev/<name>.md` (skills `afk` and `upgrade` are skipped), agents to
// `.opencode/agents/<name>.md`, with the Claude-specific tokens rewritten deterministically, and
// the eight hooks are bridged by a generated OpenCode plugin at `.opencode/plugins/superdev.js`
// (issue #376) that spawns them as `node <plugin-root>/hooks/<hook>.js` with a Claude-shaped
// stdin payload. Exit nonzero with a one-line stderr reason on any refusal, the convention
// scripts/scope.js uses.
//
// Flags: --harness opencode, --plugin-root <abs-path> (default: this script's .., the plugin
// root), --dest <dir>, a repeatable --model-map <alias>=<provider/model>, and --selftest.
// Rendered agent and command frontmatter resolves each surface's `model:` alias through
// --model-map; a missing alias is a named refusal, never a silent passthrough. Every rendered
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
// driver and has no OpenCode command rendering (issue #375). upgrade's body only drives Claude
// Code's own `claude plugin update`; OpenCode's real upgrade path is a git pull plus a re-render,
// which is not this skill (issue #393), so it renders no OpenCode command either.
const SKIPPED_SKILLS = new Set(['afk', 'upgrade']);

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
// after it to false. No `permission:` block: that config only restricts a tool it explicitly
// denies, and a bare `allow` listing over its allow-by-default baseline (the shape this adapter
// used to emit) restricts nothing.
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
  frontmatter += '---\n';
  return rewrite(`${frontmatter}\n${body.replace(/^\n+/, '')}`);
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

  const skills = listDirs(skillsDir, 'skills directory')
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const agents = listDirs(agentsDir, 'agents directory')
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name.replace(/\.md$/, ''))
    .sort();
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
    fs.writeFileSync(path.join(opts.dest, rel), renderCommand(name, path.join(skillsDir, name, 'SKILL.md'), opts.modelMap, rewrite));
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

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
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
      'body',
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
      path.join('.opencode', 'plugins', 'superdev.js'),
    ]);

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
    assert.ok(!agent.includes('permission:'), 'the inert permission: block is not rendered');
    assert.ok(agent.includes(`Read ${pluginRoot}/references/test-selection.md.`));

    // A read-only agent (Read, Grep only) gets edit and write denied by the wildcard — the defect
    // this fix closes: the four read-only agents (doc-reader, final-reviewer, simplicity-reviewer,
    // slice-reviewer) resolved edit/write/task/webfetch as allowed under the old permission:-only
    // render. No `false` entries beyond the wildcard: an enumerated eleven-key deny list still
    // reads a twelfth, unenumerated tool id as allowed, which the wildcard does not. `invalid`
    // still resolves true even for a read-only agent — it is denied nowhere.
    const reviewer = fs.readFileSync(path.join(dest, '.opencode', 'agents', 'final-reviewer.md'), 'utf8');
    assert.ok(reviewer.includes('tools:\n  "*": false\n  grep: true\n  invalid: true\n  read: true\n'));

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

    console.log('adapter.js selftest ok');
  } finally {
    for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  if (process.argv[2] === '--selftest') selftest();
  else main();
}

module.exports = { render };
