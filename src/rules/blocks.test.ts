import { describe, expect, it } from 'vitest'
import { blockName, blockOnMove, currentBlock, type Block } from './blocks'

// Blocks as they are on the Projects, September to October 2026.
const blocks: Block[] = [
  { title: 'block: B1', startDate: '2026-09-14', duration: 12 },
  { title: 'block: B2', startDate: '2026-09-26', duration: 14 },
  { title: 'block: B3', startDate: '2026-10-10', duration: 7 },
  { title: 'Iteration 3', startDate: '2026-05-04', duration: 14 },
]
const now = Date.parse('2026-09-29T12:00:00Z')

describe('blocks', () => {
  it('finds the block running today', () => {
    expect(currentBlock(blocks, now)?.title).toBe('block: B2')
    expect(currentBlock(blocks, Date.parse('2026-12-01T00:00:00Z'))).toBeUndefined()
  })

  it('reads "block: B2" and "B2" as the same block', () => {
    expect(blockName('block: B2')).toBe('B2')
    expect(blockName('B2')).toBe('B2')
  })
})

describe('blockOnMove', () => {
  it('leaves an approved card unscheduled', () => {
    expect(blockOnMove({ from: 'issues', to: 'approved', block: null, blocks }, now)).toBeUndefined()
  })

  it('gives work that starts without a block the current one', () => {
    expect(blockOnMove({ from: 'to-do', to: 'doing', block: null, blocks }, now)).toBe('B2')
    expect(blockOnMove({ from: 'to-spec', to: 'specing', block: null, blocks }, now)).toBe('B2')
  })

  it('keeps a block planned ahead, even when work starts early', () => {
    expect(blockOnMove({ from: 'to-do', to: 'doing', block: 'B3', blocks }, now)).toBeUndefined()
  })

  it('clears the block when the card goes back to the Inbox', () => {
    expect(blockOnMove({ from: 'approved', to: 'issues', block: 'B3', blocks }, now)).toBeNull()
  })

  it('does nothing when a card moves back for changes', () => {
    expect(blockOnMove({ from: 'reviewing', to: 'doing', block: null, blocks }, now)).toBeUndefined()
  })
})
