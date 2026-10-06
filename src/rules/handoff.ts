import { COLUMN_BY_ID, columnIndex, type StageId } from './flow'

// Hand-off: when a card leaves a stage it was being worked in, the people on
// it get the credit in a comment on the issue and are unassigned, so an
// assignee always means "on it right now" and the issue keeps the history:
//
//   Doing → To review      "Code done by @b", @b unassigned
//   To review → Reviewing  nobody assigned, so whoever moved it takes it
//   Reviewing → Doing      back for changes: @b (who coded) is assigned again
//   Reviewing → Done       "Reviewed and tested by @c" and the story: spec, code, review
//
// Pure, so the rules can be tested without GitHub.

export type Credit = { stage: StageId; logins: string[]; at: number }

export type HandoffInput = {
  from: string
  to: string
  assignees: string[]
  // Who moved the card (the webhook sender); null when unknown.
  mover: string | null
  // People who approved the card's pull requests: the most reliable reviewer.
  approvers?: string[]
  // Earlier hand-offs on this card, oldest first.
  credits: Credit[]
}

export type Handoff = {
  credit: Credit | null
  comment: string | null
  assign: string[]
  unassign: string[]
}

const DONE_BY: Record<StageId, string> = {
  intake: 'Triage done',
  spec: 'Spec done',
  build: 'Code done',
  review: 'Reviewed and tested',
  done: 'Finished',
}

const STORY: [StageId, string][] = [
  ['spec', 'Spec'],
  ['build', 'Code'],
  ['review', 'Review & test'],
]

export const HANDOFF_MARKER = '<!-- kanban:handoff -->'

export function handoff(input: HandoffInput, now = Date.now()): Handoff {
  const from = COLUMN_BY_ID.get(input.from)
  const to = COLUMN_BY_ID.get(input.to)
  const none: Handoff = { credit: null, comment: null, assign: [], unassign: [] }
  if (!from || !to || from.id === to.id) return none

  const forward = columnIndex(to.id) > columnIndex(from.id)
  const leftWork = forward && from.kind === 'active'
  const people = (xs: string[]) => [...new Map(xs.map((x) => [x.toLowerCase(), x])).values()]

  // Credit for the stage being finished.
  let credit: Credit | null = null
  if (leftWork) {
    const approvers = from.stage === 'review' ? (input.approvers ?? []) : []
    const logins = people(approvers.length ? approvers : input.assignees.length ? input.assignees : input.mover ? [input.mover] : [])
    if (logins.length) credit = { stage: from.stage, logins, at: now }
  }

  // Who should be on the card now: nobody in a queue or in Done; in a column
  // where work happens, whoever did this stage before (going back), whoever
  // already took it, or else whoever moved it.
  let target: string[] = []
  if (to.kind === 'active') {
    const before = forward ? undefined : lastCredit(input.credits, to.stage)?.logins
    target = before ?? (leftWork ? [] : input.assignees)
    if (!target.length && input.mover) target = [input.mover]
  }
  const has = (xs: string[], x: string) => xs.some((y) => y.toLowerCase() === x.toLowerCase())
  const assign = people(target.filter((x) => !has(input.assignees, x)))
  const unassign = input.assignees.filter((x) => !has(target, x))

  // Comment only when a stage is finished, or when the card reaches Done.
  const lines: string[] = []
  const by = (logins: string[]) => logins.map((l) => `@${l}`).join(', ')
  if (credit) lines.push(`**${DONE_BY[credit.stage]} by ${by(credit.logins)}**, moved from ${from.name} to ${to.name}${input.mover ? ` by @${input.mover}` : ''}.`)
  if (to.kind === 'done') {
    const all = [...input.credits, ...(credit ? [credit] : [])]
    const story = STORY.map(([stage, label]) => {
      const c = lastCredit(all, stage)
      return c ? `${label} ${by(c.logins)}` : null
    }).filter(Boolean)
    if (story.length) lines.push(`Finished. ${story.join(' · ')}`)
  }
  const comment = lines.length ? `${lines.join('\n\n')}\n\n<sub>ADT Backlog Wizard · hand-off</sub>\n${creditMarker(credit)}` : null

  return { credit, comment, assign, unassign }
}

// The comment carries its credit in a hidden marker, so the history can be
// read back from the issue itself: the bot keeps no database.
export function creditMarker(credit: Credit | null) {
  return credit ? `<!-- kanban:handoff ${JSON.stringify(credit)} -->` : HANDOFF_MARKER
}

export function creditsFromComments(bodies: string[]): Credit[] {
  const out: Credit[] = []
  for (const body of bodies) {
    // done-board:handoff is the marker's earlier name, from the first tests.
    const m = /<!-- (?:kanban|done-board):handoff (\{.*?\}) -->/.exec(body)
    if (!m) continue
    try {
      const c = JSON.parse(m[1]!) as Credit
      if (c.stage && Array.isArray(c.logins)) out.push(c)
    } catch {
      // A marker someone edited by hand; skip it.
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

function lastCredit(credits: Credit[], stage: StageId) {
  return [...credits].reverse().find((c) => c.stage === stage)
}
