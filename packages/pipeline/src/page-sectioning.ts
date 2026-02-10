import type {
  TextClassificationOutput,
  ImageClassificationOutput,
  PageSectioningOutput,
  AppConfig,
  TypeDef,
} from "@adt/types"
import { buildPageSectioningLLMSchema } from "@adt/types"
import type { LLMModel } from "@adt/llm"

export interface SectioningConfig {
  sectionTypes: TypeDef[]
  prunedSectionTypes: string[]
  promptName: string
  modelId: string
}

export interface SectionPageInput {
  pageId: string
  pageNumber: number
  pageImageBase64: string
  textClassification: TextClassificationOutput
  imageClassification: ImageClassificationOutput
  images: Array<{ imageId: string; imageBase64: string }>
}

/**
 * Build concise group summaries from text classification, excluding pruned text entries.
 * Groups with no unpruned texts are omitted entirely.
 */
export function buildGroupSummaries(
  textClassification: TextClassificationOutput
): Array<{ groupId: string; groupType: string; text: string }> {
  return textClassification.groups
    .map((g) => {
      const unprunedTexts = g.texts.filter((t) => !t.isPruned)
      if (unprunedTexts.length === 0) return null

      return {
        groupId: g.groupId,
        groupType: g.groupType,
        text: unprunedTexts.map((t) => t.text).join(" "),
      }
    })
    .filter((g): g is NonNullable<typeof g> => g !== null)
}

/**
 * Section a page into semantic groups. Pure function — no side effects.
 * The caller handles concurrency, storage writes, and progress.
 */
export async function sectionPage(
  input: SectionPageInput,
  config: SectioningConfig,
  llmModel: LLMModel
): Promise<PageSectioningOutput> {
  // Build group summaries (excludes pruned text entries)
  const groupSummaries = buildGroupSummaries(input.textClassification)

  // Filter to un-pruned images
  const prunedImageIds = new Set(
    input.imageClassification.images
      .filter((img) => img.isPruned)
      .map((img) => img.imageId)
  )
  const unprunedImages = input.images.filter(
    (img) => !prunedImageIds.has(img.imageId)
  )

  // Build valid part IDs for the schema
  const validPartIds = [
    ...groupSummaries.map((g) => g.groupId),
    ...unprunedImages.map((img) => img.imageId),
  ]

  // If no parts to section, return empty result
  if (validPartIds.length === 0) {
    return { reasoning: "No content to section", sections: [] }
  }

  const sectionTypeKeys = config.sectionTypes.map((s) => s.key)
  if (sectionTypeKeys.length === 0) {
    throw new Error("No section types configured")
  }

  const schema = buildPageSectioningLLMSchema(
    sectionTypeKeys as [string, ...string[]],
    validPartIds as [string, ...string[]]
  )

  const result = await llmModel.generateObject<{
    reasoning: string
    sections: Array<{
      section_type: string
      part_ids: string[]
      background_color: string
      text_color: string
      page_number: number | null
    }>
  }>({
    schema,
    prompt: {
      name: config.promptName,
      context: {
        page: { imageBase64: input.pageImageBase64 },
        images: unprunedImages.map((img) => ({
          image_id: img.imageId,
          imageBase64: img.imageBase64,
        })),
        groups: groupSummaries.map((g) => ({
          group_id: g.groupId,
          group_type: g.groupType,
          text: g.text,
        })),
        section_types: config.sectionTypes,
      },
    },
    maxRetries: 2,
    maxTokens: 16384,
    log: {
      taskType: "page-sectioning",
      pageId: input.pageId,
      promptName: config.promptName,
    },
  })

  // Post-process: mark pruned sections
  const prunedSet = new Set(config.prunedSectionTypes)

  const sections = result.object.sections.map((s) => ({
    sectionType: s.section_type,
    partIds: s.part_ids,
    backgroundColor: s.background_color,
    textColor: s.text_color,
    pageNumber: s.page_number,
    isPruned: prunedSet.has(s.section_type),
  }))

  return {
    reasoning: result.object.reasoning,
    sections,
  }
}

/**
 * Build SectioningConfig from AppConfig.
 */
export function buildSectioningConfig(appConfig: AppConfig): SectioningConfig {
  const sectionTypes: TypeDef[] = Object.entries(
    appConfig.section_types ?? {}
  ).map(([key, description]) => ({ key, description }))

  return {
    sectionTypes,
    prunedSectionTypes: appConfig.pruned_section_types ?? [],
    promptName: appConfig.page_sectioning?.prompt ?? "page_sectioning",
    modelId: appConfig.page_sectioning?.model ?? "openai:gpt-4o",
  }
}
