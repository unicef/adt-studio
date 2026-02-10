import type {
  PageSectioningOutput,
  TextClassificationOutput,
  AppConfig,
  SectionRendering,
  WebRenderingOutput,
} from "@adt/types"
import { webRenderingLLMSchema } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import { validateSectionHtml } from "./validate-html.js"

export interface RenderConfig {
  promptName: string
  modelId: string
  maxRetries: number
  timeoutMs: number
}

export interface TextInput {
  textId: string
  textType: string
  text: string
}

export interface ImageInput {
  imageId: string
  imageBase64: string
}

export interface RenderPageInput {
  pageId: string
  pageImageBase64: string
  sectioning: PageSectioningOutput
  textClassification: TextClassificationOutput
  images: Map<string, string> // imageId → base64
}

/**
 * Resolve section part IDs to text entries. Each partId that matches a group ID
 * expands to the individual text entries within that group (excluding pruned texts).
 */
function resolveTexts(
  partIds: string[],
  textClassification: TextClassificationOutput
): TextInput[] {
  const groupMap = new Map(
    textClassification.groups.map((g) => [g.groupId, g])
  )
  const texts: TextInput[] = []

  for (const partId of partIds) {
    const group = groupMap.get(partId)
    if (!group) continue

    const nonPruned = group.texts.filter((t) => !t.isPruned)
    for (let i = 0; i < nonPruned.length; i++) {
      texts.push({
        textId: `${partId}_tx${String(i + 1).padStart(3, "0")}`,
        textType: nonPruned[i].textType,
        text: nonPruned[i].text,
      })
    }
  }

  return texts
}

/**
 * Resolve section part IDs to image entries.
 */
function resolveImages(
  partIds: string[],
  images: Map<string, string>
): ImageInput[] {
  const resolved: ImageInput[] = []

  for (const partId of partIds) {
    const imageBase64 = images.get(partId)
    if (imageBase64) {
      resolved.push({ imageId: partId, imageBase64 })
    }
  }

  return resolved
}

/**
 * Render all sections for a page as HTML. Pure function — no side effects.
 * The caller handles concurrency, storage writes, and progress.
 */
export async function renderPage(
  input: RenderPageInput,
  config: RenderConfig,
  llmModel: LLMModel
): Promise<WebRenderingOutput> {
  const sections: SectionRendering[] = []

  for (let i = 0; i < input.sectioning.sections.length; i++) {
    const section = input.sectioning.sections[i]

    // Skip pruned sections
    if (section.isPruned) continue

    // Resolve texts and images from part IDs
    const texts = resolveTexts(section.partIds, input.textClassification)
    const sectionImages = resolveImages(section.partIds, input.images)

    // Skip sections with no content
    if (texts.length === 0 && sectionImages.length === 0) continue

    const rendering = await renderSection(
      {
        pageId: input.pageId,
        pageImageBase64: input.pageImageBase64,
        sectionIndex: i,
        sectionType: section.sectionType,
        texts,
        images: sectionImages,
      },
      config,
      llmModel
    )

    sections.push(rendering)
  }

  return { sections }
}

export interface RenderSectionInput {
  pageId: string
  pageImageBase64: string
  sectionIndex: number
  sectionType: string
  texts: TextInput[]
  images: ImageInput[]
}

/**
 * Render a single section as HTML.
 */
export async function renderSection(
  input: RenderSectionInput,
  config: RenderConfig,
  llmModel: LLMModel
): Promise<SectionRendering> {
  const result = await llmModel.generateObject<{
    reasoning: string
    content: string
  }>({
    schema: webRenderingLLMSchema,
    prompt: config.promptName,
    context: {
      page_image_base64: input.pageImageBase64,
      section_type: input.sectionType,
      texts: input.texts.map((t) => ({
        text_id: t.textId,
        text_type: t.textType,
        text: t.text,
      })),
      images: input.images.map((img) => ({
        image_id: img.imageId,
        image_base64: img.imageBase64,
      })),
    },
    validate: validateWebRendering,
    maxRetries: config.maxRetries,
    maxTokens: 16384,
    timeoutMs: config.timeoutMs,
    log: {
      taskType: "web-rendering",
      pageId: input.pageId,
      promptName: config.promptName,
    },
  })

  return {
    sectionIndex: input.sectionIndex,
    sectionType: input.sectionType,
    reasoning: result.object.reasoning,
    html: result.object.content,
  }
}

function validateWebRendering(
  result: unknown,
  context: Record<string, unknown>
): ValidationResult {
  const r = result as { reasoning: string; content: string }
  const texts = context.texts as Array<{ text_id: string }>
  const images = context.images as Array<{ image_id: string }>
  const allowedTextIds = texts.map((t) => t.text_id)
  const allowedImageIds = images.map((img) => img.image_id)

  const check = validateSectionHtml(r.content, allowedTextIds, allowedImageIds)
  if (check.valid && check.sectionHtml) {
    return {
      valid: true,
      errors: [],
      cleaned: { reasoning: r.reasoning, content: check.sectionHtml },
    }
  }
  return { valid: check.valid, errors: check.errors }
}

/**
 * Build RenderConfig from AppConfig.
 */
export function buildRenderConfig(appConfig: AppConfig): RenderConfig {
  return {
    promptName: appConfig.web_rendering?.prompt ?? "web_generation_html",
    modelId: appConfig.web_rendering?.model ?? "openai:gpt-4o",
    maxRetries: appConfig.web_rendering?.max_retries ?? 8,
    timeoutMs: (appConfig.web_rendering?.timeout ?? 180) * 1000,
  }
}
