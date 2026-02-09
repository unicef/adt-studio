#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { Listr } from "listr2"
import { createBookStorage } from "@adt/storage"
import type { Storage } from "@adt/storage"
import type { ExtractResult } from "@adt/pdf"
import { parseCliArgs, USAGE } from "./cli-args.js"
import { runExtract } from "./run-extract.js"

interface PipelineContext {
  storage?: Storage
  result?: ExtractResult
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stderr.write(USAGE + "\n")
    process.exit(args.length === 0 ? 1 : 0)
  }

  const { label, pdfPath, startPage, endPage, booksRoot } = parseCliArgs(args)

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`)
  }

  let activeStorage: Storage | undefined

  const tasks = new Listr<PipelineContext>(
    [
      {
        title: `Extract PDF: ${path.basename(pdfPath)}`,
        task: async (ctx, task) => {
          activeStorage = createBookStorage(label, booksRoot)
          ctx.storage = activeStorage

          ctx.result = await runExtract(
            { pdfPath, startPage, endPage },
            ctx.storage,
            {
              emit(event) {
                if (
                  event.type === "step-progress" &&
                  event.page !== undefined &&
                  event.totalPages !== undefined
                ) {
                  task.title = `Extract PDF: ${path.basename(pdfPath)} [${event.page}/${event.totalPages}]`
                }
              },
            }
          )

          task.title = `Extract PDF: ${ctx.result.pages.length} pages extracted`
        },
        rendererOptions: { persistentOutput: false },
      },
    ],
    {
      rendererOptions: {
        collapseSubtasks: false,
      },
    }
  )

  try {
    await tasks.run({})

    process.stderr.write(`\nOutput: ${path.join(booksRoot, label)}/\n`)
  } finally {
    activeStorage?.close()
  }
}

main().catch((err) => {
  process.stderr.write(
    `\nFailed: ${err instanceof Error ? err.message : String(err)}\n`
  )
  process.exit(1)
})
