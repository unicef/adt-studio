import type { Note } from "./comparison"
import { fmtDec1, fmtDuration, fmtInt, fmtPct, fmtUsd } from "./format"
import { relativeChange, taskOrder } from "./metrics"
import { tierLabel } from "./pricing"
import type { RunMetrics } from "./types"

export function downloadText(fileName: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text
}

export function callsCsv(runs: RunMetrics[]): string {
  const header = ["conversion", "llm_log_id", "task", "model", "effort", "item", "attempt", "success", "error_count", "start_s", "duration_s", "input_tokens", "cached_input_tokens", "output_tokens", "cost_usd"]
  const lines = runs.flatMap((run) =>
    run.callSpans.map((c) =>
      [run.name, c.id, c.task, c.model, c.effort, c.item, c.attempt, c.success ? 1 : 0, c.errorCount, c.startS, c.durationS, c.inputTokens, c.cachedInputTokens, c.outputTokens, c.costUsd].map(csvCell).join(","),
    ),
  )
  return [header.join(","), ...lines].join("\n")
}

const row = (cells: string[]) => `| ${cells.join(" | ")} |`
const divider = (count: number, firstLeft = true) => row(Array.from({ length: count }, (_, i) => (i === 0 && firstLeft ? "---" : "---:")))

export function reportMarkdown(runs: RunMetrics[], notes: Note[]): string {
  const [base] = runs
  const names = runs.map((r) => r.name)
  const delta = (pick: (r: RunMetrics) => number) => (r: RunMetrics, i: number) => {
    if (i === 0) return ""
    const change = relativeChange(pick(base), pick(r))
    return change === null ? "" : ` (${fmtPct(change)})`
  }
  const metricRow = (label: string, pick: (r: RunMetrics) => number, format: (n: number) => string) =>
    row([label, ...runs.map((r, i) => `${format(pick(r))}${delta(pick)(r, i)}`)])

  const out: string[] = []
  out.push(`# Conversion comparison: ${names.join(" × ")}`, "")
  out.push(`Generated ${new Date().toISOString()} from the llm_log and step_runs tables of each database. Changes are relative to ${base.name}.`, "")
  if (notes.length) {
    out.push("## Notes", "")
    for (const note of notes) out.push(`- ${note.tone === "warn" ? "⚠️ " : ""}${note.text}`)
    out.push("")
  }

  out.push("## Summary", "", row(["Metric", ...names]), divider(names.length + 1))
  out.push(row(["Models", ...runs.map((r) => r.models.join(", "))]))
  out.push(row(["Reasoning effort", ...runs.map((r) => (r.efforts.length ? r.efforts.join(", ") : "not recorded"))]))
  out.push(metricRow("Total time", (r) => r.totalS, fmtDuration))
  out.push(metricRow("Time after extraction", (r) => r.postExtractS, fmtDuration))
  out.push(metricRow("LLM calls", (r) => r.callCount, fmtInt))
  out.push(metricRow("Failed calls", (r) => r.failedCalls, fmtInt))
  out.push(metricRow("Validation errors", (r) => r.validationErrors, fmtInt))
  out.push(metricRow("Items that ended failing", (r) => r.finalFailures, fmtInt))
  out.push(metricRow("Timeouts", (r) => r.timeouts, fmtInt))
  out.push(metricRow("Cache hits", (r) => r.cacheHits, fmtInt))
  out.push(metricRow("Input tokens", (r) => r.inputTokens, fmtInt))
  out.push(metricRow("Output tokens", (r) => r.outputTokens, fmtInt))
  out.push(metricRow("Estimated cost", (r) => r.costUsd, fmtUsd))
  out.push(metricRow("Summed call time", (r) => r.llmTimeS, fmtDuration))
  out.push(metricRow("Peak concurrent calls", (r) => r.peakConcurrency, fmtInt))
  out.push("", `Cost prices each call at its model's ${tierLabel(base.priceTier)} price per token, with cached input tokens at the cached-input price. Calls of models without a price are left out.`, "")

  out.push("## Steps (seconds)", "", row(["Step", ...names]), divider(names.length + 1))
  const steps = [...new Set(runs.flatMap((r) => r.steps.map((s) => s.step)))]
  for (const step of steps) out.push(row([step, ...runs.map((r) => {
    const s = r.steps.find((q) => q.step === step)
    return s ? fmtDec1(s.durationS) : "—"
  })]))
  out.push("")

  out.push("## By task", "")
  out.push(row(["Task", "Conversion", "Model", "Effort", "Calls", "Failed", "Errors", "Input tokens", "Output tokens", "Mean (s)", "p50 (s)", "p90 (s)", "Max (s)"]))
  out.push(row(["---", "---", "---", "---", ...Array.from({ length: 9 }, () => "---:")]))
  for (const task of taskOrder(runs)) {
    for (const run of runs) {
      const t = run.byTask.find((q) => q.task === task)
      if (!t) continue
      out.push(row([task, run.name, t.models.join(", "), t.efforts.join(", ") || "—", fmtInt(t.calls), fmtInt(t.failedCalls), fmtInt(t.validationErrors), fmtInt(t.inputTokens), fmtInt(t.outputTokens), fmtDec1(t.avgS), fmtDec1(t.p50S), fmtDec1(t.p90S), fmtDec1(t.maxS)]))
    }
  }
  out.push("")

  out.push("## Errors by type", "", row(["Type", "Task", ...names]), divider(names.length + 2))
  const keys = [...new Set(runs.flatMap((r) => r.errors.map((e) => `${e.type}|${e.task}`)))]
  const total = (key: string) => runs.reduce((s, r) => s + (r.errors.find((e) => `${e.type}|${e.task}` === key)?.count ?? 0), 0)
  for (const key of keys.sort((a, b) => total(b) - total(a))) {
    const [type, task] = key.split("|")
    out.push(row([type.replace(/\|/g, "\\|"), task, ...runs.map((r) => fmtInt(r.errors.find((e) => e.type === type && e.task === task)?.count ?? 0))]))
  }
  out.push("")
  return out.join("\n")
}
