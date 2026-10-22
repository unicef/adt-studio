import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react"
import { SelectionBar } from "./SelectionBar"
import { Verdicts } from "./Verdicts"
import { ConversionPicker } from "../ConversionPicker"
import { FolderForm } from "../FolderForm"
import { AttemptsCard } from "../report/AttemptsCard"
import { CallTimeline } from "../report/CallTimeline"
import { DurationStrip } from "../report/DurationStrip"
import { ErrorsCard } from "../report/ErrorsCard"
import { ExportButtons } from "../report/ExportButtons"
import { Kpis } from "../report/Kpis"
import { Notes } from "../report/Notes"
import { StepsChart } from "../report/StepsChart"
import { TaskTable } from "../report/TaskTable"
import { TokensCard } from "../report/TokensCard"
import { SummaryMatrix, TaskMatrix } from "../compare/ComparisonMatrix"
import { ModelComparison } from "../compare/ModelComparison"
import { PageComparison } from "../pages/PageComparison"
import { Panel, ReadingRuns, runTitle, type DashboardProps } from "./shared"
import type { Workspace } from "../../hooks/useWorkspace"
import { comparisonNotes, type Note } from "../../lib/comparison"
import { fmtInt } from "../../lib/format"
import type { RunView } from "../../lib/run-view"

type TabId = "overview" | "pages" | "models" | "time" | "calls" | "tokens" | "errors" | "tasks"

interface TabDef {
  id: TabId
  label: string
  count?: (notes: Note[]) => number
}

const TABS: TabDef[] = [
  { id: "overview", label: "Overview", count: (notes) => notes.filter((n) => n.tone === "warn").length },
  { id: "pages", label: "Pages" },
  { id: "models", label: "Models" },
  { id: "time", label: "Time" },
  { id: "calls", label: "Call durations" },
  { id: "tokens", label: "Tokens" },
  { id: "errors", label: "Errors & retries" },
  { id: "tasks", label: "All tasks" },
]

const PAIR = "grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,26rem),1fr))]"

export function Dashboard({ folder, workspace, hasListing }: DashboardProps) {
  const { runs, selected, pending } = workspace
  const [tab, setTab] = useState<TabId>("overview")
  return (
    <div className="mx-auto flex max-w-[96rem] flex-col gap-5 px-4 py-6 lg:px-6">
      <FolderForm folder={folder} />
      {hasListing && selected.length === 0 && (
        <Panel title="Pick conversions to compare">
          <ConversionPicker workspace={workspace} />
        </Panel>
      )}
      {selected.length > 0 && <SelectionBar workspace={workspace} />}
      {pending && <ReadingRuns />}
      {runs.length > 0 && <FocusReport workspace={workspace} runs={runs} tab={tab} onTab={setTab} />}
    </div>
  )
}

interface FocusReportProps {
  workspace: Workspace
  runs: RunView[]
  tab: TabId
  onTab: (tab: TabId) => void
}

function FocusReport({ workspace, runs, tab, onTab }: FocusReportProps) {
  const notes = useMemo(() => comparisonNotes(runs), [runs])

  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
    if (!step) return
    event.preventDefault()
    const index = TABS.findIndex((t) => t.id === tab)
    const next = TABS[(index + step + TABS.length) % TABS.length]
    onTab(next.id)
    document.getElementById(`focus-tab-${next.id}`)?.focus()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-xl font-medium text-balance text-ink">{runTitle(runs.map((r) => r.metrics.name))}</h2>
          <ExportButtons runs={runs} notes={notes} />
        </div>
        <div role="tablist" aria-label="Report topic" onKeyDown={onKeyDown} className="-mx-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
          {TABS.map((t) => {
            const active = t.id === tab
            const count = t.count?.(notes) ?? 0
            return (
              <button
                key={t.id}
                id={`focus-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="focus-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => onTab(t.id)}
                className={`relative -mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${active ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink-2"}`}
              >
                {t.label}
                {count > 0 && <span className="rounded-full bg-warn-bg px-1.5 text-[11px] tabular-nums text-warn">{fmtInt(count)}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div id="focus-panel" role="tabpanel" aria-labelledby={`focus-tab-${tab}`} key={tab} className="enter flex flex-col gap-4">
        <TabContent tab={tab} workspace={workspace} runs={runs} notes={notes} />
      </div>
    </div>
  )
}

function TabContent({ tab, workspace, runs, notes }: { tab: TabId; workspace: Workspace; runs: RunView[]; notes: Note[] }): ReactNode {
  switch (tab) {
    case "overview":
      return (
        <>
          <Kpis runs={runs} />
          <Verdicts runs={runs} />
          <Notes notes={notes} />
          <SummaryMatrix workspace={workspace} runs={runs} />
        </>
      )
    case "pages":
      return <PageComparison workspace={workspace} runs={runs} />
    case "models":
      return <ModelComparison workspace={workspace} runs={runs} />
    case "time":
      return (
        <>
          <StepsChart runs={runs} />
          <CallTimeline runs={runs} />
        </>
      )
    case "calls":
      return <DurationStrip runs={runs} />
    case "tokens":
      return <TokensCard runs={runs} />
    case "errors":
      return (
        <div className={PAIR}>
          <ErrorsCard runs={runs} />
          <AttemptsCard runs={runs} />
        </div>
      )
    case "tasks":
      return (
        <>
          <TaskMatrix workspace={workspace} runs={runs} />
          <TaskTable runs={runs} />
        </>
      )
  }
}
