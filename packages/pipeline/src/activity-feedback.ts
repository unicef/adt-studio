/**
 * On-demand LLM feedback generation for editable (step-by-step) activities.
 *
 * Mirrors the quiz-generation flow: the LLM writes a `correct` message (may
 * restate the answer) and an `incorrect` hint (must not reveal it) per step,
 * in the book's language. The result is returned to the studio where the user
 * reviews/edits before saving — nothing is written to storage here.
 */
import {
  activityFeedbackLLMSchema,
  type EditableActivity,
  type StepFeedback,
} from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import { buildLanguageContext } from "./language-context.js"

export interface ActivityFeedbackConfig {
  language: string
  promptName: string
  maxRetries: number
  timeoutMs: number
}

const MAX_FEEDBACK_LENGTH = 300

/** Compact, answer-bearing step summaries for the prompt. */
function summarizeSteps(activity: EditableActivity): unknown[] {
  if (activity.kind === "fill-in-the-blank") {
    return activity.steps.map((step) => ({
      id: step.id,
      sentences: step.sentences.map((s) =>
        // Make the blank positions obvious to the model without marker syntax.
        s.text.replace(/\[\[blank:item-\d+(?::[^\]]+)?\]\]/g, "_____"),
      ),
      image_alt: step.image?.alt || undefined,
      answers: step.blanks.map((b) => ({ blank: b.itemId, accepted: b.answers })),
    }))
  }
  if (activity.kind === "multiple-choice") {
    return activity.steps.map((step) => ({
      id: step.id,
      question: step.prompt?.text,
      image_alt: step.image?.alt || undefined,
      options: step.options.map((o) => ({
        text: o.text?.text,
        image_alt: o.image?.alt || undefined,
        correct: o.correct,
      })),
    }))
  }
  if (activity.kind === "open-ended") {
    return activity.steps.map((step) => ({
      id: step.id,
      question: step.prompt?.text,
      image_alt: step.image?.alt || undefined,
      answer: "open-ended — any thoughtful response is accepted, there is no fixed answer",
    }))
  }
  // underline-text: the learner underlines the marked words in the sentence.
  return activity.steps.map((step) => ({
    id: step.id,
    prompt: step.prompt?.text,
    sentence: step.tokens.map((t) => t.text).join(""),
    words_to_underline: step.tokens.filter((t) => t.itemId && t.correct).map((t) => t.text),
  }))
}

export async function generateActivityFeedback(
  activity: EditableActivity,
  config: ActivityFeedbackConfig,
  llmModel: LLMModel,
): Promise<Record<string, StepFeedback>> {
  const stepIds = new Set(activity.steps.map((s) => s.id))

  const result = await llmModel.generateObject<{
    reasoning: string
    steps: Array<{ id: string; correct: string; incorrect: string }>
  }>({
    schema: activityFeedbackLLMSchema,
    prompt: config.promptName,
    context: {
      ...buildLanguageContext(config.language),
      activity_kind: activity.kind,
      activity_title: activity.title?.text ?? "",
      steps_json: JSON.stringify(summarizeSteps(activity), null, 2),
    },
    validate: (raw: unknown): ValidationResult => {
      const r = raw as { steps: Array<{ id: string; correct: string; incorrect: string }> }
      const errors: string[] = []
      const seen = new Set<string>()
      for (const step of r.steps ?? []) {
        if (!stepIds.has(step.id)) {
          errors.push(`Unknown step id "${step.id}" — use the ids provided in the input.`)
          continue
        }
        seen.add(step.id)
        if (!step.correct?.trim()) errors.push(`Step "${step.id}" is missing 'correct' feedback.`)
        if (!step.incorrect?.trim()) errors.push(`Step "${step.id}" is missing 'incorrect' feedback.`)
        if (step.correct?.length > MAX_FEEDBACK_LENGTH)
          errors.push(`Step "${step.id}" 'correct' feedback is too long.`)
        if (step.incorrect?.length > MAX_FEEDBACK_LENGTH)
          errors.push(`Step "${step.id}" 'incorrect' feedback is too long.`)
      }
      for (const id of stepIds) {
        if (!seen.has(id)) errors.push(`Missing feedback for step "${id}".`)
      }
      return { valid: errors.length === 0, errors }
    },
    maxRetries: config.maxRetries,
    timeoutMs: config.timeoutMs,
    log: {
      taskType: "activity-feedback",
      promptName: config.promptName,
    },
  })

  const feedback: Record<string, StepFeedback> = {}
  for (const step of result.object.steps) {
    if (stepIds.has(step.id)) {
      feedback[step.id] = { correct: step.correct.trim(), incorrect: step.incorrect.trim() }
    }
  }
  return feedback
}
