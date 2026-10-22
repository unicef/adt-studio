import type { Note } from "../../lib/comparison"
import { callsCsv, downloadText, reportMarkdown } from "../../lib/export"
import type { RunView } from "../../lib/run-view"

export function ExportButtons({ runs, notes }: { runs: RunView[]; notes: Note[] }) {
  const fileBase = runs.map((r) => r.metrics.name).join("_vs_")
  return (
    <div className="flex flex-wrap gap-2">
      <ExportButton onClick={() => downloadText(`${fileBase}.md`, reportMarkdown(runs.map((r) => r.metrics), notes), "text/markdown")}>Report .md</ExportButton>
      <ExportButton onClick={() => downloadText(`${fileBase}-calls.csv`, callsCsv(runs.map((r) => r.metrics)), "text/csv")}>Calls .csv</ExportButton>
    </div>
  )
}

function ExportButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Download ${children}`}
      className="press inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-ink/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5">
        <path d="M8 2.5v8m0 0L4.8 7.3M8 10.5l3.2-3.2M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </button>
  )
}
