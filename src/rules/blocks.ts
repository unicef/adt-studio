import { COLUMN_BY_ID, columnIndex } from './flow'

// Blocks (sprints) are the iterations of the Project's "Block" field. A card's
// block says when the work is planned:
//
//   - set by hand, on the Project's Block field or as a `block:` label
//     (approve now, plan for B3); the field and the label are kept the same;
//   - filled in with the current block when work starts on a card that has
//     none, so nothing runs outside a block;
//   - cleared when the card goes back to the Inbox.
//
// Approving does not set a block: approved and unscheduled is fine.
// `label:"block: B2"` finds a block's work anywhere on GitHub, and the
// Project's `block:@current` filter follows the calendar.

export type Block = { title: string; startDate: string; duration: number }

const DAY = 86_400_000
export const BLOCK_PREFIX = 'block:'

// "block: B2" stays as is; "Iteration 3" becomes "block: Iteration 3".
export function blockLabel(title: string) {
  return title.toLowerCase().startsWith(BLOCK_PREFIX) ? title : `${BLOCK_PREFIX} ${title}`
}

export function isBlockLabel(name: string) {
  return name.toLowerCase().startsWith(BLOCK_PREFIX)
}

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

// The Project's Block field and the issue's `block:` label say the same.
// The field wins when both are set (it is what people edit while planning);
// a label alone fills the field in.
export function reconcileBlock(i: { field: string | null; labels: string[] }) {
  const labels = i.labels.filter(isBlockLabel)
  const want = i.field ? blockName(i.field) : labels[0] ? blockName(labels[0]) : null
  const label = want ? blockLabel(want) : null
  return {
    block: want,
    field: want && (!i.field || blockName(i.field) !== want) ? want : undefined,
    addLabel: label && !labels.some((l) => l.toLowerCase() === label.toLowerCase()) ? label : null,
    removeLabels: labels.filter((l) => !label || l.toLowerCase() !== label.toLowerCase()),
  }
}

// The block a card was committed in has ended and the card is still open:
// it carried over. The label stays, so the slip is visible.
export function carriedOver(labels: string[], blocks: Block[], now = Date.now()) {
  const label = labels.find(isBlockLabel)
  if (!label) return null
  const b = blocks.find((x) => blockLabel(x.title).toLowerCase() === label.toLowerCase())
  if (!b || span(b).end > now) return null
  return { label, title: b.title.replace(/^block:\s*/i, '') }
}
