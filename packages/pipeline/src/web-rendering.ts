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
  const allowedTextIds = input.texts.map((t) => t.textId)
  const allowedImageIds = input.images.map((img) => img.imageId)

  const validate = (result: unknown): ValidationResult => {
    const r = result as { reasoning: string; content: string }
    return validateSectionHtml(r.content, allowedTextIds, allowedImageIds)
  }

  const result = await llmModel.generateObject<{
    reasoning: string
    content: string
  }>({
    schema: webRenderingLLMSchema,
    prompt: {
      name: config.promptName,
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
    },
    validate,
    maxRetries: config.maxRetries,
    maxTokens: 16384,
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

/**
 * Build RenderConfig from AppConfig.
 */
export function buildRenderConfig(appConfig: AppConfig): RenderConfig {
  return {
    promptName: appConfig.web_rendering?.prompt ?? "web_generation_html",
    modelId: appConfig.web_rendering?.model ?? "openai:gpt-4o",
    maxRetries: appConfig.web_rendering?.max_retries ?? 8,
  }
}
