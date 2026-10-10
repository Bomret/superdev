import type { ClientModule } from 'claude-code'

import type { CardData } from '../types'

// One agent's card. It posts its key once a second and the hooks module answers with the agent's latest
// record, so a tool call or a clock tick redraws this card alone, never the pane.
// A done card keeps posting for GRACE_POSTS more seconds after it first sees its agent done, so a call or
// step bookkept just after the end still reaches it, and then stops posting.

// simplicity: a fixed 5 s grace; a call bookkept later than that after the end reaches only a card mounted
// afterwards.
const GRACE_POSTS = 5

// `isDone` is a box the post timer reads, set from each render's props.
type State = { isDone: { value: boolean } }

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const Card: ClientModule<CardData, State> = (c, surface) => {
  const { Box, Text } = surface.elements
  if (surface.state === undefined) {
    const isDone = { value: c.isDone }
    let left = GRACE_POSTS
    // the post carries the card's mode, and the answer hands it back
    const isCompact = c.isCompact === true
    const stop = surface.every(1000, () => (isDone.value && left-- <= 0 ? stop() : surface.post({ key: c.key, isCompact })))
    surface.setState({ isDone })
  } else surface.state.isDone.value = c.isDone
  const elapsed = c.start === null ? null : clock((c.end ?? c.now) - c.start)
  const mark = <Text color={c.isDone ? 'gray' : 'green'}>{c.isDone ? '■' : '●'}</Text>
  if (c.isCompact) {
    return (
      <Text>
        {mark} {c.type.replace(/^superdev:/, '')}{elapsed && ` · ⏱ ${elapsed}`}
      </Text>
    )
  }
  const facts = [
    elapsed && `⏱ ${elapsed}`,
    c.isLive && `ctx ${c.ctx === null ? '—' : c.ctx.toLocaleString('en-US')}`,
    c.events !== null && `${c.events} trace events`,
  ].filter(Boolean).join(' · ')

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={c.isDone ? 'gray' : 'green'} paddingX={1}>
      <Text>
        {mark} {c.isDone ? 'done' : 'running'} <Text bold>{c.type.replace(/^superdev:/, '')}</Text>
      </Text>
      <Text dimColor>{`${c.scope} · ${c.slice}`}</Text>
      <Text dimColor>{c.desc}</Text>
      {facts !== '' && <Text dimColor>{facts}</Text>}
      {c.calls.map((call, n) => <Text key={`call-${n}`} wrap="truncate-end">› {call}</Text>)}
      {c.last !== null && <Text wrap="truncate-end">↳ {c.last}</Text>}
    </Box>
  )
}

export default Card
