import { DEFAULT_LLM_MODEL_ID, PIPELINE, STEP_TO_STAGE, type AiModality, type AppConfig, type StageName } from "@adt/types"
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
  "book_outline",
  "quiz_generation",
  "easy_read",
  "font_assignment",
  "image_meaningfulness",
  "glossary",
  "toc_generation",
  "image_captioning",
  "image_segmentation",
  "image_cropping",
  "core_tts",
] as const satisfies readonly (keyof AppConfig)[]

const LLM_RENDER_TYPES: readonly string[] = ["llm", "activity"]

/**
 * The web-rendering step resolves `render_strategies.<name>.config.model`
 * before `default_model`, so those overrides must be credentialed too.
 * Template and fixed-layout strategies never route to a model and are skipped.
 */
function collectRenderStrategyChecks(config: AppConfig): ConfigModelCheck[] {
  const checks: ConfigModelCheck[] = []
  for (const [name, strategy] of Object.entries(config.render_strategies ?? {})) {
    if (LLM_RENDER_TYPES.includes(strategy.render_type) && strategy.config?.model) {
      checks.push({
        field: `render_strategies.${name}.config.model`,
        modelId: strategy.config.model,
        modality: "structured-text",
      })
    }
  }
  return checks
}

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
  checks.push(...collectRenderStrategyChecks(config))

  if (config.image_translation?.image_model) {
    checks.push({
      field: "image_translation.image_model",
      modelId: config.image_translation.image_model,
      modality: "image",
    })
  }

  return checks
}

/**
 * The model checks a stage-scoped run must pass before it clears any data.
 * Steps resolve their model through override chains that all end at
 * `default_model`, so a run containing any LLM step validates the default plus
 * every configured step override. An override consumed only by an out-of-range
 * step still gets checked — the chains are private to each step, and a config
 * that names an uncredentialed provider is broken for the pipeline as a whole —
 * but a run whose stages make no structured-text call (e.g. speech only)
 * checks nothing. Render-strategy models are the exception: only the storyboard
 * stage renders, and the shipped config pins one activity strategy to an
 * OpenAI model, so demanding that key from an Extract run on a keyless default
 * (Codex, Claude Code) would block runs that never touch it. Image and TTS
 * models are excluded: those steps guard themselves before touching existing data.
 */
export function collectStageRunModelChecks(
  config: AppConfig,
  stages: readonly StageName[],
): ConfigModelCheck[] {
  const steps = PIPELINE.filter((stage) => stages.includes(stage.name)).flatMap(
    (stage) => stage.steps,
  )
  if (!steps.some((step) => step.modelDefault === "llm")) return []

  const checks: ConfigModelCheck[] = [
    {
      field: "default_model",
      modelId: config.default_model ?? DEFAULT_LLM_MODEL_ID,
      modality: "structured-text",
    },
  ]
  for (const field of STRUCTURED_TEXT_STEP_FIELDS) {
    const step = config[field] as { model?: string } | undefined
    if (step?.model) {
      checks.push({ field: `${field}.model`, modelId: step.model, modality: "structured-text" })
    }
  }
  if (stages.includes(STEP_TO_STAGE["web-rendering"])) {
    checks.push(...collectRenderStrategyChecks(config))
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
