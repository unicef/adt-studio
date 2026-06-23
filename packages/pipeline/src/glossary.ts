import { parseDocument, DomUtils } from "htmlparser2"
import type { AppConfig, GlossaryItem, GlossaryOutput } from "@adt/types"
import {
  glossaryLLMSchema,
  WebRenderingOutput,
  DEFAULT_LLM_MAX_RETRIES,
} from "@adt/types"
import type { LLMModel } from "@adt/llm"
import type { Storage, PageData } from "@adt/storage"
import { processWithConcurrency } from "./concurrency.js"
import { getRenderSectioning } from "./render-sectioning.js"
import { buildLanguageContext } from "./language-context.js"

export interface GlossaryConfig {
  promptName: string
  modelId: string
  maxRetries: number
  language: string
  batchSize: number
  amount?: "concise" | "standard" | "comprehensive"
  userPrompt?: string
  seedTerms?: GlossaryItem[]
}

export function buildGlossaryConfig(
  appConfig: AppConfig,
  language: string
): GlossaryConfig {
  return {
    promptName: appConfig.glossary?.prompt ?? "glossary",
    modelId:
      appConfig.glossary?.model ??
      appConfig.page_sectioning?.model ??
      "openai:gpt-4.1",
    maxRetries: appConfig.glossary?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
    language,
    batchSize: 10,
    amount: appConfig.glossary_amount,
    userPrompt: appConfig.glossary_user_prompt || undefined,
    seedTerms:
      appConfig.glossary_seed_terms && appConfig.glossary_seed_terms.length > 0
        ? appConfig.glossary_seed_terms
        : undefined,
  }
}

export function stripHtml(html: string): string {
  const doc = parseDocument(html)
  const text = DomUtils.textContent(doc)
  return text.replace(/\s+/g, " ").trim()
}

function normalizeGlossaryWord(word: string): string {
  return word.trim().toLocaleLowerCase()
}

export function getGlossaryItemTextId(item: Pick<GlossaryItem, "id">, index: number): string {
  return item.id?.trim() || `gl${String(index + 1).padStart(3, "0")}`
}

export function isManualGlossaryItem(item: Pick<GlossaryItem, "source">): boolean {
  return item.source === "manual"
}

export function isPrunedGlossaryItem(item: Pick<GlossaryItem, "pruned">): boolean {
  return item.pruned === true
}

export function getPrunedGlossaryWords(items: GlossaryItem[]): string[] {
  return items.filter(isPrunedGlossaryItem).map((item) => item.word)
}

export function mergeGeneratedGlossaryWithManualItems(
  generated: GlossaryOutput,
  existingItems: GlossaryItem[],
): GlossaryOutput {
  const manualItems = existingItems.filter(isManualGlossaryItem)
  const prunedItems = existingItems.filter(
    (item) => isPrunedGlossaryItem(item) && !isManualGlossaryItem(item),
  )
  const prunedWords = new Set(prunedItems.map((item) => normalizeGlossaryWord(item.word)))

  // Drop any generated item that matches a pruned word (server-side backstop
  // in case the LLM ignores the excluded-words instruction).
  const filteredGenerated = prunedWords.size > 0
    ? generated.items.filter((item) => !prunedWords.has(normalizeGlossaryWord(item.word)))
    : generated.items

  const mergedItems = [...filteredGenerated]
  const existingIndexByWord = new Map(
    mergedItems.map((item, index) => [normalizeGlossaryWord(item.word), index]),
  )

  for (const manualItem of manualItems) {
    const normalizedWord = normalizeGlossaryWord(manualItem.word)
    const existingIndex = existingIndexByWord.get(normalizedWord)
    if (existingIndex !== undefined) {
      const generatedItem = mergedItems[existingIndex]
      mergedItems[existingIndex] = {
        ...generatedItem,
        ...manualItem,
        id: getGlossaryItemTextId(generatedItem, existingIndex),
        source: "manual",
      }
      continue
    }

    mergedItems.push({
      ...manualItem,
      source: "manual",
    })
  }

  // Re-add pruned AI items so the user can still see / unprune them.
  const wordsInMerged = new Set(mergedItems.map((item) => normalizeGlossaryWord(item.word)))
  for (const prunedItem of prunedItems) {
    const normalizedWord = normalizeGlossaryWord(prunedItem.word)
    if (!wordsInMerged.has(normalizedWord)) {
      mergedItems.push({ ...prunedItem, source: prunedItem.source ?? "ai", pruned: true })
      wordsInMerged.add(normalizedWord)
    }
  }

  return {
    ...generated,
    items: mergedItems,
  }
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
    // Filter out pruned sections (resolver: positioned tree for fixed-layout)
    const sectioning = getRenderSectioning(storage, page.pageId)
    const htmlParts = rendering.sections
      .filter(
        (s) => !sectioning || !sectioning.sections[s.sectionIndex]?.isPruned
      )
      .map((s) => s.html)
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
  /** Words the LLM should not re-suggest. Items returned matching one of these
   * are also dropped server-side as a backstop. */
  excludedWords?: string[]
}

export async function generateGlossary(
  options: GenerateGlossaryOptions
): Promise<GlossaryOutput> {
  const { storage, pages, config, llmModel, concurrency = 1, onBatchComplete, excludedWords = [] } = options
  const languageContext = buildLanguageContext(config.language)
  const excludedWordsNormalized = new Set(excludedWords.map(normalizeGlossaryWord))

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

  const seedWords = config.seedTerms?.map((t) => t.word) ?? []

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
        amount: config.amount ?? "",
        user_instructions: config.userPrompt ?? "",
        seed_terms: seedWords,
        excluded_words: excludedWords,
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

  // Deduplicate: first definition wins, case-insensitive. Drop any item whose
  // word matches the caller-supplied exclusion list (backstop in case the LLM
  // ignores the prompt instruction).
  const seen = new Map<string, GlossaryItem>()
  for (const item of allItems) {
    const key = item.word.toLowerCase()
    if (excludedWordsNormalized.has(normalizeGlossaryWord(item.word))) continue
    if (!seen.has(key)) {
      seen.set(key, item)
    }
  }

  // Sort alphabetically
  const items = Array.from(seen.values()).sort((a, b) =>
    a.word.toLowerCase().localeCompare(b.word.toLowerCase())
  )

  const aiGlossary: GlossaryOutput = {
    items: items.map((item) => ({
      ...item,
      source: item.source ?? "ai",
    })),
    pageCount: pageTexts.length,
    generatedAt: new Date().toISOString(),
  }

  // Pin user-defined seed terms as manual items so they always appear and
  // survive re-runs, taking precedence over LLM-generated entries with the
  // same word.
  if (config.seedTerms && config.seedTerms.length > 0) {
    const seedManualItems: GlossaryItem[] = config.seedTerms.map((t) => ({
      ...t,
      source: "manual" as const,
    }))
    return mergeGeneratedGlossaryWithManualItems(aiGlossary, seedManualItems)
  }

  return aiGlossary
}

export interface GenerateGlossaryItemOptions {
  word: string
  context?: string
  candidateVariations?: string[]
  config: GlossaryConfig
  llmModel: LLMModel
  /** Prompt name for the single-term prompt. Defaults to `glossary_one`. */
  promptName?: string
}

export interface GeneratedGlossaryItemFields {
  definition: string
  variations: string[]
  emojis: string[]
}

export async function generateGlossaryItem(
  options: GenerateGlossaryItemOptions
): Promise<GeneratedGlossaryItemFields> {
  const { word, context, candidateVariations = [], config, llmModel } = options
  const promptName = options.promptName ?? "glossary_one"
  const languageContext = buildLanguageContext(config.language)

  const result = await llmModel.generateObject<{
    reasoning: string
    items: GlossaryItem[]
  }>({
    schema: glossaryLLMSchema,
    prompt: promptName,
    context: {
      ...languageContext,
      word,
      context: context ?? "",
      candidate_variations: candidateVariations,
    },
    maxRetries: config.maxRetries,
    maxTokens: 2048,
    log: {
      taskType: "glossary",
      promptName,
    },
  })

  const item = result.object.items[0]
  if (!item) {
    throw new Error(`LLM returned no glossary item for word: ${word}`)
  }

  const allowedVariations = new Set(
    candidateVariations.map((v) => v.toLocaleLowerCase())
  )
  return {
    definition: item.definition,
    variations: item.variations.filter((v) =>
      allowedVariations.has(v.toLocaleLowerCase())
    ),
    emojis: item.emojis,
  }
}
