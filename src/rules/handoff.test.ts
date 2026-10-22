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

  it('does nothing for moves between waiting columns: no comment, people stay', () => {
    expect(handoff({ from: 'approved', to: 'to-spec', assignees: [], mover: 'ana', credits: [] }, at)).toEqual({ credit: null, comment: null, assign: [], unassign: [] })
    expect(handoff({ from: 'to-do', to: 'to-review', assignees: ['bruna'], mover: 'ana', credits: [] }, at).unassign).toEqual([])
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

describe('spec review lane', () => {
  const pr = { number: 890, author: 'ana', approvers: ['bruna'], merged: false }

  it('a finished spec waits for approval: nothing changes, no comment', () => {
    expect(handoff({ from: 'specing', to: 'spec-review', assignees: ['ana'], mover: 'ana', credits: [] }, at)).toEqual({ credit: null, comment: null, assign: [], unassign: [] })
  })

  it('moved on by someone else: written by the writer, approved by them, with the spec PR', () => {
    const h = handoff({ from: 'spec-review', to: 'to-do', assignees: ['ana'], mover: 'bruna', credits: [], specPr: pr }, at)
    expect(h.credit).toEqual({ stage: 'spec', logins: ['ana'], approvers: ['bruna'], at })
    expect(h.unassign).toEqual(['ana'])
    expect(h.comment).toContain('**Spec written by @ana, approved by @bruna**, moved from Spec review to To do by @bruna.')
    expect(h.comment).toContain('Spec PR: #890')
  })

  it('moved on by the writer: written only, nobody approved', () => {
    const h = handoff({ from: 'spec-review', to: 'to-do', assignees: ['ana'], mover: 'ana', credits: [] }, at)
    expect(h.credit).toEqual({ stage: 'spec', logins: ['ana'], at })
    expect(h.comment).toContain('**Spec written by @ana**, moved from Spec review to To do by @ana.')
  })

  it('the spec PR was merged: its approvers approved it, its author wrote it', () => {
    const h = handoff({ from: 'spec-review', to: 'to-do', assignees: [], mover: null, credits: [], specPr: { ...pr, merged: true } }, at)
    expect(h.credit).toEqual({ stage: 'spec', logins: ['ana'], approvers: ['bruna'], at })
    expect(h.comment).toContain('**Spec written by @ana, approved by @bruna**, moved from Spec review to To do when spec PR #890 was merged.')
  })

  it('a merged spec still in Specing moves on the same way', () => {
    const h = handoff({ from: 'specing', to: 'to-do', assignees: ['ana'], mover: null, credits: [], specPr: { ...pr, merged: true } }, at)
    expect(h.credit).toEqual({ stage: 'spec', logins: ['ana'], approvers: ['bruna'], at })
  })

  it('changes requested: back to Specing, nothing changes', () => {
    expect(handoff({ from: 'spec-review', to: 'specing', assignees: ['ana'], mover: 'bruna', credits: [] }, at)).toEqual({ credit: null, comment: null, assign: [], unassign: [] })
  })

  it('the story at Done shows who approved the spec', () => {
    const credits = [{ stage: 'spec' as const, logins: ['ana'], approvers: ['bruna'], at }, credit('build', 'caio')]
    const h = handoff({ from: 'reviewing', to: 'done', assignees: ['dani'], mover: 'dani', credits }, at)
    expect(h.comment).toContain('Finished. Spec @ana (approved by @bruna) · Code @caio · Review & test @dani')
  })
})

describe('moved to Done by GitHub (issue closed by a merged PR)', () => {
  it('credits the PR approvers and tells the story, without a mover', () => {
    const h = handoff({ from: 'reviewing', to: 'done', assignees: ['caio'], mover: null, approvers: ['dani'], credits: [credit('build', 'bruna')] }, at)
    expect(h.credit).toEqual(credit('review', 'dani'))
    expect(h.comment).toContain('**Reviewed and tested by @dani**, moved from Reviewing to Done.')
    expect(h.comment).toContain('Finished. Code @bruna · Review & test @dani')
    expect(h.unassign).toEqual(['caio'])
  })
})

describe('placing a card leaves its people alone', () => {
  it('triage straight to a later waiting column keeps the assignees', () => {
    expect(handoff({ from: 'issues', to: 'to-review', assignees: ['nick', 'zig'], mover: 'zig', credits: [] }, at)).toEqual({ credit: null, comment: null, assign: [], unassign: [] })
    expect(handoff({ from: 'approved', to: 'to-spec', assignees: ['ana'], mover: 'bruna', credits: [] }, at).unassign).toEqual([])
  })

  it('but finishing, pausing, sending back and Done still take people off', () => {
    expect(handoff({ from: 'doing', to: 'to-review', assignees: ['bruna'], mover: 'bruna', credits: [] }, at).unassign).toEqual(['bruna'])
    expect(handoff({ from: 'doing', to: 'to-do', assignees: ['bruna'], mover: 'bruna', credits: [] }, at).unassign).toEqual(['bruna'])
    expect(handoff({ from: 'to-review', to: 'done', assignees: ['caio'], mover: 'caio', credits: [] }, at).unassign).toEqual(['caio'])
  })

  it('pulling into a working column keeps whoever is already on it', () => {
    const h = handoff({ from: 'issues', to: 'specing', assignees: ['ana'], mover: 'bruna', credits: [] }, at)
    expect(h.assign).toEqual([])
    expect(h.unassign).toEqual([])
  })
})

describe('reviews on the PR', () => {
  it('review requested while the card waits in To review: the reviewer takes it', () => {
    const h = handoff({ from: 'to-review', to: 'reviewing', assignees: [], mover: 'eli', credits: [credit('build', 'eli')], take: ['rech'], via: 'when @rech was asked to review PR #975' }, at)
    expect(h).toEqual({ credit: null, comment: null, assign: ['rech'], unassign: [] })
  })

  it('review requested while still in Doing: code done, the reviewer takes it', () => {
    const h = handoff({ from: 'doing', to: 'reviewing', assignees: ['eli'], mover: 'eli', credits: [], take: ['rech'], via: 'when @rech was asked to review PR #975' }, at)
    expect(h.credit).toEqual(credit('build', 'eli'))
    expect(h.assign).toEqual(['rech'])
    expect(h.unassign).toEqual(['eli'])
    expect(h.comment).toContain('**Code done by @eli**, moved from Doing to Reviewing when @rech was asked to review PR #975.')
  })

  it('changes requested: back to the PR author, the reviewer is off it', () => {
    const h = handoff({ from: 'reviewing', to: 'doing', assignees: ['rech'], mover: 'eli', credits: [credit('build', 'eli')], take: ['eli'], via: 'when @rech requested changes on PR #975' }, at)
    expect(h).toEqual({ credit: null, comment: null, assign: ['eli'], unassign: ['rech'] })
  })

  it('reaching Done without anyone in Reviewing credits the PR approvers (#959)', () => {
    const h = handoff({ from: 'to-review', to: 'done', assignees: [], mover: null, approvers: ['rech'], credits: [credit('build', 'eli')] }, at)
    expect(h.credit).toEqual(credit('review', 'rech'))
    expect(h.comment).toContain('**Reviewed and tested by @rech**, moved from To review to Done.')
    expect(h.comment).toContain('Finished. Code @eli · Review & test @rech')
  })

  it('a review already credited is not credited twice at Done', () => {
    const h = handoff({ from: 'to-review', to: 'done', assignees: [], mover: null, approvers: ['rech'], credits: [credit('build', 'eli'), credit('review', 'dani')] }, at)
    expect(h.credit).toBeNull()
  })
})
