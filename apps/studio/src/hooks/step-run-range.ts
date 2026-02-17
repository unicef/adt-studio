const UI_STEP_ORDER = [
  "extract",
  "storyboard",
  "quizzes",
  "captions",
  "glossary",
  "translations",
  "text-to-speech",
] as const

type UIStepSlug = (typeof UI_STEP_ORDER)[number]

const UI_FINAL_PIPELINE_STEP: Record<string, string> = {
  extract: "translation",
  storyboard: "web-rendering",
  quizzes: "quiz-generation",
  captions: "image-captioning",
  glossary: "glossary",
  translations: "catalog-translation",
  "text-to-speech": "tts",
}

export function getTargetStepsForRange(fromStep: string, toStep: string): Set<string> {
  const fromIndex = UI_STEP_ORDER.indexOf(fromStep as UIStepSlug)
  const toIndex = UI_STEP_ORDER.indexOf(toStep as UIStepSlug)
  if (fromIndex !== -1 && toIndex !== -1 && fromIndex <= toIndex) {
    return new Set(UI_STEP_ORDER.slice(fromIndex, toIndex + 1))
  }

  // Fallback for unknown/reversed ranges to avoid dropping status entirely.
  const targetSteps = new Set<string>()
  targetSteps.add(fromStep)
  if (fromStep !== toStep) targetSteps.add(toStep)
  return targetSteps
}

export function isFinalPipelineStepForUiStep(uiStep: string, pipelineStep: string): boolean {
  return UI_FINAL_PIPELINE_STEP[uiStep] === pipelineStep
}
