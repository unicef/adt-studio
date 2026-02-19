#!/usr/bin/env node

import path from "node:path"
import cliProgress from "cli-progress"
import { PIPELINE, STAGE_BY_NAME, STEP_TO_STAGE } from "@adt/types"
import type { StepName, StageName, ProgressEvent } from "@adt/types"
import { parseCliArgs, USAGE } from "./cli-args.js"
import { runFullPipeline } from "./pipeline-dag.js"
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
  const stepFormat = (label: string) =>
    `   ${label.padEnd(maxLabel + 2)} [{bar}] {value}/{total}`

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
      if (event.type === "step-complete" || event.type === "step-skip") {
        const bar = bars.get(event.step)
        if (bar) bar.update(bar.getTotal())
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

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stderr.write(USAGE + "\n")
    process.exit(args.length === 0 ? 1 : 0)
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
