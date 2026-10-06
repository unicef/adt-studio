import { describe, expect, it } from 'vitest'
import { blockLabel, blockName, blockOnMove, carriedOver, currentBlock, reconcileBlock, type Block } from './blocks'

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

  it('names labels the way the Projects name their blocks', () => {
    expect(blockLabel('block: B2')).toBe('block: B2')
    expect(blockLabel('B2')).toBe('block: B2')
    expect(blockName('block: B2')).toBe('B2')
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

describe('reconcileBlock', () => {
  it('copies the field to the label', () => {
    expect(reconcileBlock({ field: 'B3', labels: ['lane: fast'] })).toEqual({ block: 'B3', field: undefined, addLabel: 'block: B3', removeLabels: [] })
  })

  it('fills the field in from a label set by hand', () => {
    expect(reconcileBlock({ field: null, labels: ['block: B3'] })).toEqual({ block: 'B3', field: 'B3', addLabel: null, removeLabels: [] })
  })

  it('lets the field win when they disagree', () => {
    expect(reconcileBlock({ field: 'RC1', labels: ['block: B3'] })).toEqual({ block: 'RC1', field: undefined, addLabel: 'block: RC1', removeLabels: ['block: B3'] })
  })

  it('does nothing when they already agree, or neither is set', () => {
    expect(reconcileBlock({ field: 'B2', labels: ['block: B2'] })).toEqual({ block: 'B2', field: undefined, addLabel: null, removeLabels: [] })
    expect(reconcileBlock({ field: null, labels: [] })).toEqual({ block: null, field: undefined, addLabel: null, removeLabels: [] })
  })
})

describe('carriedOver', () => {
  it('says when planned work carried over from a finished block', () => {
    expect(carriedOver(['block: B1'], blocks, now)).toEqual({ label: 'block: B1', title: 'B1' })
    expect(carriedOver(['block: B2'], blocks, now)).toBeNull()
    expect(carriedOver(['lane: fast'], blocks, now)).toBeNull()
  })
})
