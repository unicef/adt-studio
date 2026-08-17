export type Severity = "blocker" | "major" | "minor" | "nit"

export const SEVERITY_ORDER: Severity[] = ["blocker", "major", "minor", "nit"]

export interface Finding {
  /** Stable anchor id, e.g. "c-3" — used for deep links. */
  id: string
  severity: Severity
  /** Grouping bucket inside a review, e.g. "Spacing & radii". */
  category: string
  /** `file:line` when known, otherwise the surface name. */
  where: string
  /** One-line statement of the defect. */
  problem: string
  /** The concrete change to make. */
  fix: string
  /** Measured ratios, computed values, counts — anything auditable. */
  evidence?: string
  /** Screenshot filenames under .context/review-shots/ that show it. */
  shots?: string[]
}

export interface ClearedItem {
  what: string
  why: string
}

export interface Review {
  id: string
  /** Short nav label. */
  label: string
  title: string
  lead: string
  /** What the reviewer looked at and how. */
  method: string
  findings: Finding[]
  /** Checked and found fine — coverage record. */
  cleared?: ClearedItem[]
  /** Closing calls, highest leverage first. */
  verdict?: string[]
  /** Verbatim-but-trimmed tool output (tsc/lint), when the review ran commands. */
  toolOutput?: { command: string; result: string }[]
}
