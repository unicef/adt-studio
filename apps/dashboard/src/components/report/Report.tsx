import { useMemo } from "react"
import { Section, Swatch } from "../Card"
import { AttemptsCard } from "./AttemptsCard"
import { CallTimeline } from "./CallTimeline"
import { DurationStrip } from "./DurationStrip"
import { ErrorsCard } from "./ErrorsCard"
import { Kpis } from "./Kpis"
import { ModelTable } from "./ModelTable"
import { StepsChart } from "./StepsChart"
import { TaskTable } from "./TaskTable"
import { TokensCard } from "./TokensCard"
import { comparisonNotes, type Note } from "../../lib/comparison"
import { callsCsv, downloadText, reportMarkdown } from "../../lib/export"
import { fmtDateTime } from "../../lib/format"
import type { RunView } from "../../lib/run-view"

export function Report({ runs }: { runs: RunView[] }) {
  const notes = useMemo(() => comparisonNotes(runs), [runs])
  const fileBase = runs.map((r) => r.metrics.name).join("_vs_")

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-medium text-balance text-ink">{runs.map((r) => r.metrics.name).join(" × ")}</h2>
          <div className="flex flex-wrap gap-2">
            <ExportButton onClick={() => downloadText(`${fileBase}.md`, reportMarkdown(runs.map((r) => r.metrics), notes), "text/markdown")}>Download report (.md)</ExportButton>
            <ExportButton onClick={() => downloadText(`${fileBase}-calls.csv`, callsCsv(runs.map((r) => r.metrics)), "text/csv")}>Download calls (.csv)</ExportButton>
          </div>
        </div>
        <ul className="flex flex-col gap-1 text-xs text-muted">
          {runs.map((run, i) => (
            <li key={run.metrics.name} className="flex flex-wrap items-center gap-x-2">
              <Swatch color={run.color} />
              <strong className="font-medium text-ink">{run.metrics.name}</strong>
              {i === 0 && <span className="rounded border border-line px-1 text-[11px]">baseline</span>}
              <span>started {fmtDateTime(run.metrics.startedAt)}</span>
              <span>· {run.metrics.models.join(", ")}</span>
              <span>· effort {run.metrics.efforts.length ? run.metrics.efforts.join(", ") : "not recorded"}</span>
            </li>
          ))}
        </ul>
      </header>

      {notes.length > 0 && <Notes notes={notes} />}

      <Section id="summary" title="Summary">
        <Kpis runs={runs} />
      </Section>

      <Section id="time" title="Time">
        <StepsChart runs={runs} />
        <CallTimeline runs={runs} />
      </Section>

      <Section id="call-durations" title="Duration of each call">
        <DurationStrip runs={runs} />
      </Section>

      <Section id="tokens" title="Tokens">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,26rem),1fr))]">
          <TokensCard runs={runs} />
          <ModelTable runs={runs} />
        </div>
      </Section>

      <Section id="errors" title="Errors">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,26rem),1fr))]">
          <ErrorsCard runs={runs} />
          <AttemptsCard runs={runs} />
        </div>
      </Section>

      <Section id="tasks" title="All tasks">
        <TaskTable runs={runs} />
      </Section>
    </div>
  )
}

function ExportButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-page focus-visible:outline-2 focus-visible:outline-ink"
    >
      {children}
    </button>
  )
}

function Notes({ notes }: { notes: Note[] }) {
  return (
    <ul className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-4 text-sm leading-relaxed">
      {notes.map((note, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden="true" className={note.tone === "warn" ? "text-warn" : "text-muted"}>{note.tone === "warn" ? "⚠" : "ℹ"}</span>
          <span>
            <span className="sr-only">{note.tone === "warn" ? "Warning: " : "Note: "}</span>
            {note.text}
          </span>
        </li>
      ))}
    </ul>
  )
}
