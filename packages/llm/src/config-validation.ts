import type { AiModality, AppConfig } from "@adt/types"
import { AiProviderError } from "./ports/errors.js"
import { resolveModelIdFor } from "./model-id.js"
import type { ProviderRegistry } from "./registry.js"

export interface ConfigModelCheck {
  field: string
  modelId: string
  modality: AiModality
}

export interface ConfigModelIssue extends ConfigModelCheck {
  code: AiProviderError["code"]
  message: string
}

const STRUCTURED_TEXT_STEP_FIELDS = [
  "page_sectioning",
  "translation",
  "metadata",
  "book_summary",
  "quiz_generation",
  "easy_read",
  "font_assignment",
  "image_meaningfulness",
  "glossary",
  "toc_generation",
  "image_captioning",
  "image_segmentation",
  "image_cropping",
] as const satisfies readonly (keyof AppConfig)[]

export function collectConfigModelChecks(config: AppConfig): ConfigModelCheck[] {
  const checks: ConfigModelCheck[] = []

  if (config.default_model) {
    checks.push({ field: "default_model", modelId: config.default_model, modality: "structured-text" })
  }
  if (config.agents?.model) {
    checks.push({ field: "agents.model", modelId: config.agents.model, modality: "agent" })
  }
  if (config.default_image_generation_model) {
    checks.push({
      field: "default_image_generation_model",
      modelId: config.default_image_generation_model,
      modality: "image",
    })
  }

  for (const field of STRUCTURED_TEXT_STEP_FIELDS) {
    const step = config[field] as { model?: string } | undefined
    if (step?.model) {
      checks.push({ field: `${field}.model`, modelId: step.model, modality: "structured-text" })
    }
  }

  if (config.image_translation?.image_model) {
    checks.push({
      field: "image_translation.image_model",
      modelId: config.image_translation.image_model,
      modality: "image",
    })
  }

  return checks
}

export function validateConfigModels(
  registry: ProviderRegistry,
  config: AppConfig,
): ConfigModelIssue[] {
  const issues: ConfigModelIssue[] = []
  for (const check of collectConfigModelChecks(config)) {
    try {
      resolveModelIdFor(registry, check.modelId, check.modality)
    } catch (error) {
      if (!AiProviderError.is(error)) throw error
      issues.push({ ...check, code: error.code, message: error.message })
    }
  }
  return issues
}

export function assertConfigModels(registry: ProviderRegistry, config: AppConfig): void {
  const [first] = validateConfigModels(registry, config)
  if (!first) return
  throw new AiProviderError(first.code, `${first.field}: ${first.message}`, {
    modelId: first.modelId,
    modality: first.modality,
  })
}
