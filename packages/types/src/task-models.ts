import { z } from "zod"
import { StepName } from "./pipeline.js"
import { DEFAULT_LLM_MODEL_ID, LLMModelId, type AppConfig } from "./config.js"
import { ReasoningEffort } from "./llm-inference.js"

export interface StepTaskModelTarget {
  configKey: string
  step?: StepName
  defaultPrompt: string
  extraPrompts: readonly string[]
  promptKey?: string
  inheritsFrom?: readonly string[]
}

export const STEP_TASK_MODEL_TARGETS: readonly StepTaskModelTarget[] = [
  { configKey: "metadata", step: "metadata", defaultPrompt: "metadata_extraction", extraPrompts: [] },
  { configKey: "book_summary", step: "book-summary", defaultPrompt: "book_summary", extraPrompts: [] },
  {
    configKey: "book_outline",
    step: "book-outline",
    defaultPrompt: "book_outline",
    extraPrompts: ["book_outline_chunk", "book_outline_synthesis"],
  },
  {
    configKey: "image_meaningfulness",
    step: "image-meaningfulness",
    defaultPrompt: "image_meaningfulness",
    extraPrompts: [],
  },
  {
    configKey: "image_segmentation",
    step: "image-segmentation",
    defaultPrompt: "image_segmentation",
    extraPrompts: [],
  },
  {
    configKey: "image_cropping",
    step: "image-cropping",
    defaultPrompt: "image_cropping",
    extraPrompts: [],
    inheritsFrom: ["image_meaningfulness"],
  },
  {
    configKey: "page_sectioning",
    step: "page-sectioning",
    defaultPrompt: "page_sectioning",
    extraPrompts: ["page_sectioning_refinement", "html_edit", "html_edit_verify"],
  },
  {
    configKey: "translation",
    step: "translation",
    defaultPrompt: "translation",
    extraPrompts: [],
    inheritsFrom: ["page_sectioning"],
  },
  {
    configKey: "quiz_generation",
    step: "quiz-generation",
    defaultPrompt: "quiz_generation",
    extraPrompts: ["activity_feedback"],
    inheritsFrom: ["page_sectioning"],
  },
  {
    configKey: "image_captioning",
    step: "image-captioning",
    defaultPrompt: "image_captioning",
    extraPrompts: [],
    inheritsFrom: ["page_sectioning"],
  },
  {
    configKey: "glossary",
    step: "glossary",
    defaultPrompt: "glossary",
    extraPrompts: ["glossary_one"],
    inheritsFrom: ["page_sectioning"],
  },
  {
    configKey: "toc_generation",
    step: "toc-generation",
    defaultPrompt: "toc_generation",
    extraPrompts: [],
    inheritsFrom: ["page_sectioning"],
  },
  {
    configKey: "easy_read",
    step: "easy-read",
    defaultPrompt: "easy_read",
    extraPrompts: [],
    inheritsFrom: ["translation", "page_sectioning"],
  },
  {
    configKey: "core_tts",
    step: "core-tts-catalog",
    defaultPrompt: "core_tts_preparation",
    extraPrompts: [],
    inheritsFrom: ["translation"],
  },
  { configKey: "font_assignment", defaultPrompt: "font_assignment", extraPrompts: [] },
  { configKey: "styleguide_generation", defaultPrompt: "styleguide_generation", extraPrompts: [] },
  {
    configKey: "visual_review",
    defaultPrompt: "visual_review",
    extraPrompts: [],
    promptKey: "visual_review_prompt",
  },
]

export const TaskModelKind = z.enum(["step", "render-strategy"])
export type TaskModelKind = z.infer<typeof TaskModelKind>

export const TaskModelEntry = z.object({
  id: z.string(),
  kind: TaskModelKind,
  configKey: z.string(),
  step: StepName.optional(),
  prompts: z.array(z.string()),
  model: z.string().nullable(),
  reasoningEffort: ReasoningEffort.nullable(),
  inheritsFrom: z.array(z.string()),
})
export type TaskModelEntry = z.infer<typeof TaskModelEntry>

export type InheritedModelSource = { kind: "default" } | { kind: "platform" } | { kind: "task"; taskId: string }

export function taskConfigPath(
  task: Pick<TaskModelEntry, "kind" | "configKey">,
  field: "model" | "reasoning_effort",
): string[] {
  return task.kind === "step"
    ? [task.configKey, field]
    : ["render_strategies", task.configKey, "config", field]
}

export function resolveInheritedTaskModel(
  task: Pick<TaskModelEntry, "inheritsFrom">,
  modelOf: (taskId: string) => string | null | undefined,
  defaultModel: string,
): { model: string; source: InheritedModelSource } {
  for (const taskId of task.inheritsFrom) {
    const model = modelOf(taskId)
    if (model) return { model, source: { kind: "task", taskId } }
  }
  return { model: defaultModel, source: { kind: "default" } }
}

function providerOf(model: string): string {
  return model.split(":", 1)[0]
}

/**
 * The models the shipped config pins tasks to. These are recommendations for
 * the OpenAI default; a task set to any other model was chosen on purpose.
 */
export const SHIPPED_TASK_MODEL_IDS: readonly string[] = [DEFAULT_LLM_MODEL_ID, "openai:gpt-6.1-sol"]

/**
 * A task pinned to one of the shipped models (GPT-6 Luna, GPT-6.1 Sol) applies
 * only while the default LLM is an OpenAI model. With another provider as the
 * default, that task follows the default instead, so a user with no OpenAI key
 * can run every stage. A pin to any other model, OpenAI's included, always
 * applies: it is the user's choice, and a missing key is reported before a run.
 */
export function taskModelApplies(model: string | null | undefined, defaultModel: string): boolean {
  return !model || !SHIPPED_TASK_MODEL_IDS.includes(model) || providerOf(defaultModel) === "openai"
}

type ModelBlock = { model?: string | null; reasoning_effort?: unknown }

function withoutModel<T extends ModelBlock>(block: T): T {
  const { model: _model, reasoning_effort: _effort, ...rest } = block
  return rest as T
}

type RenderStrategy = NonNullable<AppConfig["render_strategies"]>[string]

/**
 * A render strategy without the model pin and the fallback model that don't
 * apply under `defaultModel`. The shipped fallback is a pin like any other: a
 * user with no OpenAI key must not have a failed render switch to OpenAI.
 */
function withApplicableStrategyModels(strategy: RenderStrategy, defaultModel: string): RenderStrategy {
  const config = strategy.config
  if (!config) return strategy
  const { fallback, ...rest } = config
  const dropModel = !taskModelApplies(config.model, defaultModel)
  const dropFallback = fallback !== undefined && !taskModelApplies(fallback.model, defaultModel)
  if (!dropModel && !dropFallback) return strategy
  const base = dropModel ? withoutModel(rest) : rest
  return { ...strategy, config: fallback && !dropFallback ? { ...base, fallback } : base }
}

/**
 * `config` without the task pins that don't apply under its default LLM (see
 * `taskModelApplies`). A dropped pin takes its `reasoning_effort` with it,
 * since that effort was chosen for the pinned model. Apply it to the final,
 * merged config: a book can set its own default LLM.
 */
export function withApplicableTaskModels(config: AppConfig): AppConfig {
  const defaultModel = config.default_model ?? DEFAULT_LLM_MODEL_ID
  if (providerOf(defaultModel) === "openai") return config
  const next = { ...config } as Record<string, unknown>
  for (const target of STEP_TASK_MODEL_TARGETS) {
    const block = next[target.configKey] as ModelBlock | undefined
    if (block && typeof block === "object" && !taskModelApplies(block.model, defaultModel)) {
      next[target.configKey] = withoutModel(block)
    }
  }
  if (config.render_strategies) {
    next.render_strategies = Object.fromEntries(Object.entries(config.render_strategies).map(([name, strategy]) => [
      name,
      withApplicableStrategyModels(strategy, defaultModel),
    ]))
  }
  return next as AppConfig
}

export const TaskModelsResponse = z.object({
  defaultModel: z.string(),
  defaultReasoningEffort: ReasoningEffort.nullable(),
  tasks: z.array(TaskModelEntry),
})
export type TaskModelsResponse = z.infer<typeof TaskModelsResponse>

export const UpdateTaskModelRequest = z
  .object({
    id: z.string().min(1),
    model: LLMModelId.nullable().optional(),
    reasoningEffort: ReasoningEffort.nullable().optional(),
  })
  .refine((value) => value.model !== undefined || value.reasoningEffort !== undefined, {
    message: "Provide a model or a reasoning effort",
  })
export type UpdateTaskModelRequest = z.infer<typeof UpdateTaskModelRequest>

export const UpdateDefaultReasoningEffortRequest = z.object({
  reasoningEffort: ReasoningEffort.nullable(),
})
export type UpdateDefaultReasoningEffortRequest = z.infer<typeof UpdateDefaultReasoningEffortRequest>
