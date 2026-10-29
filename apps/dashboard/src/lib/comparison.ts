import { tierLabel } from "./pricing"
import type { ConversionSummary } from "./types"

export interface Note {
  tone: "warn" | "info"
  text: string
}

const normalize = (text: string) => text.replace(/\r\n/g, "\n").trim()

export function pageRange(config: string | null): string | null {
  if (!config) return null
  const start = /^start_page:\s*(\d+)/m.exec(config)?.[1]
  const end = /^end_page:\s*(\d+)/m.exec(config)?.[1]
  if (!start && !end) return null
  return `pages ${start ?? "1"} to ${end ?? "end"}`
}

function changedConfigKeys(a: string, b: string): string[] {
  const topLevel = (text: string) => {
    const blocks = new Map<string, string>()
    let key = ""
    for (const line of normalize(text).split("\n")) {
      const match = /^([A-Za-z_][\w-]*):/.exec(line)
      if (match) key = match[1]
      blocks.set(key, `${blocks.get(key) ?? ""}${line}\n`)
    }
    return blocks
  }
  const left = topLevel(a)
  const right = topLevel(b)
  const keys = new Set([...left.keys(), ...right.keys()])
  return [...keys].filter((k) => left.get(k) !== right.get(k))
}

export function comparisonNotes(data: ConversionSummary[]): Note[] {
  const notes: Note[] = []
  const runs = data.map((d) => d.metrics)
  if (data.length >= 2) {
    const hashes = new Set(data.map((d) => d.pdfHash ?? "no-pdf"))
    if (data.some((d) => !d.pdfHash)) notes.push({ tone: "warn", text: "One of the conversions has no PDF in its folder, so there is no way to confirm it is the same book." })
    else if (hashes.size === 1) notes.push({ tone: "info", text: "All conversions use the same PDF (same SHA-256)." })
    else notes.push({ tone: "warn", text: "The PDFs differ: these conversions did not process the same file." })

    const [base, ...others] = data
    if (base.config === null || others.some((d) => d.config === null)) {
      notes.push({ tone: "warn", text: "One of the conversions has no config.yaml." })
    } else {
      const differing = others.flatMap((d) => changedConfigKeys(base.config ?? "", d.config ?? "").map((k) => `${d.name}: ${k}`))
      const range = pageRange(base.config)
      if (differing.length === 0) notes.push({ tone: "info", text: `Same config.yaml in all conversions${range ? ` (${range})` : ""}.` })
      else notes.push({ tone: "warn", text: `config.yaml differs from the baseline in: ${differing.join(", ")}.` })
    }
  }

  const noEffort = runs.filter((r) => r.efforts.length === 0).map((r) => r.name)
  if (noEffort.length) {
    notes.push({ tone: "info", text: `Reasoning effort is not recorded in the log of: ${noEffort.join(", ")}. Conversions made before the effort was logged cannot confirm it.` })
  }
  for (const run of runs) {
    if (run.cacheHits > 0) {
      notes.push({ tone: "warn", text: `${run.name}: ${run.cacheHits} calls came from the cache (the conversion was partly re-run). Time and tokens are lower than in a run from scratch.` })
    }
    if (run.unfinishedSteps.length) {
      notes.push({ tone: "warn", text: `${run.name}: unfinished steps (${run.unfinishedSteps.join(", ")}).` })
    }
    if (run.finalFailures > 0) {
      notes.push({ tone: "warn", text: `${run.name}: ${run.finalFailures} items ended with their last attempt failing.` })
    }
    if (!run.startedFromPdf) {
      notes.push({ tone: "info", text: `${run.name}: the PDF timestamp does not match the conversion, so total time starts at the first recorded step.` })
    }
    if (run.unpricedCalls > 0) {
      notes.push({ tone: "warn", text: `${run.name}: no ${tierLabel(run.priceTier)} price for ${run.unpricedModels.join(", ")}, so the cost leaves out ${run.unpricedCalls} calls.` })
    }
  }
  if (runs.length) {
    notes.push({ tone: "info", text: `Cost uses each model's ${tierLabel(runs[0].priceTier)} price per token. The log does not record which tier a call was billed in, nor cache writes, so cache writes are not priced.` })
  }
  return notes
}
