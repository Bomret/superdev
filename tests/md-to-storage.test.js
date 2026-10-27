'use strict';

// Suite for plugin/lib/md-to-storage.js (ADR 0109): markdown in, Confluence storage XHTML out.

const assert = require('node:assert');
const { toStorage } = require('../plugin/lib/md-to-storage.js');

// Well-formed XML without a parser dependency: every `<` opens a tag, every tag balances, every `&`
// starts one of the entities the converter emits. XML 1.0 forbids C0 control characters except tab, LF, CR.
function assertWellFormed(xml, label) {
  const stack = [];
  const tag = /<(\/?)([\w:]+)((?:\s+[\w:]+="[^"<]*")*)\s*(\/?)>/y;
  for (let i = 0; i < xml.length; i++) {
    const ch = xml.charCodeAt(i);
    assert.ok(!(ch >= 0x0000 && ch <= 0x0008 || ch === 0x000B || ch === 0x000C || ch >= 0x000E && ch <= 0x001F || ch === 0xFFFE || ch === 0xFFFF), `${label}: XML-invalid control character U+${ch.toString(16).toUpperCase().padStart(4, '0')} at ${i}`);
    if (xml[i] === '&') assert.match(xml.slice(i, i + 6), /^&(amp|lt|gt|quot);/, `${label}: bare & at ${i}`);
    if (xml[i] !== '<') continue;
    tag.lastIndex = i;
    const m = tag.exec(xml);
    assert.ok(m, `${label}: malformed tag at ${i}: ${xml.slice(i, i + 20)}`);
    if (m[1]) assert.equal(stack.pop(), m[2], `${label}: unbalanced </${m[2]}>`);
    else if (!m[4]) stack.push(m[2]);
    i = tag.lastIndex - 1;
  }
  assert.deepEqual(stack, [], `${label}: unclosed ${stack.join(', ')}`);
}

function check(md, expected, label) {
  const out = toStorage(md);
  assert.equal(out, expected, label);
  assertWellFormed(out, label);
}

check('', '', 'an empty body converts to an empty body');
check('\n\n', '', 'a blank body converts to an empty body');

check('# One\n\n### Three ###\n', '<h1>One</h1>\n<h3>Three</h3>\n', 'ATX headings, closing hashes dropped');

check(
  'Line one\nline two  \nline three\n\nNext.\n',
  '<p>Line one\nline two<br/>\nline three</p>\n<p>Next.</p>\n',
  'paragraphs and a self-closed hard break',
);

check(
  '**bold** and *em* and _em_ and ~~gone~~ and `a <b> & c`\n',
  '<p><strong>bold</strong> and <em>em</em> and <em>em</em> and <del>gone</del> and <code>a &lt;b&gt; &amp; c</code></p>\n',
  'inline formatting; code span content escaped and left unformatted',
);

check('`*not em*`\n', '<p><code>*not em*</code></p>\n', 'no emphasis inside a code span');

check(
  'See [the docs](https://x.test/a?b=1&c=2) or <https://y.test>.\n',
  '<p>See <a href="https://x.test/a?b=1&amp;c=2">the docs</a> or <a href="https://y.test">https://y.test</a>.</p>\n',
  'links and autolinks, & in a URL escaped',
);

check(
  'See <https://y.test/?a=1&b=2>.\n',
  '<p>See <a href="https://y.test/?a=1&amp;b=2">https://y.test/?a=1&amp;b=2</a>.</p>\n',
  'an autolink keeps an & in its URL',
);

check(
  '![diagram](https://x.test/d.png)\n',
  '<p><ac:image ac:alt="diagram"><ri:url ri:value="https://x.test/d.png"/></ac:image></p>\n',
  'an image becomes a Confluence image macro',
);

check(
  'Raw <div class="x">html</div> & <br> stays text.\n',
  '<p>Raw &lt;div class=&quot;x&quot;&gt;html&lt;/div&gt; &amp; &lt;br&gt; stays text.</p>\n',
  'raw HTML is escaped, never passed through',
);

check(
  '- a\n- b\n  - b1\n  - b2\n- c\n',
  '<ul>\n<li>a</li>\n<li>b\n<ul>\n<li>b1</li>\n<li>b2</li>\n</ul></li>\n<li>c</li>\n</ul>\n',
  'a nested tight unordered list',
);

check(
  '1. one\n2. two\n   1. inner\n',
  '<ol>\n<li>one</li>\n<li>two\n<ol>\n<li>inner</li>\n</ol></li>\n</ol>\n',
  'a nested ordered list',
);

check('3. three\n4. four\n', '<ol start="3">\n<li>three</li>\n<li>four</li>\n</ol>\n', 'an ordered list keeps its start');

check(
  '- a\n\n- b\n',
  '<ul>\n<li><p>a</p></li>\n<li><p>b</p></li>\n</ul>\n',
  'a loose list keeps its paragraphs',
);

check(
  'Intro:\n- a\n- b\n\nAfter.\n',
  '<p>Intro:</p>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n<p>After.</p>\n',
  'a list interrupts a paragraph and ends at a paragraph',
);

check(
  '| Name | Note |\n|:-----|-----:|\n| `a` | x \\| y |\n| **c** | <d> |\n',
  '<table><tbody>\n<tr><th>Name</th><th>Note</th></tr>\n<tr><td><code>a</code></td><td>x | y</td></tr>\n<tr><td><strong>c</strong></td><td>&lt;d&gt;</td></tr>\n</tbody></table>\n',
  'a GFM table: header cells, an escaped pipe, inline formatting, escaped HTML',
);

check(
  '```js\nif (a < b && c > d) {\n  return "<x>";\n}\n```\n',
  '<pre><code>if (a &lt; b &amp;&amp; c &gt; d) {\n  return &quot;&lt;x&gt;&quot;;\n}</code></pre>\n',
  'fenced code escapes < & > and keeps indentation',
);

check('~~~~\n```\ninner\n```\n~~~~\n', '<pre><code>```\ninner\n```</code></pre>\n', 'a tilde fence holds a backtick fence');

check('```\nunterminated <x>\n', '<pre><code>unterminated &lt;x&gt;</code></pre>\n', 'an unterminated fence runs to the end');

check(
  '> quoted **text**\n> more\n\n---\n',
  '<blockquote>\n<p>quoted <strong>text</strong>\nmore</p>\n</blockquote>\n<hr/>\n',
  'a block quote and a self-closed rule',
);

check('a snake_case_name stays\n', '<p>a snake_case_name stays</p>\n', 'no emphasis inside a word');

check('a\r\nb\r\n', '<p>a\nb</p>\n', 'CRLF line endings');

// Generated link, image and autolink markup is never re-processed by the emphasis pass.
check(
  'See [API](https://x.test/v1/*) and *this*\n',
  '<p>See <a href="https://x.test/v1/*">API</a> and <em>this</em></p>\n',
  'an asterisk in a link URL is not emphasis',
);
check(
  'See [docs](https://x.test/_private_/page).\n',
  '<p>See <a href="https://x.test/_private_/page">docs</a>.</p>\n',
  'underscores in a link URL are not emphasis',
);
check(
  '![alt](https://x.test/_img_.png)\n',
  '<p><ac:image ac:alt="alt"><ri:url ri:value="https://x.test/_img_.png"/></ac:image></p>\n',
  'underscores in an image URL are not emphasis',
);
check(
  '<https://x.test/_a_/>\n',
  '<p><a href="https://x.test/_a_/">https://x.test/_a_/</a></p>\n',
  'underscores in an autolink are not emphasis',
);
check(
  '*a [b* c](https://u.test)\n',
  '<p>*a <a href="https://u.test">b* c</a></p>\n',
  'emphasis never crosses a link boundary',
);
check(
  '**a [b** c](https://u.test) ~~d [e~~ f](https://u.test)\n',
  '<p>**a <a href="https://u.test">b** c</a> ~~d <a href="https://u.test">e~~ f</a></p>\n',
  'strong and strike never cross a link boundary',
);

check(
  '```\nfoo\u0000bar\u001b[31m\n```\n',
  '<pre><code>foobar[31m</code></pre>\n',
  'a code block with NUL and ESC is stripped',
);

check(
  'a\u000cb\u001bc\n',
  '<p>abc</p>\n',
  'paragraph text with form feed and ESC is stripped',
);

// A realistic staged page, end to end, is well-formed.
assertWellFormed(
  toStorage(
    '## Was das für <Leser> ist\n\nText mit & und "Zitat".\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n- x\n  1. y\n\n```sh\necho "$A" > /dev/null && true\n```\n',
  ),
  'a realistic page',
);

check('*a **b* c**', '<p>*a <strong>b* c</strong></p>\n', 'crossed em and strong stay literal, never crossed tags');

check('~~a *b~~ c*', '<p>~~a <em>b~~ c</em></p>\n', 'crossed del and em stay literal');

check('_a **b_ c**', '<p>_a <strong>b_ c</strong></p>\n', 'crossed underscore em and strong stay literal');

check('**a _b** c_', '<p><strong>a _b</strong> c_</p>\n', 'crossed strong and underscore em stay literal');

check('[x](http://a/b_(c))', '<p><a href="http://a/b_(c)">x</a></p>\n', 'a URL with balanced parentheses stays whole');

check('**[a](u)**', '<p><strong><a href="u">a</a></strong></p>\n', 'bold wraps a whole link');
check('*[a](u)* _[b](v)_ ~~[c](w)~~', '<p><em><a href="u">a</a></em> <em><a href="v">b</a></em> <del><a href="w">c</a></del></p>\n', 'italic and strike wrap a whole link');
check('[a](<u>)', '<p><a href="u">a</a></p>\n', 'an angle-bracket destination loses its brackets');
check('[x](javascript:alert(1))', '<p>x</p>\n', 'a javascript: link renders its text only');
check('[x](javascript&#58;alert)', '<p>x</p>\n', 'an entity-encoded scheme renders its text only');
check('[x](javascript&colon;alert)', '<p>x</p>\n', 'a named-entity scheme renders its text only');
check('[q](/p?a=1&b=2)', '<p><a href="/p?a=1&amp;b=2">q</a></p>\n', 'an ampersand after the scheme position stays a link');
check('[x](  JavaScript:alert(1))', '<p>[x](  JavaScript:alert(1))</p>\n', 'a destination with a space is no link');
check('[x](JaVaScRiPt:a) ![i](data:text/html,a)', '<p>x i</p>\n', 'scheme check is case-insensitive and covers images');
check('[m](mailto:a@b.c) [r](/p#h) [h](#h)', '<p><a href="mailto:a@b.c">m</a> <a href="/p#h">r</a> <a href="#h">h</a></p>\n', 'mailto and relative destinations stay links');
assertWellFormed(toStorage('a\uFFFEb\uFFFF'), 'U+FFFE and U+FFFF are stripped');
assert.equal(toStorage('a\uFFFEb\uFFFF'), '<p>ab</p>\n', 'U+FFFE and U+FFFF are stripped');
check('[`x`](u)', '<p><a href="u"><code>x</code></a></p>\n', 'a code span in link text keeps the link');

check('*a **b** c*', '<p><em>a <strong>b</strong> c</em></p>\n', 'a complete pair nests inside emphasis');

assertWellFormed(toStorage('__~~<\\***)&\\_~~*  '), 'a fuzz-found crossed-tag input stays well-formed');

// Seeded fuzz: random marker soup always converts to well-formed XML.
{
  let a = 0x9e3779b9;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const tokens = ['*', '**', '_', '__', '~~', '`', '[', ']', '(', ')', '![', '<', '>', '&', '"', 'a', ' ', 'b', '\n', '- ', '# ', '|', 'http://x', '\\', '1. ', '> ', '```\n', '  '];
  for (let n = 0; n < 20000; n++) {
    let md = '';
    for (let k = 1 + Math.floor(rand() * 14); k > 0; k--) md += tokens[Math.floor(rand() * tokens.length)];
    assertWellFormed(toStorage(md), `fuzz ${JSON.stringify(md)}`);
  }
}

console.log('md-to-storage.test.js: all assertions passed');
