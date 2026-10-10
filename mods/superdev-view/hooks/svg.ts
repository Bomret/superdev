import type { Agent, Intent, Scope, Snapshot } from '../types'

// SVG + inline CSS drawings for the surfaces that have `Svg` (desktop, vscode, mobile).
// Cards are light with dark text so they read on a light or a dark theme alike.

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
const cut = (s: string, n: number) => esc(s.length > n ? `${s.slice(0, n - 1)}…` : s)
const MUTED = '#8b93a7'
const INK = '#1e293b'

const CSS = `<style>
text{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif}
.emoji{font-family:"Apple Color Emoji","Segoe UI Emoji",sans-serif}
.float{animation:float 3.2s ease-in-out infinite}
.bob{animation:float 1.6s ease-in-out infinite}
.glow{animation:glow 2.4s ease-in-out infinite}
.spin{transform-box:fill-box;transform-origin:center;animation:spin 9s linear infinite}
.wiggle{transform-box:fill-box;transform-origin:center;animation:wiggle 2.8s ease-in-out infinite}
.ping{transform-box:fill-box;transform-origin:center;animation:ping 1.8s cubic-bezier(0,0,.2,1) infinite}
.blink{transform-box:fill-box;transform-origin:center;animation:blink 4s infinite}
.flow{stroke-dasharray:6 6;animation:flow .9s linear infinite}
@keyframes float{50%{transform:translateY(-4px)}}
@keyframes glow{50%{filter:drop-shadow(0 0 7px #fbbf24)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes wiggle{25%{transform:rotate(-7deg)}75%{transform:rotate(7deg)}}
@keyframes ping{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.4);opacity:0}}
@keyframes blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
@keyframes flow{to{stroke-dashoffset:-12}}
</style>`
const doc = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="max-width:100%;height:auto">${CSS}${body}</svg>`

export type Drawing = { source: string; width: number; height: number; alt: string }

// --- overview tiles: one per known area that exists ---------------------------------------------

type Tile = { emoji: string; anim: string; count: string; label: string; sub: string; bg: string; ink: string }

export const tiles = (snap: Snapshot): Drawing => {
  const active = (snap.scopes ?? []).filter(s => s.stage !== 'closed')
  // One row per area, drawn only when the area is present: [present, emoji, anim, count, label, sub, bg, ink].
  const table: [unknown, string, string, string, string, string, string, string][] = [
    [snap.assignees, '🪪', 'wiggle', snap.assignees?.[0]?.who ?? '—', 'info.json', snap.assignees?.map(a => a.role).join(', ') || 'operator', '#c7d2fe', '#312e81'],
    [snap.scopes, '🧭', 'spin', String(active.length), 'scopes', `${active.length} active · ${(snap.scopes?.length ?? 0) - active.length} closed`, '#a7f3d0', '#064e3b'],
    [snap.intents, '💡', 'glow', String(snap.intents?.length), 'brainstorm', 'intents to plan', '#fde68a', '#78350f'],
    [snap.kbPending, '📮', 'float', String(snap.kbPending?.length), 'kb-pending', 'pages to publish', '#bae6fd', '#0c4a6e'],
    [snap.designs, '🎨', 'wiggle', String(snap.designs?.length), 'design', 'sketches', '#fbcfe8', '#831843'],
    [snap.drafts.length, '📝', 'float', String(snap.drafts.length), 'dod drafts', 'plans in progress', '#ddd6fe', '#4c1d95'],
  ]
  const list: Tile[] = table.filter(([present]) => present).map(([, emoji, anim, count, label, sub, bg, ink]) => ({ emoji, anim, count, label, sub, bg, ink }))
  const W = 150, H = 104, G = 12, COLS = 3
  const rows = Math.max(1, Math.ceil(list.length / COLS))
  const body = `<defs><clipPath id="tile"><rect width="${W}" height="${H}" rx="18"/></clipPath></defs>` + list
    .map((t, i) => {
      const x = (i % COLS) * (W + G), y = Math.floor(i / COLS) * (H + G)
      return `<g transform="translate(${x},${y})"><g>
<rect width="${W}" height="${H}" rx="18" fill="${t.bg}"/>
<circle cx="${W - 22}" cy="22" r="40" fill="#fff" opacity=".25" clip-path="url(#tile)"/>
<g transform="translate(${W - 34},14)"><text class="emoji ${t.anim}" x="0" y="22" font-size="24">${t.emoji}</text></g>
<text x="14" y="44" font-size="26" font-weight="800" fill="${t.ink}">${cut(t.count, 9)}</text>
<text x="14" y="70" font-size="13" font-weight="700" fill="${t.ink}">${esc(t.label)}</text>
<text x="14" y="88" font-size="10.5" fill="${t.ink}" opacity=".75">${cut(t.sub, 24)}</text></g></g>`
    })
    .join('')
  const width = Math.min(COLS, list.length || 1) * W + (Math.min(COLS, list.length || 1) - 1) * G
  return { source: doc(width, rows * H + (rows - 1) * G, body), width, height: rows * H + (rows - 1) * G, alt: list.map(t => `${t.label}: ${t.count}`).join(', ') }
}

// --- the stage pipeline every scope walks -------------------------------------------------------

export const STAGES = ['planned', 'implementing', 'merged', 'reviewed', 'documented-unreviewed', 'documented', 'submitted', 'shipped', 'closed'] as const
const SHORT: Record<string, string> = { 'documented-unreviewed': 'doc·unrev', implementing: 'implement' }
// The brainstorm column opens the pipeline: intents, before any scope exists, linked to none.
const COLUMNS = ['brainstorm', ...STAGES] as const
export const STAGE_HEX: Record<string, string> = {
  brainstorm: '#fbbf24', planned: '#94a3b8', implementing: '#f59e0b', merged: '#06b6d4', reviewed: '#0ea5e9', 'documented-unreviewed': '#6366f1',
  documented: '#8b5cf6', submitted: '#d946ef', shipped: '#22c55e', closed: '#94a3b8',
}

export const pipeline = (scopes: Scope[], intents: Intent[] | null = null): Drawing => {
  const W = 640, X0 = 36, STEP = (W - 2 * X0) / (COLUMNS.length - 1), TY = 30
  const xOf = (stage: string) => X0 + Math.max(0, COLUMNS.indexOf(stage as (typeof COLUMNS)[number])) * STEP
  // ponytail: three dots a row under the column; past about six intents the rows reach the first pills
  const dots = (intents ?? []).map((n, k) => {
    const x = X0 - 10 + (k % 3) * 10, y = TY + 36 + Math.floor(k / 3) * 12
    const kind = n.isDraft ? 'draft' : 'ready'
    const look = n.isDraft ? `fill="none" stroke="${STAGE_HEX.brainstorm}" stroke-width="1.5" stroke-dasharray="2 2"` : `fill="${STAGE_HEX.brainstorm}"`
    return `<circle class="dot ${kind}" cx="${x}" cy="${y}" r="4" ${look}><title>${esc(n.title)} (${kind})</title></circle>`
  })
  const drafts = (intents ?? []).filter(n => n.isDraft).length
  const active = scopes.filter(s => s.stage !== 'closed')
  const closed = scopes.length - active.length
  const stack = new Map<string, number>()
  const pills = active.map(s => {
    const k = stack.get(s.stage) ?? 0
    stack.set(s.stage, k + 1)
    return { s, x: xOf(s.stage), y: 84 + k * 30 }
  })
  const H = Math.max(96, ...pills.map(p => p.y + 22), TY + 42 + Math.ceil(dots.length / 3) * 12)
  const far = Math.max(X0, ...pills.map(p => p.x))
  const body = [
    `<defs><linearGradient id="trk" gradientUnits="userSpaceOnUse" x1="${X0}" x2="${W - X0}" y1="0" y2="0">${COLUMNS.map((s, i) => `<stop offset="${i / (COLUMNS.length - 1)}" stop-color="${STAGE_HEX[s]}"/>`).join('')}</linearGradient></defs>`,
    `<line x1="${X0}" y1="${TY}" x2="${W - X0}" y2="${TY}" stroke="url(#trk)" stroke-width="4" stroke-linecap="round" opacity=".3"/>`,
    active.length ? `<line class="flow" x1="${X0}" y1="${TY}" x2="${far}" y2="${TY}" stroke="url(#trk)" stroke-width="4" stroke-linecap="round"/>` : '',
    ...dots,
    ...COLUMNS.map(s => `<circle cx="${xOf(s)}" cy="${TY}" r="6" fill="${STAGE_HEX[s]}"/><text x="${xOf(s)}" y="${TY + 22}" font-size="10" text-anchor="middle" fill="${MUTED}">${SHORT[s] ?? s}</text>`),
    closed ? `<g><rect x="${xOf('closed') - 22}" y="${TY - 26}" width="44" height="16" rx="8" fill="#e2e8f0"/><text x="${xOf('closed')}" y="${TY - 14}" font-size="10" font-weight="700" text-anchor="middle" fill="#475569">✓ ${closed}</text></g>` : '',
    ...pills.map(({ s, x, y }, i) => {
      const c = STAGE_HEX[s.stage] ?? '#64748b'
      const w = Math.min(150, 26 + s.name.length * 6.2)
      const px = Math.min(Math.max(x - w / 2, 0), W - w)
      return `<circle class="ping" cx="${x}" cy="${TY}" r="7" fill="none" stroke="${c}" stroke-width="2" style="animation-delay:${i * 0.4}s"/>
<line x1="${x}" y1="${TY + 28}" x2="${x}" y2="${y}" stroke="${c}" stroke-dasharray="2 3"/>
<g><rect x="${px}" y="${y}" width="${w}" height="22" rx="11" fill="${c}"/>
<circle cx="${px + 12}" cy="${y + 11}" r="4" fill="#fff" class="glow"/>
<text x="${px + 22}" y="${y + 15}" font-size="11" font-weight="700" fill="#fff">${cut(s.name, 20)}</text></g>`
    }),
  ].join('')
  return { source: doc(W, H, body), width: W, height: H, alt: `${drafts} draft and ${dots.length - drafts} ready intents; ${active.length} active scopes: ${active.map(s => `${s.name} (${s.stage})`).join(', ')}; ${closed} closed` }
}

// --- generic card list (brainstorm, kb-pending, design, drafts) ---------------------------------

export type Row = { emoji: string; title: string; sub: string; badge?: string; badgeColor?: string }

export const cards = (rows: Row[], bg: string, ink: string, anim: string): Drawing => {
  const W = 640, RH = 44, G = 8
  const body = rows
    .map((r, i) => {
      const y = i * (RH + G)
      const badge = r.badge
        ? `<rect x="${W - 82}" y="${y + 13}" width="70" height="18" rx="9" fill="${r.badgeColor ?? ink}"/><text x="${W - 47}" y="${y + 26}" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">${cut(r.badge, 11)}</text>`
        : ''
      return `<g><rect y="${y}" width="${W}" height="${RH}" rx="14" fill="${bg}"/>
<g transform="translate(12,${y + 8})"><text class="emoji ${anim}" style="animation-delay:${i * 0.35}s" x="0" y="21" font-size="20">${r.emoji}</text></g>
<text x="46" y="${y + 19}" font-size="12.5" font-weight="700" fill="${ink}">${cut(r.title, r.badge ? 70 : 82)}</text>
<text x="46" y="${y + 34}" font-size="10.5" fill="${ink}" opacity=".7">${cut(r.sub, 90)}</text>${badge}</g>`
    })
    .join('')
  const H = Math.max(1, rows.length * (RH + G) - G)
  return { source: doc(W, H, body), width: W, height: H, alt: rows.map(r => r.title).join('; ') }
}

// --- one active scope: controller, slices, and their agents as little bots ----------------------

const AGENT_HEX: Record<string, string> = {
  implementer: '#f59e0b', 'slice-reviewer': '#3b82f6', 'simplicity-reviewer': '#14b8a6', 'final-reviewer': '#8b5cf6',
  'doc-writer': '#ec4899', 'doc-reader': '#f472b6', 'test-auditor': '#84cc16',
}
const SLICE_STYLE: Record<string, { fill: string; emoji: string }> = {
  todo: { fill: '#e2e8f0', emoji: '⏳' }, 'in-progress': { fill: '#fde68a', emoji: '🔨' },
  'in-review': { fill: '#bfdbfe', emoji: '🔍' }, merged: { fill: '#bbf7d0', emoji: '✅' }, scope: { fill: '#e9d5ff', emoji: '🧩' },
}
const bot = (a: Agent, x: number, y: number, i: number) => {
  const type = a.type.replace(/^superdev:/, '')
  const c = a.isDone ? '#cbd5e1' : (AGENT_HEX[type] ?? '#64748b')
  const eyes = a.isDone
    ? `<path d="M8 14h6M22 14h6" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`
    : `<g class="blink" style="animation-delay:${i * 0.7}s"><circle cx="11" cy="14" r="4.5" fill="#fff"/><circle cx="25" cy="14" r="4.5" fill="#fff"/><circle cx="12" cy="15" r="2" fill="${INK}"/><circle cx="26" cy="15" r="2" fill="${INK}"/></g>`
  return `<g transform="translate(${x},${y})"><g>
<rect width="148" height="56" rx="14" fill="#f8fafc" stroke="${c}" stroke-width="${a.isDone ? 1 : 2}"/>
<g transform="translate(8,14)"><g class="${a.isDone ? '' : 'bob'}" style="animation-delay:${i * 0.25}s">
<line x1="18" y1="-1" x2="18" y2="-7" stroke="${c}" stroke-width="2"/>
<circle cx="18" cy="-9" r="3" fill="${a.isDone ? '#94a3b8' : '#22c55e'}" class="${a.isDone ? '' : 'glow'}"/>
<rect width="36" height="28" rx="10" fill="${c}"/>${eyes}</g></g>
<text x="52" y="18" font-size="11" font-weight="700" fill="${INK}">${cut(type, 15)}</text>
<text x="52" y="32" font-size="9.5" fill="#475569">${cut(a.desc, 17)}</text>
<text x="52" y="45" font-size="9" fill="${MUTED}">${a.isDone ? 'done' : 'running'}</text></g></g>`
}

// A scope's lanes: one per ledger slice, then the scope-level lane (`id` `scope`, titled `scopeTitle`)
// only when an agent is on it. An agent whose slice has no ledger row joins the scope-level lane, so every
// counted agent is drawn. Both the scope map and the terminal's lane boxes draw these.
export const scopeLanes = (s: Scope, scopeTitle: string) =>
  [
    ...s.slices.map(sl => ({ id: sl.id, status: sl.status, title: sl.title, tree: s.slicetrees.includes(sl.id) })),
    { id: 'scope', status: 'scope', title: scopeTitle, tree: false },
  ]
    .map(l => ({ ...l, agents: s.agents.filter(a => (s.slices.some(sl => sl.id === a.slice) ? a.slice : 'scope') === l.id) }))
    .filter(l => l.id !== 'scope' || l.agents.length > 0)

export const scopeMap = (s: Scope): Drawing => {
  const lanes = scopeLanes(s, 'reviews · docs · fixes')
  const LW = 164, MAX = 6
  const W = Math.max(640, lanes.length * LW + 24)
  const x0 = (W - lanes.length * LW) / 2
  const cxOf = (i: number) => x0 + LW / 2 + i * LW
  const live = s.agents.filter(a => !a.isDone).length
  const deepest = Math.max(0, ...lanes.map(l => Math.min(MAX, l.agents.length) + (l.agents.length > MAX ? 0.5 : 0)))
  const H = 232 + deepest * 66 + 8
  const CX = W / 2
  const R = 24, CIRC = 2 * Math.PI * R
  const frac = s.dod.total ? s.dod.done / s.dod.total : 0

  const parts: string[] = [
    // DoD ring
    `<g transform="translate(46,52)"><circle r="${R}" fill="#f8fafc" stroke="#e2e8f0" stroke-width="7"/>
<circle r="${R}" fill="none" stroke="#22c55e" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(frac * CIRC).toFixed(1)} ${CIRC.toFixed(1)}" transform="rotate(-90)"/>
<text y="4" font-size="11" font-weight="800" text-anchor="middle" fill="${INK}">${s.dod.done}/${s.dod.total}</text>
<text y="${R + 20}" font-size="10" text-anchor="middle" fill="${MUTED}">DoD</text></g>`,
    // controller
    `<g transform="translate(${CX},54)">${live ? `<circle class="spin" r="40" fill="none" stroke="#818cf8" stroke-width="2" stroke-dasharray="4 7"/>` : ''}
<circle r="30" fill="#6366f1"/><circle r="30" fill="#fff" opacity=".12" transform="translate(-6,-8) scale(.6)"/>
<text class="emoji ${live ? 'bob' : ''}" y="9" font-size="26" text-anchor="middle">🧠</text>
<text y="54" font-size="11" font-weight="700" text-anchor="middle" fill="${MUTED}">controller · ${live} live · ${s.agents.length - live} done</text></g>`,
  ]
  lanes.forEach((l, i) => {
    const cx = cxOf(i)
    const hot = l.agents.some(a => !a.isDone) || l.status === 'in-progress'
    const st = SLICE_STYLE[l.status] ?? SLICE_STYLE.todo!
    parts.push(
      `<path class="${hot ? 'flow' : ''}" d="M${CX} 116 C ${CX} 140, ${cx} 130, ${cx} 150" fill="none" stroke="${hot ? '#6366f1' : '#cbd5e1'}" stroke-width="${hot ? 2.5 : 1.5}"/>`,
      `<g transform="translate(${cx - 74},150)"><g><rect width="148" height="54" rx="16" fill="${st.fill}"/>
<text x="12" y="21" font-size="11.5" font-weight="800" fill="${INK}">${esc(l.id === 'scope' ? 'scope-level' : `${l.id} · ${l.status}`)}</text>
<text x="12" y="38" font-size="10" fill="#334155">${cut(l.title, 22)}</text>
<g transform="translate(118,6)"><text class="emoji ${l.status === 'in-progress' ? 'wiggle' : ''}" y="18" font-size="16">${st.emoji}</text></g>
${l.tree ? `<g transform="translate(118,30)"><text class="emoji" y="16" font-size="13">🌳</text></g>` : ''}</g></g>`,
    )
    l.agents.slice(0, MAX).forEach((a, k) => {
      const y = 222 + k * 66
      parts.push(`<line x1="${cx}" y1="${y - 18}" x2="${cx}" y2="${y}" stroke="#cbd5e1" stroke-width="1.5"/>`, bot(a, cx - 74, y, i * MAX + k))
    })
    if (l.agents.length > MAX) parts.push(`<text x="${cx}" y="${222 + MAX * 66 + 10}" font-size="10" text-anchor="middle" fill="${MUTED}">+${l.agents.length - MAX} more</text>`)
    if (l.agents.length === 0) parts.push(`<text x="${cx}" y="226" font-size="10" text-anchor="middle" fill="${MUTED}">no agents yet</text>`)
  })
  return {
    source: doc(W, H, parts.join('')),
    width: W,
    height: H,
    alt: `${s.name}: ${live} live and ${s.agents.length - live} done agents; ${lanes.map(l => `${l.id} ${l.status} (${l.agents.map(a => a.type).join(', ') || 'no agents'})`).join('; ')}`,
  }
}
