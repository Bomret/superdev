'use strict';

// Suite for plugin/scripts/publish-kb.js: the pure `addParentLink` and `removeParentLink` exports under
// `- **Hierarchy:** links` (ADR 0168, INV-0170): where the link lands, what a delete keeps, and the two
// linear-time pins (ADR 0086, ADR 0149) that measure through tests/linear-time.js. No backend is spawned,
// so the file times no spawn.

const assert = require('node:assert');
const { publishKbPath } = require('./publish-kb-setup');

// removing a section's only list item also drops the blank line the add set above it, and the line end it
// appended to an unterminated last heading: add then remove restores the parent byte for byte. A prose line right
// below the heading keeps one blank line above it after the first cycle, and every later cycle returns those bytes.
{
  const { addParentLink, removeParentLink } = require(publishKbPath);
  const lineFor = () => ({ ok: true, line: '- [Child](Child) — desc' });
  const cycle = (body) => removeParentLink(addParentLink(body, 'Guides', lineFor, 'Child').body, 'Guides', 'Child').body;
  for (const [what, body] of [
    ['an empty section', 'Intro.\n\n## Guides\n\n## Other\n\n- [Z](Z)\n'],
    ['a last heading with no line end', 'Intro.\n\n## Guides'],
    ['CRLF line ends', 'Intro.\r\n\r\n## Guides\r\n\r\n## Other\r\n'],
  ]) {
    assert.equal(cycle(body), body, `${what}: add then remove restores the parent`);
  }
  const once = cycle('Intro.\n\n## Guides\nSome text.\n');
  assert.equal(once, 'Intro.\n\n## Guides\n\nSome text.\n', 'a section of prose keeps one blank line below its heading');
  assert.equal(cycle(once), once, 'a second cycle over a section of prose returns the same bytes');
}

// the link joins the named section's own list, ahead of any subsection: a list under a `###` inside the section is
// no anchor, and a section with no list of its own opens one below its heading
{
  const { addParentLink } = require(publishKbPath);
  const lineFor = () => ({ ok: true, line: '- [C](c)' });
  const add = (body) => addParentLink(body, 'Guides', lineFor, 'C').body;
  assert.equal(
    add('## Guides\n\n- [A](a)\n\n### Advanced\n\n- [B](b)\n\n## Other\n'),
    '## Guides\n\n- [A](a)\n- [C](c)\n\n### Advanced\n\n- [B](b)\n\n## Other\n',
    'the link follows the section\'s own last item, not a subsection\'s',
  );
  assert.equal(
    add('## Guides\n\nText.\n\n### Advanced\n\n- [B](b)\n'),
    '## Guides\n\n- [C](c)\n\nText.\n\n### Advanced\n\n- [B](b)\n',
    'a section whose only list sits in a subsection opens its own list below the heading',
  );
}

// the link follows every line the last top-level item carries: a nested item, a continuation line, or a fenced code
// block indented to the item's content column belongs to it across blank lines, and so does a lazy continuation line
// right below its text; a blank-separated line indented less is no part of it
{
  const { addParentLink } = require(publishKbPath);
  const lineFor = () => ({ ok: true, line: '- [C](c)' });
  const add = (body) => addParentLink(body, 'Guides', lineFor, 'C').body;
  assert.equal(
    add('## Guides\n\n- A\n\n    - A1\n\n## Other\n'),
    '## Guides\n\n- A\n\n    - A1\n- [C](c)\n\n## Other\n',
    'a blank-separated nested item stays under the last item, and the link follows it',
  );
  assert.equal(
    add('## Guides\n\n- A\n\nA paragraph.\n'),
    '## Guides\n\n- A\n- [C](c)\n\nA paragraph.\n',
    'a blank-separated paragraph below the list stays outside it, and the link lands above it',
  );
  assert.equal(
    add('## Guides\n\n- A\n\n  ```\n  code\n  ```\n'),
    '## Guides\n\n- A\n\n  ```\n  code\n  ```\n- [C](c)\n',
    'a fenced code block indented under the last item stays under it, and the link follows its closing fence',
  );
  assert.equal(
    add('## Guides\n\n- A\n\n  ```\ncode\n  ```\n'),
    '## Guides\n\n- A\n\n  ```\ncode\n  ```\n- [C](c)\n',
    'a fence the last item opens is carried to its closing fence, so the link never lands inside it',
  );
  assert.equal(
    add('## Guides\n\n- A\n  - A1\n\n  more A text\n'),
    '## Guides\n\n- A\n  - A1\n\n  more A text\n- [C](c)\n',
    'a two-space nested item is no anchor: the link follows the paragraph its top-level item carries',
  );
  assert.equal(
    add('## Guides\n\n- A\n - B\n'),
    '## Guides\n\n- A\n - B\n- [C](c)\n',
    'an item indented less than the item above it is that item\'s sibling, and the link follows it',
  );
  assert.equal(
    add('## Guides\n\n- A\nlazy\n'),
    '## Guides\n\n- A\nlazy\n- [C](c)\n',
    'a lazy continuation line right below the item continues its paragraph, and the link follows it',
  );
  assert.equal(
    add('## Guides\n\n- A\n```\ncode\n```\n'),
    '## Guides\n\n- A\n- [C](c)\n```\ncode\n```\n',
    'a fence opener indented less than the item\'s content column ends the item, and the link lands above the fence',
  );
  assert.equal(
    add('## Guides\n\n-\tA\n\n    more\n'),
    '## Guides\n\n-\tA\n\n    more\n- [C](c)\n',
    'a tab after the marker reaches the next tab stop, column 4, so a paragraph indented four spaces stays under the item',
  );
}

// a parent that links the page under another section already links it: the add writes nothing (ADR 0168)
{
  const { addParentLink } = require(publishKbPath);
  const out = addParentLink('## Other\n\n- [C](c)\n\n## Guides\n\n- [A](a)\n', 'Guides', () => ({ ok: true, line: '- [C](c)' }), 'C');
  assert.equal(out.changed, false, 'a link under another section counts as linked');
}

// a delete keeps the structure around the removed line: an item that carries a nested item, a continuation line,
// a lazy continuation line, or fenced code stays and is reported kept, and an item with another top-level item beside it is no only item
{
  const { removeParentLink, addParentLink } = require(publishKbPath);
  for (const [what, body, line] of [
    ['a nested child item', '## Guides\n\n- [Child](x)\n    - [Grand](y)\n', '- [Child](x)'],
    ['a nested child item after a blank line', '## Guides\n\n- [Child](x)\n\n  - [Grand](y)\n', '- [Child](x)'],
    ['a continuation line', '## Guides\n\n- [A](a)\n- [Child](x)\n  more text\n', '- [Child](x)'],
    ['a fenced code block', '## Guides\n\n- [Child](x)\n\n  ```\n  code\n  ```\n', '- [Child](x)'],
    ['a lazy continuation line', '## Guides\n\n- [Child](x)\nlazy\n', '- [Child](x)'],
    ['a continuation paragraph at the tab stop a tab after the marker reaches', '## Guides\n\n-\t[Child](x)\n\n    more\n', '-\t[Child](x)'],
  ]) {
    const out = removeParentLink(body, 'Guides', 'Child');
    assert.equal(out.changed, false, `${what}: the item stays`);
    assert.deepEqual(out.kept, [line], `${what}: the item is reported kept`);
  }
  assert.equal(
    removeParentLink('## Guides\n\n- [Child](x)\n- [A](a)\n    - [Grand](y)\n', 'Guides', 'Child').body,
    '## Guides\n\n- [A](a)\n    - [Grand](y)\n',
    'a section with another top-level item keeps the blank line below the heading',
  );
  const lineFor = () => ({ ok: true, line: '- [C](c)' });
  const body = '## Guides\n\n### Advanced\n\n- [B](b)\n';
  assert.equal(
    removeParentLink(addParentLink(body, 'Guides', lineFor, 'C').body, 'Guides', 'C').body,
    body,
    'add then remove restores a section whose only list sits in a subsection',
  );
}

// Linear time (ADR 0086, ADR 0149): a parent line of unclosed brackets four times as long takes about four times as long to
// read for links when linear, sixteen times when quadratic; the ceiling sits at nine, between them. The capped scan
// still finds every link shape it found before. Each unit also opens a capped link-text run, a linear cost that hides a
// quadratic one on a short line, so the input starts at 6000 units, where a quadratic run dominates.
{
  const { removeParentLink } = require(publishKbPath);
  const { timePair, cpuNs } = require('./linear-time');
  const scan = (body) => removeParentLink(body, 'How it works', 'Child');
  for (const unit of ['[', '[[', '[a][', '[a](', '[[a|']) {
    const make = (n) => `## How it works\n\n- ${unit.repeat(n)}\n`;
    let n = 6000;
    for (let t0 = cpuNs(); n < 200000; n *= 2, t0 = cpuNs()) {
      scan(make(n));
      if (cpuNs() - t0 >= 10e6) break;
    }
    const [base, big] = timePair(scan, make(n), make(n * 4));
    assert.ok(big < 9 * base, `${unit} run stays about linear: ${base}ns at ${n}, four times the input ${big}ns`);
  }
  const body = '## How it works\n\n- [A](A)\n- [**Child**](x) — d\n- See [Child][c] and [[Child|c]] and [Child](y)\n';
  const out = scan(body);
  assert.equal(out.body, '## How it works\n\n- [A](A)\n- See [Child][c] and [[Child|c]] and [Child](y)\n', 'the single-link line is removed');
  assert.deepEqual(out.kept, ['- See [Child][c] and [[Child|c]] and [Child](y)'], 'the reference, wiki, and inline links are still found');
  assert.deepEqual(scan('## How it works\n\n- See [Child][c]\n- [[Child]]\n').kept, ['- See [Child][c]', '- [[Child]]'], 'each link shape alone');
}

// Linear time (ADR 0086, ADR 0149): a parent heading line four times as long takes about four times as long to read for
// its heading text when linear, sixteen times when quadratic, on the remove path and the add path alike; the ceiling
// sits at nine, between them.
{
  const { removeParentLink, addParentLink } = require(publishKbPath);
  const { timePair, cpuNs } = require('./linear-time');
  const scans = {
    remove: (body) => removeParentLink(body, 'How it works', 'Child'),
    add: (body) => addParentLink(body, 'How it works', () => ({ ok: true, line: '- [Child](Child)' }), 'Child'),
  };
  for (const [path, scan] of Object.entries(scans)) {
    for (const unit of [' ', ' #']) {
      const make = (n) => `## How it works\n\n- [A](A)\n# a${unit.repeat(n)}b\n`;
      let n = 2000;
      for (let t0 = cpuNs(); n < 200000; n *= 2, t0 = cpuNs()) {
        scan(make(n));
        if (cpuNs() - t0 >= 10e6) break;
      }
      const [base, big] = timePair(scan, make(n), make(n * 4));
      assert.ok(big < 9 * base, `${path} over a heading of ${JSON.stringify(unit)} runs stays about linear: ${base}ns at ${n}, four times the input ${big}ns`);
    }
  }
  const add = addParentLink;
  const lineFor = () => ({ ok: true, line: '- [Child](Child)' });
  for (const heading of ['## How it works', '## How it works ##', '  ## How it works  #  ', '##\tHow it works']) {
    assert.equal(add(`${heading}\n\n- [A](A)\n`, 'How it works', lineFor, 'Child').changed, true, `${JSON.stringify(heading)} is read as the section`);
  }
  for (const heading of ['## How it works#', '##How it works', '####### How it works']) {
    assert.equal(add(`${heading}\n\n- [A](A)\n`, 'How it works', lineFor, 'Child').ok, false, `${JSON.stringify(heading)} is no heading "How it works"`);
  }
}

// the parent body the add and delete blocks below share, and a copy of it with one more line after item B
const HOME = 'Intro.\n\n## How it works\n\n- [A](A)\n- [B](B)\n\n## Other\n\n- [Z](Z)\n';
const withB = (extra) => HOME.replace('- [B](B)\n', `- [B](B)\n${extra}\n`);

// the add path over the staged page's link line and the parent's live body (ADR 0168, INV-0170): where the link lands in a
// section with no list, which links already count as the page's own (the add writes nothing), which lines do not, a
// section the parent lacks or repeats, and a title edged by emphasis characters
{
  const { addParentLink } = require(publishKbPath);
  const { parentLinkRefusal } = require('../plugin/lib/kb-parent-link.js');
  const add = (body, line, title = 'Child', section = 'How it works') => addParentLink(body, section, () => ({ ok: true, line }), title);
  const link = '- [Child](Child) — desc';

  for (const [what, body, linked] of [
    ['an empty section', 'Intro.\n\n## Guides\n\n## Other\n\n- [Z](Z)\n', 'Intro.\n\n## Guides\n\n- [Child](Child) — desc\n\n## Other\n\n- [Z](Z)\n'],
    ['a section of prose', 'Intro.\n\n## Guides\nSome text.\n', 'Intro.\n\n## Guides\n\n- [Child](Child) — desc\n\nSome text.\n'],
    ['a last heading with no line end', 'Intro.\n\n## Guides', 'Intro.\n\n## Guides\n\n- [Child](Child) — desc'],
    ['CRLF line ends', 'Intro.\r\n\r\n## Guides\r\n\r\n## Other\r\n', 'Intro.\r\n\r\n## Guides\r\n\r\n- [Child](Child) — desc\r\n\r\n## Other\r\n'],
  ]) {
    assert.deepEqual(add(body, link, 'Child', 'Guides'), { ok: true, changed: true, body: linked }, `${what}: the link opens the section's list`);
  }

  assert.equal(add(HOME, link).body, HOME.replace('- [B](B)\n', `- [B](B)\n${link}\n`), 'one line added after the last item, every other byte kept');
  const crlf = HOME.replace(/\n/g, '\r\n');
  assert.equal(add(crlf, link).body, crlf.replace('- [B](B)\r\n', `- [B](B)\r\n${link}\r\n`), 'a CRLF parent gets a CRLF line');

  // a link already in the parent, in any target spelling or list shape, is no add
  for (const [what, line] of [
    ['an absolute target', '- [Child](https://codeberg.org/o/r/wiki/Child) — d'],
    ['an ordered item', '1. [Child](Child) — d'],
    ['bold link text', '- [**Child**](Child)'],
    ['italic link text', '- [_Child_](Child)'],
    ['code link text', '- [`Child`](Child)'],
    ['an item nested by four spaces', '- Group\n    - [Child](Child)'],
    ['an item nested by a tab', '- Group\n\t- [Child](Child)'],
    ['an item nested after a four-space continuation', '    cont\n\t- [Child](Child)'],
    ['an item nested after a tab continuation', '\tcont\n\t- [Child](Child)'],
  ]) {
    assert.deepEqual(add(withB(line), link), { ok: true, changed: false }, `${what} counts as an existing link`);
  }
  assert.equal(add(withB('- [Notes \\[draft\\]](Notes) — desc'), link, 'Notes [draft]').changed, false, 'an escaped bracket in the link text is the title');

  // a line that only looks like a link does not count
  for (const [what, line, title] of [
    ['an image item', '- ![Child](child.png)', 'Child'],
    ['an escaped-backslash image', '- \\\\![Child](Child)', 'Child'],
    ['wrapped text that merely contains the title', '- [__init__](x)', 'init'],
    ['wrapped text with other edges', '- [__init__](x)', '_init_'],
    ['indented code after a paragraph', '\nSome paragraph\n\n    - [Child](Child)', 'Child'],
    ['a space and a tab to column 4 after a paragraph', '\nSome paragraph\n \t- [Child](Child)', 'Child'],
  ]) {
    assert.equal(add(withB(line), link, title).changed, true, `${what} is no existing link`);
  }
  assert.equal(add(`${HOME}\n\`\`\`md\n- [Child](Child)\n\`\`\`\n`, link).changed, true, 'a link inside fenced code is no link');
  assert.equal(
    add('Intro.\n\n## How it works\n\n- [A](A)\n- [B](B)\n\n* * *\n\n    - code\n\n## Other\n', link).body,
    'Intro.\n\n## How it works\n\n- [A](A)\n- [B](B)\n- [Child](Child) — desc\n\n* * *\n\n    - code\n\n## Other\n',
    'a thematic break and indented code at the end of a section are no list item to follow',
  );

  // a section the parent lacks, repeats, or heads with a setext line is refused with the section named
  for (const [what, body, reason] of [
    ['no heading', 'Intro.\n\n- [A](A)\n', /the parent has no ATX \(#\) heading "How it works"/],
    ['a setext heading', 'Intro.\n\nHow it works\n============\n\n- [A](A)\n', /the parent has no ATX \(#\) heading "How it works"/],
    ['two headings', `${HOME}\n## How it works\n\n- [Q](Q)\n`, /the parent has 2 ATX \(#\) headings "How it works"/],
  ]) {
    const out = add(body, link);
    assert.equal(out.ok, false, what);
    assert.match(out.reason, reason, what);
  }

  // a title edged by `_` or `*`, and link text with an escaped bracket, is the title of its own parent-link
  for (const title of ['__init__', '_index', 'C*', 'Notes [draft]']) {
    const text = title.replace(/[[\]]/g, '\\$&');
    const line = `- [${text}](${title.replace(/[^\w*]/g, '')}) — desc`;
    assert.equal(parentLinkRefusal({ parent: 'Home', title, parentSection: 'How it works', parentLink: line }), null, `${title}: the parent-link is accepted`);
    assert.ok(add(HOME, line, title).body.includes(`${line}\n`), `${title}: linked`);
  }
}

// the delete path (ADR 0168, INV-0164): the first single-link item of the section goes, every other line linking the page
// stays and comes back in `kept`, a parent that does not link the page is no change, and a section the parent lacks or
// repeats is refused
{
  const { removeParentLink, addParentLink } = require(publishKbPath);
  const WITH_CHILD = HOME.replace('- [B](B)\n', '- [B](B)\n- [Child](Child) — desc\n');
  const remove = (body) => removeParentLink(body, 'How it works', 'Child');

  assert.deepEqual(remove(WITH_CHILD), { ok: true, changed: true, body: HOME, kept: [] }, 'only the link line is gone');
  assert.equal(remove(WITH_CHILD.replace(/\n/g, '\r\n')).body, HOME.replace(/\n/g, '\r\n'), 'a CRLF parent loses one CRLF line');
  assert.deepEqual(remove(HOME), { ok: true, changed: false, kept: [] }, 'a parent that does not link the page is unchanged');

  for (const line of ['See [Child](Child) for more.', '- [Child](Child) and [Other](Other)', '- [Child][c]', '- [Child][]', '- [[Child]]', '- [[Child|alias]]']) {
    assert.deepEqual(remove(withB(line)), { ok: true, changed: false, kept: [line] }, `${line} stays and is kept`);
  }
  assert.deepEqual(remove(withB('- ![Child](child.png)')), { ok: true, changed: false, kept: [] }, 'an image item is no link line');
  assert.deepEqual(remove(withB('- \\\\![Child](Child)')), { ok: true, changed: false, kept: [] }, 'an escaped backslash then an image is no link');
  assert.equal(remove(withB('- \\![Child](Child)')).body, HOME, 'a literal bang then a link is a link line, removed');

  const second = remove(WITH_CHILD.replace('- [Child](Child) — desc\n', '- [Child](Child) — desc\n- [Child](Child) — second\n'));
  assert.equal(second.body, HOME.replace('- [B](B)\n', '- [B](B)\n- [Child](Child) — second\n'), 'two single-link items: the first goes');
  assert.deepEqual(second.kept, ['- [Child](Child) — second'], 'the second stays and is kept');
  const later = remove(WITH_CHILD.replace('- [Z](Z)\n', '- [Z](Z)\n- [Child](Child) — other\n'));
  assert.equal(later.body, HOME.replace('- [Z](Z)\n', '- [Z](Z)\n- [Child](Child) — other\n'), 'a link in a later section stays');
  assert.deepEqual(later.kept, ['- [Child](Child) — other'], 'and is kept');

  for (const [what, body, reason] of [
    ['missing', 'Intro.\n\n## Other\n\n- [Child](Child)\n', /the parent has no ATX \(#\) heading "How it works"/],
    ['duplicated', `${WITH_CHILD}\n## How it works\n\n- [Q](Q)\n`, /the parent has 2 ATX \(#\) headings "How it works"/],
  ]) {
    const out = remove(body);
    assert.equal(out.ok, false, what);
    assert.match(out.reason, reason, what);
  }
  // the escaped-backslash image is no link on the add path either: the link line is added
  assert.equal(addParentLink(withB('- \\\\![Child](Child)'), 'How it works', () => ({ ok: true, line: '- [Child](Child) — desc' }), 'Child').changed, true);
}

// the link target fill (ADR 0168), given the fields the page's own find returned: a line with no placeholder in a link
// target comes back as staged, every `{sub_url}` in a target takes the value, and a value outside the URL-safe set
// (one row per rejected character family), an empty one, or a non-string one refuses. The paths that look the target
// up on the backend (absent, unknown, timeout) are end to end in the placeholder and hang-add suites.
{
  const { fillLinkTarget } = require('../plugin/lib/kb-parent-link.js');
  const fill = (parentLink, fields) => fillLinkTarget({ title: 'Child', parentLink }, {}, fields);
  const SUB = '- [Child](https://x/wiki/{sub_url}): d';
  for (const [what, link, fields, line] of [
    ['no placeholder, whatever find returned', '- [Child](https://x/wiki/Fixed): d', { sub_url: 'a b' }, '- [Child](https://x/wiki/Fixed): d'],
    ['a placeholder outside a link target', '- [Child](Child): {sub_url}', { sub_url: 'a b' }, '- [Child](Child): {sub_url}'],
    ['a plain value', SUB, { sub_url: 'Child-live' }, '- [Child](https://x/wiki/Child-live): d'],
    ['a percent-escaped value', SUB, { sub_url: 'ADR+0023%3A-a.b_c~d' }, '- [Child](https://x/wiki/ADR+0023%3A-a.b_c~d): d'],
    ['every URL-safe punctuation', SUB, { sub_url: "!$&'*+,;=/:@?#" }, "- [Child](https://x/wiki/!$&'*+,;=/:@?#): d"],
    ['a placeholder twice in one target', '- [Child](https://x/{sub_url}/{sub_url}): d', { sub_url: 's' }, '- [Child](https://x/s/s): d'],
    ['a placeholder in the target only', '- [{sub_url}](https://x/{sub_url}): d', { sub_url: 's' }, '- [{sub_url}](https://x/s): d'],
  ]) {
    assert.deepEqual(fill(link, fields), { ok: true, line }, what);
  }
  for (const [what, value] of [
    ['a space', 'a b'],
    ['a tab', 'a\tb'],
    ['a line feed', 'a\nb'],
    ['a parenthesis', 'a)b'],
    ['an open parenthesis', 'a(b'],
    ['a control character', 'a\u0007b'],
    ['a delete character', 'a\u007fb'],
    ['a trailing backslash', 'a\\'],
    ['a leading angle bracket', '<a'],
    ['a closing angle bracket', 'a>'],
    ['a double quote', 'a"b'],
    ['a backtick', 'a`b'],
    ['a brace', 'a{b}'],
    ['a pipe', 'a|b'],
    ['a caret', 'a^b'],
    ['a bracket', 'a[b]'],
    ['a non-ASCII letter', 'café'],
  ]) {
    const out = fill(SUB, { sub_url: value });
    assert.equal(out.ok, false, `${what} is refused`);
    assert.match(out.reason, /a character outside the URL-safe set/, what);
    assert.equal(out.fix, 'write the link target in full in parent-link', what);
  }
  for (const [what, fields] of [
    ['an empty sub_url', { sub_url: '' }],
    ['a numeric sub_url', { sub_url: 5 }],
    ['a null sub_url', { sub_url: null }],
    ['no sub_url', {}],
  ]) {
    const out = fill(SUB, fields);
    assert.equal(out.ok, false, `${what} is refused`);
    assert.match(out.reason, /find returned no sub_url for "Child"/, what);
    assert.match(out.fix, /this backend's find emits no sub_url/, what);
  }
}

console.log('publish-kb-parent-link-pure.test.js: all assertions passed');
