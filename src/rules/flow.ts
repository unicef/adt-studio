// The columns every card moves through. Column names match the options of the
// Kanban Project's "Status" field: they are the contract between the board and
// the bot. Renaming a column on the Project means renaming it here too.

export type ColumnKind = 'inbox' | 'queue' | 'active' | 'done'

export type StageId = 'intake' | 'spec' | 'build' | 'review' | 'done'

export type Column = { id: string; name: string; stage: StageId; kind: ColumnKind }

// Each stage has a column where work waits (queue) and one where someone is
// working on it (active).
export const COLUMNS: Column[] = [
  { id: 'issues', name: 'Inbox', stage: 'intake', kind: 'inbox' },
  { id: 'approved', name: 'Approved', stage: 'intake', kind: 'queue' },
  { id: 'to-spec', name: 'To spec', stage: 'spec', kind: 'queue' },
  { id: 'specing', name: 'Specing', stage: 'spec', kind: 'active' },
  { id: 'to-do', name: 'To do', stage: 'build', kind: 'queue' },
  { id: 'doing', name: 'Doing', stage: 'build', kind: 'active' },
  { id: 'to-review', name: 'To review', stage: 'review', kind: 'queue' },
  { id: 'reviewing', name: 'Reviewing', stage: 'review', kind: 'active' },
  { id: 'done', name: 'Done', stage: 'done', kind: 'done' },
]

export const COLUMN_BY_ID = new Map(COLUMNS.map((c) => [c.id, c]))
const COLUMN_BY_NAME = new Map(COLUMNS.map((c) => [normalize(c.name), c]))

// "To review", "to-review" and "TO REVIEW" are the same column.
export function columnFromStatusName(name: string | null | undefined): Column | undefined {
  return name ? COLUMN_BY_NAME.get(normalize(name)) : undefined
}

function normalize(name: string) {
  return name.toLowerCase().replace(/[^a-z]/g, '')
}

export function columnIndex(id: string) {
  return COLUMNS.findIndex((c) => c.id === id)
}
