#!/usr/bin/env node

import path from "node:path"
import cliProgress from "cli-progress"
import { parseCliArgs, USAGE } from "./cli-args.js"
import { runPipeline } from "./pipeline.js"
import type { Progress } from "./progress.js"

function log(msg: string): void {
  if (msg.startsWith("\r")) {
    process.stderr.write("\x1b[2K\r" + msg.slice(1))
  } else {
    process.stderr.write(msg)
  }
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

function startSpinner(label: string): () => void {
  let i = 0
  const id = setInterval(() => {
    process.stderr.write(`\x1b[2K\r  ${SPINNER_FRAMES[i % SPINNER_FRAMES.length]} ${label}`)
    i++
  }, 80)
  return () => clearInterval(id)
}

function createCliProgress(pdfBasename: string): Progress {
  let extractBar: cliProgress.SingleBar | undefined
  let extractedPages = 0
  let multibar: cliProgress.MultiBar | undefined
  let spinnerStop: (() => void) | undefined

  const counters = {
    classifyImages: 0,
    classifyText: 0,
    translate: 0,
    section: 0,
    render: 0,
  }
  let totalPages = 0
  let bars: {
    classifyImages: cliProgress.SingleBar
    classifyText: cliProgress.SingleBar
    translate?: cliProgress.SingleBar
    section: cliProgress.SingleBar
    render: cliProgress.SingleBar
  } | undefined

  return {
    emit(event) {
      if (event.type === "step-progress" && event.step === "extract") {
        if (
          event.page !== undefined &&
          event.totalPages !== undefined
        ) {
          if (!extractBar) {
            extractBar = new cliProgress.SingleBar(
              {
                clearOnComplete: true,
                hideCursor: true,
                barsize: 30,
                linewrap: false,
                format: `  Extracting ${pdfBasename} [{bar}] {value}/{total} pages`,
              },
              cliProgress.Presets.shades_grey
            )
            extractBar.start(event.totalPages, 0)
          }
          extractedPages = event.page
          extractBar.update(event.page)
        }
        return
      }

      if (event.type === "step-complete" && event.step === "extract") {
        extractBar?.stop()
        log(`✔ Extract PDF: ${extractedPages} pages extracted\n`)
        return
      }

      if (event.type === "step-start" && event.step === "metadata") {
        spinnerStop = startSpinner("Extracting metadata...")
        return
      }

      if (event.type === "step-complete" && event.step === "metadata") {
        spinnerStop?.()
        log("\r✔ Extract Metadata\n")
        return
      }

      if (event.type === "step-error" && event.step === "metadata") {
        spinnerStop?.()
        return
      }

      if (event.type === "step-complete" && event.step === "web-rendering") {
        multibar?.stop()
        return
      }

      if (
        event.type === "step-error" &&
        (event.step === "image-classification" ||
          event.step === "text-classification" ||
          event.step === "translation" ||
          event.step === "page-sectioning" ||
          event.step === "web-rendering")
      ) {
        multibar?.stop()
        return
      }

      // Per-page progress events drive the multibar
      if (event.type === "step-progress") {
        if (event.totalPages !== undefined) {
          totalPages = Math.max(totalPages, event.totalPages)
        }

        if (!multibar) {
          // Lazily initialize on first per-page progress event
          log("\nCreating Storyboard:\n")
          multibar = new cliProgress.MultiBar(
            {
              clearOnComplete: false,
              hideCursor: true,
              barsize: 30,
              linewrap: false,
              forceRedraw: true,
            },
            cliProgress.Presets.shades_grey
          )
        }

        const barFormat = (label: string) =>
          ` ${label.padEnd(16)} [{bar}] {value}/{total}`

        const syncBarTotals = () => {
          if (!bars) return
          bars.classifyImages.setTotal(totalPages)
          bars.classifyText.setTotal(totalPages)
          bars.translate?.setTotal(totalPages)
          bars.section.setTotal(totalPages)
          bars.render.setTotal(totalPages)
        }

        if (event.step === "image-classification") {
          counters.classifyImages++
          if (!bars) {
            bars = {
              classifyImages: multibar.create(0, 0, {}, { format: barFormat("Classify Images") }),
              classifyText: multibar.create(0, 0, {}, { format: barFormat("Classify Text") }),
              section: multibar.create(0, 0, {}, { format: barFormat("Section Pages") }),
              render: multibar.create(0, 0, {}, { format: barFormat("Render Pages") }),
            }
          }
          syncBarTotals()
          bars.classifyImages.update(counters.classifyImages)
        } else if (event.step === "text-classification") {
          counters.classifyText++
          syncBarTotals()
          bars?.classifyText.update(counters.classifyText)
        } else if (event.step === "translation") {
          counters.translate++
          if (bars && !bars.translate) {
            bars.translate = multibar.create(
              0,
              totalPages,
              {},
              { format: barFormat("Translate Text") }
            )
          }
          syncBarTotals()
          bars?.translate?.update(counters.translate)
        } else if (event.step === "page-sectioning") {
          counters.section++
          syncBarTotals()
          bars?.section.update(counters.section)
        } else if (event.step === "web-rendering") {
          counters.render++
          syncBarTotals()
          bars?.render.update(counters.render)
        }
      }
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
  const progress = createCliProgress(path.basename(pdfPath))

  await runPipeline(
    {
      label,
      pdfPath,
      booksRoot,
      startPage,
      endPage,
      concurrency,
      promptsDir,
      templatesDir,
    },
    progress
  )

  log(`\nOutput: ${path.join(booksRoot, label)}/\n`)
}

main().catch((err) => {
  const detail =
    err instanceof Error ? err.stack ?? err.message : String(err)
  process.stderr.write(`\nFailed: ${detail}\n`)
  process.exit(1)
})
