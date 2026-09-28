'use strict';

// Suite for plugin/scripts/adapter.js. Requires the module (silent — adapter.js already guards its
// CLI entry with require.main === module, per ADR 0059) and calls its exported internals directly,
// the way the script's own inline --selftest used to before this suite moved off the shipped tree
// (ADR 0059). The suite awaits render()'s CLI-path model resolution and the OpenCode hook bridge's
// hook spawns, exactly as the script's own selftest did — CommonJS carries no top-level await, so
// the whole body runs inside one async IIFE instead.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { assertSpawnDecided } = require('./spawn-verdict');

const adapterPath = require.resolve('../plugin/scripts/adapter.js');
const { readHookTimeoutMs } = require('../plugin/hooks/green-gate.js');
const {
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
} = require(adapterPath);

(async () => {
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
    // A skill's own token becomes the flat `/superdev-<name>` OpenCode registers it under, while afk
    // — the one SKILL_ONLY_COMMANDS member — becomes the namespaced `/superdev/afk` its command
    // render actually answers to (ADR 0055).
    assert.ok(rewritten.includes('/superdev-plan and `/superdev-implement`, dispatched by /superdev/afk'));
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
      '# superdev afk',
      '',
      AFK_SKILL_TOOL_SENTENCE,
      '',
      AFK_CHAIN_TABLE_HEADER,
      '| no run root | `/superdev:implement <feature-label> --unattended` |',
      '',
      'Then run /superdev:implement and /superdev:plan in order.',
      '',
    ].join('\n'));
    write(pluginRoot, 'skills/submit-pr/SKILL.md', [
      '---',
      'name: submit-pr',
      'description: Open a pull request for a superdev scope.',
      '---',
      '',
      'body',
      '',
    ].join('\n'));
    write(pluginRoot, 'skills/ship/SKILL.md', [
      '---',
      'name: ship',
      'description: Merge a superdev scope pull request. Only a human runs it.',
      'disable-model-invocation: true',
      '---',
      '',
      '# superdev ship',
      '',
      'Merge the pull request /superdev:submit-pr opened.',
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
      path.join('.opencode', 'commands', 'superdev', 'afk.md'),
      path.join('.opencode', 'commands', 'superdev', 'ship.md'),
      path.join('.opencode', 'plugins', 'superdev.js'),
      path.join('.opencode', 'skills', 'superdev-backlog', 'SKILL.md'),
      path.join('.opencode', 'skills', 'superdev-implement', 'SKILL.md'),
      path.join('.opencode', 'skills', 'superdev-plan', 'SKILL.md'),
      path.join('.opencode', 'skills', 'superdev-setup', 'SKILL.md'),
      path.join('.opencode', 'skills', 'superdev-submit-pr', 'SKILL.md'),
      path.join('.opencode', 'skills', 'superdev-upgrade', 'SKILL.md'),
    ]);
    // afk and ship each render as a command and never as a skill — a command is the one OpenCode
    // surface the model cannot invoke, which is what reproduces disable-model-invocation (ADR 0055,
    // ADR 0096).
    assert.ok(!written.includes(path.join('.opencode', 'skills', 'superdev-afk', 'SKILL.md')), 'afk is never a skill');
    assert.ok(!fs.existsSync(path.join(dest, '.opencode', 'skills', 'superdev-afk')), 'no afk skill directory exists');
    assert.ok(fs.existsSync(path.join(dest, '.opencode', 'commands', 'superdev', 'afk.md')), 'afk renders as a command');
    assert.ok(!written.includes(path.join('.opencode', 'skills', 'superdev-ship', 'SKILL.md')), 'ship is never a skill');
    assert.ok(!fs.existsSync(path.join(dest, '.opencode', 'skills', 'superdev-ship')), 'no ship skill directory exists');
    assert.ok(fs.existsSync(path.join(dest, '.opencode', 'commands', 'superdev', 'ship.md')), 'ship renders as a command');

    // ship carries no afk-shaped Skill-tool sentence or chain table, so it renders through the plain
    // renderCommand() path — the description and disable-model-invocation carry through, and the
    // command frontmatter carries no `disable-model-invocation` key (OpenCode commands have none; the
    // command render itself is what reproduces the effect).
    const shipCommand = fs.readFileSync(path.join(dest, '.opencode', 'commands', 'superdev', 'ship.md'), 'utf8');
    assert.ok(shipCommand.includes('description: "Merge a superdev scope pull request. Only a human runs it."'));
    assert.ok(shipCommand.includes('Merge the pull request /superdev-submit-pr opened.'), 'the ordinary command render still applies the plain /superdev:<cmd> rewrite, no afk-shaped rewrite applied');

    // The rendered afk names OpenCode's own skill tool and the rendered skill names it drives, never
    // Claude Code's Skill tool, and it states the headless launch line the operator actually uses.
    const afkCommand = fs.readFileSync(path.join(dest, '.opencode', 'commands', 'superdev', 'afk.md'), 'utf8');
    assert.ok(afkCommand.includes("with OpenCode's own `skill` tool"), 'names the OpenCode skill tool');
    for (const step of ['superdev-implement', 'superdev-review', 'superdev-document', 'superdev-submit-pr']) {
      assert.ok(afkCommand.includes(`\`${step}\``), `names the rendered ${step} skill`);
    }
    assert.ok(afkCommand.includes('opencode run --auto --command superdev/afk'), 'states the headless launch line');
    assert.ok(!afkCommand.includes('with the Skill tool'), "carries none of Claude Code's own Skill-tool sentence");
    assert.ok(afkCommand.includes('/superdev-implement and /superdev-plan'), 'the rest of the body carries through the ordinary rewrite');

    // A rendered skill's `$ARGUMENTS` token is rewritten to name where OpenCode arguments actually
    // are — the invoking message — since OpenCode's `skill` tool takes only a `name` and nothing
    // substitutes the token the way Claude Code's own command runner does. The command surface afk
    // renders to keeps the literal token untouched: OpenCode's own slash-command substitution still
    // fills it in there.
    {
      const argsRoot = tmp();
      fs.mkdirSync(path.join(argsRoot, 'agents'), { recursive: true });
      write(argsRoot, 'skills/implement/SKILL.md', ['---', 'name: implement', 'description: Build a plan.', '---', '', 'Resolve `$ARGUMENTS` to one feature.', ''].join('\n'));
      const argsDest = tmp();
      render({ harness: 'opencode', pluginRoot: argsRoot, dest: argsDest, modelMap: new Map() });
      const renderedSkill = fs.readFileSync(path.join(argsDest, '.opencode', 'skills', 'superdev-implement', 'SKILL.md'), 'utf8');
      assert.ok(!renderedSkill.includes('$ARGUMENTS'), 'no literal $ARGUMENTS token survives a rendered skill');
      assert.ok(renderedSkill.includes('the message that invoked this skill'), 'names the invoking message as where the arguments actually are');

      write(argsRoot, 'skills/afk/SKILL.md', ['---', 'name: afk', 'description: Drive the chain unattended.', '---', '', AFK_SKILL_TOOL_SENTENCE, '', AFK_CHAIN_TABLE_HEADER, '| no run root | `/superdev:implement <feature-label> --unattended` |', '', 'Resolve `$ARGUMENTS` too.', ''].join('\n'));
      const argsDest2 = tmp();
      render({ harness: 'opencode', pluginRoot: argsRoot, dest: argsDest2, modelMap: new Map() });
      const renderedAfkCommand = fs.readFileSync(path.join(argsDest2, '.opencode', 'commands', 'superdev', 'afk.md'), 'utf8');
      assert.ok(renderedAfkCommand.includes('$ARGUMENTS'), "afk's own command render keeps the literal token — OpenCode substitutes it there itself");
    }

    // The rewrite is anchored on afk's own canonical sentence: an edit to that prose refuses the
    // render instead of shipping an afk that still names a tool OpenCode does not have.
    {
      const driftedRoot = tmp();
      write(driftedRoot, 'skills/afk/SKILL.md', ['---', 'name: afk', 'description: Drive the chain unattended.', '---', '', 'You invoke the chain some other way now.', ''].join('\n'));
      fs.mkdirSync(path.join(driftedRoot, 'agents'), { recursive: true });
      refuses(
        () => render({ harness: 'opencode', pluginRoot: driftedRoot, dest: tmp(), modelMap: new Map() }),
        'no longer carries the chain-driver sentence',
      );
    }

    // The chain table's cells still read as slash-command text after the ordinary rewrite
    // (`/superdev-review <BASE>..<feature-label> --unattended`), which nothing on OpenCode expands
    // outside a live typed command. A sentence right before the table maps a cell to the actual
    // OpenCode call — the `skill` tool, by name — so a model that follows the table literally still
    // reaches for that tool instead of emitting inert slash-command text.
    {
      const tableRoot = tmp();
      write(tableRoot, 'skills/review/SKILL.md', ['---', 'name: review', 'description: Review a slice.', '---', '', 'body', ''].join('\n'));
      write(tableRoot, 'skills/afk/SKILL.md', [
        '---', 'name: afk', 'description: Drive the chain unattended.', '---', '',
        AFK_SKILL_TOOL_SENTENCE, '',
        AFK_CHAIN_TABLE_HEADER,
        '| `merged` | `/superdev:review <BASE>..<feature-label> --unattended` |',
        '',
      ].join('\n'));
      fs.mkdirSync(path.join(tableRoot, 'agents'), { recursive: true });
      const tableDest = tmp();
      render({ harness: 'opencode', pluginRoot: tableRoot, dest: tableDest, modelMap: new Map() });
      const renderedAfk = fs.readFileSync(path.join(tableDest, '.opencode', 'commands', 'superdev', 'afk.md'), 'utf8');
      const headerIndex = renderedAfk.indexOf('| Stage | Start at |');
      assert.ok(headerIndex > -1, 'the chain table itself still renders');
      const beforeTable = renderedAfk.slice(Math.max(0, headerIndex - 400), headerIndex);
      assert.ok(beforeTable.includes('`skill`') && beforeTable.includes('superdev-<name>'), 'a sentence right before the table maps a cell to the actual OpenCode call');
      assert.ok(renderedAfk.includes('| `merged` | `/superdev-review <BASE>..<feature-label> --unattended` |'), 'the table row itself still renders through the ordinary rewrite');

      const driftedTableRoot = tmp();
      write(driftedTableRoot, 'skills/afk/SKILL.md', ['---', 'name: afk', 'description: Drive the chain unattended.', '---', '', AFK_SKILL_TOOL_SENTENCE, '', 'The chain table lives somewhere else now.', ''].join('\n'));
      fs.mkdirSync(path.join(driftedTableRoot, 'agents'), { recursive: true });
      refuses(
        () => render({ harness: 'opencode', pluginRoot: driftedTableRoot, dest: tmp(), modelMap: new Map() }),
        "no longer carries the chain table's header",
      );
    }

    // upgrade renders OpenCode-native content, synthesized rather than derived from the skill's own
    // Claude-Code-only body: a real git-pull-then-re-render path, and none of the Claude-only
    // commands or restart instruction.
    const upgradeCommand = fs.readFileSync(path.join(dest, '.opencode', 'skills', 'superdev-upgrade', 'SKILL.md'), 'utf8');
    assert.ok(upgradeCommand.startsWith(`---\n${SKILL_MARKER}\nname: superdev-upgrade\ndescription:`), 'the upgrade skill carries the marker and its prefixed name');
    assert.ok(!/^model:/m.test(upgradeCommand), 'carries no model line — OpenCode skill frontmatter has no such key');
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
      assert.ok(rendered.includes(path.join('.opencode', 'skills', 'superdev-upgrade', 'SKILL.md')));
      const rerendered = fs.readFileSync(path.join(upgradeDest, '.opencode', 'skills', 'superdev-upgrade', 'SKILL.md'), 'utf8');
      assert.ok(!/^model:/m.test(rerendered), "the skill drops the canonical model pin rather than emitting a key OpenCode ignores");
      const rerenderedLine = rerendered.match(/^node .+$/m)[0];
      const rerenderedOpts = parseArgs(tokenizeShellLine(rerenderedLine).slice(2));
      assert.deepEqual(
        rerenderedOpts.modelMap,
        new Map([['haiku', 'acme/haiku-1']]),
        'a single-alias model-map still round-trips through the emitted re-render command',
      );

      // A skill's own `model:` pin reaches no render target, so a plugin root of skills alone needs
      // no --model-map at all — where an agent's pin still refuses one (the two refuses() below).
      const noMapDest = tmp();
      render({ harness: 'opencode', pluginRoot: upgradeRoot, dest: noMapDest, modelMap: new Map() });
      assert.ok(fs.existsSync(path.join(noMapDest, '.opencode', 'skills', 'superdev-upgrade', 'SKILL.md')));
    }

    const command = fs.readFileSync(path.join(dest, '.opencode', 'skills', 'superdev-plan', 'SKILL.md'), 'utf8');
    assert.ok(command.startsWith(`---\n${SKILL_MARKER}\nname: superdev-plan\ndescription: "Plan a feature. Run before /superdev-implement."\n---\n\n# superdev plan`));
    assert.ok(command.includes(`Read ${pluginRoot}/references/plan-contract.md, then dispatch \`implementer\`.`));
    assert.ok(command.includes('/superdev/afk'));
    assert.ok(!command.includes('argument-hint'));

    // A description carrying `: ` renders as a JSON-quoted YAML scalar, so the frontmatter parses.
    const colonCommand = fs.readFileSync(path.join(dest, '.opencode', 'skills', 'superdev-setup', 'SKILL.md'), 'utf8');
    assert.ok(colonCommand.startsWith(`---\n${SKILL_MARKER}\nname: superdev-setup\ndescription: "Configure this repo for superdev: slice store, code host."\n---`));

    // A skill's allowed-tools carry verbatim, and its canonical `model:` pin is dropped: OpenCode
    // skill frontmatter recognizes neither key, and carrying the one beats dropping it silently
    // while the other has no rendered equivalent at all (ADR 0055).
    const backlogCommand = fs.readFileSync(path.join(dest, '.opencode', 'skills', 'superdev-backlog', 'SKILL.md'), 'utf8');
    assert.ok(backlogCommand.startsWith(`---\n${SKILL_MARKER}\nname: superdev-backlog\ndescription: "Survey the backlog. Read-only."\nallowed-tools: "Read, Bash"\n---`));
    assert.ok(!/^model:/m.test(backlogCommand), 'the sonnet pin is dropped rather than emitted');

    // $ARGUMENTS rewrite: the backticked form `$ARGUMENTS` becomes the phrase without surrounding
    // backticks, reading as prose not a code token. Backticked form handled first, so any remaining
    // bare token is also rewritten (the second form would be in unreplaced prose or a template marker).
    {
      const backtickRoot = tmp();
      fs.mkdirSync(path.join(backtickRoot, 'agents'), { recursive: true });
      write(backtickRoot, 'skills/test/SKILL.md', ['---', 'name: test', 'description: Test backtick rewrite.', '---', '', 'The backticked `$ARGUMENTS` token here.', 'Also a bare $ARGUMENTS token.', ''].join('\n'));
      const backtickDest = tmp();
      render({ harness: 'opencode', pluginRoot: backtickRoot, dest: backtickDest, modelMap: new Map() });
      const rendered = fs.readFileSync(path.join(backtickDest, '.opencode', 'skills', 'superdev-test', 'SKILL.md'), 'utf8');
      assert.ok(rendered.includes('the message that invoked this skill'), 'the phrase replaces both forms');
      assert.ok(!rendered.includes('`the message that invoked'), 'no backticks remain adjacent to the phrase — backticked form consumed them');
      assert.ok(!rendered.includes('$ARGUMENTS'), 'no literal token survives');
    }

    const agent = fs.readFileSync(path.join(dest, '.opencode', 'agents', 'implementer.md'), 'utf8');
    assert.ok(agent.includes('description: "Slice implementer. Dispatched by /superdev-implement."'));
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
    // The skills directory is shared the same way .opencode/agents/ is, so the same marker rule
    // governs it: a stale superdev-rendered skill goes, a consumer's own skill stays — including one
    // whose directory name begins `superdev-`, which a prefix-keyed cleanup would delete (ADR 0055).
    write(dest, '.opencode/skills/superdev-ghost/SKILL.md', `---\n${SKILL_MARKER}\nname: superdev-ghost\ndescription: "ghost"\n---\n\nghost\n`);
    write(dest, '.opencode/skills/superdev-notes/SKILL.md', '---\nname: superdev-notes\ndescription: "a consumer\'s own skill"\n---\n\nmine\n');
    write(dest, '.opencode/skills/notes/SKILL.md', '---\nname: notes\ndescription: "another of the consumer\'s own"\n---\n\nalso mine\n');
    // A previous, pre-ADR-0055 render's commands tree: the migration path every existing OpenCode
    // install takes on its first re-render.
    write(dest, '.opencode/commands/superdev/plan.md', '---\ndescription: "a command from the render before this one"\n---\n\nstale\n');
    write(dest, '.opencode/commands/superdev/review.md', '---\ndescription: "another stale command"\n---\n\nstale\n');
    const rewritten2 = render(opts);
    assert.deepEqual(rewritten2, written);
    assert.ok(!fs.existsSync(path.join(dest, '.opencode', 'agents', 'ghost.md')), 'a stale superdev-rendered agent is cleaned');
    assert.ok(!fs.existsSync(path.join(dest, '.opencode', 'skills', 'superdev-ghost')), 'a stale superdev-rendered skill directory is cleaned');
    assert.equal(fs.readFileSync(path.join(dest, '.opencode', 'skills', 'superdev-notes', 'SKILL.md'), 'utf8'), '---\nname: superdev-notes\ndescription: "a consumer\'s own skill"\n---\n\nmine\n', "a consumer's own skill named superdev-* survives a re-render");
    assert.ok(fs.existsSync(path.join(dest, '.opencode', 'skills', 'notes', 'SKILL.md')), "a consumer's own unprefixed skill survives too");
    assert.ok(!fs.existsSync(path.join(dest, '.opencode', 'commands', 'superdev', 'plan.md')), 'a pre-ADR-0055 render\'s command files are cleared');
    assert.ok(!fs.existsSync(path.join(dest, '.opencode', 'commands', 'superdev', 'review.md')), 'every one of them, not just the ones this render replaces');
    assert.equal(fs.readFileSync(path.join(dest, '.opencode', 'agents', 'mine.md'), 'utf8'), 'a consumer\'s own agent, not ours\n', 'a foreign agent file survives a re-render');
    assert.ok(fs.existsSync(path.join(dest, '.opencode', 'agents', 'quoter.md')), 'a foreign agent that merely quotes the marker in its body survives');
    assert.equal(fs.readFileSync(path.join(dest, '.opencode', 'plugins', 'other.js'), 'utf8'), '// a foreign plugin\n');
    assert.equal(fs.readFileSync(path.join(dest, 'unrelated', 'keep.txt'), 'utf8'), 'not generated\n');
    assert.deepEqual(rewritten2.map((rel) => fs.readFileSync(path.join(dest, rel), 'utf8')), before);

    // A trailing slash on the plugin root normalizes away instead of producing `//` paths.
    const slashDest = tmp();
    render({ harness: 'opencode', pluginRoot: pluginRoot + path.sep, dest: slashDest, modelMap });
    const slashed = fs.readFileSync(path.join(slashDest, '.opencode', 'skills', 'superdev-plan', 'SKILL.md'), 'utf8');
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
    assert.deepEqual(BRIDGE_SESSION_END_HOOKS, ['slicetree-sweep', 'scope-prune']);

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

    // INV-0009, ADR 0087: a hook the bridge's own ceiling killed carries no verdict, and on
    // OpenCode this bridge is the only gate there is — so it blocks, naming the kill rather than
    // a refusal the hook never made. `close` reports a killed child as a null status beside a
    // signal, which is the field the handler used to discard.
    const killed = hookBlockReason('green-gate', { status: null, signal: 'SIGTERM', stdout: '', stderr: '' });
    assert.match(killed, /killed/i, 'a killed hook blocks, naming the kill');
    assert.match(killed, /green-gate/, 'and names the hook it killed');
    assert.doesNotMatch(killed, /refus|denied/i, 'a kill is not a refusal the hook made');
    assert.equal(
      hookBlockReason('green-gate', { status: 0, signal: null, stdout: '', stderr: '' }),
      null,
      'a hook that decided on its own is unaffected by the signal check'
    );

    // ADR 0087: the bridge's ceiling follows hooks/hooks.json's own green-gate entry rather than a
    // literal of its own, so raising that entry raises both bounds. The renderer reads the manifest
    // and bakes the value in, which is why the generated bridge needs no reader of its own.
    assert.equal(
      BRIDGE_HOOK_TIMEOUT_MS,
      readHookTimeoutMs(),
      "the bridge's ceiling is the manifest's own green-gate entry, not a second literal"
    );
    assert.ok(BRIDGE_HOOK_TIMEOUT_MS > 0, 'and it is bounded');

    // ADR 0087: a hook that never started is a Spawn failure, not a No verdict — the gate never
    // ran, so the absence is evidence about the installation rather than about the code under the
    // gate. The call proceeds, because every repair for a broken install is made through the
    // surface a block would close. The notice fires once per session: one nobody can read past is
    // the same failure as none.
    const first = spawnFailureNotice('green-gate');
    assert.match(first, /green-gate/, 'the notice names the hook that could not start');
    assert.match(first, /start/i, 'and says it never started');
    assert.equal(spawnFailureNotice('green-gate'), null, 'a second spawn failure for the same hook is silent in the same session');
    // Keyed by hook, not one session-wide flag: a different hook still gets its own first notice —
    // one transient failure must not silence every other hook for the life of the process.
    assert.match(spawnFailureNotice('merge-guard'), /merge-guard/, 'a different hook still gets its own notice');
    assert.equal(spawnFailureNotice('merge-guard'), null, 'and is then silent for itself too');

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
    write(pluginRoot, 'hooks/slicetree-sweep.js', fakeHook('process.exit(0);'));
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

    // ADR 0087, end to end through the rendered bridge: a hook that never starts leaves the call
    // proceeding, and says so once. Emptying PATH makes `node` itself unspawnable, which is a real
    // ENOENT reaching `child.on('error')` rather than a hand-built shape — the discipline
    // tests/spawn-verdict.test.js takes with the result shapes it asserts against.
    {
      const realPath = process.env.PATH;
      const realWrite = process.stderr.write;
      const captured = [];
      process.env.PATH = '';
      process.stderr.write = (chunk) => (captured.push(String(chunk)), true);
      let threw = null;
      try {
        // The before-hook spawns three SHELL_BEFORE_HOOKS in turn — with PATH empty every one of
        // them fails to spawn, so the first call gets one notice per distinct hook, never one
        // session-wide flag silencing the other two.
        await plugin['tool.execute.before']({ tool: 'bash', sessionID: 'sf1' }, { args: { command: 'ls' } });
        await plugin['tool.execute.before']({ tool: 'bash', sessionID: 'sf2' }, { args: { command: 'ls' } });
      } catch (e) {
        threw = e;
      } finally {
        process.stderr.write = realWrite;
        process.env.PATH = realPath;
      }
      assert.equal(threw, null, 'a hook that never started blocks nothing — the call proceeds');
      const text = captured.join('');
      assert.match(text, /could not start/, 'and the operator is told the hook never started');
      assert.equal(
        text.split('could not start').length - 1,
        BRIDGE_SHELL_BEFORE_HOOKS.length,
        'once per hook for the session, not once per tool call, and not silenced session-wide by one hook',
      );

      // The session boundary the bridge already has — session.created — clears the per-hook flags,
      // so the next session's first spawn failure is noticed again rather than staying silent for
      // the life of the process.
      process.env.PATH = '';
      process.stderr.write = (chunk) => (captured.push(String(chunk)), true);
      try {
        // update-check (PATH still empty) also fails to spawn here and gets its own first-time
        // notice — irrelevant to what this asserts, so it's cleared off before the check below.
        await plugin.event({ event: { type: 'session.created' } });
        captured.length = 0;
        await plugin['tool.execute.before']({ tool: 'bash', sessionID: 'sf3' }, { args: { command: 'ls' } });
      } finally {
        process.stderr.write = realWrite;
        process.env.PATH = realPath;
      }
      assert.equal(
        captured.join('').split('could not start').length - 1,
        BRIDGE_SHELL_BEFORE_HOOKS.length,
        'a fresh session.created resets the per-hook notice flags',
      );
    }

    // ADR 0100: every spawn failure reaches one answer, in each of the three shapes Node's
    // lib/internal/child_process.js reports it (v20.x and main, read 2026-09-27): an 'error' event on
    // a child whose stdio exists (EACCES, EAGAIN, ENOENT), a child whose stdio was never assigned
    // with the 'error' on the next tick (EMFILE, ENFILE), and a synchronous throw (every other code,
    // ENOMEM among them). A transient code is retried once; an installation code is not; neither
    // blocks the call or ends the process. child_process.spawn is replaced before a freshly rendered
    // bridge loads, because the bridge destructures `spawn` at load time.
    {
      const cp = require('node:child_process');
      const { EventEmitter } = require('node:events');
      const { PassThrough } = require('node:stream');
      const realSpawn = cp.spawn;
      const spawnErr = (code) => Object.assign(new Error(`spawn node ${code}`), { code, errno: -1, syscall: 'spawn node' });
      const withStdio = (child) => Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: () => {} });
      let fastKill = false;
      const shapes = {
        // 'error' on a child with stdio (EAGAIN, ENOENT, EACCES).
        event: (code) => {
          const child = withStdio(new EventEmitter());
          process.nextTick(() => child.emit('error', spawnErr(code)));
          return child;
        },
        // EMFILE/ENFILE: stdin/stdout/stderr never assigned, 'error' on the next tick.
        noStdio: (code) => {
          const child = new EventEmitter();
          child.kill = () => {};
          process.nextTick(() => child.emit('error', spawnErr(code)));
          return child;
        },
        // Any other code: spawn() throws synchronously.
        throws: (code) => {
          throw spawnErr(code);
        },
        // A child its own bound killed: it started, then closed on a signal (INV-0009).
        killed: () => {
          const child = withStdio(new EventEmitter());
          process.nextTick(() => child.emit('close', null, 'SIGKILL'));
          return child;
        },        // A child that started and outlived its bound, whose kill then fails: Node's ChildProcess#kill
        // emits 'error' synchronously for any code but ESRCH, and the child never closes (#707).
        killFails: (code) => {
          fastKill = true;
          const child = withStdio(new EventEmitter());
          child.kill = () => {
            child.emit('error', Object.assign(new Error(`kill ${code}`), { code, errno: -1, syscall: 'kill' }));
            return false;
          };
          return child;
        },
        // A child that outlived its bound and whose kill succeeds: it closes on the signal.
        timedOut: () => {
          fastKill = true;
          const child = withStdio(new EventEmitter());
          child.kill = (signal = 'SIGTERM') => {
            process.nextTick(() => child.emit('close', null, signal));
            return true;
          };
          return child;
        },
      };
      let queue = [];
      let attempts = 0;
      cp.spawn = (...args) => {
        attempts++;
        const next = queue.shift();
        return next ? shapes[next[0]](next[1]) : realSpawn(...args);
      };

      const failRoot = tmp();
      fs.mkdirSync(path.join(failRoot, 'skills'), { recursive: true });
      fs.mkdirSync(path.join(failRoot, 'agents'), { recursive: true });
      const failMark = path.join(tmp(), 'fail-mark');
      const markHook = (exit) => `require('fs').appendFileSync(${JSON.stringify(failMark)}, require('path').basename(process.argv[1]) + '\\n');process.stdin.resume();process.stdin.on('end',()=>process.exit(${exit}));`;
      for (const hook of ['run-lock', 'ledger-guard', 'green-gate', 'update-check', 'slicetree-sweep', 'scope-prune', 'model-explicit']) {
        write(failRoot, `hooks/${hook}.js`, markHook(0));
      }
      write(failRoot, 'hooks/merge-guard.js', `require('fs').appendFileSync(${JSON.stringify(failMark)}, 'merge-guard.js\\n');process.stderr.write('merge-guard refused');process.exit(2);`);
      const failDest = tmp();
      render({ harness: 'opencode', pluginRoot: failRoot, dest: failDest, modelMap: new Map() });
      const { server: FailPlugin } = require(path.join(failDest, '.opencode', 'plugins', 'superdev.js'));
      const failPlugin = await FailPlugin({ directory: failDest });
      const marks = () => (fs.existsSync(failMark) ? fs.readFileSync(failMark, 'utf8') : '');

      const realErr = console.error;
      // The rendered bridge arms its kill timer through the global setTimeout right after spawn(), at
      // call time. A faked timeout child sets `fastKill`, so the kill timer armed for it fires at once
      // instead of after the real ceiling; every real hook spawned after it keeps the real ceiling.
      const realSetTimeout = global.setTimeout;
      global.setTimeout = (fn, ms, ...rest) => {
        const fast = fastKill && ms === BRIDGE_HOOK_TIMEOUT_MS;
        if (fast) fastKill = false;
        return realSetTimeout(fn, fast ? 0 : ms, ...rest);
      };
      // One bash tool call against a queue of spawn outcomes, one per spawn attempt in order. It
      // returns what the operator would see: whether the call threw, how many spawns were
      // attempted, and every notice printed.
      const call = async (outcomes, hookCall) => {
        queue = outcomes.slice();
        attempts = 0;
        const notices = [];
        console.error = (m) => notices.push(String(m));
        let threw = null;
        try {
          await hookCall();
        } catch (e) {
          threw = e;
        } finally {
          console.error = realErr;
        }
        return { threw, attempts, notices: notices.join('\n') };
      };
      const bash = (command) => () => failPlugin['tool.execute.before']({ tool: 'bash', sessionID: 'x' }, { args: { command } });
      const newSession = () => failPlugin.event({ event: { type: 'session.created' } });

      try {
        // EMFILE: no stdio, 'error' next tick. The call must proceed after one retry on the same
        // hook, noticed.
        await newSession();
        let r = await call([['noStdio', 'EMFILE'], ['noStdio', 'EMFILE']], bash('ls'));
        assert.equal(r.threw, null, `an EMFILE spawn failure does not block the call (got: ${r.threw && r.threw.message})`);
        assert.equal(r.attempts, BRIDGE_SHELL_BEFORE_HOOKS.length + 1, 'the failing hook is retried once (2), then each remaining hook spawns for real (1 each)');
        assert.doesNotMatch(marks(), /merge-guard\.js/, 'the retried hook never started, so its mark is absent');
        assert.match(r.notices, /merge-guard[\s\S]*EMFILE/, 'the notice names the hook and EMFILE');
        assert.match(r.notices, /out of processes, file descriptors, or memory/, 'and names the transient class');

        // ENFILE shares EMFILE's shape: no stdio, 'error' next tick, retried once, then noticed.
        await newSession();
        r = await call([['noStdio', 'ENFILE'], ['noStdio', 'ENFILE']], bash('ls'));
        assert.equal(r.threw, null, `an ENFILE spawn failure does not block the call (got: ${r.threw && r.threw.message})`);
        assert.equal(r.attempts, BRIDGE_SHELL_BEFORE_HOOKS.length + 1, 'the failing hook is retried once, then each remaining hook spawns for real');
        assert.match(r.notices, /merge-guard[\s\S]*ENFILE/, 'the notice names the hook and ENFILE');
        assert.match(r.notices, /out of processes, file descriptors, or memory/, 'and names the transient class');

        // ENOMEM: spawn() throws synchronously. Both failures land on the same hook, retried once,
        // then proceeds with a notice.
        await newSession();
        fs.rmSync(failMark, { force: true });
        r = await call([['throws', 'ENOMEM'], ['throws', 'ENOMEM']], bash('ls'));
        assert.equal(r.threw, null, `an ENOMEM spawn failure does not block the call (got: ${r.threw && r.threw.message})`);
        assert.equal(r.attempts, BRIDGE_SHELL_BEFORE_HOOKS.length + 1, 'the failing hook is retried once (2), then each remaining hook spawns for real (1 each)');
        assert.doesNotMatch(marks(), /merge-guard\.js/, 'the retried hook never started, so its mark is absent');
        assert.match(r.notices, /ENOMEM/, 'the notice names ENOMEM');
        assert.match(r.notices, /out of processes, file descriptors, or memory/, 'and names the transient class');

        // EAGAIN once, then a clean start: the hook runs and its own verdict applies, and nothing is
        // noticed. merge-guard refuses every call here, so a clean retry must still block.
        await newSession();
        fs.rmSync(failMark, { force: true });
        r = await call([['event', 'EAGAIN']], bash('merge x'));
        assert.ok(r.threw && /merge-guard refused/.test(r.threw.message), 'a retry that starts runs the hook, and its refusal still blocks');
        assert.equal((marks().match(/merge-guard\.js/g) || []).length, 1, 'the hook ran once, on the retry');
        assert.doesNotMatch(r.notices, /could not start/, 'a transient failure that clears on the retry prints no notice');

        // EAGAIN twice: exactly two attempts for that hook, then the call proceeds, noticed.
        await newSession();
        r = await call([['event', 'EAGAIN'], ['event', 'EAGAIN'], ['event', 'EAGAIN'], ['event', 'EAGAIN'], ['event', 'EAGAIN'], ['event', 'EAGAIN']], bash('ls'));
        assert.equal(r.threw, null, 'two EAGAIN failures in a row do not block the call');
        assert.equal(r.attempts, BRIDGE_SHELL_BEFORE_HOOKS.length * 2, 'each hook is attempted exactly twice, never more');
        assert.match(r.notices, /EAGAIN/, 'the notice names EAGAIN');
        assert.match(r.notices, /out of processes, file descriptors, or memory/, 'as the transient class');

        // ENOENT and EACCES: installation class, one attempt, no retry, noticed as installation.
        for (const code of ['ENOENT', 'EACCES']) {
          await newSession();
          r = await call(BRIDGE_SHELL_BEFORE_HOOKS.map(() => ['event', code]), bash('ls'));
          assert.equal(r.threw, null, `${code} does not block the call`);
          assert.equal(r.attempts, BRIDGE_SHELL_BEFORE_HOOKS.length, `${code} is not retried`);
          assert.match(r.notices, new RegExp(code), `the notice names ${code}`);
          assert.match(r.notices, /installation problem/, `${code} is noticed as an installation problem`);
        }

        // A code outside both lists is answered as installation: no retry.
        await newSession();
        r = await call(BRIDGE_SHELL_BEFORE_HOOKS.map(() => ['throws', 'EPERM']), bash('ls'));
        assert.equal(r.threw, null, 'an unlisted code does not block the call');
        assert.equal(r.attempts, BRIDGE_SHELL_BEFORE_HOOKS.length, 'an unlisted code is not retried');
        assert.match(r.notices, /EPERM[\s\S]*installation problem/, 'and is noticed as an installation problem');

        // A killed spawn still blocks and is never retried (INV-0009).
        await newSession();
        r = await call([['killed']], bash('ls'));
        assert.ok(r.threw && /killed \(SIGKILL\)/.test(r.threw.message), 'a killed spawn still blocks the call');
        assert.equal(r.attempts, 1, 'a killed spawn is never retried');

        // A spawn that outlived its bound and whose kill succeeds blocks, never retried (INV-0009).
        await newSession();
        r = await call([['timedOut']], bash('ls'));
        assert.ok(r.threw && /killed \(SIGTERM\)/.test(r.threw.message), `a timed-out spawn whose kill succeeds blocks (got: ${r.threw && r.threw.message})`);
        assert.equal(r.attempts, 1, 'a timed-out spawn is never retried');

        // #707: a spawn that outlived its bound and whose kill fails carries no verdict either. It
        // blocks at once, naming the timeout and the kill's code, is never retried, and is never
        // noticed as a spawn failure (INV-0009, INV-0097).
        await newSession();
        r = await call([['killFails', 'EPERM']], bash('ls'));
        assert.ok(r.threw, 'a timed-out spawn whose kill fails blocks the call');
        assert.match(r.threw.message, /timed out/, 'the reason names the timeout');
        assert.match(r.threw.message, /EPERM/, "the reason names the kill's code");
        assert.equal(r.attempts, 1, 'a timed-out spawn whose kill fails is never retried');
        assert.doesNotMatch(r.notices, /could not start/, 'and is never noticed as a spawn failure');

        // The same on a session hook: its failed kill is answered like a killed one, swallowed, and
        // the next session hook still runs.
        await newSession();
        fs.rmSync(failMark, { force: true });
        r = await call([['killFails', 'EPERM']], () => failPlugin.event({ event: { type: 'session.idle' } }));
        assert.doesNotMatch(r.notices, /could not start/, "a session hook's failed kill is not noticed as a spawn failure");
        assert.match(marks(), /scope-prune\.js/, 'the next session hook still runs');

        // A session hook's spawn failure is retried and noticed by the same rules, never skipped
        // in silence: slicetree-sweep fails transiently twice, scope-prune still runs after it.
        await newSession();
        fs.rmSync(failMark, { force: true });
        r = await call([['event', 'EAGAIN'], ['event', 'EAGAIN']], () => failPlugin.event({ event: { type: 'session.idle' } }));
        assert.match(r.notices, /slicetree-sweep[\s\S]*EAGAIN/, 'a session hook that could not start is noticed, naming the code');
        assert.match(marks(), /scope-prune\.js/, 'the next session hook still runs');

        // Once per hook, per session boundary, for a transient failure too.
        await newSession();
        await call([['event', 'EAGAIN'], ['event', 'EAGAIN'], ['event', 'EAGAIN'], ['event', 'EAGAIN']], bash('ls'));
        const r2 = await call([['event', 'EAGAIN'], ['event', 'EAGAIN']], bash('ls'));
        assert.doesNotMatch(r2.notices, /merge-guard could not start|hook merge-guard/, 'a second failure of the same hook in one session prints no second notice');
      } finally {
        cp.spawn = realSpawn;
        console.error = realErr;
        global.setTimeout = realSetTimeout;
      }
    }

    // Regression: a hook that never reads stdin (a require() failure before main() runs, the
    // documented slicetree-sweep/scope-prune shape) must not turn a >64KB command payload into an
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

    // Session events: created → update-check; idle and deleted → slicetree-sweep + scope-prune;
    // an unknown event spawns nothing.
    await plugin.event({ event: { type: 'session.created' } });
    assert.equal(count('update-check'), 1);
    await plugin.event({ event: { type: 'session.idle' } });
    await plugin.event({ event: { type: 'session.deleted' } });
    assert.equal(count('slicetree-sweep'), 2);
    assert.equal(count('scope-prune'), 2);
    await plugin.event({ event: { type: 'session.updated' } });
    await plugin.event({});
    assert.equal(count('slicetree-sweep'), 2, 'unknown and malformed events spawn nothing');

    // CLI integration: the CLI writes the bridge into --dest and reports it.
    {
      const cliDest = tmp();
      const res = require('node:child_process').spawnSync(
        process.execPath,
        [adapterPath, '--harness', 'opencode', '--plugin-root', pluginRoot, '--dest', cliDest, '--model-map', 'sonnet=acme/sonnet-1', '--model-map', 'opus=acme/opus-1'],
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
        [adapterPath, '--harness', 'opencode', '--plugin-root', pluginRoot, '--dest', cliDest2, '--model-map', 'opus=acme/opus-1'],
        {
          encoding: 'utf8',
          input: '1\n',
          cwd: invocationDir2,
          env: Object.assign({}, process.env, { OPENCODE_CONFIG: '', HOME: invocationDir2 }),
        },
      );
      assert.equal(res2.status, 0, res2.stderr);
      const sonnetAgent2 = fs.readFileSync(path.join(cliDest2, '.opencode', 'agents', 'implementer.md'), 'utf8');
      assert.ok(sonnetAgent2.includes('model: acme/interactive-sonnet-1'), 'the missing sonnet alias resolves to the interactively picked model');
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
        [adapterPath, '--harness', 'opencode', '--plugin-root', pluginRoot, '--dest', cliDest3],
        {
          encoding: 'utf8',
          input: '',
          cwd: eofInvocationDir,
          env: Object.assign({}, process.env, { OPENCODE_CONFIG: '', HOME: eofInvocationDir }),
          timeout: 5000,
        },
      );
      assertSpawnDecided(res3, 'spawning the adapter CLI over EOF stdin');
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
        [adapterPath, '--harness', 'opencode', '--plugin-root', pluginRoot, '--dest', cliDest4],
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
      assertSpawnDecided(res4, 'spawning the adapter CLI with piped multi-alias input');
      assert.equal(res4.status, 0, res4.stderr);
      const sonnetAgent4 = fs.readFileSync(path.join(cliDest4, '.opencode', 'agents', 'implementer.md'), 'utf8');
      assert.ok(sonnetAgent4.includes('model: acme/multi-a'), "the first missing alias ('sonnet') resolves from the first queued answer");
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
        [adapterPath, '--harness', 'opencode', '--plugin-root', pluginRoot, '--dest', cliDest5],
        {
          encoding: 'utf8',
          input: '1\n1\n',
          cwd: invocationDir,
          env: Object.assign({}, process.env, { OPENCODE_CONFIG: '', HOME: homeDir }),
          timeout: 5000,
        },
      );
      assertSpawnDecided(res5, 'spawning the adapter CLI with a --dest-scoped model config');
      assert.equal(res5.status, 0, res5.stderr);
      const sonnetAgent5 = fs.readFileSync(path.join(cliDest5, '.opencode', 'agents', 'implementer.md'), 'utf8');
      assert.ok(sonnetAgent5.includes('model: acme/from-dest-project'), 'the picker offers the --dest project\'s own models, not the invocation directory\'s');
      assert.ok(!sonnetAgent5.includes('model: acme/from-invocation-dir'), 'the invocation directory\'s config is never consulted');
    }

    delete process.env.BRIDGE_MARK;

    // Refusals and defaults: a missing harness defaults to opencode, an unknown harness, a
    // missing dest, a malformed --model-map, a model alias with no mapping (named, for each of the
    // two agents), and a plugin root with no skills directory (named) all refuse. Agents are the
    // only surface a model alias reaches now: a skill's own pin is dropped (ADR 0055).
    assert.equal(parseArgs(['--dest', 'x']).harness, 'opencode');
    refuses(() => parseArgs(['--harness', 'cursor', '--dest', 'x']), "unknown harness 'cursor'");
    refuses(() => parseArgs(['--harness', 'opencode']), 'missing --dest');
    refuses(() => parseArgs(['--harness', 'opencode', '--dest', 'x', '--model-map', 'sonnet']), '<alias>=<provider/model>');
    refuses(
      () => render({ harness: 'opencode', pluginRoot, dest: tmp(), modelMap: new Map([['opus', 'acme/opus-1']]) }),
      "no --model-map entry for model alias 'sonnet' (agent implementer)",
    );
    refuses(
      () => render({ harness: 'opencode', pluginRoot, dest: tmp(), modelMap: new Map([['sonnet', 'acme/sonnet-1']]) }),
      "no --model-map entry for model alias 'opus' (agent final-reviewer)",
    );
    refuses(
      () => render({ harness: 'opencode', pluginRoot: tmp(), dest: tmp(), modelMap }),
      'skills directory',
    );

    // The fake terminal below feeds the next queued answer only once it sees the prompt that asks
    // for it — a real terminal never hands over the next keystroke before the question is on
    // screen, and readline drops a line typed before anyone asked for it.
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

    // resolveModelMap: an alias --model-map already covers never reaches queryOpenCodeModels or the
    // interactive prompt at all — the same map comes back unchanged, and the fake terminal captures
    // no output. This is the CI-safe path: no --model-map entry missing means nothing here ever
    // touches stdin/stdout.
    {
      const root = tmp();
      fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
      write(root, 'agents/onlysonnet.md', ['---', 'name: onlysonnet', 'description: only sonnet', 'model: sonnet', '---', '', 'body', ''].join('\n'));
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
      fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
      write(root, 'agents/covered.md', ['---', 'name: covered', 'description: sonnet, already mapped', 'model: sonnet', '---', '', 'body', ''].join('\n'));
      write(root, 'agents/needsprompt.md', ['---', 'name: needsprompt', 'description: opus, missing from --model-map', 'model: opus', '---', '', 'body', ''].join('\n'));
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
    // report, e.g. no OpenCode config found anywhere) refuses gracefully instead of looping
    // forever on a picker with nothing to pick, or crashing with a raw error — and never opens a
    // readline interface over the input at all, since there is nothing to prompt for.
    {
      const root = tmp();
      fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
      write(root, 'agents/needsprompt.md', ['---', 'name: needsprompt', 'description: no model configured anywhere', 'model: opus', '---', '', 'body', ''].join('\n'));
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

    // The Codex harness (issue #431): every shipped skill except afk renders to
    // .agents/skills/superdev-<name>/SKILL.md, name equal to its directory, afk renders nowhere, and
    // the prose rewrite uses Codex's own $superdev-<name> invocation and a plain name for a withheld
    // surface.
    {
      const codexRoot = tmp();
      write(codexRoot, 'skills/plan/SKILL.md', [
        '---',
        'name: plan',
        'description: Plan a feature. Run before /superdev:implement.',
        '---',
        '',
        '# superdev plan',
        '',
        'Read ${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md, then dispatch `superdev:implementer`.',
        'Mentions /superdev:afk stay rewritten even though afk itself is not rendered.',
        '',
      ].join('\n'));
      write(codexRoot, 'skills/implement/SKILL.md', ['---', 'name: implement', 'description: Build a plan.', '---', '', 'Resolve `$ARGUMENTS` to one feature.', ''].join('\n'));
      write(codexRoot, 'skills/afk/SKILL.md', ['---', 'name: afk', 'description: Drive the chain unattended.', '---', '', '# superdev afk', '', 'body', ''].join('\n'));
      write(codexRoot, 'skills/ship/SKILL.md', ['---', 'name: ship', 'description: Merge a superdev scope pull request.', 'disable-model-invocation: true', '---', '', '# superdev ship', '', 'body', ''].join('\n'));
      write(codexRoot, 'skills/upgrade/SKILL.md', ['---', 'name: upgrade', 'description: Upgrade via claude plugin update.', '---', '', 'Run claude plugin marketplace update superdev.', ''].join('\n'));
      write(codexRoot, 'agents/implementer.md', ['---', 'name: implementer', 'description: Slice implementer.', 'tools: Read, Edit, Write, Bash', 'model: sonnet', '---', '', 'body', ''].join('\n'));
      write(codexRoot, 'agents/reviewer.md', ['---', 'name: reviewer', 'description: Read-only reviewer. Dispatched by /superdev:implement — not for direct use.', 'tools: Read, Grep, Bash', 'model: sonnet', '---', '', 'reviewer body', ''].join('\n'));

      const codexDest = tmp();
      write(codexDest, 'unrelated/keep.txt', 'not generated\n');
      const codexModelMap = new Map([['sonnet', 'acme/sonnet-1']]);
      const codexWritten = render({ harness: 'codex', pluginRoot: codexRoot, dest: codexDest, modelMap: codexModelMap });

      assert.deepEqual(codexWritten, [
        path.join('.agents', 'skills', 'superdev-implement', 'SKILL.md'),
        path.join('.agents', 'skills', 'superdev-plan', 'SKILL.md'),
        path.join('.agents', 'skills', 'superdev-upgrade', 'SKILL.md'),
        path.join('.codex', 'agents', 'superdev-implementer.toml'),
        path.join('.codex', 'agents', 'superdev-reviewer.toml'),
        path.join('.codex', 'hooks.json'),
      ]);
      assert.ok(fs.existsSync(path.join(codexDest, 'unrelated', 'keep.txt')), 'a foreign file under --dest survives');

      const codexImplementerToml = fs.readFileSync(path.join(codexDest, '.codex', 'agents', 'superdev-implementer.toml'), 'utf8');
      assert.ok(codexImplementerToml.startsWith(`${CODEX_AGENT_MARKER}\n`), 'carries the agent marker as a leading TOML comment');
      assert.ok(codexImplementerToml.includes('name = "superdev-implementer"'), 'name is prefixed the same way a rendered skill is');
      assert.ok(codexImplementerToml.includes('description = "Slice implementer."'));
      assert.ok(codexImplementerToml.includes('model = "acme/sonnet-1"'), 'model is the mapped provider model, never the Claude alias');
      assert.ok(codexImplementerToml.includes('sandbox_mode = "workspace-write"'), 'Edit/Write in tools: maps to workspace-write');
      assert.ok(codexImplementerToml.includes('developer_instructions = "body\\n"'), 'the canonical body becomes developer_instructions');

      const codexReviewerToml = fs.readFileSync(path.join(codexDest, '.codex', 'agents', 'superdev-reviewer.toml'), 'utf8');
      assert.ok(codexReviewerToml.includes('sandbox_mode = "read-only"'), 'no Edit/Write in tools: maps to read-only');
      assert.ok(!codexReviewerToml.includes('workspace-write'), 'a read-only agent never carries workspace-write');
      assert.ok(codexReviewerToml.includes('description = "Read-only reviewer. Dispatched by $superdev-implement'), "description gets the same /superdev:<cmd> rewrite the body does");
      assert.ok(!codexReviewerToml.includes('/superdev:implement'), 'no raw /superdev:<cmd> token survives in a rendered agent description');

      const codexPlan = fs.readFileSync(path.join(codexDest, '.agents', 'skills', 'superdev-plan', 'SKILL.md'), 'utf8');
      assert.ok(codexPlan.startsWith(`---\n${CODEX_SKILL_MARKER}\nname: superdev-plan\ndescription:`), 'carries the marker and the prefixed name');
      assert.ok(codexPlan.includes('dispatch `superdev-implementer`'), 'a bare agent token becomes the name the rendered Codex agent TOML actually carries');
      assert.ok(codexPlan.includes('Mentions afk stay rewritten'), 'a withheld surface renders as its plain name, with no invocation token');
      assert.ok(!codexPlan.includes('$superdev-afk'), 'afk never carries the $superdev-afk invocation token');
      assert.ok(codexPlan.includes('$superdev-implement'), "a skill's own token becomes Codex's own $superdev-<name> invocation");

      const codexImplement = fs.readFileSync(path.join(codexDest, '.agents', 'skills', 'superdev-implement', 'SKILL.md'), 'utf8');
      assert.ok(!codexImplement.includes('$ARGUMENTS'), 'no literal $ARGUMENTS token survives a rendered Codex skill');

      const codexUpgrade = fs.readFileSync(path.join(codexDest, '.agents', 'skills', 'superdev-upgrade', 'SKILL.md'), 'utf8');
      assert.ok(!codexUpgrade.includes('claude plugin'), "upgrade's synthesized Codex body names no claude plugin command");
      assert.ok(codexUpgrade.includes('--harness codex'), 're-runs the adapter with --harness codex');
      assert.ok(codexUpgrade.includes('--model-map "sonnet=acme/sonnet-1"'), "carries the resolved model-map forward, re-emitted verbatim");

      assert.ok(!fs.existsSync(path.join(codexDest, '.agents', 'skills', 'superdev-afk')), 'afk renders nowhere on Codex');
      assert.ok(!fs.existsSync(path.join(codexDest, '.agents', 'skills', 'superdev-ship')), 'ship renders nowhere on Codex');

      // .codex/hooks.json (issue #433): every shipped hook except model-explicit, wired to Codex's
      // own events, every command path absolute (Codex resolves no ${CLAUDE_PLUGIN_ROOT}).
      const codexHooks = JSON.parse(fs.readFileSync(path.join(codexDest, '.codex', 'hooks.json'), 'utf8'));
      const hookPath = (name) => path.join(codexRoot, 'hooks', `${name}.js`);
      const commandsOf = (entries) => entries.flatMap((e) => e.hooks.map((h) => h.command));

      assert.deepEqual(
        commandsOf(codexHooks.hooks.SessionStart),
        [`node ${JSON.stringify(hookPath('update-check'))}`],
        'SessionStart wires update-check',
      );

      const bashPre = codexHooks.hooks.PreToolUse.find((e) => e.matcher === 'Bash');
      assert.deepEqual(
        commandsOf([bashPre]),
        ['merge-guard', 'run-lock', 'ledger-guard'].map((h) => `node ${JSON.stringify(hookPath(h))}`),
        'PreToolUse/Bash wires merge-guard, run-lock, ledger-guard',
      );

      const editPre = codexHooks.hooks.PreToolUse.find((e) => e.matcher !== 'Bash');
      assert.ok(/apply_patch/.test(editPre.matcher), 'the edit matcher covers apply_patch');
      assert.ok(/Edit/.test(editPre.matcher) && /Write/.test(editPre.matcher), 'the edit matcher still covers Edit and Write');
      assert.deepEqual(commandsOf([editPre]), [`node ${JSON.stringify(hookPath('ledger-guard'))}`], 'the edit matcher wires ledger-guard');

      const bashPost = codexHooks.hooks.PostToolUse.find((e) => e.matcher === 'Bash');
      assert.equal(bashPost.hooks[0].command, `node ${JSON.stringify(hookPath('green-gate'))}`, 'PostToolUse/Bash wires green-gate');
      assert.equal(
        bashPost.hooks[0].timeout,
        Math.round(BRIDGE_HOOK_TIMEOUT_MS / 1000),
        "green-gate's Codex timeout is derived from BRIDGE_HOOK_TIMEOUT_MS, not a literal of its own",
      );

      assert.deepEqual(
        commandsOf(codexHooks.hooks.Stop),
        ['slicetree-sweep', 'scope-prune'].map((h) => `node ${JSON.stringify(hookPath(h))}`),
        'Stop wires slicetree-sweep and scope-prune',
      );

      const rendered = JSON.stringify(codexHooks);
      assert.ok(!/model-explicit/.test(rendered), 'model-explicit appears nowhere in the rendered file (ADR 0056)');

      // Rendered against the real plugin root (not the synthetic codexRoot fixture, which carries
      // no hooks/ directory), every emitted command path resolves to a file that actually exists.
      const realRoot = path.join(__dirname, '..', 'plugin');
      const realDest = tmp();
      const realModelMap = new Map([['haiku', 'acme/haiku'], ['sonnet', 'acme/sonnet'], ['opus', 'acme/opus']]);
      render({ harness: 'codex', pluginRoot: realRoot, dest: realDest, modelMap: realModelMap });
      const realHooks = JSON.parse(fs.readFileSync(path.join(realDest, '.codex', 'hooks.json'), 'utf8'));
      const realCommands = [
        ...commandsOf(realHooks.hooks.SessionStart),
        ...commandsOf(realHooks.hooks.PreToolUse),
        ...commandsOf(realHooks.hooks.PostToolUse),
        ...commandsOf(realHooks.hooks.Stop),
      ];
      for (const command of realCommands) {
        const p = JSON.parse(command.slice('node '.length));
        assert.ok(path.isAbsolute(p), `${p} is an absolute path`);
        assert.ok(fs.existsSync(p), `${p} resolves to a file that exists`);
      }

      // A pre-existing .codex/hooks.json this render did not itself produce refuses before anything
      // else is written — no other render target left half-written — and the file itself is
      // untouched (issue #433).
      {
        const refusedDest = tmp();
        write(refusedDest, '.codex/hooks.json', '{"hooks": {"custom": true}}\n');
        const before = fs.readFileSync(path.join(refusedDest, '.codex', 'hooks.json'), 'utf8');
        refuses(
          () => render({ harness: 'codex', pluginRoot: codexRoot, dest: refusedDest, modelMap: codexModelMap }),
          '.codex/hooks.json',
        );
        const after = fs.readFileSync(path.join(refusedDest, '.codex', 'hooks.json'), 'utf8');
        assert.equal(after, before, 'the pre-existing hooks.json is left untouched');
        assert.ok(!fs.existsSync(path.join(refusedDest, '.agents')), 'no other render target is left half-written');
        assert.ok(!fs.existsSync(path.join(refusedDest, '.codex', 'agents')), 'no other render target is left half-written');
      }

      // Idempotent: a consumer's own skill and agent survive a re-render untouched, a removed
      // shipped skill or agent leaves no orphan, and a second render over the same dest is
      // byte-identical.
      write(codexDest, '.agents/skills/superdev-notes/SKILL.md', ['---', 'name: superdev-notes', 'description: a consumer skill', '---', '', 'mine', ''].join('\n'));
      write(codexDest, '.codex/agents/reviewer.toml', 'name = "reviewer"\ndescription = "a consumer agent"\n');
      // A foreign agent TOML whose developer_instructions merely quotes the marker sentence
      // (documenting it, say) is not itself marker-tagged — the marker check must look only at the
      // leading comment line, not the whole file, or a quote like this reads as a stale superdev
      // render and gets deleted.
      write(codexDest, '.codex/agents/quoter.toml', `name = "quoter"\ndescription = "quotes the marker"\ndeveloper_instructions = ${JSON.stringify(`See: \`${CODEX_AGENT_MARKER}\``)}\n`);
      fs.rmSync(path.join(codexRoot, 'skills', 'implement'), { recursive: true, force: true });
      fs.rmSync(path.join(codexRoot, 'agents', 'reviewer.md'));
      render({ harness: 'codex', pluginRoot: codexRoot, dest: codexDest, modelMap: codexModelMap });
      assert.ok(fs.existsSync(path.join(codexDest, '.agents', 'skills', 'superdev-notes', 'SKILL.md')), "a consumer's own skill survives a re-render");
      assert.ok(!fs.existsSync(path.join(codexDest, '.agents', 'skills', 'superdev-implement')), 'a skill removed from the shipped tree leaves no orphan');
      assert.ok(fs.existsSync(path.join(codexDest, '.codex', 'agents', 'reviewer.toml')), "a consumer's own .codex/agents/reviewer.toml survives a re-render untouched");
      assert.ok(!fs.existsSync(path.join(codexDest, '.codex', 'agents', 'superdev-reviewer.toml')), 'an agent removed from the shipped tree leaves no orphan');
      assert.ok(fs.existsSync(path.join(codexDest, '.codex', 'agents', 'quoter.toml')), 'a foreign agent that merely quotes the marker in its body survives');

      const beforeSecond = fs.readFileSync(path.join(codexDest, '.agents', 'skills', 'superdev-plan', 'SKILL.md'), 'utf8');
      const beforeSecondAgent = fs.readFileSync(path.join(codexDest, '.codex', 'agents', 'superdev-implementer.toml'), 'utf8');
      render({ harness: 'codex', pluginRoot: codexRoot, dest: codexDest, modelMap: codexModelMap });
      const afterSecond = fs.readFileSync(path.join(codexDest, '.agents', 'skills', 'superdev-plan', 'SKILL.md'), 'utf8');
      const afterSecondAgent = fs.readFileSync(path.join(codexDest, '.codex', 'agents', 'superdev-implementer.toml'), 'utf8');
      assert.equal(beforeSecond, afterSecond, 'a second render over the same dest is byte-identical (skill)');
      assert.equal(beforeSecondAgent, afterSecondAgent, 'a second render over the same dest is byte-identical (agent)');

      // A dest with no .agents/skills/ or .codex/agents/ yet renders cleanly.
      const freshDest = tmp();
      render({ harness: 'codex', pluginRoot: codexRoot, dest: freshDest, modelMap: codexModelMap });
      assert.ok(fs.existsSync(path.join(freshDest, '.agents', 'skills', 'superdev-plan', 'SKILL.md')));
      assert.ok(fs.existsSync(path.join(freshDest, '.codex', 'agents', 'superdev-implementer.toml')));
    }

    // Every shipped agent renders (issue #432): asserted over the discovered set, never a hardcoded
    // count (ADR 0064) — a plugin root carrying N agents produces N rendered .toml files, each
    // carrying name/description/developer_instructions/model.
    {
      const allAgentsRoot = tmp();
      write(allAgentsRoot, 'skills/plan/SKILL.md', ['---', 'name: plan', 'description: Plan.', '---', '', 'body', ''].join('\n'));
      const agentDefs = [
        ['a-one', 'Read'],
        ['a-two', 'Read, Grep, Bash'],
        ['a-three', 'Read, Edit, Bash'],
      ];
      for (const [name, tools] of agentDefs) {
        write(allAgentsRoot, `agents/${name}.md`, ['---', `name: ${name}`, `description: Agent ${name}.`, `tools: ${tools}`, 'model: sonnet', '---', '', `${name} body`, ''].join('\n'));
      }
      const allAgentsDest = tmp();
      const allAgentsWritten = render({ harness: 'codex', pluginRoot: allAgentsRoot, dest: allAgentsDest, modelMap: new Map([['sonnet', 'acme/sonnet-1']]) });
      const renderedAgentFiles = allAgentsWritten.filter((rel) => rel.startsWith(path.join('.codex', 'agents')));
      assert.equal(renderedAgentFiles.length, agentDefs.length, 'every shipped agent renders, exactly one .toml apiece');
      for (const [name] of agentDefs) {
        const text = fs.readFileSync(path.join(allAgentsDest, '.codex', 'agents', `superdev-${name}.toml`), 'utf8');
        for (const key of ['name', 'description', 'developer_instructions', 'model']) {
          assert.ok(text.includes(`${key} = `), `superdev-${name}.toml carries ${key}`);
        }
      }
    }

    // A TOML round-trip: a body carrying a triple-quote, a backslash, a `#`, and `: ` renders as a
    // valid TOML string that reads back byte-identical (verified against Python's stdlib `tomllib`
    // parser during development — no TOML dependency is installed in this repo, so this assertion
    // reads the rendered string back with the adapter's own escaping rules, run in reverse via
    // JSON.parse: a TOML basic string's escape set is exactly JSON's, so the value this produces is
    // simultaneously valid JSON and valid TOML, and JSON.parse is a correct, independent reader of it).
    {
      const tomlRoot = tmp();
      write(tomlRoot, 'skills/plan/SKILL.md', ['---', 'name: plan', 'description: Plan.', '---', '', 'body', ''].join('\n'));
      const trickyBody = 'has """triple""" quotes, a back\\slash, a # hash, and a key: value pair.';
      write(tomlRoot, 'agents/tricky.md', ['---', 'name: tricky', 'description: Tricky body.', 'tools: Read', 'model: sonnet', '---', '', trickyBody, ''].join('\n'));
      const tomlDest = tmp();
      render({ harness: 'codex', pluginRoot: tomlRoot, dest: tomlDest, modelMap: new Map([['sonnet', 'acme/sonnet-1']]) });
      const tomlText = fs.readFileSync(path.join(tomlDest, '.codex', 'agents', 'superdev-tricky.toml'), 'utf8');
      const match = tomlText.match(/^developer_instructions = (".*")$/m);
      assert.ok(match, 'developer_instructions renders as one quoted TOML/JSON string');
      assert.equal(JSON.parse(match[1]), `${trickyBody}\n`, 'the TOML string parses back to the byte-identical source body');
    }

    // A --model-map miss on an alias an agent uses exits nonzero naming the alias and the flag, and
    // writes nothing — not even the skills a working model map would otherwise render.
    {
      const missingRoot = tmp();
      write(missingRoot, 'skills/plan/SKILL.md', ['---', 'name: plan', 'description: Plan.', '---', '', 'body', ''].join('\n'));
      write(missingRoot, 'agents/implementer.md', ['---', 'name: implementer', 'description: Slice implementer.', 'tools: Read', 'model: opus', '---', '', 'body', ''].join('\n'));
      const missingDest = tmp();
      const err = await thrown(() => render({ harness: 'codex', pluginRoot: missingRoot, dest: missingDest, modelMap: new Map() }));
      assert.ok(err, 'refuses instead of rendering with an unresolved model alias');
      assert.equal(err.isRefusal, true);
      assert.ok(err.message.includes("'opus'"), 'names the unresolved alias');
      assert.ok(err.message.includes('--model-map'), 'names the flag to pass instead');
      assert.ok(!fs.existsSync(path.join(missingDest, '.codex')), 'writes nothing under .codex on refusal');
      assert.ok(!fs.existsSync(path.join(missingDest, '.agents')), 'writes nothing at all on refusal, not even the skills a working model map would render');
    }

    // --harness codex is a valid CLI value, and its interactive model-map fallback never runs (ADR
    // 0056: querying an OpenCode config says nothing about a Codex install): a plugin root whose
    // agent needs a --model-map entry the CLI is never given exits nonzero immediately — never hangs
    // waiting on a prompt nobody can answer over EOF stdin — naming the alias and the flag. The same
    // CLI given a covering --model-map renders both the skill and the agent TOML successfully.
    {
      const cliCodexRoot = tmp();
      write(cliCodexRoot, 'skills/plan/SKILL.md', ['---', 'name: plan', 'description: Plan a feature.', '---', '', 'body', ''].join('\n'));
      write(cliCodexRoot, 'agents/implementer.md', ['---', 'name: implementer', 'description: Slice implementer.', 'tools: Read', 'model: sonnet', '---', '', 'body', ''].join('\n'));

      const cliCodexDestRefused = tmp();
      const refusedRes = require('node:child_process').spawnSync(
        process.execPath,
        [adapterPath, '--harness', 'codex', '--plugin-root', cliCodexRoot, '--dest', cliCodexDestRefused],
        { input: '', encoding: 'utf8', timeout: 5000 },
      );
      assertSpawnDecided(refusedRes, 'spawning the adapter CLI under --harness codex over EOF stdin');
      assert.equal(refusedRes.status, 1);
      assert.ok(refusedRes.stderr.includes("'sonnet'"), 'names the unresolved alias');
      assert.ok(refusedRes.stderr.includes('--model-map'), 'names the flag to pass instead');
      assert.ok(!fs.existsSync(path.join(cliCodexDestRefused, '.agents')), 'a refused Codex render writes nothing to --dest');
      assert.ok(!fs.existsSync(path.join(cliCodexDestRefused, '.codex')), 'a refused Codex render writes nothing to --dest');

      const cliCodexDest = tmp();
      const res = require('node:child_process').spawnSync(
        process.execPath,
        [adapterPath, '--harness', 'codex', '--plugin-root', cliCodexRoot, '--dest', cliCodexDest, '--model-map', 'sonnet=acme/sonnet-1'],
        { input: '', encoding: 'utf8', timeout: 5000 },
      );
      assertSpawnDecided(res, 'spawning the adapter CLI under --harness codex with a covering --model-map');
      assert.equal(res.status, 0, res.stderr);
      assert.ok(fs.existsSync(path.join(cliCodexDest, '.agents', 'skills', 'superdev-plan', 'SKILL.md')), 'renders the skill with no prompt');
      assert.ok(fs.existsSync(path.join(cliCodexDest, '.codex', 'agents', 'superdev-implementer.toml')), 'renders the agent with the given --model-map, no prompt');
    }

    // End to end, the kill path: a fake hook that sleeps past a short bound, killed by a real
    // SIGTERM, reaching hookBlockReason with a real signal rather than the hand-built shape the
    // unit-level assertion above uses. BRIDGE_HOOK_TIMEOUT_MS is a module-load-time constant, baked
    // into the rendered bridge as a literal declaration at render time (600s in production, far too
    // long to wait on here). Rather than lowering the *tracked* hooks.json (a SIGTERM here runs no
    // `finally`, so a killed test process could leave the shipped manifest permanently bricked at a
    // 1s ceiling — the same kill path the merge gate itself relies on, post-merge, unattended), this
    // renders the bridge with the real adapter to an untracked temp destination and rewrites the
    // baked constant in that *emitted* file before loading it — the tracked hooks.json, and the
    // already-cached adapterPath module, are never touched.
    {
      const killRoot = tmp();
      fs.mkdirSync(path.join(killRoot, 'skills'), { recursive: true });
      fs.mkdirSync(path.join(killRoot, 'agents'), { recursive: true });
      // Sleeps well past the 1s bound, then would exit cleanly if never killed — proving the
      // bridge's own kill, not the hook's own exit code, is what the assertion below observes.
      write(killRoot, 'hooks/merge-guard.js', 'const start = Date.now(); while (Date.now() - start < 3000) {} process.exit(0);\n');
      write(killRoot, 'hooks/run-lock.js', 'process.exit(0);\n');
      write(killRoot, 'hooks/ledger-guard.js', 'process.exit(0);\n');
      const killDest = tmp();
      render({ harness: 'opencode', pluginRoot: killRoot, dest: killDest, modelMap: new Map() });
      const bridgePath = path.join(killDest, '.opencode', 'plugins', 'superdev.js');
      const renderedBridge = fs.readFileSync(bridgePath, 'utf8');
      const bakedConstant = `const BRIDGE_HOOK_TIMEOUT_MS = ${JSON.stringify(BRIDGE_HOOK_TIMEOUT_MS)};`;
      assert.ok(renderedBridge.includes(bakedConstant), 'the emitted bridge bakes the real ceiling as a literal declaration');
      fs.writeFileSync(bridgePath, renderedBridge.replace(bakedConstant, 'const BRIDGE_HOOK_TIMEOUT_MS = 1000;'));
      delete require.cache[bridgePath];
      const { server: KillPlugin } = require(bridgePath);
      const killPlugin = await KillPlugin({ directory: killDest });
      const killErr = await (async () => {
        try {
          await killPlugin['tool.execute.before']({ tool: 'bash', sessionID: 'kill1' }, { args: { command: 'ls' } });
          return null;
        } catch (e) {
          return e;
        }
      })();
      assert.ok(killErr, 'the bridge blocks the call it was gating once the ceiling kills the hook');
      assert.match(killErr.message, /killed/i, 'naming the kill');
      assert.match(killErr.message, /merge-guard/, 'and naming the hook the ceiling killed');

      // Ride-along: the Codex timeout derivation was asserted only by mirroring the same formula
      // the implementation uses (Math.round(BRIDGE_HOOK_TIMEOUT_MS / 1000)) — with the real constant
      // at 600000, a hand-written `timeout: 600` satisfies that mirror exactly, so a regression to a
      // literal would stay green. Proving genuine derivation needs a render whose own
      // BRIDGE_HOOK_TIMEOUT_MS actually differs from 600000 — a lowered manifest, read by a second,
      // independently-loaded copy of green-gate.js and adapter.js at a fresh, untracked path (never
      // the cached adapterPath, never the tracked hooks.json).
      const loweredPluginRoot = tmp();
      fs.mkdirSync(path.join(loweredPluginRoot, 'hooks'), { recursive: true });
      fs.mkdirSync(path.join(loweredPluginRoot, 'scripts'), { recursive: true });
      fs.copyFileSync(require.resolve('../plugin/hooks/green-gate.js'), path.join(loweredPluginRoot, 'hooks', 'green-gate.js'));
      fs.copyFileSync(adapterPath, path.join(loweredPluginRoot, 'scripts', 'adapter.js'));
      const realManifest = fs.readFileSync(path.join(path.dirname(require.resolve('../plugin/hooks/green-gate.js')), 'hooks.json'), 'utf8');
      fs.writeFileSync(path.join(loweredPluginRoot, 'hooks', 'hooks.json'), realManifest.replace('"timeout": 600', '"timeout": 1'));
      const loweredAdapter = require(path.join(loweredPluginRoot, 'scripts', 'adapter.js'));
      assert.equal(loweredAdapter.BRIDGE_HOOK_TIMEOUT_MS, 1000, 'the independently-loaded copy picks up its own lowered manifest');

      const codexKillDest = tmp();
      loweredAdapter.render({ harness: 'codex', pluginRoot: killRoot, dest: codexKillDest, modelMap: new Map() });
      const codexKillHooks = JSON.parse(fs.readFileSync(path.join(codexKillDest, '.codex', 'hooks.json'), 'utf8'));
      const bashPostKill = codexKillHooks.hooks.PostToolUse.find((e) => e.matcher === 'Bash');
      assert.equal(bashPostKill.hooks[0].timeout, 1, 'the emitted Codex timeout is the small derived value, which a hardcoded 600 could not satisfy');
    }
  } finally {
    for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log('adapter tests ok');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
