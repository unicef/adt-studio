import type { OutputReference } from "@adt/types"
import { outputSkipped } from "./output-freshness.js"
import { z } from "zod"
import { parseDocument, DomUtils } from "htmlparser2"
import type { AppConfig, EasyReadOutput, OutputRunScope, TextCatalogEntry, WebRenderingOutput, PageSectioningOutput } from "@adt/types"
import { DEFAULT_LLM_MAX_RETRIES, EasyReadOutput as EasyReadOutputSchema, WebRenderingOutput as WebRenderingOutputSchema } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import type { Storage, PageData } from "@adt/storage"
import { buildLanguageContext, normalizeLocale } from "./language-context.js"
import { getRenderSectioning } from "./render-sectioning.js"
import { processWithConcurrency } from "./concurrency.js"

import { inputSignature, outputEvidence, deriveOutputStatus, withOutputLocations, selectedForGeneration } from "./output-freshness.js"

export const DEFAULT_EASY_READ_MODEL_ID = "openai:gpt-4.1"

export interface EasyReadConfig {
  promptSignature?: string
  enabled: boolean
  language: string
  promptName: string
  modelId: string
  maxRetries: number
  batchSize: number
  tts: boolean
}

export const EMPTY_EASY_READ_GENERATED_AT = "1970-01-01T00:00:00.000Z"

export function createEmptyEasyReadOutput(): EasyReadOutput {
  return { blocks: [], generatedAt: EMPTY_EASY_READ_GENERATED_AT }
}

export function isDeterministicEmptyEasyReadOutput(value: unknown): boolean {
  const parsed = EasyReadOutputSchema.safeParse(value)
  return parsed.success &&
    parsed.data.blocks.length === 0 &&
    parsed.data.generatedAt === EMPTY_EASY_READ_GENERATED_AT
}

export type EasyReadElementExclusionReason =
  | "missing-data-id"
  | "activity-generated"
  | "image"
  | "image-caption"
  | "heading"
  | "excluded-context"
  | "empty-text"

export interface EasyReadElementEligibility {
  eligible: boolean
  reason?: EasyReadElementExclusionReason
  text?: string
}

export function buildEasyReadConfig(appConfig: AppConfig, language: string): EasyReadConfig {
  return {
    enabled: appConfig.easy_read?.enabled ?? false,
    language: normalizeLocale(language),
    promptName: appConfig.easy_read?.prompt ?? "easy_read",
    modelId:
      appConfig.easy_read?.model ??
      appConfig.translation?.model ??
      appConfig.page_sectioning?.model ??
      appConfig.default_model ??
      DEFAULT_EASY_READ_MODEL_ID,
    maxRetries: appConfig.easy_read?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
    batchSize: appConfig.easy_read?.batch_size ?? 50,
    tts: appConfig.easy_read?.tts ?? false,
  }
}

const easyReadSchema = z.object({
  texts: z.array(z.string()),
})

const IMAGE_ID_RE = /(?:^|_)im\d{3}(?:_|$)/

function hasImageDataId(dataId: string | undefined): boolean {
  return !!dataId && IMAGE_ID_RE.test(dataId)
}

function hasActivityGeneratedDataId(dataId: string | undefined): boolean {
  return !!dataId && (dataId.startsWith("activity_gen_") || dataId.includes("__activity_gen_") || dataId.includes("_activity_"))
}

function hasExcludedAncestor(el: { parent?: unknown } | null): boolean {
  let current = el as { parent?: unknown; name?: string; attribs?: Record<string, string> } | null
  while (current) {
    const className = current.attribs?.class ?? ""
    if (
      className.split(/\s+/).some((c) => c === "word-card") ||
      current.attribs?.["data-activity-item"] !== undefined ||
      current.name === "nav" ||
      current.name === "button" ||
      current.name === "input" ||
      current.name === "textarea" ||
      current.name === "select" ||
      current.name === "option"
    ) {
      return true
    }
    current = current.parent as typeof current
  }
  return false
}

function isHeadingTag(name: string | undefined): boolean {
  return !!name && /^h[1-6]$/i.test(name)
}

export function getEasyReadElementEligibility(
  el: { name?: string; attribs?: Record<string, string>; parent?: unknown },
): EasyReadElementEligibility {
  const dataId = el.attribs?.["data-id"]
  if (!dataId) return { eligible: false, reason: "missing-data-id" }
  if (hasActivityGeneratedDataId(dataId)) return { eligible: false, reason: "activity-generated" }
  if (el.name === "img") return { eligible: false, reason: "image" }
  if (hasImageDataId(dataId)) return { eligible: false, reason: "image-caption" }
  if (isHeadingTag(el.name)) return { eligible: false, reason: "heading" }
  if (hasExcludedAncestor(el)) return { eligible: false, reason: "excluded-context" }
  const text = DomUtils.textContent(el as never).replace(/\s+/g, " ").trim()
  if (text.length === 0) return { eligible: false, reason: "empty-text" }
  return { eligible: true, text }
}

function isEligibleTextElement(el: { name?: string; attribs?: Record<string, string>; parent?: unknown }): boolean {
  return getEasyReadElementEligibility(el).eligible
}

export function buildEasyReadSourceBlocks(
  storage: Storage,
  pages: PageData[],
): EasyReadOutput["blocks"] {
  const blocks: EasyReadOutput["blocks"] = []

  for (const page of pages) {
    const renderingRow = storage.getLatestNodeData("web-rendering", page.pageId)
    // Resolver: fixed-layout books pair against the positioned tree (its ids
    // match the rendered HTML data-ids the runtime swaps Easy Read text into).
    const sectioning = getRenderSectioning(storage, page.pageId)
    if (!renderingRow || !sectioning) continue

    const rendering = WebRenderingOutputSchema.safeParse(renderingRow.data)
    if (!rendering.success) continue

    blocks.push(...buildPageEasyReadBlocks(page, rendering.data, sectioning))
  }

  return blocks
}

export function buildPageEasyReadBlocks(
  page: PageData,
  rendering: WebRenderingOutput,
  sectioning: PageSectioningOutput,
): EasyReadOutput["blocks"] {
  const blocks: EasyReadOutput["blocks"] = []

  for (const renderedSection of rendering.sections) {
    const section = sectioning.sections[renderedSection.sectionIndex]
    if (!section || section.isPruned) continue
    const sectionType = section.sectionType || renderedSection.sectionType

    const doc = parseDocument(renderedSection.html)
    const elements = DomUtils.findAll(
      (el) => el.type === "tag" && el.attribs?.["data-id"] !== undefined,
      doc.children,
    )

    const seenSourceIds = new Set<string>()
    const entries = elements.flatMap((el) => {
      const tag = el as unknown as { attribs: Record<string, string> }
      const sourceId = tag.attribs["data-id"]
      if (seenSourceIds.has(sourceId)) return []

      const eligibility = getEasyReadElementEligibility(el as never)
      if (!eligibility.eligible) return []

      seenSourceIds.add(sourceId)
      const originalText = eligibility.text ?? DomUtils.textContent(el).replace(/\s+/g, " ").trim()
      return [{
        sourceId,
        easyReadId: `${sourceId}_easy_read`,
        originalText,
        text: originalText,
        pageId: page.pageId,
        sectionId: section.sectionId,
        sectionIndex: renderedSection.sectionIndex,
      }]
    })

    if (entries.length > 0) {
      blocks.push({
        pageId: page.pageId,
        pageNumber: page.pageNumber,
        sectionId: section.sectionId,
        sectionIndex: renderedSection.sectionIndex,
        sectionType,
        entries,
      })
    }
  }

  return blocks
}

/**
 * Adapt the texts of ONE section (block) into Easy Read.
 *
 * Pure with respect to shared state — it owns no caller state and returns its
 * results keyed by `sourceId`, so many blocks can be processed concurrently.
 * The section's full text is passed as `section_text` context on every call;
 * `batchSize` only caps the per-call size for unusually large sections (the
 * common case is a single call per section).
 */
export async function rewriteBlockEasyRead(
  block: EasyReadOutput["blocks"][number],
  config: EasyReadConfig,
  llmModel: LLMModel,
  selectedSourceIds?: ReadonlySet<string>,
): Promise<Map<string, string>> {
  const rewrittenBySourceId = new Map<string, string>()
  const sectionText = block.entries.map((entry) => entry.originalText).join("\n")

  const selected = block.entries.filter((entry) => !selectedSourceIds || selectedSourceIds.has(entry.sourceId))
  for (let i = 0; i < selected.length; i += config.batchSize) {
    const batch = selected.slice(i, i + config.batchSize)
    const texts = batch.map((entry, index) => ({ index, text: entry.originalText }))
    const result = await llmModel.generateObject<{ texts: string[] }>({
      schema: easyReadSchema,
      prompt: config.promptName,
      context: {
        ...buildLanguageContext(config.language),
        section_text: sectionText,
        section_type: block.sectionType,
        texts,
      },
      validate: (raw: unknown): ValidationResult => {
        const r = raw as { texts?: string[] }
        if (!Array.isArray(r.texts) || r.texts.length !== batch.length) {
          return {
            valid: false,
            errors: [
              `Expected ${batch.length} Easy Read texts but got ${Array.isArray(r.texts) ? r.texts.length : "none"}.`,
            ],
          }
        }
        return { valid: true, errors: [] }
      },
      maxRetries: config.maxRetries,
      maxTokens: 16384,
      log: {
        taskType: "easy-read",
        promptName: config.promptName,
        pageId: block.pageId,
      },
    })

    batch.forEach((entry, index) => {
      rewrittenBySourceId.set(entry.sourceId, result.object.texts[index] ?? entry.originalText)
    })
  }

  return rewrittenBySourceId
}

export interface GenerateEasyReadOptions {
  previous?: EasyReadOutput
  scope?: OutputRunScope
  signal?: AbortSignal
  references?: OutputReference[]
  excluded?: ReadonlySet<string>
  /** Maximum number of sections processed in parallel. Defaults to 1 (sequential). */
  concurrency?: number
  /** Called after each section finishes, with the cumulative entry counts. */
  onProgress?: (completed: number, total: number) => void
}

export async function generateEasyRead(
  blocks: EasyReadOutput["blocks"],
  config: EasyReadConfig,
  llmModel: LLMModel,
  options?: GenerateEasyReadOptions,
): Promise<EasyReadOutput> {
  if (!config.enabled || blocks.length === 0) {
    return createEmptyEasyReadOutput()
  }

  const previous = new Map((options?.previous?.blocks ?? []).flatMap((block) => block.entries.map((entry) => [entry.sourceId, entry] as const)))
  const generated = new Map<string, EasyReadOutput["blocks"][number]["entries"][number]>()
  const totalEntries = blocks.reduce((sum, block) => sum + block.entries.length, 0)
  let completed = 0
  await processWithConcurrency(blocks, options?.concurrency ?? 1, async (block) => {
    options?.signal?.throwIfAborted()
    const selected = new Set(block.entries.filter((entry) => {
      const prior = previous.get(entry.sourceId)
      const signature = easyReadInputSignature(block, entry.sourceId, config)
      const status = withOutputLocations(deriveOutputStatus({
        identity: { kind: "easy-read", id: entry.easyReadId, language: config.language },
        signature, content: prior?.text, metadata: prior, usable: !!prior?.text.trim(),
        excluded: options?.excluded?.has(entry.easyReadId),
      }), { id: entry.easyReadId, text: entry.text, locations: [{ pageId: block.pageId, sectionId: block.sectionId }] })
      return selectedForGeneration(status, prior, options?.scope)
    }).map((entry) => entry.sourceId))
    const rewritten = await rewriteBlockEasyRead(block, config, llmModel, selected)
    options?.signal?.throwIfAborted()
    for (const entry of block.entries) {
      if (outputSkipped(options?.scope, { kind: "easy-read", id: entry.easyReadId, language: config.language })) continue
      const text = rewritten.get(entry.sourceId)
      if (text !== undefined) generated.set(entry.sourceId, {
        ...entry, text, source: "ai", input: outputEvidence(easyReadInputSignature(block, entry.sourceId, config), text, options?.references),
      })
    }
    completed += block.entries.length
    options?.onProgress?.(completed, totalEntries)
  })
  options?.signal?.throwIfAborted()
  if (!generated.size && options?.previous) return options.previous
  const merged = blocks.map((block) => ({ ...block, entries: block.entries.flatMap((entry) => {
    const result = generated.get(entry.sourceId) ?? previous.get(entry.sourceId)
    return result ? [result] : []
  }) }))
  // Retired entries remain in retained versions; unselected active work survives.
  return EasyReadOutputSchema.parse({ blocks: merged, generatedAt: new Date().toISOString() })
}

export function easyReadInputSignature(block: EasyReadOutput["blocks"][number], sourceId: string, config: EasyReadConfig): string {
  return inputSignature({ id: sourceId, entries: block.entries.map((entry) => ({ id: entry.sourceId, text: entry.originalText })),
    sectionType: block.sectionType, language: config.language, model: config.modelId,
    prompt: config.promptSignature ?? config.promptName })
}

export function flattenEasyReadEntries(output: EasyReadOutput | null | undefined): TextCatalogEntry[] {
  return output?.blocks.flatMap((block) =>
    block.entries.map((entry) => ({
      id: entry.easyReadId,
      text: entry.text,
      source: entry.source, input: entry.input, review: entry.review,
      locations: [{ pageId: entry.pageId, sectionId: entry.sectionId }],
    }))
  ) ?? []
}
