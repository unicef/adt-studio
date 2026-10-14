import { renderedText } from "./rendered-text.js"
import type { AppConfig, GlossaryItem, GlossaryOutput } from "@adt/types"
import {
  glossaryLLMSchema,
  WebRenderingOutput,
  GlossaryOutput as GlossaryOutputSchema,
  DEFAULT_LLM_MAX_RETRIES,
} from "@adt/types"
import type { LLMModel } from "@adt/llm"
import type { Storage, PageData } from "@adt/storage"
import { processWithConcurrency } from "./concurrency.js"
import { withLegacyRenderingOwnership, getRenderSectioning, resolveRenderedSection } from "./render-sectioning.js"
import { buildLanguageContext } from "./language-context.js"
import { inputSignature } from "./output-freshness.js"

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
      appConfig.default_model ??
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
  return renderedText(html)
}

function normalizeGlossaryWord(word: string): string {
  return word.trim().toLocaleLowerCase()
}

export function getGlossaryItemTextId(item: Pick<GlossaryItem, "id">, index: number): string {
  return item.id?.trim() || `gl${String(index + 1).padStart(3, "0")}`
}

function glossaryIdentityAllocator(storage: Storage, extraIds: string[] = []) {
  const reserved = new Set(extraIds)
  for (const row of storage.getAllNodeVersions("glossary", "book")) {
    const parsed = GlossaryOutputSchema.safeParse(row.data)
    if (parsed.success) parsed.data.items.forEach((item, index) => reserved.add(getGlossaryItemTextId(item, index)))
  }
  let next = 1
  return () => {
    let id: string
    do { id = `gl${String(next++).padStart(3, "0")}` } while (reserved.has(id))
    reserved.add(id)
    return id
  }
}

/** Call under the existing book writer before exposing legacy terms for edit.
 * Preserve the IDs already used by their catalog consumers exactly once. */
export function materializeGlossaryIds(storage: Storage) {
  const row = storage.getLatestNodeData("glossary", "book")
  const parsed = GlossaryOutputSchema.safeParse(row?.data)
  if (!parsed.success) return row
  const ids = parsed.data.items.map(getGlossaryItemTextId)
  if (parsed.data.items.every((item) => item.id?.trim()) && new Set(ids).size === ids.length) return row
  const allocate = glossaryIdentityAllocator(storage, ids)
  const seen = new Set<string>()
  const data = { ...parsed.data, items: parsed.data.items.map((item, index) => {
    // Catalog readers have always used the first copy of an identity. A later
    // legacy collision must never acquire that first term's manual outputs.
    const id = seen.has(ids[index]) ? allocate() : ids[index]
    seen.add(id)
    return { ...item, id }
  }) }
  storage.putNodeData("glossary", "book", data)
  return storage.getLatestNodeData("glossary", "book")
}

/** Older clients may submit an idless subset. Match only a unique retained
 * word; new/renamed ambiguous terms get fresh IDs, never another term's slot. */
export function reconcileGlossaryEditIds(storage: Storage, edited: GlossaryOutput, verifiedVersion?: number): GlossaryOutput {
  const base = storage.getLatestNodeData("glossary", "book")
  const baseItems = GlossaryOutputSchema.safeParse(base?.data)
  const verifiedIds = new Set<string>()
  if (verifiedVersion === base?.version && baseItems.success) {
    const ids = baseItems.data.items.map((item) => item.id?.trim())
    for (const id of ids) if (id && ids.filter((candidate) => candidate === id).length === 1) verifiedIds.add(id)
  }
  const current = GlossaryOutputSchema.safeParse(materializeGlossaryIds(storage)?.data)
  const previous = current.success ? current.data.items : []
  const reserved = new Set<string>()
  const collided = new Set<string>()
  for (const row of storage.getAllNodeVersions("glossary", "book")) {
    const data = GlossaryOutputSchema.safeParse(row.data)
    if (data.success) {
      const seen = new Set<string>()
      data.data.items.forEach((item, index) => {
        const id = getGlossaryItemTextId(item, index)
        if (seen.has(id)) collided.add(id)
        seen.add(id)
        reserved.add(id)
      })
    }
  }
  const currentIds = new Set(previous.map((item) => item.id))
  const historical = new Set(reserved)
  for (const item of edited.items) if (item.id) reserved.add(item.id)
  const previousWords = uniqueGlossaryWordIndexes(previous)
  const editedWords = uniqueGlossaryWordIndexes(edited.items)
  const assigned = new Set<string>()
  const contentKey = (item: GlossaryItem) => inputSignature({
    word: item.word, definition: item.definition, variations: item.variations,
    emojis: item.emojis, pruned: item.pruned === true, imageId: item.imageId,
  })
  const previousKeys = previous.map(contentKey)
  const editedKeys = edited.items.map(contentKey)
  let next = 1
  return { ...edited, items: edited.items.map((item, index) => {
    const word = normalizeGlossaryWord(item.word)
    const matches = previousKeys.flatMap((key, i) => key === editedKeys[index] ? [i] : [])
    const exactIndex = matches.length === 1 && editedKeys.filter((key) => key === editedKeys[index]).length === 1 ? matches[0] : undefined
    const previousIndex = exactIndex ?? (editedWords.get(word) === index ? previousWords.get(word) : undefined)
    // An older editor can submit an explicit duplicate ID captured before
    // migration. A unique retained word identifies its migrated slot safely.
    const submittedId = item.id?.trim()
    // An old duplicate ID alone cannot prove ownership, even when that ID is
    // still assigned to the first term. Preserve its outputs in history and
    // allocate a fresh identity if neither retained content nor word is unique.
    let id = submittedId && currentIds.has(submittedId) && (!collided.has(submittedId) || verifiedIds.has(submittedId))
      ? submittedId
      : previousIndex === undefined
        ? submittedId && !collided.has(submittedId) ? submittedId : undefined
        : previous[previousIndex].id
    if (!id || assigned.has(id) || (historical.has(id) && !currentIds.has(id))) {
      do { id = `gl${String(next++).padStart(3, "0")}` } while (reserved.has(id))
      reserved.add(id)
    }
    assigned.add(id)
    return { ...item, id }
  }) }
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
        id: manualItem.id ?? generatedItem.id,
        source: "manual",
      }
      existingIndexByWord.delete(normalizedWord)
      continue
    }

    mergedItems.push({
      ...manualItem,
      source: "manual",
    })
  }

  // Re-add pruned AI items so the user can still see / unprune them.
  for (const prunedItem of prunedItems) {
    mergedItems.push({ ...prunedItem, source: prunedItem.source ?? "ai", pruned: true })
  }

  return {
    ...generated,
    items: mergedItems,
  }
}

/** Index words that occur exactly once. Ambiguous duplicate words are omitted
 * so media is never guessed onto the wrong regenerated entry. */
function uniqueGlossaryWordIndexes(items: GlossaryItem[]): Map<string, number> {
  const indexes = new Map<string, number>()
  const duplicates = new Set<string>()
  for (let index = 0; index < items.length; index++) {
    const word = normalizeGlossaryWord(items[index].word)
    if (indexes.has(word)) {
      indexes.delete(word)
      duplicates.add(word)
    } else if (!duplicates.has(word)) {
      indexes.set(word, index)
    }
  }
  return indexes
}

/** Carry media from unchanged terms. Stable term IDs retain video assignments;
 * removed or ambiguous terms lose only their active assignment. */
function preserveGlossaryMedia(
  regenerated: GlossaryOutput,
  existingItems: GlossaryItem[],
  storage: Storage,
): GlossaryOutput {
  const existingIndexByWord = uniqueGlossaryWordIndexes(existingItems)
  const regeneratedIndexByWord = uniqueGlossaryWordIndexes(regenerated.items)
  const items = regenerated.items.map((item) => ({ ...item }))

  for (const [word, regeneratedIndex] of regeneratedIndexByWord) {
    const existingIndex = existingIndexByWord.get(word)
    if (existingIndex === undefined) continue
    const imageId = existingItems[existingIndex].imageId
    if (imageId) items[regeneratedIndex].imageId = imageId
  }

  const existingIndexByTextId = new Map<string, number>()
  const duplicateTextIds = new Set<string>()
  for (let index = 0; index < existingItems.length; index++) {
    const textId = getGlossaryItemTextId(existingItems[index], index)
    if (existingIndexByTextId.has(textId)) {
      existingIndexByTextId.delete(textId)
      duplicateTextIds.add(textId)
    } else if (!duplicateTextIds.has(textId)) {
      existingIndexByTextId.set(textId, index)
    }
  }

  for (const video of storage.getSignLanguageVideos()) {
    const sectionId = video.sectionId
    if (!sectionId) continue
    if (items.some(item => item.id === sectionId) && existingIndexByTextId.has(sectionId)) continue

    const existingIndex = existingIndexByTextId.get(sectionId)
    let nextSectionId: string | null | undefined
    if (existingIndex !== undefined) {
      const word = normalizeGlossaryWord(existingItems[existingIndex].word)
      const regeneratedIndex = regeneratedIndexByWord.get(word)
      nextSectionId = regeneratedIndex === undefined
        ? null
        : getGlossaryItemTextId(items[regeneratedIndex], regeneratedIndex)
    } else if (/^gl(?:\d+|_manual_)/.test(sectionId)) {
      // Stale/unknown glossary assignments must not drift onto a new term.
      nextSectionId = null
    }

    if (nextSectionId !== undefined && nextSectionId !== sectionId) {
      storage.assignSignLanguageVideo(video.videoId, nextSectionId)
    }
  }

  return { ...regenerated, items }
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
    const rendering = withLegacyRenderingOwnership(storage, page.pageId, parsed.data)
    // Filter out pruned sections (resolver: positioned tree for fixed-layout)
    const sectioning = getRenderSectioning(storage, page.pageId)
    const htmlParts = rendering.sections
      .filter(
        (s) => !sectioning || !resolveRenderedSection(s, sectioning.sections)?.isPruned
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

/** Regenerate the glossary while preserving manually added, edited, and pruned
 * terms plus media attached to unchanged words. Shared by both pipeline runners
 * so the behavior can't drift; the caller persists the returned glossary.
 * Relies on the prior glossary node surviving any pre-run clear (see
 * getStageRerunClearNodes). */
export async function regenerateGlossaryPreservingEdits(
  options: Omit<GenerateGlossaryOptions, "excludedWords">
): Promise<GlossaryOutput> {
  // Run may be the first operation on an old book. Resolve positional/explicit
  // collisions in its original order before generated ordering can choose a
  // different owner for retained translations, recordings or manual edits.
  const existingRow = materializeGlossaryIds(options.storage)
  const existingItems = ((existingRow?.data as GlossaryOutput | undefined)?.items ?? [])
    .map((item, index) => ({ ...item, id: getGlossaryItemTextId(item, index) }))
  const generated = await generateGlossary({
    ...options,
    excludedWords: getPrunedGlossaryWords(existingItems),
  })
  const merged = mergeGeneratedGlossaryWithManualItems(generated, existingItems)
  // Legacy positional IDs are materialized before merging. Reserve every ID in
  // history so deleting a term or restoring an old version cannot reassign its
  // translations, recordings or corrections to a different term.
  const reserved = new Set(existingItems.map((item) => item.id))
  for (const row of options.storage.getAllNodeVersions("glossary", "book")) {
    const historical = GlossaryOutputSchema.safeParse(row.data)
    if (historical.success) historical.data.items.forEach((item, index) => reserved.add(getGlossaryItemTextId(item, index)))
  }
  const historicalIds = new Set(reserved)
  for (const item of merged.items) if (item.id) reserved.add(item.id)
  let next = 1
  const existingByWord = uniqueGlossaryWordIndexes(existingItems)
  const generatedByWord = uniqueGlossaryWordIndexes(merged.items)
  const assigned = new Set<string>()
  const regenerated = { ...merged, items: merged.items.map((item, index) => {
    const word = normalizeGlossaryWord(item.word)
    const previousIndex = generatedByWord.get(word) === index ? existingByWord.get(word) : undefined
    let id = previousIndex === undefined ? item.id : existingItems[previousIndex].id
    const retainedIdentity = existingItems.some((previous) => previous.id === id && normalizeGlossaryWord(previous.word) === word)
    // Seed settings can carry a stale ID from another book or retired term.
    if (!id || assigned.has(id) || (historicalIds.has(id) && !retainedIdentity)) {
      do { id = `gl${String(next++).padStart(3, "0")}` } while (reserved.has(id))
      reserved.add(id)
    }
    assigned.add(id)
    return { ...item, id }
  }) }

  return preserveGlossaryMedia(regenerated, existingItems, options.storage)
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
