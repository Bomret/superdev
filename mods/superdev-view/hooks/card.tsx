import type { ClientElements, ClientModule } from 'claude-code'

import type { CardData } from '../types'

// One running agent's card. It posts its key once a second and the hooks module answers with the agent's
// latest record, so a tool call or a clock tick redraws this card alone, never the pane. Every card of a
// page shares one message budget, so the pane draws a done agent's card itself with `drawCard`, and a
// card lives only while its agent runs.

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const Card: ClientModule<CardData, true> = (c, surface) => {
  if (surface.state === undefined) {
    surface.every(1000, () => surface.post({ key: c.key }))
    surface.setState(true)
  }
  return drawCard(c, surface.elements)
}

// A card's drawing, from its record alone; the pane draws a done agent's card with it too.
export const drawCard = (c: CardData, { Box, Text }: Pick<ClientElements, 'Box' | 'Text'>) => {
  const elapsed = c.start === null ? null : clock((c.end ?? c.now) - c.start)
  const mark = <Text color={c.isDone ? 'gray' : 'green'}>{c.isDone ? '■' : '●'}</Text>
  const facts = [
    `${c.scope} · ${c.slice}`,
    c.isLive && `ctx ${c.ctx === null ? '—' : c.ctx.toLocaleString('en-US')}`,
    c.events !== null && `${c.events} trace events`,
  ].filter(Boolean).join(' · ')
  // A running card keeps one height, so the cards below it stay put: one line each for the description and
  // the facts, a live agent always both call rows, and a trace-only one always its last trace line.
  const isSteady = !c.isDone
  const calls = isSteady && c.isLive ? [...c.calls, '', ''].slice(0, 2) : c.calls

  return (
    <Box flexDirection="row" columnGap={1}>
      <Box width={1} flexShrink={0} backgroundColor={c.isDone ? 'gray' : 'green'} />
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
          <Text wrap="truncate-end">
            {mark} <Text bold>{c.type.replace(/^superdev:/, '')}</Text><Text dimColor> {c.isDone ? 'done' : 'running'}</Text>
          </Text>
          {elapsed && <Text dimColor>{`⏱ ${elapsed}`}</Text>}
        </Box>
        <Text wrap={isSteady ? 'truncate-end' : 'wrap'}>{c.desc}</Text>
        <Text dimColor wrap={isSteady ? 'truncate-end' : 'wrap'}>{facts}</Text>
        {calls.map((call, n) => <Text key={`call-${n}`} wrap="truncate-end">{call === '' ? '\u00a0' : `› ${call}`}</Text>)}
        {(c.last !== null || (isSteady && !c.isLive)) && <Text wrap="truncate-end">↳ {c.last ?? '—'}</Text>}
      </Box>
    </Box>
  )
}

export default Card
