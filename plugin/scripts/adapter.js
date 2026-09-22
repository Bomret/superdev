#!/usr/bin/env node
'use strict';

// adapter.js: the harness adapter (issue #375). Renders the shipped surfaces — the
// plugin/skills/<name>/SKILL.md prompts, the plugin/agents/<name>.md subagents, and the
// deterministic guardrails — into another harness's on-disk layout, so a superdev install there
// carries the same chain. Under `opencode`: skills render to
// `.opencode/skills/superdev-<name>/SKILL.md` (`upgrade` renders synthesized, OpenCode-native
// content instead of its Claude-Code-only body, ADR 0052), agents to
// `.opencode/agents/<name>.md`, with the Claude-specific tokens rewritten deterministically, and
// the eight hooks are bridged by a generated OpenCode plugin at `.opencode/plugins/superdev.js`
// (issue #376) that spawns them as `node <plugin-root>/hooks/<hook>.js` with a Claude-shaped
// stdin payload. Under `codex`: skills render to `.agents/skills/superdev-<name>/SKILL.md`
// (issue #431) and agents to `.codex/agents/superdev-<name>.toml`, a `developer_instructions`
// TOML string carrying the rewritten body and a `sandbox_mode` derived from the source agent's
// own `tools:` frontmatter (issue #432, ADR 0056). Exit nonzero with a one-line stderr reason on
// any refusal, the convention scripts/scope.js uses.
//
// A skill is the model-invocable target: OpenCode exposes one through its built-in `skill` tool and
// registers it as a `/superdev-<name>` slash command besides, where a command under
// `.opencode/commands/` is only ever typed by the operator. That is what decides which surface
// renders where — SKILL_ONLY_COMMANDS names the ones that stay commands (ADR 0055). Codex's own
// hooks wire to `.codex/hooks.json` (issue #433): every shipped hook except `model-explicit`,
// every command path absolute since Codex resolves no `${CLAUDE_PLUGIN_ROOT}` token.
//
// Flags: --harness opencode, --plugin-root <abs-path> (default: this script's .., the plugin
// root), --dest <dir>, and a repeatable --model-map <alias>=<provider/model>.
// Rendered agent frontmatter resolves each agent's `model:` alias through
// --model-map; a rendered skill carries no model at all, since OpenCode skill frontmatter has no
// such key. The CLI fills in a missing alias interactively before it ever renders: it queries
// the OpenCode config for the models available and prompts for a pick, one prompt per still-missing
// alias — an alias --model-map already covers is never asked about. Every rendered
// string scalar is emitted JSON-quoted, so a description carrying `: ` stays valid YAML. A
// surface's `allowed-tools:` carries verbatim: OpenCode frontmatter has no permission
// key, and carrying the field beats dropping it silently.
//
// A render is idempotent: it removes its own generated files before writing —
// .opencode/commands/superdev/ wholesale (a namespaced subdirectory nothing foreign shares, which
// also clears an install rendered before ADR 0055), .opencode/plugins/superdev.js by name, and, in
// the shared .opencode/agents/ and .opencode/skills/ directories, only the files and directories
// carrying AGENT_MARKER or SKILL_MARKER from a past render — and touches nothing else in --dest.
//
// The module is require-able (guarded main), so the drift-check fixture diff and a harness hook
// bridge drive render() in-process instead of spawning the CLI.

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { readHookTimeoutMs } = require('../hooks/green-gate.js');

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

// HARNESS_REGISTRY (defined after the render-target functions it wires, below) is the shared
// render()'s only way to reach a harness's own layout. Its keys are the available --harness values.

// The line every rendered agent's frontmatter carries, so a re-render can tell "a stale file this
// adapter wrote in a past render" from "a consumer's own agent that happens to share this
// directory" — .opencode/agents/ is a shared OpenCode directory, unlike the commands render's own
// superdev/ subdirectory. A YAML comment: OpenCode's frontmatter parser accepts and ignores it
// (verified live against opencode 1.18.20 — a probe agent carrying this exact line still resolved
// every other field correctly).
const AGENT_MARKER = '# generated-by: superdev-adapter — a re-render overwrites this file';

// The same marker for a rendered skill, and for the same reason: .opencode/skills/ is a shared
// OpenCode directory, so a re-render removes only the skill directories this adapter itself wrote.
// Keying cleanup on the `superdev-` name prefix instead would delete a consumer's own skill that
// happens to start that way. A YAML comment rather than a frontmatter field: OpenCode recognizes
// `name`, `description`, `license`, `compatibility` and `metadata` and ignores everything else, and
// a comment is invisible to a schema validator besides (verified live against opencode 1.18.20,
// 2026-09-09 — a rendered skill carrying this exact line still resolved every other field
// correctly, and `opencode debug skill` still listed it under its own `name`).
const SKILL_MARKER = '# generated-by: superdev-adapter — a re-render overwrites this directory';

// The same marker's Codex-render counterpart (issue #431): `.agents/skills/` is a directory a
// consumer's own skills share too, so cleanup there is marker-keyed the same way. Declared here,
// ahead of the rest of the Codex harness registry entry further down, because renderUpgradeSkill's
// per-harness table below needs it at module-load time.
const CODEX_SKILL_MARKER = '# generated-by: superdev-adapter — a re-render overwrites this directory';

// A rendered skill's name is the canonical skill name behind this prefix. OpenCode's skill registry
// is flat and globally unique across every scan root, so an unprefixed `plan` or `review` would
// collide with a consumer's own skill of that name (ADR 0055).
const SKILL_NAME_PREFIX = 'superdev-';

// OpenCode's own skill-name rule: lowercase alphanumerics in hyphen-separated segments, and the
// name must match the directory holding the SKILL.md.
const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// afk renders as an OpenCode *command*, never a skill: a command is not model-invocable there, which
// is what reproduces Claude Code's `disable-model-invocation: true` and keeps the model from starting
// an unattended backlog sweep on its own (ADR 0055). It is skipped by the skill render for that
// reason, not for want of a rendering.
const SKILL_ONLY_COMMANDS = new Set(['afk']);

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
// token). `${CLAUDE_PLUGIN_ROOT}` becomes the --plugin-root value; a bare `superdev:<agent>` becomes
// whichever agent name that harness's registry actually carries — the bare name for OpenCode, the
// prefixed `superdev-<agent>` for Codex, whose rendered TOML is named that way too (ADR 0056); and
// `/superdev:<cmd>` becomes whichever slash-command name that surface
// actually renders under — `/superdev-<cmd>` for a skill, which OpenCode registers flat, and
// `/superdev/<cmd>` for a SKILL_ONLY_COMMANDS member, which renders into the namespaced commands
// subdirectory instead (ADR 0055). Both name rewrites are
// restricted to the names discovered under --plugin-root, so a token that is not a real skill or
// agent (an HTML comment marker, a prose example) is never mangled.
// Codex has no invocation Codex itself never expands, the way OpenCode expands its own
// `/superdev-<name>` slash command: Codex's own explicit invocation is `$superdev-<name>`, a skill
// mention (ADR 0056). afk renders nowhere on Codex, so a reference to it carries no invocation token
// at all — its plain name, exactly the way a reader would name a surface with nothing to invoke.
function renderedInvocation(harness, name) {
  if (harness === 'codex') return SKILL_ONLY_COMMANDS.has(name) ? name : `$${SKILL_NAME_PREFIX}${name}`;
  return SKILL_ONLY_COMMANDS.has(name) ? `/superdev/${name}` : `/${SKILL_NAME_PREFIX}${name}`;
}

function rewriteProse(text, opts) {
  const harness = opts.harness || 'opencode';
  let out = text.split('${CLAUDE_PLUGIN_ROOT}').join(opts.pluginRoot);
  for (const name of opts.skills) {
    out = out.replace(new RegExp(`/superdev:${name}\\b`, 'g'), renderedInvocation(harness, name));
  }
  for (const name of opts.agents) {
    const rendered = harness === 'codex' ? `${SKILL_NAME_PREFIX}${name}` : name;
    out = out.replace(new RegExp(`(?<![/\\w-])superdev:${name}\\b`, 'g'), rendered);
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
// several aliases in one pass (resolveModelMap's per-missing-alias loop) shares one interface and
// one async iterator across every prompt — a fresh interface per alias would each buffer and then
// discard on close whatever the pipe still held for the *next* prompt, starving every alias after
// the first on piped input. Refuses via fail(), naming `alias` and pointing at --model-map as the
// manual override, when the input closes before this alias gets an answer.
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

// plugin/skills/<name>/SKILL.md → .opencode/commands/superdev/<name>.md, the render target for a
// SKILL_ONLY_COMMANDS member. The command name comes
// from the directory, so the rendered frontmatter keeps the description, the resolved model when
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

// The canonical `$ARGUMENTS` token is Claude Code's own command-argument substitution: Claude Code
// fills it in with whatever followed the invocation before the model ever reads the prompt.
// OpenCode's built-in `skill` tool takes only a `name` (ADR 0055), so a model that invokes a rendered
// skill that way substitutes nothing at all. A literal, unsubstituted `$ARGUMENTS` left in the render
// would then read as empty to the model, which plausibly takes the documented empty-input branch and
// silently drops whatever the invoker actually said (including `--unattended`, ADR 0016). Removing
// the token is safe on the *other* path into the same rendered file — the slash command every skill
// auto-registers — because OpenCode there appends the operator's typed arguments to the prompt
// whenever it finds neither `$ARGUMENTS` nor a `$N` left to fill (verified 2026-09-10, opencode
// 1.18.20: `SessionPrompt.command`). Rewritten here, in renderSkill, rather than in rewriteProse's
// shared rewrites: it is true only of the skill surface, never of the command surface
// renderCommand/renderOpencodeAfkCommand serve, where OpenCode's own slash-command
// substitution still fills the token in exactly as Claude Code's does (verified 2026-09-10, opencode
// 1.18.20: `SessionPrompt.command`'s `$ARGUMENTS` replacement) — folding it into rewriteProse
// would need the function to know which surface its caller renders to, for one token rewriteProse's
// other three never needed.
const ARGUMENTS_TOKEN = '$ARGUMENTS';
const OPENCODE_ARGUMENTS_PHRASE = 'the message that invoked this skill';

// plugin/skills/<name>/SKILL.md → .opencode/skills/superdev-<name>/SKILL.md, the model-invocable
// render target: OpenCode exposes a skill through its built-in `skill` tool and registers it as a
// `/superdev-<name>` slash command besides, where a command carries only the second of those two
// (ADR 0055). The rendered `name` must equal the directory holding it, so both come from the same
// prefixed value.
//
// No `model:` line: OpenCode skill frontmatter recognizes `name`, `description`, `license`,
// `compatibility` and `metadata`, so a canonical `model:` pin has nowhere to land and the skill runs
// on the session's model. `allowed-tools` carries verbatim on the same reasoning renderCommand
// already applies — an ignored field beats a silently dropped one.
function renderSkill(name, skillPath, rewrite, marker) {
  const { fields, body } = readFrontmatter(fs.readFileSync(skillPath, 'utf8'), skillPath);
  if (!fields.description) fail(`${skillPath} carries no description`);
  const skillName = `${SKILL_NAME_PREFIX}${name}`;
  if (!SKILL_NAME_PATTERN.test(skillName)) {
    fail(`'${skillName}' is not a valid skill name — lowercase alphanumeric segments joined by '-' (${skillPath})`);
  }
  let frontmatter = `---\n${marker}\nname: ${skillName}\ndescription: ${yamlString(fields.description)}\n`;
  if (fields['allowed-tools']) frontmatter += `allowed-tools: ${yamlString(fields['allowed-tools'])}\n`;
  frontmatter += '---\n';
  let result = rewrite(`${frontmatter}\n${body.replace(/^\n+/, '')}`);
  // Rewrite $ARGUMENTS: handle backticked form first so backticks are consumed, then any bare token.
  result = result.replace(/`\$ARGUMENTS`/g, OPENCODE_ARGUMENTS_PHRASE);
  result = result.split(ARGUMENTS_TOKEN).join(OPENCODE_ARGUMENTS_PHRASE);
  return result;
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

// The per-harness detail renderUpgradeSkill() below fills in: everything else about the synthesized
// upgrade skill — the two-command shape, the model-map re-emission, the marker, the refusal on
// failure — is identical prose across harnesses. rewriteParagraph and closingLines are the two
// places the two harnesses' rendered upgrade bodies genuinely differ in substance (what a
// re-render touches on disk, and what "start a new session" means); tool names the surface the
// model runs the commands with.
const UPGRADE_HARNESS = {
  opencode: {
    label: 'OpenCode',
    flag: 'opencode',
    tool: 'Bash',
    marker: SKILL_MARKER,
    description: "Pull the latest superdev source and re-render this project's OpenCode surfaces (skills, agents, hook bridge) in place.",
    rewriteParagraph: [
      'Re-rendering rewrites every file this adapter generates — every skill directory under',
      '`.opencode/skills/`, every agent it wrote under `.opencode/agents/`, and',
      '`.opencode/plugins/superdev.js` — to match the pulled source. The command above already',
      "carries this project's resolved model-map, so it re-renders non-interactively with no prompts.",
    ],
    closingLines: [
      '**start a new OpenCode session** in this project — OpenCode loads skills, commands, agents,',
      'and plugins at startup, with no documented hot-reload, so a running session keeps the old ones',
      'until it restarts.',
    ],
  },
  codex: {
    label: 'Codex',
    flag: 'codex',
    tool: 'shell',
    marker: CODEX_SKILL_MARKER,
    description: "Pull the latest superdev source and re-render this project's Codex surfaces in place.",
    rewriteParagraph: [
      'Re-rendering rewrites every skill directory this adapter generates under `.agents/skills/` to',
      "match the pulled source. The command above already carries this project's resolved model-map, so",
      'it re-renders non-interactively with no prompts.',
    ],
    closingLines: [
      '**start a new Codex session** in this project, so it loads the freshly rendered skills.',
    ],
  },
};

// renderUpgradeSkill() emits the synthesized upgrade skill for either harness — a git pull in the
// plugin's source clone, then a re-render with `--harness <harness>` — rather than deriving it from
// plugin/skills/upgrade/SKILL.md's body, which drives Claude Code's own `claude plugin update` and
// has no equivalent on either rendered harness (ADR 0052 for OpenCode, amending ADR 0050's outright
// exclusion; ADR 0056 for Codex, naming no `claude plugin` command). The same treatment
// renderBridge() above already gives the hook-bridge plugin: both are pure harness mechanics with no
// prose in common with their Claude Code counterpart. OpenCode's frontmatter carries no `model:`
// line, for the reason renderSkill() states: OpenCode skill frontmatter has no such key (ADR 0055).
// The "start a new OpenCode session" instruction is verified against OpenCode's own plugin docs
// (https://opencode.ai/docs/plugins/, 2026-09-06): plugin/command/agent files are "loaded at
// startup", with no documented hot-reload, so a fresh session is the correct load point.
function renderUpgradeSkill(harness, skillPath, pluginRoot, modelMap) {
  readFrontmatter(fs.readFileSync(skillPath, 'utf8'), skillPath);
  const cfg = UPGRADE_HARNESS[harness];
  // Kept as a literal `pluginRoot + '/..'` string, never path.dirname(pluginRoot)'s normalized
  // parent: the golden-fixture normalizer (scripts/drift/opencode-fixtures.js and
  // scripts/drift/codex-fixtures.js) replaces only exact occurrences of the resolved plugin-root
  // string with its `<plugin-root>` placeholder, so a normalized parent path would leak the real
  // machine's absolute path into the committed fixture.
  const repoRoot = `${pluginRoot}${path.sep}..`;
  const adapterPath = path.join(pluginRoot, 'scripts', 'adapter.js');
  // Every entry of the resolved model-map, re-emitted as its own `--model-map` flag: the CLI's
  // parseArgs() has no positional-argument handling (every non-flag argv element is an "unknown
  // flag" refusal), so the re-render must carry no bare subcommand word, and it must carry every
  // alias's resolved value so the re-render never prompts — there is no TTY when a model runs this
  // via the harness's tool, and re-prompting here would also silently discard the operator's
  // original picks. Same JSON-quoting convention as the git/node invocations below.
  const modelMapArgs = [...modelMap]
    .map(([alias, value]) => ` --model-map ${JSON.stringify(`${alias}=${value}`)}`)
    .join('');
  const frontmatter = `---\n${cfg.marker}\nname: ${SKILL_NAME_PREFIX}upgrade\ndescription: ${yamlString(cfg.description)}\n---\n`;
  const body = [
    '',
    `# superdev upgrade (${cfg.label})`,
    '',
    "Upgrade this project's rendered superdev surfaces to the latest published source, hands-off.",
    `You (the model) run the two commands below with the ${cfg.tool} tool, checking each one's exit`,
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
    // from the project root, which is where a rendered command always executes.
    `node ${JSON.stringify(adapterPath)} --dest "$(pwd)" --harness ${cfg.flag}${modelMapArgs}`,
    '```',
    '',
    ...cfg.rewriteParagraph,
    '',
    '## 3. Done',
    '',
    "Once both commands have succeeded, report both commands' output, then tell the user to",
    ...cfg.closingLines,
    '',
  ].join('\n');
  return frontmatter + body;
}

// The sentence afk's canonical body uses to name its chain driver, and the OpenCode rendering that
// replaces it. Claude Code's Skill tool has no OpenCode counterpart that takes arguments: OpenCode's
// own `skill` tool takes a `name` and nothing else, so a step's arguments travel in the model's own
// message rather than in the call (ADR 0055). renderOpencodeAfkCommand refuses when the canonical
// sentence is absent, so an edit to afk's own prose surfaces here instead of silently shipping a
// rendered afk that still names a tool OpenCode does not have.
const AFK_SKILL_TOOL_SENTENCE = [
  '**You invoke the real commands** with the Skill tool — the same commands a maintainer types, carrying',
  '`--unattended` (ADR 0015). You never re-implement what they do, and you never edit a file yourself.',
].join('\n');

const AFK_OPENCODE_INVOCATION = [
  "**You invoke the real commands** with OpenCode's own `skill` tool, naming the rendered skill —",
  '`superdev-implement`, `superdev-review`, `superdev-document`, `superdev-ship` — the same commands a',
  'maintainer types, carrying `--unattended` (ADR 0015). That tool takes a `name` and nothing else, so',
  "state each step's arguments — the feature label, the commit range, and `--unattended` — in your own",
  'message as you invoke it. You never re-implement what they do, and you never edit a file yourself.',
  '',
  '**The operator starts this sweep from a shell**, not from a slash command in a live session:',
  '`opencode run --auto --command superdev/afk`. `--auto` approves every permission not explicitly',
  'denied, which is what keeps `doom_loop` and `external_directory` — both `ask` by default — from',
  'stalling a run nobody is watching. A headless run denies the `question` tool outright, which is the',
  'behaviour the standing answers already assume: a stop with no standing answer is a block, never a',
  'question.',
].join('\n');

// afk's own §3 chain table opens with this exact header, right above rows whose "Start at" cells are
// Claude Code slash-command text — rewriteProse turns each into `/superdev-<cmd>` for OpenCode the
// same way it does everywhere else in the body. That rewritten text still reads as a slash command,
// though, and nothing on OpenCode expands one that was never typed — the model's own way to invoke a
// step is the `skill` tool named in AFK_OPENCODE_INVOCATION above. AFK_CHAIN_TABLE_NOTE (below) is
// what closes that gap for a model reading the table literally. Anchored on the header alone, not the
// full table: the rows name real command surfaces (review, document, ship) that a caller's own
// plugin root may not carry as discovered skills, and inserting text between the header and the first
// row would break the table's own markdown syntax.
const AFK_CHAIN_TABLE_HEADER = '| Stage | Start at |\n|---|---|';

// Inserted right before the table: it maps a "Start at" cell's slash-command text to the call a model
// actually has on OpenCode — the `skill` tool, by name — so a model that follows the table literally
// still reaches for that tool instead of emitting inert slash-command text nothing expands.
const AFK_CHAIN_TABLE_NOTE = [
  'Each "Start at" cell below still reads as a slash command. On OpenCode, invoke it with the `skill`',
  "tool instead — `name: superdev-<name>` for the command named `/superdev-<name>` — and state the",
  "rest of the cell's text as your own message's arguments, exactly as the chain driver above already",
  'does.',
  '',
].join('\n');

// plugin/skills/afk/SKILL.md → .opencode/commands/superdev/afk.md. afk is the one surface that
// renders as a command rather than a skill: an OpenCode command is not model-invocable, which is
// what reproduces the canonical skill's own `disable-model-invocation: true` and keeps the model
// from starting an unattended backlog sweep on its own judgment (ADR 0055). Everything else about
// the body carries through renderCommand unchanged — the selection, blocking, and reporting prose is
// harness-independent, and only the chain driver's own sentence and the chain table's header are
// anchored. Both rewrites refuse when their own canonical anchor is absent, so an edit to afk's own
// prose surfaces here instead of silently shipping a rendered afk that has drifted from what these
// key on.
function renderOpencodeAfkCommand(name, skillPath, modelMap, rewrite) {
  const rendered = renderCommand(name, skillPath, modelMap, rewrite);

  const sentenceTarget = rewrite(AFK_SKILL_TOOL_SENTENCE);
  if (!rendered.includes(sentenceTarget)) {
    fail(`${skillPath} no longer carries the chain-driver sentence adapter.js rewrites for OpenCode — update AFK_SKILL_TOOL_SENTENCE`);
  }
  const withInvocation = rendered.replace(sentenceTarget, AFK_OPENCODE_INVOCATION);

  const tableHeader = rewrite(AFK_CHAIN_TABLE_HEADER);
  if (!withInvocation.includes(tableHeader)) {
    fail(`${skillPath} no longer carries the chain table's header adapter.js anchors for OpenCode — update AFK_CHAIN_TABLE_HEADER`);
  }
  return withInvocation.replace(tableHeader, `${AFK_CHAIN_TABLE_NOTE}\n${tableHeader}`);
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
const BRIDGE_SESSION_END_HOOKS = ['slicetree-sweep', 'scope-prune'];
// The bridge's own ceiling on a hook child, taken from `hooks/hooks.json`'s green-gate entry rather
// than restated as a literal here (ADR 0087). `green-gate.js` owns that reader, so `adapter.js`
// requires a hook — the one inversion of the direction the root `AGENTS.md`'s Child DOX Index
// documents, recorded there. The renderer bakes the value into the generated plugin's constants, so
// the bridge running inside OpenCode's host needs no reader, and no second reader exists to drift.
const BRIDGE_HOOK_TIMEOUT_MS = readHookTimeoutMs();

// The four helpers below are serialized verbatim into the generated bridge via
// Function.prototype.toString, so they stay self-contained: the free names they reference
// (PLUGIN_ROOT, spawn, path) are constants the bridge source defines, never adapter.js's own
// scope. They live here, not in the template string, so tests/adapter.test.js exercises the same
// code the bridge ships.

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
  // A spawn its own bound ended carries no verdict, and no gate reads its absence as a pass
  // (INV-0009, ADR 0087). `close` reports a killed child as a null status beside a signal, and on
  // OpenCode this bridge is the only gate there is: a green-gate killed at the ceiling would
  // otherwise pass the merge it was gating. The reason names the kill, never a refusal the hook
  // never made. Codex never reaches this function — its hooks are wired directly through
  // `.codex/hooks.json`, never through this bridge.
  if (result.signal) {
    return `superdev hook ${hook} was killed (${result.signal}) before it produced a verdict — blocking the call it was gating`;
  }
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

// A hook that never started carries a **Spawn failure**, not a **No verdict** (ADR 0087): the gate
// never ran, so the absence is evidence about the installation — a missing `node`, a wrong plugin
// path, a broken install — rather than about the code under the gate. INV-0009 does not govern it,
// and the call proceeds, because every repair for those conditions is made through the very surface
// a block would close. On the same condition `hooks/green-gate.js` blocks, for its own stated
// reason: it fires only on a merge, where a tree that cannot run its suite is a defect in the thing
// being gated, so blocking costs one merge rather than the session. The divergence is deliberate,
// and each gate names the other's answer so neither reads as the other's oversight.
//
// The notice fires once per hook, per session boundary, rather than once per tool call, which this
// bridge runs on: a notice nobody can read past is the same failure as no notice. Keyed by hook, not
// one session-wide flag — the host runs every tool call, hook, and event for every concurrent
// session on one process, so a single boolean would let one hook's transient failure silence every
// other hook's notice for the rest of the process's life. Returns the text the first time for that
// hook and `null` after, so the rule is the function's rather than its caller's. Cleared by
// resetSpawnFailureNotices() at the session boundary the bridge already has (session.created).
// ponytail: the map, and the reset, are both process-global rather than keyed by session — a second
// concurrent session's own session.created re-arms every hook's notice for every other running
// session, not just its own, so "per session" above is really "per session boundary, host-wide".
// Upgrade to true per-session scoping (a Map keyed by sessionID, threaded through runBridgeHook and
// cleared only for the session that started) if that cross-session re-notification proves noisy.
let spawnFailureNoticedByHook = {};
function spawnFailureNotice(hook) {
  if (spawnFailureNoticedByHook[hook]) return null;
  spawnFailureNoticedByHook[hook] = true;
  return (
    `superdev: hook ${hook} could not start, so it is not gating this session — the call proceeded ` +
    'unchecked. This is an installation problem (a missing `node`, a wrong plugin path, a broken ' +
    'install), not a verdict. Repair it; this notice appears once per hook, per session boundary.'
  );
}

// The session boundary the bridge already has: a fresh session.created clears every hook's own
// notice flag, so a session that outlives the one that hit the failure is noticed again rather than
// staying silent for the life of the process. Host-wide, not scoped to the session that just started
// (the ponytail note above) — a concurrent session's own failure is noticed again too, which is
// over-notification, never under-notification.
function resetSpawnFailureNotices() {
  spawnFailureNoticedByHook = {};
}

// Spawn one hook and translate its verdict: a block reason throws, so the deny reaches the model
// the way Claude's exit-2 blocking does; a killed child blocks too (INV-0009, ADR 0087), and only
// a spawn error — the hook never started — fails open, noticed once. BRIDGE_HOOK_TIMEOUT_MS is
// read from the green-gate entry in hooks/hooks.json at render time, not a literal of its own, so
// raising that entry raises this ceiling too. child_process.spawn (never spawnSync): OpenCode's plugin host
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
    const timer = setTimeout(() => child.kill(), BRIDGE_HOOK_TIMEOUT_MS);
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
    child.on('close', (code, signal) => finish({ status: code, signal, stdout, stderr }));
    // A hook that exits before ever reading stdin (a require() failure before main() runs, e.g.)
    // turns a payload larger than the pipe buffer into an EPIPE write error; spawnSync's `input`
    // option contained that internally, but a plain child.stdin write does not — an unlistened
    // 'error' here would otherwise escape as an uncaught exception and crash the whole host.
    child.stdin.on('error', () => {});
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  }).then((result) => {
    if (!result || result.error) {
      const notice = spawnFailureNotice(hook);
      if (notice) console.error(notice);
      return;
    }
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
    `const BRIDGE_HOOK_TIMEOUT_MS = ${JSON.stringify(BRIDGE_HOOK_TIMEOUT_MS)};`,
    'let spawnFailureNoticedByHook = {};',
  ].join('\n');
  const helpers = [
    bridgeSpawnEnv,
    buildHookPayload,
    hookBlockReason,
    spawnFailureNotice,
    resetSpawnFailureNotices,
    runBridgeHook,
  ]
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
        // A fresh session is the notice's own boundary (ADR 0087): clear every hook's flag before
        // this session's own spawns, so a failure this session hits is noticed again rather than
        // staying silent because some earlier session already hit it once.
        resetSpawnFailureNotices();
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

// --- the OpenCode harness registry entry --------------------------------------
//
// A harness registry entry is the layout half of render(): where a rendered surface lands, which of
// its own generated files it re-cleans before writing, and how each surface type renders. render()
// builds one `ctx = { pluginRoot, dest, modelMap, rewrite, skills, agents }` and hands it to every
// method below; a method never reaches back into render()'s own discovery or validation. An entry
// implements:
//   cleanup(ctx): void — remove the harness's own generated files under ctx.dest (wholesale or
//     marker-keyed) before the write loop runs.
//   renderSkill(name, skillPath, ctx): { rel, content } — rel is dest-relative.
//   renderCommand(name, skillPath, ctx): { rel, content } — called only for a SKILL_ONLY_COMMANDS name.
//   renderAgent(name, agentPath, ctx): { rel, content }
//   extras(ctx): Array<{ rel, content }> — any generated file outside the skill/command/agent shape
//     (OpenCode's hook bridge plugin).

// Walks a directory, reads each SKILL.md's frontmatter, and removes entries whose frontmatter
// includes the marker. Shared by opencodeCleanup and codexCleanup to avoid duplication.
function cleanupByMarker(skillsDest, marker) {
  for (const entry of fs.readdirSync(skillsDest, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(skillsDest, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    const match = fs.readFileSync(skillFile, 'utf8').match(/^---\n([\s\S]*?)\n---\n?/);
    if (match && match[1].includes(marker)) {
      fs.rmSync(path.join(skillsDest, entry.name), { recursive: true, force: true });
    }
  }
}

// .opencode/commands/superdev/ goes wholesale (namespaced, nothing foreign shares it), the hook
// bridge is removed by name, and .opencode/skills/ and .opencode/agents/ are shared OpenCode
// directories that keep only the files/directories a past render tagged with SKILL_MARKER /
// AGENT_MARKER — a consumer's own agent or skill there survives.
function opencodeCleanup(ctx) {
  const commandsDest = path.join(ctx.dest, '.opencode', 'commands', 'superdev');
  const skillsDest = path.join(ctx.dest, '.opencode', 'skills');
  const agentsDest = path.join(ctx.dest, '.opencode', 'agents');
  const bridgeDest = path.join(ctx.dest, '.opencode', 'plugins', 'superdev.js');
  fs.rmSync(commandsDest, { recursive: true, force: true });
  fs.rmSync(bridgeDest, { force: true });
  fs.mkdirSync(skillsDest, { recursive: true });
  fs.mkdirSync(agentsDest, { recursive: true });
  cleanupByMarker(skillsDest, SKILL_MARKER);
  for (const entry of fs.readdirSync(agentsDest, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(agentsDest, entry.name);
    const match = fs.readFileSync(full, 'utf8').match(/^---\n([\s\S]*?)\n---\n?/);
    if (match && match[1].includes(AGENT_MARKER)) fs.rmSync(full);
  }
}

// upgrade renders synthesized OpenCode-native content instead of its Claude-Code-only body (ADR
// 0052); every other skill renders through the shared renderSkill().
function opencodeRenderSkill(name, skillPath, ctx) {
  const rel = path.join('.opencode', 'skills', `${SKILL_NAME_PREFIX}${name}`, 'SKILL.md');
  const content = name === 'upgrade'
    ? renderUpgradeSkill('opencode', skillPath, ctx.pluginRoot, ctx.modelMap)
    : renderSkill(name, skillPath, ctx.rewrite, SKILL_MARKER);
  return { rel, content };
}

// afk is the one SKILL_ONLY_COMMANDS member today; its OpenCode rendering replaces the Skill-tool
// sentence and chain-table header with OpenCode's own `skill`-tool invocation (ADR 0055). Every
// other SKILL_ONLY_COMMANDS name (there are none yet) would render through the shared renderCommand().
function opencodeRenderCommand(name, skillPath, ctx) {
  const rel = path.join('.opencode', 'commands', 'superdev', `${name}.md`);
  const content = name === 'afk'
    ? renderOpencodeAfkCommand(name, skillPath, ctx.modelMap, ctx.rewrite)
    : renderCommand(name, skillPath, ctx.modelMap, ctx.rewrite);
  return { rel, content };
}

function opencodeRenderAgent(name, agentPath, ctx) {
  const rel = path.join('.opencode', 'agents', `${name}.md`);
  return { rel, content: renderAgent(name, agentPath, ctx.modelMap, ctx.rewrite) };
}

// The hook bridge: the one generated file outside the skill/command/agent shape.
function opencodeExtras(ctx) {
  return [{ rel: path.join('.opencode', 'plugins', 'superdev.js'), content: renderBridge(ctx.pluginRoot) }];
}

// --- the Codex harness registry entry (issues #431, #432) -------------------
//
// Skills render to `.agents/skills/superdev-<name>/SKILL.md`, the Agent Skills standard's own shared
// scan root rather than a superdev-owned directory (ADR 0056), so cleanup there is marker-keyed the
// same way `.opencode/skills/` already is — never keyed on the bare `superdev-` name prefix, which a
// consumer's own skill might also start with. afk renders nowhere: Codex's only non-model-invocable
// surface is a deprecated feature living outside the project tree this adapter writes to (ADR 0056),
// so codexRenderCommand returns null for afk, its one SKILL_ONLY_COMMANDS name, and the shared
// write() below skips a null result the same way it skips no entry at all. Every shipped agent
// renders to `.codex/agents/superdev-<name>.toml` (issue #432, below `codexRenderAgent`). extras is a
// minimal stub for this slice — a later slice (#433) fills in `.codex/hooks.json`. CODEX_SKILL_MARKER
// itself is declared earlier, alongside SKILL_MARKER.

// The marker a rendered agent TOML carries, as a leading `#` comment line — a TOML comment, unlike
// AGENT_MARKER's YAML-comment form, and its own constant even though the text is identical, the same
// distinct-constant-same-text convention CODEX_SKILL_MARKER already follows for the skills render.
// `.codex/agents/` is a directory a consumer's own agents share, so cleanup here is marker-keyed the
// same way `.agents/skills/` already is — never keyed on the bare `superdev-` name prefix.
const CODEX_AGENT_MARKER = '# generated-by: superdev-adapter — a re-render overwrites this file';

function codexCleanup(ctx) {
  const skillsDest = path.join(ctx.dest, '.agents', 'skills');
  const agentsDest = path.join(ctx.dest, '.codex', 'agents');
  fs.mkdirSync(skillsDest, { recursive: true });
  fs.mkdirSync(agentsDest, { recursive: true });
  cleanupByMarker(skillsDest, CODEX_SKILL_MARKER);
  for (const entry of fs.readdirSync(agentsDest, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(agentsDest, entry.name);
    // The marker check reads the leading line only — where codexRenderAgent puts it — not the
    // whole file: a foreign agent whose developer_instructions merely quotes the marker sentence is
    // not itself marker-tagged, the same way opencodeCleanup's own frontmatter-only test protects a
    // foreign agent that quotes AGENT_MARKER in its body.
    const [firstLine] = fs.readFileSync(full, 'utf8').split('\n', 1);
    if (firstLine === CODEX_AGENT_MARKER) fs.rmSync(full);
  }
}

function codexRenderSkill(name, skillPath, ctx) {
  const rel = path.join('.agents', 'skills', `${SKILL_NAME_PREFIX}${name}`, 'SKILL.md');
  const content = name === 'upgrade'
    ? renderUpgradeSkill('codex', skillPath, ctx.pluginRoot, ctx.modelMap)
    : renderSkill(name, skillPath, ctx.rewrite, CODEX_SKILL_MARKER);
  return { rel, content };
}

// afk is the one SKILL_ONLY_COMMANDS member, and it renders nowhere on Codex (ADR 0056).
function codexRenderCommand() {
  return null;
}

// plugin/agents/<name>.md → .codex/agents/superdev-<name>.toml (issue #432). Codex resolves agent
// names flat — a project agent overrides a global one, a custom agent overrides a built-in — so the
// rendered name is prefixed the same way a rendered skill's is (ADR 0056). Codex offers no per-agent
// tool restriction: a subagent inherits the parent's tools, so `sandbox_mode` is the whole
// access-control story a rendered agent carries, derived from the source agent's own `tools:`
// frontmatter rather than a hardcoded name list — an agent whose allowlist grants Edit or Write gets
// `workspace-write`, every other agent gets `read-only` (ADR 0056 names six agents' worth of a
// Claude-Code-only `tools:`-to-`sandbox_mode` table; deriving it here instead means a newly shipped
// agent needs no table edit and test-auditor, the table's own omission, still renders correctly).
//
// `developer_instructions` carries the canonical body as a TOML basic string, via JSON.stringify: a
// TOML basic string's escape set (\b \t \n \f \r \" \\ \uXXXX) is exactly JSON's own, so JSON's
// escaping produces a valid TOML string with no separate writer — the one line the ladder's stdlib
// rung asks for. shortcut: a raw DEL (U+007F) byte in a body would round-trip through JSON.stringify
// unescaped, which TOML's basic-string grammar forbids raw; that byte is not prose any shipped agent
// carries, so the ceiling is undetected until one does — escape it explicitly (or switch to a literal
// multi-line string) if that ever changes.
function codexSandboxMode(toolsField) {
  const tools = (toolsField || '').split(',').map((t) => t.trim());
  return tools.includes('Edit') || tools.includes('Write') ? 'workspace-write' : 'read-only';
}

function codexRenderAgent(name, agentPath, ctx) {
  const { fields, body } = readFrontmatter(fs.readFileSync(agentPath, 'utf8'), agentPath);
  if (!fields.description) fail(`${agentPath} carries no description`);
  if (!fields.model) fail(`${agentPath} carries no model alias`);
  const model = resolveModel(fields, ctx.modelMap, 'agent', name);
  const rel = path.join('.codex', 'agents', `${SKILL_NAME_PREFIX}${name}.toml`);
  const content = [
    CODEX_AGENT_MARKER,
    `name = ${JSON.stringify(`${SKILL_NAME_PREFIX}${name}`)}`,
    `description = ${JSON.stringify(ctx.rewrite(fields.description))}`,
    `model = ${JSON.stringify(model)}`,
    `sandbox_mode = ${JSON.stringify(codexSandboxMode(fields.tools))}`,
    `developer_instructions = ${JSON.stringify(ctx.rewrite(body.replace(/^\n+/, '')))}`,
    '',
  ].join('\n');
  return { rel, content };
}

// `.codex/hooks.json` (issue #433): every shipped hook except model-explicit, wired to Codex's own
// events, every command path absolute — Codex resolves no `${CLAUDE_PLUGIN_ROOT}` token, unlike
// Claude Code's own hooks.json (verified 2026-09-22 against https://learn.chatgpt.com/docs/hooks,
// whose config example carries a literal command string with no such expansion). model-explicit is
// withheld: Codex has no Agent tool, and every rendered agent TOML already carries an explicit
// `model` line, so the render satisfies that hook's contract structurally rather than by wiring it
// to nothing (ADR 0056). merge-guard is wired to Bash the same way Claude Code's own hooks.json
// wires it, and stays inert under Codex: no Codex tool event carries an `agent_id`, the field
// merge-guard requires before it ever blocks — a documented parity gap, not a silent omission.
//
// Per-hook `timeout` is honoured: Codex's own docs state hooks default to 600 seconds when the
// field is omitted, and accept an explicit `timeout` in seconds the same way Claude Code's
// hooks.json does (verified 2026-09-22, https://learn.chatgpt.com/docs/hooks: "timeout is in
// seconds", "If timeout is omitted, Codex uses 600 seconds for most hooks."). green-gate's own
// ceiling (hooks/hooks.json's PostToolUse entry) is carried forward explicitly below, derived from
// BRIDGE_HOOK_TIMEOUT_MS rather than restated as a second literal — a second reader is a second
// thing to drift, the same reason BRIDGE_HOOK_TIMEOUT_MS itself reads the manifest instead of a
// literal (ADR 0087).
function codexHookCommand(pluginRoot, hook) {
  return `node ${JSON.stringify(path.join(pluginRoot, 'hooks', `${hook}.js`))}`;
}

function codexHooksJson(pluginRoot) {
  const cmd = (hook) => ({ type: 'command', command: codexHookCommand(pluginRoot, hook) });
  const config = {
    hooks: {
      SessionStart: [{ hooks: [cmd('update-check')] }],
      PreToolUse: [
        { matcher: 'Bash', hooks: [cmd('merge-guard'), cmd('run-lock'), cmd('ledger-guard')] },
        { matcher: 'Edit|Write|apply_patch', hooks: [cmd('ledger-guard')] },
      ],
      PostToolUse: [
        { matcher: 'Bash', hooks: [Object.assign(cmd('green-gate'), { timeout: Math.round(BRIDGE_HOOK_TIMEOUT_MS / 1000) })] },
      ],
      Stop: [{ hooks: [cmd('slicetree-sweep'), cmd('scope-prune')] }],
    },
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

function codexExtras(ctx) {
  return [{ rel: path.join('.codex', 'hooks.json'), content: codexHooksJson(ctx.pluginRoot) }];
}

const HARNESS_REGISTRY = {
  opencode: {
    cleanup: opencodeCleanup,
    renderSkill: opencodeRenderSkill,
    renderCommand: opencodeRenderCommand,
    renderAgent: opencodeRenderAgent,
    extras: opencodeExtras,
  },
  codex: {
    cleanup: codexCleanup,
    renderSkill: codexRenderSkill,
    renderCommand: codexRenderCommand,
    renderAgent: codexRenderAgent,
    extras: codexExtras,
  },
};

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

// The sorted skill directory names under skillsDir (SKILL_ONLY_COMMANDS included — callers filter
// as needed) and the sorted agent names under agentsDir (the .md extension stripped). One shared
// walk, so a future SKILL_ONLY_COMMANDS member or a renamed skill-file convention only has one
// place to change.
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

// The model aliases the plugin root's own agents carry — the exact set resolveModel() will need a
// --model-map entry for once render() runs. Agents alone: a rendered skill carries no `model:` key
// for OpenCode to read (ADR 0055), so a model alias one of the ten renderSkill surfaces pins reaches
// no render target and asking the operator to resolve it would prompt for a value nothing consumes.
// The one SKILL_ONLY_COMMANDS member (afk) is the exception this scan does not account for: it
// renders through renderCommand, which does emit `model:`. Harmless today, since afk pins no model
// and every alias any surface carries also appears on an agent — but a future withheld surface that
// both pins a model and appears on no agent would hit resolveModel's "no --model-map entry" refusal
// unresolved by this pre-scan. Only reads frontmatter, so it can run before --dest is known.
function usedModelAliases(pluginRoot) {
  const agentsDir = path.join(pluginRoot, 'agents');
  const aliases = new Set();
  const modelOf = (filePath) => readFrontmatter(fs.readFileSync(filePath, 'utf8'), filePath).fields.model;
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
// input, so that path never touches stdin — instead of prompting with nothing to offer. opts
// forwards to queryOpenCodeModels (cwd/env) and the interactive prompt (input/output).
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
      // selectModel() only ever returns an entry of `models` itself, so the pick needs no further
      // check against that same list before it is used.
      resolved.set(alias, await selectModel(alias, models, it, output));
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
    if (!fs.existsSync(skillPath)) {
      fail(`${skillPath} does not exist — every skill directory carries a SKILL.md`);
    }
  }

  const rewrite = (text) => rewriteProse(text, { pluginRoot, skills, agents, harness: opts.harness });
  const target = HARNESS_REGISTRY[opts.harness];
  if (!target) fail(`unknown harness '${opts.harness}' — supported: ${Object.keys(HARNESS_REGISTRY).join(', ')}`);
  const ctx = { pluginRoot, dest: opts.dest, modelMap: opts.modelMap, rewrite, skills, agents };

  // Every agent's model alias must resolve before anything under --dest is touched: an agent renders
  // after every skill in the write loop below, so resolving models this late would otherwise leave a
  // Codex render's already-written skills on disk when a later agent's alias turns out unmapped — the
  // OpenCode CLI path never hits this, since main() resolves every alias interactively before render()
  // ever runs, but Codex's model map carries no such fallback (ADR 0056) and a caller of render()
  // itself, for either harness, gets the same "writes nothing" guarantee.
  for (const name of agents) {
    const agentPath = path.join(agentsDir, `${name}.md`);
    const { fields } = readFrontmatter(fs.readFileSync(agentPath, 'utf8'), agentPath);
    if (!fields.model) fail(`${agentPath} carries no model alias`);
    resolveModel(fields, opts.modelMap, 'agent', name);
  }

  // A pre-existing .codex/hooks.json this render did not itself produce refuses here, before
  // target.cleanup(ctx) or any write — the same "writes nothing at all" guarantee the model
  // preflight above gives. JSON carries no comment to hold a marker (unlike a rendered skill's
  // frontmatter or a rendered agent TOML's leading comment line), so the only way to tell "mine"
  // from "not mine" is exact content: a byte-identical file is what an earlier render of this exact
  // plugin root already produced, and rewriting it is a no-op; anything else — a hand-edited file,
  // a stale render from an older adapter version — refuses rather than silently overwriting it.
  if (opts.harness === 'codex') {
    const hooksJsonPath = path.join(opts.dest, '.codex', 'hooks.json');
    if (fs.existsSync(hooksJsonPath) && fs.readFileSync(hooksJsonPath, 'utf8') !== codexHooksJson(pluginRoot)) {
      fail(`${hooksJsonPath} already exists and was not written by this adapter — remove it before rendering Codex hooks`);
    }
  }

  target.cleanup(ctx);

  // A registry method may answer null for a surface its harness renders nowhere (afk on Codex, or
  // this slice's agent/extras stubs) — skipped here rather than written as an empty file.
  const write = (file, written) => {
    if (!file) return;
    fs.mkdirSync(path.dirname(path.join(opts.dest, file.rel)), { recursive: true });
    fs.writeFileSync(path.join(opts.dest, file.rel), file.content);
    written.push(file.rel);
  };

  const written = [];
  for (const name of skills) {
    if (SKILL_ONLY_COMMANDS.has(name)) continue;
    write(target.renderSkill(name, path.join(skillsDir, name, 'SKILL.md'), ctx), written);
  }
  // The command render: every SKILL_ONLY_COMMANDS member. Only afk today, and only because a
  // command is the one OpenCode surface its model cannot invoke (ADR 0055).
  for (const name of skills) {
    if (!SKILL_ONLY_COMMANDS.has(name)) continue;
    write(target.renderCommand(name, path.join(skillsDir, name, 'SKILL.md'), ctx), written);
  }
  for (const name of agents) {
    write(target.renderAgent(name, path.join(agentsDir, `${name}.md`), ctx), written);
  }
  for (const file of target.extras(ctx)) write(file, written);

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
  if (!Object.keys(HARNESS_REGISTRY).includes(opts.harness)) {
    fail(`unknown harness '${opts.harness}' — supported: ${Object.keys(HARNESS_REGISTRY).join(', ')}`);
  }
  if (opts.dest === undefined) fail('missing --dest <dir>');
  return opts;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
    // The interactive fallback queries an OpenCode configuration, which says nothing about what a
    // Codex (or any future harness's) install can run — so only opencode gets it; every other
    // harness runs with whatever --model-map already carries (ADR 0056).
    if (opts.harness === 'opencode') {
      opts.modelMap = await resolveModelMap(opts.pluginRoot, opts.modelMap, { cwd: opts.dest });
    }
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

if (require.main === module) main();

// `tests/adapter.test.js` requires the internals below besides (ADR 0059).
module.exports = {
  render,
  queryOpenCodeModels,
  parseArgs,
  resolveModelMap,
  rewriteProse,
  buildHookPayload,
  bridgeSpawnEnv,
  hookBlockReason,
  BRIDGE_HOOK_TIMEOUT_MS,
  spawnFailureNotice,
  TOOL_MAP,
  SKILL_MARKER,
  CODEX_SKILL_MARKER,
  CODEX_AGENT_MARKER,
  AFK_SKILL_TOOL_SENTENCE,
  AFK_CHAIN_TABLE_HEADER,
  BRIDGE_SHELL_TOOLS,
  BRIDGE_EDIT_TOOLS,
  BRIDGE_TASK_TOOLS,
  BRIDGE_SHELL_BEFORE_HOOKS,
  BRIDGE_SESSION_CREATED,
  BRIDGE_SESSION_ENDED,
  BRIDGE_SESSION_END_HOOKS,
};
