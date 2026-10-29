import type { ReactNode } from "react"
import type { FolderState } from "../FolderForm"
import type { Workspace } from "../../hooks/useWorkspace"

export interface DashboardProps {
  folder: FolderState
  workspace: Workspace
  hasListing: boolean
}

export function ReadingRuns() {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted">
      <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-line border-t-accent" />
      Reading the selected databases…
    </p>
  )
}

export function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export const runTitle = (names: string[]) => names.join(" × ")
