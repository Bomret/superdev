#!/usr/bin/env node
'use strict';

// adapter.js: the harness adapter (issue #375). Renders the shipped surfaces — the
// plugin/skills/<name>/SKILL.md prompts, the plugin/agents/<name>.md subagents, and the
// deterministic guardrails — into another harness's on-disk layout, so a superdev install there
// carries the same chain. The only harness is `opencode`: skills render to
// `.opencode/skills/superdev-<name>/SKILL.md` (`upgrade` renders synthesized, OpenCode-native
// content instead of its Claude-Code-only body, ADR 0052), agents to
// `.opencode/agents/<name>.md`, with the Claude-specific tokens rewritten deterministically, and
// the eight hooks are bridged by a generated OpenCode plugin at `.opencode/plugins/superdev.js`
// (issue #376) that spawns them as `node <plugin-root>/hooks/<hook>.js` with a Claude-shaped
// stdin payload. Exit nonzero with a one-line stderr reason on any refusal, the convention
// scripts/scope.js uses.
//
// A skill is the model-invocable target: OpenCode exposes one through its built-in `skill` tool and
// registers it as a `/superdev-<name>` slash command besides, where a command under
// `.opencode/commands/` is only ever typed by the operator. That is what decides which surface
// renders where — SKILL_ONLY_COMMANDS names the ones that stay commands (ADR 0055).
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

// The same marker for a rendered skill, and for the same reason: .opencode/skills/ is a shared
// OpenCode directory, so a re-render removes only the skill directories this adapter itself wrote.
// Keying cleanup on the `superdev-` name prefix instead would delete a consumer's own skill that
// happens to start that way. A YAML comment rather than a frontmatter field: OpenCode recognizes
// `name`, `description`, `license`, `compatibility` and `metadata` and ignores everything else, and
// a comment is invisible to a schema validator besides (verified live against opencode 1.18.20,
// 2026-09-09 — a rendered skill carrying this exact line still resolved every other field
// correctly, and `opencode debug skill` still listed it under its own `name`).
const SKILL_MARKER = '# generated-by: superdev-adapter — a re-render overwrites this directory';

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
// the bare agent name; and `/superdev:<cmd>` becomes whichever slash-command name that surface
// actually renders under — `/superdev-<cmd>` for a skill, which OpenCode registers flat, and
// `/superdev/<cmd>` for a SKILL_ONLY_COMMANDS member, which renders into the namespaced commands
// subdirectory instead (ADR 0055). Both name rewrites are
// restricted to the names discovered under --plugin-root, so a token that is not a real skill or
// agent (an HTML comment marker, a prose example) is never mangled.
function rewriteProse(text, opts) {
  let out = text.split('${CLAUDE_PLUGIN_ROOT}').join(opts.pluginRoot);
  for (const name of opts.skills) {
    const rendered = SKILL_ONLY_COMMANDS.has(name) ? `/superdev/${name}` : `/${SKILL_NAME_PREFIX}${name}`;
    out = out.replace(new RegExp(`/superdev:${name}\\b`, 'g'), rendered);
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
function renderSkill(name, skillPath, rewrite) {
  const { fields, body } = readFrontmatter(fs.readFileSync(skillPath, 'utf8'), skillPath);
  if (!fields.description) fail(`${skillPath} carries no description`);
  const skillName = `${SKILL_NAME_PREFIX}${name}`;
  if (!SKILL_NAME_PATTERN.test(skillName)) {
    fail(`'${skillName}' is not a valid OpenCode skill name — lowercase alphanumeric segments joined by '-' (${skillPath})`);
  }
  let frontmatter = `---\n${SKILL_MARKER}\nname: ${skillName}\ndescription: ${yamlString(fields.description)}\n`;
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

// renderOpencodeUpgradeSkill() emits .opencode/skills/superdev-upgrade/SKILL.md: OpenCode's real
// upgrade path — a git pull in the plugin's source clone, then a re-render — synthesized directly
// here rather than derived from plugin/skills/upgrade/SKILL.md's body, which drives Claude Code's
// own `claude plugin update` and has no OpenCode equivalent (ADR 0052, amending ADR 0050's outright
// exclusion). The same treatment renderBridge() above already gives the hook-bridge plugin: both
// are pure harness mechanics with no prose in common with their Claude Code counterpart. It carries
// no `model:` line, for the reason renderSkill() states: OpenCode skill frontmatter has no such key
// (ADR 0055). The
// "start a new OpenCode session" instruction is verified against OpenCode's own plugin docs
// (https://opencode.ai/docs/plugins/, 2026-09-06): plugin/command/agent files are "loaded at
// startup", with no documented hot-reload, so a fresh session is the correct load point.
function renderOpencodeUpgradeSkill(skillPath, pluginRoot, modelMap) {
  readFrontmatter(fs.readFileSync(skillPath, 'utf8'), skillPath);
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
  const frontmatter = `---\n${SKILL_MARKER}\nname: ${SKILL_NAME_PREFIX}upgrade\ndescription: ${yamlString(
    "Pull the latest superdev source and re-render this project's OpenCode surfaces (skills, agents, hook bridge) in place.",
  )}\n---\n`;
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
    'Re-rendering rewrites every file this adapter generates — every skill directory under',
    '`.opencode/skills/`, every agent it wrote under `.opencode/agents/`, and',
    '`.opencode/plugins/superdev.js` — to match the pulled source. The command above already',
    "carries this project's resolved model-map, so it re-renders non-interactively with no prompts.",
    '',
    '## 3. Done',
    '',
    "Once both commands have succeeded, report both commands' output, then tell the user to",
    '**start a new OpenCode session** in this project — OpenCode loads skills, commands, agents,',
    'and plugins at startup, with no documented hot-reload, so a running session keeps the old ones',
    'until it restarts.',
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
const BRIDGE_SESSION_END_HOOKS = ['worktree-sweep', 'scope-prune'];

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

  const rewrite = (text) => rewriteProse(text, { pluginRoot, skills, agents });

  const commandsDest = path.join(opts.dest, '.opencode', 'commands', 'superdev');
  const skillsDest = path.join(opts.dest, '.opencode', 'skills');
  const agentsDest = path.join(opts.dest, '.opencode', 'agents');
  // The commands subdirectory goes wholesale — it is namespaced to superdev, nothing foreign shares
  // it, and an install rendered before ADR 0055 carries a full set of command files there that the
  // skills render replaces. It is recreated below only if a SKILL_ONLY_COMMANDS member renders.
  fs.rmSync(commandsDest, { recursive: true, force: true });
  fs.mkdirSync(skillsDest, { recursive: true });
  fs.mkdirSync(agentsDest, { recursive: true });
  // .opencode/skills/ is shared with a consumer's own skills, so remove only the directories this
  // adapter wrote — the ones whose SKILL.md frontmatter carries SKILL_MARKER. Matching on the
  // `superdev-` name prefix instead would delete a consumer's own `superdev-notes` skill.
  for (const entry of fs.readdirSync(skillsDest, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(skillsDest, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    const match = fs.readFileSync(skillFile, 'utf8').match(/^---\n([\s\S]*?)\n---\n?/);
    if (match && match[1].includes(SKILL_MARKER)) fs.rmSync(path.join(skillsDest, entry.name), { recursive: true, force: true });
  }
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
    if (SKILL_ONLY_COMMANDS.has(name)) continue;
    const rel = path.join('.opencode', 'skills', `${SKILL_NAME_PREFIX}${name}`, 'SKILL.md');
    const skillPath = path.join(skillsDir, name, 'SKILL.md');
    const content = name === 'upgrade' && opts.harness === 'opencode'
      ? renderOpencodeUpgradeSkill(skillPath, pluginRoot, opts.modelMap)
      : renderSkill(name, skillPath, rewrite);
    fs.mkdirSync(path.dirname(path.join(opts.dest, rel)), { recursive: true });
    fs.writeFileSync(path.join(opts.dest, rel), content);
    written.push(rel);
  }
  // The command render: every SKILL_ONLY_COMMANDS member, recreated under the namespaced
  // subdirectory the cleanup above cleared. Only afk today, and only because a command is the
  // surface OpenCode's model cannot invoke (ADR 0055).
  for (const name of skills) {
    if (!SKILL_ONLY_COMMANDS.has(name)) continue;
    const rel = path.join('.opencode', 'commands', 'superdev', `${name}.md`);
    const skillPath = path.join(skillsDir, name, 'SKILL.md');
    const content = name === 'afk' && opts.harness === 'opencode'
      ? renderOpencodeAfkCommand(name, skillPath, opts.modelMap, rewrite)
      : renderCommand(name, skillPath, opts.modelMap, rewrite);
    fs.mkdirSync(path.dirname(path.join(opts.dest, rel)), { recursive: true });
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
  TOOL_MAP,
  SKILL_MARKER,
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
