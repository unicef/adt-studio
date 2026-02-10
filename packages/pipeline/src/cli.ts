#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { Listr } from "listr2"
import { createBookStorage } from "@adt/storage"
import type { Storage } from "@adt/storage"
import type { ExtractResult } from "@adt/pdf"
import { createLLMModel, createPromptEngine } from "@adt/llm"
import { parseCliArgs, USAGE } from "./cli-args.js"
import { extractPDF } from "./pdf-extraction.js"
import { extractMetadata, buildMetadataConfig } from "./metadata-extraction.js"
import { classifyPageText, buildClassifyConfig } from "./text-classification.js"
import { classifyPageImages, buildImageClassifyConfig } from "./image-classification.js"
import { loadBookConfig } from "./config.js"

const DEFAULT_METADATA_PAGES = 3

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

          ctx.result = await extractPDF(
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
        title: "Extract Metadata",
        task: async (ctx) => {
          const storage = ctx.storage!
          const config = loadBookConfig(label, booksRoot)
          const metadataConfig = buildMetadataConfig(config)

          const cacheDir = path.join(booksRoot, label, ".cache")

          const promptsDir = path.resolve(process.cwd(), "prompts")
          const promptEngine = createPromptEngine(promptsDir)

          const llmModel = createLLMModel({
            modelId: metadataConfig.modelId,
            cacheDir,
            promptEngine,
            onLog: (entry) => storage.appendLlmLog(entry),
          })

          const pages = storage.getPages()
          const metadataPages = pages.slice(0, DEFAULT_METADATA_PAGES)

          const pageInputs = metadataPages.map((page) => ({
            pageNumber: page.pageNumber,
            text: page.text,
            imageBase64: storage.getPageImageBase64(page.pageId),
          }))

          const result = await extractMetadata(
            pageInputs,
            metadataConfig,
            llmModel
          )

          storage.putNodeData("metadata", "book", result)
        },
        rendererOptions: { persistentOutput: false },
      },
      {
        title: "Classify Pages",
        task: async (ctx, task) => {
          const storage = ctx.storage!

          const config = loadBookConfig(label, booksRoot)
          const textClassifyConfig = buildClassifyConfig(config)
          const imageClassifyConfig = buildImageClassifyConfig(config)
          const cacheDir = path.join(booksRoot, label, ".cache")
          const promptsDir = path.resolve(process.cwd(), "prompts")
          const promptEngine = createPromptEngine(promptsDir)
          const llmModel = createLLMModel({
            modelId: textClassifyConfig.modelId,
            cacheDir,
            promptEngine,
            onLog: (entry) => storage.appendLlmLog(entry),
          })

          const pages = storage.getPages()
          const effectiveConcurrency =
            concurrency ?? config.text_classification?.concurrency ?? 5

          return task.newListr(
            pages.map((page) => ({
              title: `Page ${page.pageNumber}`,
              task: (_, pageTask) => {
                const imageBase64 = storage.getPageImageBase64(page.pageId)
                const images = storage.getPageImages(page.pageId)

                return pageTask.newListr(
                  [
                    {
                      title: "Classify Text",
                      task: async () => {
                        const result = await classifyPageText(
                          {
                            pageId: page.pageId,
                            pageNumber: page.pageNumber,
                            text: page.text,
                            imageBase64,
                          },
                          textClassifyConfig,
                          llmModel
                        )
                        storage.putNodeData(
                          "text-classification",
                          page.pageId,
                          result
                        )
                      },
                    },
                    {
                      title: "Classify Images",
                      task: () => {
                        const result = classifyPageImages(
                          page.pageId,
                          images,
                          imageClassifyConfig
                        )
                        storage.putNodeData(
                          "image-classification",
                          page.pageId,
                          result
                        )
                      },
                    },
                  ],
                  { concurrent: true }
                )
              },
              exitOnError: false,
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
