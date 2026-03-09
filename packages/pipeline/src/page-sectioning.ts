import type {
  TextClassificationOutput,
  ImageClassificationOutput,
  PageSectioningOutput,
  SectionPart,
  AppConfig,
  TypeDef,
  SectioningMode,
} from "@adt/types"
import {
  buildPageSectioningLLMSchema,
  DEFAULT_LLM_MAX_RETRIES,
} from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"

export interface SectioningConfig {
  sectionTypes: TypeDef[]
  prunedSectionTypes: string[]
  promptName: string
  modelId: string
  maxRetries: number
  mode: SectioningMode
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

  const schema = buildPageSectioningLLMSchema()

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
    prompt: config.promptName,
    context: {
      sectioning_mode: config.mode,
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
    validate: validatePageSectioning,
    maxRetries: config.maxRetries,
    maxTokens: 16384,
    log: {
      taskType: "page-sectioning",
      pageId: input.pageId,
      promptName: config.promptName,
    },
  })

  // Build lookup maps for expanding part_ids into inline parts
  const groupMap = new Map(
    input.textClassification.groups.map((g) => [g.groupId, g])
  )
  const imageClassMap = new Map(
    input.imageClassification.images.map((img) => [img.imageId, img])
  )

  // Track which parts get assigned to a section
  const assignedPartIds = new Set<string>()

  // Post-process: mark pruned sections, expand part_ids to inline parts
  const prunedSet = new Set(config.prunedSectionTypes)

  const sections = result.object.sections.map((s, idx) => {
    const sectionId = `${input.pageId}_sec${String(idx + 1).padStart(3, "0")}`
    const parts: SectionPart[] = s.part_ids.map((partId) => {
      assignedPartIds.add(partId)

      const group = groupMap.get(partId)
      if (group) {
        return {
          type: "text_group" as const,
          groupId: group.groupId,
          groupType: group.groupType,
          texts: group.texts.map((t, tIdx) => ({
            textId: `${group.groupId}_tx${String(tIdx + 1).padStart(3, "0")}`,
            textType: t.textType,
            text: t.text,
            isPruned: t.isPruned,
          })),
          isPruned: false,
        }
      }

      const imgClass = imageClassMap.get(partId)
      return {
        type: "image" as const,
        imageId: partId,
        isPruned: false,
        ...(imgClass?.reason ? { reason: imgClass.reason } : {}),
      }
    })

    return {
      sectionId,
      sectionType: s.section_type,
      parts,
      backgroundColor: s.background_color,
      textColor: s.text_color,
      pageNumber: s.page_number,
      isPruned: prunedSet.has(s.section_type),
    }
  })

  // Collect unassigned parts and add them to the last non-pruned section
  const unassignedParts: SectionPart[] = []

  for (const group of input.textClassification.groups) {
    if (!assignedPartIds.has(group.groupId)) {
      unassignedParts.push({
        type: "text_group",
        groupId: group.groupId,
        groupType: group.groupType,
        texts: group.texts.map((t, tIdx) => ({
          textId: `${group.groupId}_tx${String(tIdx + 1).padStart(3, "0")}`,
          textType: t.textType,
          text: t.text,
          isPruned: t.isPruned,
        })),
        isPruned: true,
      })
    }
  }

  for (const img of input.imageClassification.images) {
    if (!assignedPartIds.has(img.imageId)) {
      unassignedParts.push({
        type: "image",
        imageId: img.imageId,
        isPruned: img.isPruned,
        ...(img.reason ? { reason: img.reason } : {}),
      })
    }
  }

  if (unassignedParts.length > 0 && sections.length > 0) {
    const targetSection =
      [...sections].reverse().find((s) => !s.isPruned) ?? sections[0]
    targetSection.parts.push(...unassignedParts)
  }

  return {
    reasoning: result.object.reasoning,
    sections,
  }
}

function validatePageSectioning(
  result: unknown,
  context: Record<string, unknown>
): ValidationResult {
  const r = result as {
    sections: Array<{ section_type: string; part_ids: string[] }>
  }
  const sectionTypes = context.section_types as TypeDef[]
  const groups = context.groups as Array<{ group_id: string }>
  const images = context.images as Array<{ image_id: string }>

  const sectionTypeKeys = new Set(sectionTypes.map((s) => s.key))
  const validPartIds = new Set([
    ...groups.map((g) => g.group_id),
    ...images.map((img) => img.image_id),
  ])

  const errors: string[] = []
  const assignedIds = new Set<string>()
  for (const section of r.sections) {
    if (!sectionTypeKeys.has(section.section_type)) {
      errors.push(
        `Invalid section_type "${section.section_type}". Must be one of: ${sectionTypes.map((s) => s.key).join(", ")}`
      )
    }
    for (const partId of section.part_ids) {
      if (!validPartIds.has(partId)) {
        errors.push(
          `Invalid part_id "${partId}". Must be one of: ${[...validPartIds].join(", ")}`
        )
      }
      assignedIds.add(partId)
    }
  }

  // Ensure all parts are assigned to at least one section
  const unassigned = [...validPartIds].filter((id) => !assignedIds.has(id))
  if (unassigned.length > 0) {
    errors.push(
      `Every part must be assigned to a section. Unassigned part_ids: ${unassigned.join(", ")}`
    )
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Build SectioningConfig from AppConfig.
 */
export function buildSectioningConfig(appConfig: AppConfig): SectioningConfig {
  const disabledSet = new Set(appConfig.disabled_section_types ?? [])
  const sectionTypes: TypeDef[] = Object.entries(
    appConfig.section_types ?? {}
  )
    .filter(([key]) => !disabledSet.has(key))
    .map(([key, description]) => ({ key, description }))

  return {
    sectionTypes,
    prunedSectionTypes: appConfig.pruned_section_types ?? [],
    promptName: appConfig.page_sectioning?.prompt ?? "page_sectioning",
    modelId: appConfig.page_sectioning?.model ?? "openai:gpt-5.2",
    maxRetries:
      appConfig.page_sectioning?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
    mode: appConfig.page_sectioning?.mode ?? "section",
  }
}
