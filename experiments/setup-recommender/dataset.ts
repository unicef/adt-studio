import { readFileSync } from "node:fs"

export const DECISIONS = ["preset", "renderStrategy", "pageGrouping", "sectioningMode", "activitiesGenerator", "figureExtraction"] as const
export type DecisionId = (typeof DECISIONS)[number]

export interface DatasetBook {
  id: string // PDF basename
  description?: string
  /** Known-good settings; only these fields are scored. */
  labels: Partial<Record<DecisionId, string>>
  /** True plain facts (genre, exercises, composition, diagrams), hand-labelled from the pages; every listed value is acceptable. */
  facts?: Partial<Record<string, string[]>>
  /** Reported apart from the main score. */
  diagnostic?: boolean
}
export interface Dataset { name: string; note: string; books: DatasetBook[] }

export const loadDataset = (file: string): Dataset => JSON.parse(readFileSync(file, "utf8"))
