import type {
  PageSectioningOutput,
  TextClassificationOutput,
  AppConfig,
  SectionRendering,
  WebRenderingOutput,
} from "@adt/types"
import type { LLMModel } from "@adt/llm"
import { renderSectionLlm } from "./render-llm.js"
import { renderSectionTemplate, type TemplateEngine } from "./render-template.js"

export interface TextInput {
  textId: string
  textType: string
  text: string
}

export interface ImageInput {
  imageId: string
  imageBase64: string
}

export type SectionPart =
  | { type: "group"; groupId: string; groupType: string; texts: TextInput[] }
  | { type: "image"; imageId: string; imageBase64: string }

export interface RenderConfig {
  renderType: "llm" | "template"
  // llm fields
  promptName: string
  modelId: string
  maxRetries: number
  timeoutMs: number
  // template fields
  templateName: string
}

export interface RenderSectionInput {
  label: string
  pageId: string
  pageImageBase64: string
  sectionIndex: number
  sectionType: string
  backgroundColor: string
  textColor: string
  parts: SectionPart[]
}

export interface RenderPageInput {
  label: string
  pageId: string
  pageImageBase64: string
  sectioning: PageSectioningOutput
  textClassification: TextClassificationOutput
  images: Map<string, string> // imageId → base64
}

export type ResolveLLMModel = LLMModel | ((modelId: string) => LLMModel)

function getLLMModel(
  resolver: ResolveLLMModel,
  modelId: string
): LLMModel {
  return typeof resolver === "function"
    ? resolver(modelId)
    : resolver
}

/**
 * Resolve section part IDs to an ordered array of groups and images.
 * Groups are expanded to their non-pruned text entries.
 */
function resolveParts(
  partIds: string[],
  textClassification: TextClassificationOutput,
  images: Map<string, string>
): SectionPart[] {
  const groupMap = new Map(
    textClassification.groups.map((g) => [g.groupId, g])
  )
  const parts: SectionPart[] = []

  for (const partId of partIds) {
    const group = groupMap.get(partId)
    if (group) {
      const nonPruned = group.texts.filter((t) => !t.isPruned)
      const texts = nonPruned.map((t, i) => ({
        textId: `${partId}_tx${String(i + 1).padStart(3, "0")}`,
        textType: t.textType,
        text: t.text,
      }))
      if (texts.length > 0) {
        parts.push({
          type: "group",
          groupId: partId,
          groupType: group.groupType,
          texts,
        })
      }
      continue
    }

    const imageBase64 = images.get(partId)
    if (imageBase64) {
      parts.push({ type: "image", imageId: partId, imageBase64 })
    }
  }

  return parts
}

/**
 * Render all sections for a page. Pure function — no side effects.
 * The caller handles concurrency, storage writes, and progress.
 *
 * Dispatches each section to the appropriate renderer based on config.renderType.
 */
export async function renderPage(
  input: RenderPageInput,
  resolveConfig: (sectionType: string) => RenderConfig,
  llmModel: ResolveLLMModel,
  templateEngine?: TemplateEngine
): Promise<WebRenderingOutput> {
  const sections: SectionRendering[] = []

  for (let i = 0; i < input.sectioning.sections.length; i++) {
    const section = input.sectioning.sections[i]

    // Skip pruned sections
    if (section.isPruned) continue

    // Resolve parts from part IDs
    const parts = resolveParts(
      section.partIds,
      input.textClassification,
      input.images
    )

    // Skip sections with no content
    if (parts.length === 0) continue

    const config = resolveConfig(section.sectionType)

    const sectionInput: RenderSectionInput = {
      label: input.label,
      pageId: input.pageId,
      pageImageBase64: input.pageImageBase64,
      sectionIndex: i,
      sectionType: section.sectionType,
      backgroundColor: section.backgroundColor,
      textColor: section.textColor,
      parts,
    }

    let rendering: SectionRendering
    if (config.renderType === "template") {
      if (!templateEngine) {
        throw new Error(
          "Template engine required for template render type"
        )
      }
      rendering = await renderSectionTemplate(
        sectionInput,
        config,
        templateEngine
      )
    } else {
      rendering = await renderSectionLlm(
        sectionInput,
        config,
        getLLMModel(llmModel, config.modelId)
      )
    }

    sections.push(rendering)
  }

  return { sections }
}

const DEFAULT_RENDER_CONFIG = {
  prompt: "web_generation_html",
  model: "openai:gpt-5.2",
  max_retries: 25,
  timeout: 180,
}

/**
 * Build a resolver that returns a RenderConfig for a given section type.
 *
 * Resolution order:
 *   1. section_render_strategies[sectionType] → named strategy
 *   2. default_render_strategy → named strategy
 *   3. Hard-coded defaults
 */
export function buildRenderStrategyResolver(
  appConfig: AppConfig
): (sectionType: string) => RenderConfig {
  const strategies = appConfig.render_strategies ?? {}
  const sectionMapping = appConfig.section_render_strategies ?? {}
  const defaultName = appConfig.default_render_strategy

  return (sectionType: string): RenderConfig => {
    const sectionStrategyName = sectionMapping[sectionType]
    const sectionStrategy = sectionStrategyName
      ? strategies[sectionStrategyName]
      : undefined
    const defaultStrategy = defaultName
      ? strategies[defaultName]
      : undefined
    const strategy = sectionStrategy ?? defaultStrategy
    const cfg = strategy?.config

    return {
      renderType: strategy?.render_type ?? "llm",
      promptName: cfg?.prompt ?? DEFAULT_RENDER_CONFIG.prompt,
      modelId: cfg?.model ?? DEFAULT_RENDER_CONFIG.model,
      maxRetries: cfg?.max_retries ?? DEFAULT_RENDER_CONFIG.max_retries,
      timeoutMs: (cfg?.timeout ?? DEFAULT_RENDER_CONFIG.timeout) * 1000,
      templateName: cfg?.template ?? "",
    }
  }
}
