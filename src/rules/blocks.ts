import { COLUMN_BY_ID, columnIndex } from './flow'

// Blocks (sprints) are the iterations of the Project's "Block" field. A card's
// block says when its work is planned, and it lives on the Project only (the
// issue gets no label), the way the V1 board kept its Iteration:
//
//   - set by hand on the Block field while planning (approve now, plan for B3);
//   - filled in with the current block when work starts on a card that has
//     none, so nothing runs outside a block;
//   - cleared when the card goes back to the Inbox.
//
// Approving does not set a block: approved and unscheduled is fine. The
// Project's `block:@current` filter follows the calendar.

export type Block = { title: string; startDate: string; duration: number }

const DAY = 86_400_000

function span(b: Block) {
  const start = Date.parse(`${b.startDate}T00:00:00Z`)
  return { start, end: start + b.duration * DAY }
}

export function currentBlock(blocks: Block[], now = Date.now()) {
  return blocks.find((b) => {
    const { start, end } = span(b)
    return now >= start && now < end
  })
}

// "block: B2" and "B2" are the same block.
export function blockName(title: string) {
  return title.replace(/^block:\s*/i, '').trim()
}

// The block to give a card when it moves: a name, null to clear it, or
// undefined to leave it as it is.
export function blockOnMove(i: { from: string; to: string; block: string | null; blocks: Block[] }, now = Date.now()) {
  const from = COLUMN_BY_ID.get(i.from)
  const to = COLUMN_BY_ID.get(i.to)
  if (!from || !to || from.id === to.id) return undefined
  if (to.kind === 'inbox') return i.block ? null : undefined
  const starting = to.kind === 'active' && columnIndex(to.id) > columnIndex(from.id)
  if (starting && !i.block) {
    const b = currentBlock(i.blocks, now)
    return b ? blockName(b.title) : undefined
  }
  return undefined
}
