import type {
  PageSectioningOutput,
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
  renderType: "llm" | "template" | "activity"
  // llm / activity fields
  promptName: string
  modelId: string
  maxRetries: number
  timeoutMs: number
  temperature: number
  // activity fields — answer generation prompt
  answerPromptName: string
  // template fields
  templateName: string
}

export interface RenderSectionInput {
  label: string
  pageId: string
  pageImageBase64: string
  sectionIndex: number
  sectionId: string
  sectionType: string
  backgroundColor: string
  textColor: string
  parts: SectionPart[]
  styleguide?: string
}

export interface RenderPageInput {
  label: string
  pageId: string
  pageImageBase64: string
  sectioning: PageSectioningOutput
  images: Map<string, string> // imageId → base64
  styleguide?: string
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
 * Expand inline section parts into the render-ready SectionPart format.
 * Filters to non-pruned parts, expands text groups to TextInput with generated IDs,
 * and resolves image base64 from the images map.
 */
function expandParts(
  sectionParts: import("@adt/types").SectionPart[],
  images: Map<string, string>
): SectionPart[] {
  const parts: SectionPart[] = []

  for (const part of sectionParts) {
    if (part.isPruned) continue

    if (part.type === "text_group") {
      const nonPruned = part.texts.filter((t) => !t.isPruned)
      const texts = nonPruned.map((t, i) => ({
        textId: `${part.groupId}_tx${String(i + 1).padStart(3, "0")}`,
        textType: t.textType,
        text: t.text,
      }))
      if (texts.length > 0) {
        parts.push({
          type: "group",
          groupId: part.groupId,
          groupType: part.groupType,
          texts,
        })
      }
    } else if (part.type === "image") {
      const imageBase64 = images.get(part.imageId)
      if (imageBase64) {
        parts.push({ type: "image", imageId: part.imageId, imageBase64 })
      }
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

    // Expand inline parts to render-ready format
    const parts = expandParts(section.parts, input.images)

    // Skip sections with no content
    if (parts.length === 0) continue

    const config = resolveConfig(section.sectionType)

    const sectionInput: RenderSectionInput = {
      label: input.label,
      pageId: input.pageId,
      pageImageBase64: input.pageImageBase64,
      sectionIndex: i,
      sectionId: section.sectionId,
      sectionType: section.sectionType,
      backgroundColor: section.backgroundColor,
      textColor: section.textColor,
      parts,
      styleguide: input.styleguide,
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
      // Both "llm" and "activity" use the LLM renderer.
      // Activity-specific behaviour (looser validation, answer generation)
      // is driven by config fields (renderType, answerPromptName).
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
  temperature: 0.3,
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
      temperature: cfg?.temperature ?? DEFAULT_RENDER_CONFIG.temperature,
      answerPromptName: cfg?.answer_prompt ?? "",
      templateName: cfg?.template ?? "",
    }
  }
}
