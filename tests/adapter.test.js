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

const adapterPath = require.resolve('../plugin/scripts/adapter.js');
const {
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
      path.join('.opencode', 'plugins', 'superdev.js'),
      path.join('.opencode', 'skills', 'superdev-backlog', 'SKILL.md'),
      path.join('.opencode', 'skills', 'superdev-implement', 'SKILL.md'),
      path.join('.opencode', 'skills', 'superdev-plan', 'SKILL.md'),
      path.join('.opencode', 'skills', 'superdev-setup', 'SKILL.md'),
      path.join('.opencode', 'skills', 'superdev-upgrade', 'SKILL.md'),
    ]);
    // afk renders as a command and never as a skill — a command is the one OpenCode surface the
    // model cannot invoke, which is what reproduces disable-model-invocation (ADR 0055).
    assert.ok(!written.includes(path.join('.opencode', 'skills', 'superdev-afk', 'SKILL.md')), 'afk is never a skill');
    assert.ok(!fs.existsSync(path.join(dest, '.opencode', 'skills', 'superdev-afk')), 'no afk skill directory exists');
    assert.ok(fs.existsSync(path.join(dest, '.opencode', 'commands', 'superdev', 'afk.md')), 'afk renders as a command');

    // The rendered afk names OpenCode's own skill tool and the rendered skill names it drives, never
    // Claude Code's Skill tool, and it states the headless launch line the operator actually uses.
    const afkCommand = fs.readFileSync(path.join(dest, '.opencode', 'commands', 'superdev', 'afk.md'), 'utf8');
    assert.ok(afkCommand.includes("with OpenCode's own `skill` tool"), 'names the OpenCode skill tool');
    for (const step of ['superdev-implement', 'superdev-review', 'superdev-document', 'superdev-ship']) {
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
  } finally {
    for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log('adapter tests ok');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
