import type { StepName } from "./use-pipeline"

/**
 * Single source of truth: pipeline sub-steps grouped by UI step, in execution order.
 *
 * When adding a new pipeline step:
 * 1. Add it to StepName in use-pipeline.ts
 * 2. Add it to the appropriate group here
 *
 * `satisfies` catches invalid step names at compile time.
 * The test in use-step-run.test.ts catches missing step names.
 */
const UI_STEP_PIPELINE_STEPS = {
  extract: [
    "extract",
    "metadata",
    "image-classification",
    "text-classification",
    "translation",
    "book-summary",
  ],
  storyboard: ["page-sectioning", "web-rendering"],
  quizzes: ["quiz-generation"],
  captions: ["image-captioning"],
  glossary: ["glossary"],
  translations: ["text-catalog", "catalog-translation"],
  "text-to-speech": ["tts"],
} as const satisfies Record<string, readonly StepName[]>

export type UIStepSlug = keyof typeof UI_STEP_PIPELINE_STEPS

export const UI_STEP_ORDER = Object.keys(UI_STEP_PIPELINE_STEPS) as UIStepSlug[]

/** Maps every pipeline step name to its parent UI step slug. */
export const PIPELINE_TO_UI_STEP = Object.fromEntries(
  Object.entries(UI_STEP_PIPELINE_STEPS).flatMap(([uiStep, steps]) =>
    steps.map((step) => [step, uiStep])
  )
) as Partial<Record<StepName, UIStepSlug>>

/** The last pipeline sub-step in each UI step — used to detect completion. */
export const UI_FINAL_PIPELINE_STEP = Object.fromEntries(
  Object.entries(UI_STEP_PIPELINE_STEPS).map(([uiStep, steps]) => [
    uiStep,
    steps[steps.length - 1],
  ])
) as Record<UIStepSlug, StepName>

/** All pipeline step names that appear in the mapping, for test assertions. */
export const ALL_MAPPED_STEP_NAMES = new Set(
  Object.values(UI_STEP_PIPELINE_STEPS).flat()
) as ReadonlySet<StepName>

export function isFinalPipelineStepForUiStep(
  uiStep: string,
  pipelineStep: string
): boolean {
  return UI_FINAL_PIPELINE_STEP[uiStep as UIStepSlug] === pipelineStep
}
