import { describe, expect, it } from 'vitest'
import { creditsFromComments, handoff, type Credit } from './handoff'

const at = 0
const credit = (stage: Credit['stage'], ...logins: string[]): Credit => ({ stage, logins, at })

describe('handoff', () => {
  it('credits and unassigns whoever was on a stage when the card leaves it', () => {
    const h = handoff({ from: 'doing', to: 'to-review', assignees: ['bruna'], mover: 'bruna', credits: [] }, at)
    expect(h.credit).toEqual(credit('build', 'bruna'))
    expect(h.unassign).toEqual(['bruna'])
    expect(h.assign).toEqual([])
    expect(h.comment).toContain('**Code done by @bruna**, moved from Doing to To review by @bruna.')
  })

  it('gives the credit to whoever moved it when nobody was assigned', () => {
    const h = handoff({ from: 'specing', to: 'to-do', assignees: [], mover: 'ana', credits: [] }, at)
    expect(h.credit).toEqual(credit('spec', 'ana'))
  })

  it('assigns whoever pulls a card into a column where work happens', () => {
    const h = handoff({ from: 'to-review', to: 'reviewing', assignees: [], mover: 'caio', credits: [] }, at)
    expect(h).toEqual({ credit: null, comment: null, assign: ['caio'], unassign: [] })
  })

  it('keeps someone who already took the card', () => {
    const h = handoff({ from: 'to-do', to: 'doing', assignees: ['bruna'], mover: 'ana', credits: [] }, at)
    expect(h.assign).toEqual([])
    expect(h.unassign).toEqual([])
  })

  it('credits the PR approver for a review, over the assignee', () => {
    const h = handoff({ from: 'reviewing', to: 'done', assignees: ['caio'], mover: 'caio', approvers: ['dani'], credits: [] }, at)
    expect(h.credit).toEqual(credit('review', 'dani'))
    expect(h.unassign).toEqual(['caio'])
  })

  it('skipping a queue finishes one stage and starts the next with the mover', () => {
    const h = handoff({ from: 'doing', to: 'reviewing', assignees: ['bruna'], mover: 'caio', credits: [] }, at)
    expect(h.credit).toEqual(credit('build', 'bruna'))
    expect(h.unassign).toEqual(['bruna'])
    expect(h.assign).toEqual(['caio'])
  })

  it('sends a card back for changes to whoever did that stage, without a comment', () => {
    const h = handoff({ from: 'reviewing', to: 'doing', assignees: ['caio'], mover: 'caio', credits: [credit('build', 'bruna')] }, at)
    expect(h).toEqual({ credit: null, comment: null, assign: ['bruna'], unassign: ['caio'] })
  })

  it('tells the whole story when the card is done', () => {
    const h = handoff({ from: 'reviewing', to: 'done', assignees: ['caio'], mover: 'caio', credits: [credit('spec', 'ana'), credit('build', 'bruna')] }, at)
    expect(h.credit).toEqual(credit('review', 'caio'))
    expect(h.unassign).toEqual(['caio'])
    expect(h.comment).toContain('**Reviewed and tested by @caio**')
    expect(h.comment).toContain('Finished. Spec @ana · Code @bruna · Review & test @caio')
  })

  it('does nothing for moves between waiting columns except clearing owners', () => {
    expect(handoff({ from: 'approved', to: 'to-spec', assignees: [], mover: 'ana', credits: [] }, at)).toEqual({ credit: null, comment: null, assign: [], unassign: [] })
    expect(handoff({ from: 'to-do', to: 'to-review', assignees: ['bruna'], mover: 'ana', credits: [] }, at).unassign).toEqual(['bruna'])
  })

  it('ignores a move to the same column', () => {
    expect(handoff({ from: 'doing', to: 'doing', assignees: ['bruna'], mover: 'bruna', credits: [] }, at).comment).toBeNull()
  })
})

describe('credits in comments', () => {
  it('reads back the credits the bot wrote, oldest first', () => {
    const code = handoff({ from: 'doing', to: 'to-review', assignees: ['bruna'], mover: 'bruna', credits: [] }, 2).comment!
    const spec = handoff({ from: 'specing', to: 'to-do', assignees: ['ana'], mover: 'ana', credits: [] }, 1).comment!
    expect(creditsFromComments([code, 'a normal comment', spec])).toEqual([credit('spec', 'ana'), credit('build', 'bruna')].map((c, i) => ({ ...c, at: i + 1 })))
  })

  it('ignores markers without a credit or edited by hand', () => {
    expect(creditsFromComments(['<!-- kanban:handoff -->', '<!-- kanban:handoff {broken -->'])).toEqual([])
  })

  it('still reads credits written under the marker\'s earlier name', () => {
    expect(creditsFromComments(['<!-- done-board:handoff {"stage":"spec","logins":["ana"],"at":1} -->'])).toEqual([{ stage: 'spec', logins: ['ana'], at: 1 }])
  })
})
