import { z } from "zod"
import { StepName } from "./pipeline.js"
import { LLMModelId } from "./config.js"
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

export type InheritedModelSource = { kind: "default" } | { kind: "task"; taskId: string }

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
