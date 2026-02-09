#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { Listr } from "listr2"
import { createBookStorage } from "@adt/storage"
import type { Storage } from "@adt/storage"
import type { ExtractResult } from "@adt/pdf"
import { createLLMModel, createPromptEngine } from "@adt/llm"
import { parseCliArgs, USAGE } from "./cli-args.js"
import { runExtract } from "./run-extract.js"
import { classifyPage, buildClassifyConfig } from "./run-classify.js"
import { loadBookConfig } from "./config.js"

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

  const { label, pdfPath, startPage, endPage, booksRoot, concurrency } =
    parseCliArgs(args)

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
      {
        title: "Classify Text",
        task: async (ctx, task) => {
          const storage = ctx.storage!

          const config = loadBookConfig(label, booksRoot)
          const classifyConfig = buildClassifyConfig(config)

          const modelId =
            config.text_classification?.model ?? "openai:gpt-4o"

          const cacheDir = path.join(booksRoot, label, ".cache")
          const llmModel = createLLMModel({
            modelId,
            cacheDir,
            onLog: (entry) => storage.appendLlmLog(entry),
          })

          const promptsDir = path.resolve(process.cwd(), "prompts")
          const promptEngine = createPromptEngine(promptsDir)

          const pages = storage.getPages()
          const effectiveConcurrency =
            concurrency ?? config.text_classification?.concurrency ?? 5

          let completed = 0

          return task.newListr(
            pages.map((page) => ({
              title: `Page ${page.pageNumber}`,
              task: async () => {
                const imageBase64 = storage.getPageImageBase64(page.pageId)
                const result = await classifyPage(
                  {
                    pageId: page.pageId,
                    pageNumber: page.pageNumber,
                    text: page.text,
                    imageBase64,
                  },
                  classifyConfig,
                  llmModel,
                  promptEngine
                )
                storage.putNodeData(
                  "text-classification",
                  page.pageId,
                  result
                )
                completed++
                task.title = `Classify Text [${completed}/${pages.length}]`
              },
            })),
            { concurrent: effectiveConcurrency }
          )
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
