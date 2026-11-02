'use strict';

// md-to-storage.js: converts a staged knowledge-base page's markdown body to Confluence `storage` XHTML (ADR 0109).
// `publish-kb.js` calls `toStorage()` for a backend whose configuration carries
// `- **Body format:** storage`; nothing else does (INV-0109). Dependency-free on purpose: the
// plugin ships no node_modules.
//
// Covers what a staged page is written in: ATX headings, paragraphs, hard breaks, nested ordered and
// unordered lists, GFM tables, fenced code, block quotes, horizontal rules, links, autolinks,
// images, bold, italics, strikethrough, and inline code; emphasis wraps a whole link. Fenced code becomes a
// Confluence `code` macro, its info string's first word the language and its text verbatim in CDATA. A link or image
// destination is http, https, mailto or scheme-less; any other scheme leaves the link text alone. Raw HTML is escaped, never passed through,
// so the output stays well-formed XML whatever the markdown holds. Void elements are self-closed.
// simplicity: line-based subset, not CommonMark — setext headings, indented code blocks, reference
// links and HTML blocks render as plain paragraphs. Add a case when a staged page needs one.
// simplicity: emphasis matching backtracks on a paragraph of unclosed markers (~1.5 s at 32 KB of `**a `).
// Staged pages are far smaller; cap the paragraph length or scan linearly if one ever is not.

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?/;
const ITEM = /^( *)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;
const TABLE_SEP = /^ *\|? *:?-+:? *(\| *:?-+:? *)*\|? *$/;

function escape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Emphasis, links and images on already-escaped text. Code spans are cut out first into NUL-delimited
// placeholders, so their content is escaped and nothing else, and a link still sees through them.
function inline(text) {
  const codes = [];
  const held = text
    .replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _ticks, code) => `\u0000${codes.push(`<code>${escape(code.trim() || code)}</code>`) - 1}\u0000`);
  return spans(escape(held)).replace(/\u0000(\d+)\u0000/g, (_, n) => codes[n]);
}

// Links, images and autolinks are cut out first into \u0001-delimited placeholders (toStorage strips
// every input \u0001): their URL and alt stay escaped and untouched, and the emphasis pass runs on
// the placeholder text, so a link is one atomic segment that emphasis can wrap but never cross.
// Link text gets its own emphasis pass. A destination holds one level of balanced parentheses, or is
// written in angle brackets. Only http, https, mailto and scheme-less destinations become an href;
// any other scheme leaves the escaped link text alone. Code placeholders never enter a URL or an alt.
const LINK =
  /(!)?\[([^\]]*)\]\((?:&lt;((?:(?!&gt;)[^\s\u0000])+)&gt;|((?:[^()\s\u0000]|\([^()\s\u0000]*\))+))(?: &quot;[^)]*&quot;)?\)|&lt;(https?:\/\/(?:[^\s&\u0000]|&amp;)+)&gt;/g;

// An `&` (escaped `&amp;`) before the first `/`, `?` or `#` could spell a scheme by entity, so it is no link.
const safeUrl = (u) => !/^[^/?#]*&/.test(u) && (!/^[\s\u0000-\u001f]*[a-z][a-z0-9+.-]*:/i.test(u) || /^[\s\u0000-\u001f]*(https?|mailto):/i.test(u));

function spans(s) {
  const links = [];
  const hold = (html) => `\u0001${links.push(html) - 1}\u0001`;
  const held = s.replace(LINK, (whole, bang, text, angle, plain, auto) => {
    const url = angle || plain;
    if (auto) return hold(`<a href="${auto}">${auto}</a>`);
    if (bang && !text.includes('\u0000')) {
      return hold(safeUrl(url) ? `<ac:image ac:alt="${text}"><ri:url ri:value="${url}"/></ac:image>` : text);
    }
    if (!bang && text) return hold(safeUrl(url) ? `<a href="${url}">${emphasis(text)}</a>` : emphasis(text));
    return whole;
  });
  return emphasis(held).replace(/\u0001(\d+)\u0001/g, (_, n) => links[n]);
}

// A body is text without generated emphasis tags, or a complete generated pair around such text, so
// every body is balanced and every wrapper around it stays balanced: crossed markers stay literal.
const T = '(?!<\\/?(?:strong|em|del)>)[\\s\\S]';
const BODY = `(?:${T}|<(?<t>strong|em|del)>${T}*<\\/\\k<t>>)+?`;
const tagged = (re) => new RegExp(re.replace('BODY', BODY), 'g');

// The tempered bodies keep the common case balanced; this stack is what guarantees it. Input is
// escaped, so every `<strong|em|del>` in a segment is generated.
function balanced(html) {
  const stack = [];
  for (const [, close, name] of html.matchAll(/<(\/?)(strong|em|del)>/g)) {
    if (!close) stack.push(name);
    else if (stack.pop() !== name) return false;
  }
  return stack.length === 0;
}

function emphasis(s) {
  const html = format(s);
  return balanced(html) ? html : s.replace(/(?: {2,}|\\)\n/g, '<br/>\n');
}

function format(s) {
  return s
    .replace(tagged('(\\*\\*|__)(?=\\S)(BODY)(?<=\\S)\\1'), '<strong>$2</strong>')
    .replace(tagged('(^|[^\\w*])\\*(?=\\S)(BODY)(?<=\\S)\\*(?!\\*)'), '$1<em>$2</em>')
    .replace(tagged('(^|\\W)_(?=\\S)(BODY)(?<=\\S)_(?!\\w)'), '$1<em>$2</em>')
    .replace(tagged('~~(?=\\S)(BODY)(?<=\\S)~~'), '<del>$1</del>')
    .replace(/(?: {2,}|\\)\n/g, '<br/>\n');
}

function cells(row) {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => inline(c.trim().replace(/\\\|/g, '|')));
}

function isTableStart(lines, i) {
  return lines[i].includes('|') && i + 1 < lines.length && lines[i + 1].includes('-') && TABLE_SEP.test(lines[i + 1]);
}

function startsBlock(lines, i) {
  const l = lines[i];
  return FENCE.test(l) || HEADING.test(l) || HR.test(l) || QUOTE.test(l) || ITEM.test(l) || isTableStart(lines, i);
}

function indentOf(line) {
  return line.match(/^ */)[0].length;
}

function list(lines, i) {
  const [, lead, marker] = lines[i].match(ITEM);
  const base = lead.length;
  const ordered = /\d/.test(marker);
  const items = [];
  let loose = false;
  while (i < lines.length) {
    const m = lines[i].match(ITEM);
    if (!m || m[1].length !== base || /\d/.test(m[2]) !== ordered) break;
    const contentIndent = base + m[2].length + 1;
    const body = [m[3] || ''];
    i++;
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === '') {
        let j = i;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j >= lines.length || indentOf(lines[j]) <= base) break;
        loose = true;
        body.push('');
        i++;
        continue;
      }
      if (indentOf(l) <= base) break;
      body.push(l.slice(Math.min(indentOf(l), contentIndent)));
      i++;
    }
    items.push(body);
    let j = i;
    while (j < lines.length && lines[j].trim() === '') j++;
    const next = j < lines.length && lines[j].match(ITEM);
    if (j > i && next && next[1].length === base && /\d/.test(next[2]) === ordered) loose = true;
    if (next && next[1].length === base) i = j;
  }
  const tag = ordered ? 'ol' : 'ul';
  const lis = items.map((body) => {
    let html = blocks(body).replace(/\n$/, '');
    if (!loose) html = html.replace(/^<p>([\s\S]*?)<\/p>(?=\n|$)/, '$1');
    return `<li>${html}</li>`;
  });
  const start = ordered && parseInt(marker, 10) !== 1 ? ` start="${parseInt(marker, 10)}"` : '';
  return { html: `<${tag}${start}>\n${lis.join('\n')}\n</${tag}>`, next: i };
}

function blocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim() === '') {
      i++;
      continue;
    }
    let m;
    if ((m = l.match(FENCE))) {
      const close = new RegExp(`^ {0,3}${m[1][0]}{${m[1].length},}[ \\t]*$`);
      const info = l.slice(m[0].length).trim().split(/\s+/)[0];
      const code = [];
      i++;
      while (i < lines.length && !close.test(lines[i])) code.push(lines[i++]);
      if (i++ >= lines.length) while (code.length && code[code.length - 1] === '') code.pop();
      const language = /^[\w+#.-]+$/.test(info) ? `<ac:parameter ac:name="language">${info}</ac:parameter>` : '';
      const text = code.join('\n').replace(/]]>/g, ']]]]><![CDATA[>');
      out.push(`<ac:structured-macro ac:name="code">${language}<ac:plain-text-body><![CDATA[${text}]]></ac:plain-text-body></ac:structured-macro>`);
    } else if ((m = l.match(HEADING))) {
      out.push(`<h${m[1].length}>${inline(m[2] || '')}</h${m[1].length}>`);
      i++;
    } else if (HR.test(l)) {
      out.push('<hr/>');
      i++;
    } else if (QUOTE.test(l)) {
      const quoted = [];
      while (i < lines.length && lines[i].trim() !== '' && (QUOTE.test(lines[i]) || !startsBlock(lines, i))) {
        quoted.push(lines[i++].replace(QUOTE, ''));
      }
      out.push(`<blockquote>\n${blocks(quoted)}</blockquote>`);
    } else if (ITEM.test(l)) {
      const r = list(lines, i);
      out.push(r.html);
      i = r.next;
    } else if (isTableStart(lines, i)) {
      const head = cells(l);
      const rows = [`<tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr>`];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(`<tr>${cells(lines[i++]).map((c) => `<td>${c}</td>`).join('')}</tr>`);
      }
      out.push(`<table><tbody>\n${rows.join('\n')}\n</tbody></table>`);
    } else {
      const para = [l.replace(/^ +/, '')];
      i++;
      while (i < lines.length && lines[i].trim() !== '' && !startsBlock(lines, i)) para.push(lines[i++].replace(/^ +/, ''));
      out.push(`<p>${inline(para.join('\n').replace(/[ \t]+$/, ''))}</p>`);
    }
  }
  return out.length ? `${out.join('\n')}\n` : '';
}

function toStorage(markdown) {
  return blocks(markdown.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'));
}

module.exports = { toStorage };
