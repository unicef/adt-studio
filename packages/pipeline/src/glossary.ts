import { parseDocument, DomUtils } from "htmlparser2"
import type { AppConfig, GlossaryItem, GlossaryOutput } from "@adt/types"
import { glossaryLLMSchema, WebRenderingOutput } from "@adt/types"
import type { LLMModel } from "@adt/llm"
import type { Storage, PageData } from "@adt/storage"
import { processWithConcurrency } from "./concurrency.js"
import { buildLanguageContext } from "./language-context.js"

export interface GlossaryConfig {
  promptName: string
  modelId: string
  maxRetries: number
  language: string
  batchSize: number
}

export function buildGlossaryConfig(
  appConfig: AppConfig,
  language: string
): GlossaryConfig {
  return {
    promptName: appConfig.glossary?.prompt ?? "glossary",
    modelId:
      appConfig.glossary?.model ??
      appConfig.text_classification?.model ??
      "openai:gpt-4.1",
    maxRetries: appConfig.glossary?.max_retries ?? 2,
    language,
    batchSize: 10,
  }
}

export function stripHtml(html: string): string {
  const doc = parseDocument(html)
  const text = DomUtils.textContent(doc)
  return text.replace(/\s+/g, " ").trim()
}

interface PageText {
  pageNumber: number
  text: string
}

export function collectPageTexts(
  storage: Storage,
  pages: PageData[]
): PageText[] {
  const result: PageText[] = []
  for (const page of pages) {
    const row = storage.getLatestNodeData("web-rendering", page.pageId)
    if (!row) continue
    const parsed = WebRenderingOutput.safeParse(row.data)
    if (!parsed.success) {
      throw new Error(
        `Invalid web-rendering output for page: ${page.pageId}: ${parsed.error.message}`
      )
    }
    const rendering = parsed.data
    const htmlParts = rendering.sections.map((s) => s.html)
    const text = stripHtml(htmlParts.join(" "))
    if (text.length > 0) {
      result.push({ pageNumber: page.pageNumber, text })
    }
  }
  return result
}

export interface GenerateGlossaryOptions {
  storage: Storage
  pages: PageData[]
  config: GlossaryConfig
  llmModel: LLMModel
  concurrency?: number
  onBatchComplete?: (completed: number, total: number) => void
}

export async function generateGlossary(
  options: GenerateGlossaryOptions
): Promise<GlossaryOutput> {
  const { storage, pages, config, llmModel, concurrency = 1, onBatchComplete } = options
  const languageContext = buildLanguageContext(config.language)

  const pageTexts = collectPageTexts(storage, pages)
  if (pageTexts.length === 0) {
    return {
      items: [],
      pageCount: 0,
      generatedAt: new Date().toISOString(),
    }
  }

  // Batch pages
  const batches: PageText[][] = []
  for (let i = 0; i < pageTexts.length; i += config.batchSize) {
    batches.push(pageTexts.slice(i, i + config.batchSize))
  }

  // Generate glossary items per batch
  const allItems: GlossaryItem[] = []
  let completed = 0

  await processWithConcurrency(batches, concurrency, async (batch) => {
    const result = await llmModel.generateObject<{
      reasoning: string
      items: GlossaryItem[]
    }>({
      schema: glossaryLLMSchema,
      prompt: config.promptName,
      context: {
        ...languageContext,
        pages: batch,
      },
      maxRetries: config.maxRetries,
      maxTokens: 16384,
      log: {
        taskType: "glossary",
        promptName: config.promptName,
      },
    })

    allItems.push(...result.object.items)
    completed++
    onBatchComplete?.(completed, batches.length)
  })

  // Deduplicate: first definition wins, case-insensitive
  const seen = new Map<string, GlossaryItem>()
  for (const item of allItems) {
    const key = item.word.toLowerCase()
    if (!seen.has(key)) {
      seen.set(key, item)
    }
  }

  // Sort alphabetically
  const items = Array.from(seen.values()).sort((a, b) =>
    a.word.toLowerCase().localeCompare(b.word.toLowerCase())
  )

  return {
    items,
    pageCount: pageTexts.length,
    generatedAt: new Date().toISOString(),
  }
}
