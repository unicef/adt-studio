#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import cliProgress from "cli-progress"
import { createBookStorage } from "@adt/storage"
import type { Storage } from "@adt/storage"
import { createLLMModel, createPromptEngine } from "@adt/llm"
import { parseCliArgs, USAGE } from "./cli-args.js"
import { extractPDF } from "./pdf-extraction.js"
import { extractMetadata, buildMetadataConfig } from "./metadata-extraction.js"
import { classifyPageText, buildClassifyConfig } from "./text-classification.js"
import { classifyPageImages, buildImageClassifyConfig } from "./image-classification.js"
import { sectionPage, buildSectioningConfig } from "./page-sectioning.js"
import { renderPage, buildRenderConfig } from "./web-rendering.js"
import { loadBookConfig } from "./config.js"
import type {
  TextClassificationOutput,
  ImageClassificationOutput,
  PageSectioningOutput,
} from "@adt/types"
import type { PageData } from "@adt/storage"

const DEFAULT_METADATA_PAGES = 3

function log(msg: string): void {
  if (msg.startsWith("\r")) {
    process.stderr.write("\x1b[2K\r" + msg.slice(1))
  } else {
    process.stderr.write(msg)
  }
}

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const executing = new Set<Promise<void>>()
  for (const item of items) {
    const p = fn(item).finally(() => {
      executing.delete(p)
    })
    executing.add(p)
    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }
  await Promise.all(executing)
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

interface StepBars {
  classifyImages: cliProgress.SingleBar
  classifyText: cliProgress.SingleBar
  section: cliProgress.SingleBar
  render: cliProgress.SingleBar
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

  const storage = createBookStorage(label, booksRoot)

  try {
    // Step 1: Extract PDF
    let extractBar: cliProgress.SingleBar | undefined
    const result = await extractPDF(
      { pdfPath, startPage, endPage },
      storage,
      {
        emit(event) {
          if (
            event.type === "step-progress" &&
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
                  format: `  Extracting ${path.basename(pdfPath)} [{bar}] {value}/{total} pages`,
                },
                cliProgress.Presets.shades_grey
              )
              extractBar.start(event.totalPages, 0)
            }
            extractBar.update(event.page)
          }
        },
      }
    )
    extractBar?.stop()
    log(`✔ Extract PDF: ${result.pages.length} pages extracted\n`)

    // Step 2: Extract Metadata
    const config = loadBookConfig(label, booksRoot)
    const metadataConfig = buildMetadataConfig(config)
    const cacheDir = path.join(booksRoot, label, ".cache")
    const promptsDir = path.resolve(process.cwd(), "prompts")
    const promptEngine = createPromptEngine(promptsDir)

    const metadataModel = createLLMModel({
      modelId: metadataConfig.modelId,
      cacheDir,
      promptEngine,
      onLog: (entry) => storage.appendLlmLog(entry.taskType, entry.pageId ?? "", entry),
    })

    const pages = storage.getPages()
    const metadataPages = pages.slice(0, DEFAULT_METADATA_PAGES)
    const pageInputs = metadataPages.map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
      imageBase64: storage.getPageImageBase64(page.pageId),
    }))

    const stopSpinner = startSpinner("Extracting metadata...")
    try {
      const metadataResult = await extractMetadata(
        pageInputs,
        metadataConfig,
        metadataModel
      )
      storage.putNodeData("metadata", "book", metadataResult)
    } finally {
      stopSpinner()
    }
    log("\r✔ Extract Metadata\n")

    // Step 3: Creating Storyboard
    log("\nCreating Storyboard:\n")

    const textClassifyConfig = buildClassifyConfig(config)
    const imageClassifyConfig = buildImageClassifyConfig(config)
    const sectioningConfig = buildSectioningConfig(config)
    const renderConfig = buildRenderConfig(config)
    const llmModel = createLLMModel({
      modelId: textClassifyConfig.modelId,
      cacheDir,
      promptEngine,
      onLog: (entry) => storage.appendLlmLog(entry.taskType, entry.pageId ?? "", entry),
    })

    const effectiveConcurrency =
      concurrency ?? config.text_classification?.concurrency ?? 16
    const totalPages = pages.length

    const multibar = new cliProgress.MultiBar(
      {
        clearOnComplete: false,
        hideCursor: true,
        barsize: 30,
        linewrap: false,
        forceRedraw: true,
      },
      cliProgress.Presets.shades_grey
    )

    const barFormat = (label: string) =>
      ` ${label.padEnd(16)} [{bar}] {value}/${totalPages}`

    const stepBars: StepBars = {
      classifyImages: multibar.create(totalPages, 0, {}, { format: barFormat("Classify Images") }),
      classifyText: multibar.create(totalPages, 0, {}, { format: barFormat("Classify Text") }),
      section: multibar.create(totalPages, 0, {}, { format: barFormat("Section Pages") }),
      render: multibar.create(totalPages, 0, {}, { format: barFormat("Render Pages") }),
    }

    try {
      await processWithConcurrency(
        pages,
        effectiveConcurrency,
        async (page) => {
          await processPage(
            page,
            stepBars,
            storage,
            {
              textClassifyConfig,
              imageClassifyConfig,
              sectioningConfig,
              renderConfig,
            },
            llmModel
          )
        }
      )
    } finally {
      multibar.stop()
    }

    log(`\nOutput: ${path.join(booksRoot, label)}/\n`)
  } finally {
    storage.close()
  }
}

interface StepConfigs {
  textClassifyConfig: ReturnType<typeof buildClassifyConfig>
  imageClassifyConfig: ReturnType<typeof buildImageClassifyConfig>
  sectioningConfig: ReturnType<typeof buildSectioningConfig>
  renderConfig: ReturnType<typeof buildRenderConfig>
}

async function processPage(
  page: PageData,
  bars: StepBars,
  storage: Storage,
  configs: StepConfigs,
  llmModel: ReturnType<typeof createLLMModel>
): Promise<void> {
  const { textClassifyConfig, imageClassifyConfig, sectioningConfig, renderConfig } =
    configs

  // --- Classify ---
  const imageBase64 = storage.getPageImageBase64(page.pageId)
  const images = storage.getPageImages(page.pageId)

  const textPromise = classifyPageText(
    {
      pageId: page.pageId,
      pageNumber: page.pageNumber,
      text: page.text,
      imageBase64,
    },
    textClassifyConfig,
    llmModel
  )

  const imageResult = classifyPageImages(page.pageId, images, imageClassifyConfig)
  storage.putNodeData("image-classification", page.pageId, imageResult)
  bars.classifyImages.increment()

  const textResult = await textPromise
  storage.putNodeData("text-classification", page.pageId, textResult)
  bars.classifyText.increment()

  // --- Section ---
  const textClassification = textResult as TextClassificationOutput
  const imageClassification = imageResult as ImageClassificationOutput

  const allImages = storage.getPageImages(page.pageId)
  const prunedImageIds = new Set(
    imageClassification.images
      .filter((img) => img.isPruned)
      .map((img) => img.imageId)
  )
  const sectionImages = allImages
    .filter((img) => !prunedImageIds.has(img.imageId))
    .map((img) => ({
      imageId: img.imageId,
      imageBase64: storage.getImageBase64(img.imageId),
    }))

  const pageImageBase64 = storage.getPageImageBase64(page.pageId)
  const sectionResult = await sectionPage(
    {
      pageId: page.pageId,
      pageNumber: page.pageNumber,
      pageImageBase64,
      textClassification,
      imageClassification,
      images: sectionImages,
    },
    sectioningConfig,
    llmModel
  )
  storage.putNodeData("page-sectioning", page.pageId, sectionResult)
  bars.section.increment()

  // --- Render ---
  const sectioning = sectionResult as PageSectioningOutput
  const renderImages = new Map<string, string>()
  for (const img of allImages) {
    if (!prunedImageIds.has(img.imageId)) {
      renderImages.set(img.imageId, storage.getImageBase64(img.imageId))
    }
  }

  const renderResult = await renderPage(
    {
      pageId: page.pageId,
      pageImageBase64,
      sectioning,
      textClassification,
      images: renderImages,
    },
    renderConfig,
    llmModel
  )
  storage.putNodeData("web-rendering", page.pageId, renderResult)
  bars.render.increment()
}

main().catch((err) => {
  const detail =
    err instanceof Error ? err.stack ?? err.message : String(err)
  process.stderr.write(`\nFailed: ${detail}\n`)
  process.exit(1)
})
