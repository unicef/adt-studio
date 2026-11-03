#!/usr/bin/env node

import path from "node:path"
import cliProgress from "cli-progress"
import { PIPELINE, STAGE_BY_NAME, STEP_TO_STAGE } from "@adt/types"
import type { StepName, StageName, ProgressEvent } from "@adt/types"
import { parseCliArgs, USAGE } from "./cli-args.js"
import { runFullPipeline } from "./pipeline-dag.js"
import { diagnoseBook, diagnoseBooks, formatDiagnosis, hasFindings } from "./book-doctor.js"
import { diffExtractReports, extractReportCsv, formatExtractReport, formatExtractReportDiff, hasExtractFindings, reportExtract, reportExtracts } from "./extract-report.js"
import type { Progress } from "./progress.js"

function log(msg: string): void {
  process.stderr.write(msg)
}

function getStepLabel(step: StepName): string {
  const stage = STAGE_BY_NAME[STEP_TO_STAGE[step]]
  return stage.steps.find((s) => s.name === step)?.label ?? step
}

/**
 * CLI progress display driven by stage/step events.
 *
 * All bars are pre-created from the PIPELINE definition in a single multibar.
 * This avoids bar creation/destruction during parallel stage execution.
 */
function createCliProgress(): Progress & { stop(): void } {
  const maxLabel = Math.max(
    ...PIPELINE.flatMap((s) => s.steps.map((st) => st.label.length)),
  )
  const stageFormat = (label: string) => ` ${label}`
  // A skipped step never ran, so its bar stays empty and says so instead of
  // showing a filled bar that looks like a completed step.
  const stepFormat =
    (label: string): cliProgress.GenericFormatter =>
    (options, params, payload: { skipped?: boolean }) => {
      const name = `   ${label.padEnd(maxLabel + 2)} `
      const bar = cliProgress.Format.BarFormat(
        payload.skipped ? 0 : params.progress,
        options,
      )
      const status = payload.skipped
        ? "skipped"
        : `${params.value}/${params.total}`
      return `${name}[${bar}] ${status}`
    }

  const multibar = new cliProgress.MultiBar(
    {
      clearOnComplete: false,
      hideCursor: true,
      barsize: 30,
      linewrap: false,
      forceRedraw: true,
    },
    cliProgress.Presets.shades_grey,
  )

  // Pre-create a header + bars for every stage/step in pipeline order
  const bars = new Map<StepName, cliProgress.SingleBar>()
  for (let i = 0; i < PIPELINE.length; i++) {
    const stage = PIPELINE[i]
    // Blank spacer line between stages (skip before first)
    if (i > 0) multibar.create(0, 0, {}, { format: " " })
    // Stage header — renders only the stage label
    multibar.create(0, 0, {}, { format: stageFormat(stage.label) })
    for (const step of stage.steps) {
      const bar = multibar.create(1, 0, {}, {
        format: stepFormat(step.label),
      })
      bars.set(step.name, bar)
    }
  }

  return {
    emit(event: ProgressEvent) {
      if (event.type === "step-complete") {
        const bar = bars.get(event.step)
        if (bar) bar.update(bar.getTotal())
        return
      }

      if (event.type === "step-skip") {
        const bar = bars.get(event.step)
        if (bar) bar.update(0, { skipped: true })
        return
      }

      if (event.type === "step-error") {
        multibar.stop()
        log(`\n  ✘ ${getStepLabel(event.step)}: ${event.error}\n`)
        return
      }

      if (event.type === "step-progress") {
        if (event.page !== undefined && event.totalPages !== undefined) {
          const bar = bars.get(event.step)
          if (bar) {
            bar.setTotal(event.totalPages)
            bar.update(event.page)
          }
        }
        return
      }
    },

    stop() {
      multibar.stop()
    },
  }
}

/** `pipeline doctor [books-dir] [--label <label>] [--json]`: read-only. */
function runDoctor(args: string[]): void {
  let booksDir = "books"
  let label: string | undefined
  let json = false
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === "--json") json = true
    else if (arg === "--label") label = args[++index]
    else if (arg.startsWith("--")) throw new Error(`Unknown doctor option: ${arg}`)
    else booksDir = arg
  }
  const reports = label ? [diagnoseBook(booksDir, label)] : diagnoseBooks(booksDir)
  if (json) process.stdout.write(JSON.stringify(reports, null, 2) + "\n")
  else if (reports.length === 0) process.stdout.write(`No books found under ${path.resolve(booksDir)}\n`)
  else process.stdout.write(reports.map(formatDiagnosis).join("\n") + "\n")
  process.exitCode = reports.some((report) => report.error) ? 2 : reports.some(hasFindings) ? 1 : 0
}

/** `pipeline extract-report [books-dir] [--label <label>] [--compare <label>] [--json] [--csv pages|tasks] [--config <path>]`: read-only. */
function runExtractReport(args: string[]): void {
  let booksDir = "books"
  let label: string | undefined
  let compare: string | undefined
  let configPath: string | undefined
  let csv: "pages" | "tasks" | undefined
  let json = false
  const value = (index: number, option: string): string => {
    const next = args[index]
    if (next === undefined || next.startsWith("--")) throw new Error(`${option} needs a value`)
    return next
  }
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === "--json") json = true
    else if (arg === "--label") label = value(++index, arg)
    else if (arg === "--compare") compare = value(++index, arg)
    else if (arg === "--config") configPath = value(++index, arg)
    else if (arg === "--csv") {
      const kind = value(++index, arg)
      if (kind !== "pages" && kind !== "tasks") throw new Error(`--csv expects "pages" or "tasks", got ${kind}`)
      csv = kind
    }
    else if (arg.startsWith("--")) throw new Error(`Unknown extract-report option: ${arg}`)
    else booksDir = arg
  }
  if (compare && !label) throw new Error("--compare needs --label for the baseline book")
  const reports = label ? [reportExtract(booksDir, label, configPath)] : reportExtracts(booksDir, configPath)
  if (compare) reports.push(reportExtract(booksDir, compare, configPath))
  const diff = compare ? diffExtractReports(reports[0], reports[1]) : undefined
  if (json) process.stdout.write(JSON.stringify(diff ? { reports, diff } : reports, null, 2) + "\n")
  else if (csv) process.stdout.write(extractReportCsv(reports, csv))
  else if (reports.length === 0) process.stdout.write(`No books found under ${path.resolve(booksDir)}\n`)
  else process.stdout.write(reports.map(formatExtractReport).concat(diff ? [formatExtractReportDiff(diff)] : []).join("\n") + "\n")
  process.exitCode = reports.some((report) => report.error) ? 2 : reports.some(hasExtractFindings) ? 1 : 0
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stderr.write(USAGE + "\n")
    process.exit(args.length === 0 ? 1 : 0)
  }

  if (args[0] === "doctor") {
    runDoctor(args.slice(1))
    return
  }

  if (args[0] === "extract-report") {
    runExtractReport(args.slice(1))
    return
  }

  const { label, pdfPath, startPage, endPage, booksRoot, concurrency } =
    parseCliArgs(args)

  const promptsDir = path.resolve(process.cwd(), "prompts")
  const templatesDir = path.resolve(process.cwd(), "templates")
  const webAssetsDir = path.resolve(process.cwd(), "assets", "adt")
  const progress = createCliProgress()

  try {
    const result = await runFullPipeline(
      {
        label,
        pdfPath,
        booksRoot,
        startPage,
        endPage,
        concurrency,
        promptsDir,
        templatesDir,
        webAssetsDir,
        logLevel: "silent",
      },
      progress,
    )
    progress.stop()

    if (result.stages.errors.size > 0) {
      const failed = [...result.stages.errors.entries()]
        .map(([stage, err]) => `  ${stage}: ${err.message}`)
      log(`\nFailed stages:\n${failed.join("\n")}\n`)
      process.exit(1)
    }

    log(`\nOutput: ${path.join(booksRoot, label)}/\n`)
  } catch (err) {
    progress.stop()
    throw err
  }
}

main().catch((err) => {
  const detail =
    err instanceof Error ? err.stack ?? err.message : String(err)
  process.stderr.write(`\nFailed: ${detail}\n`)
  process.exit(1)
})
