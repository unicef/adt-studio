import { z } from "zod"

/**
 * Judging the spoken form of maths.
 *
 * `latexToSpeech` converts LaTeX deterministically, but it can only emit
 * symbols — constructs whose spoken form needs words (`a^m`, `∫_a^b`, `∑`)
 * come out as notation a voice cannot read. This node asks a judge to read the
 * original LaTeX and say whether the walker's output states the same
 * mathematics, and to supply a spoken form where it does not.
 *
 * The confidence signal is *agreement between two independent methods*, not a
 * score the model reports about itself: the walker has no language
 * understanding and the judge has no determinism, so they fail for unrelated
 * reasons. Where they disagree the walker's output is kept and the entry is
 * flagged for a human, who accepts the suggestion or overrides it.
 *
 * Shape mirrors `translation-evaluation` so the two review flows behave the
 * same way.
 */

export const DEFAULT_MATH_SPEECH_EVALUATION_JUDGE_INSTRUCTIONS = `
Compare a mathematical expression written in LaTeX against a plain-text form
prepared for a text-to-speech voice.

Decide one thing: would a listener hearing the plain-text form understand the
same mathematics the LaTeX states?

Judge only whether the mathematics survives. Do not ask for a prettier or more
conventional rendering.

Mark an entry unacceptable when:
- a number, variable, or operator differs from the LaTeX
- the structure differs, so the value would be understood differently
- notation that has no spoken form survives into the text, such as a caret, an
  underscore, or an unmatched bracket
- content present in the LaTeX is missing from the text

Symbols are expected and correct. The voice localises them, so "2/5", "×",
"÷", "π" and "mm²" are all acceptable and must not be marked down for failing
to spell the words out.

When an entry is unacceptable, return suggested_text: the same mathematics
written the way it should be spoken, in the language of the surrounding book.
Return suggested_text only when you are confident it states the mathematics
exactly; a wrong suggestion is worse than none.
`.trim()

export const DEFAULT_MATH_SPEECH_EVALUATION_JUDGE_MODEL = "openai:gpt-5.4"
export const DEFAULT_MATH_SPEECH_EVALUATION_MAX_RETRIES = 3
export const DEFAULT_MATH_SPEECH_EVALUATION_TEMPERATURE = 0
export const DEFAULT_MATH_SPEECH_EVALUATION_SEVERITY_THRESHOLD = "medium"

export const MathSpeechEvaluationIssueType = z.enum([
  // The spoken form states a different number or operator — the dangerous one,
  // because it sounds authoritative while teaching the wrong thing.
  "wrong-value",
  // Same symbols, different grouping: "1/2 + 3" heard for "1/(2 + 3)".
  "wrong-structure",
  // Notation with no spoken form survived: a caret, an underscore, a stray
  // accent, an unmatched bracket.
  "unreadable-notation",
  // Something in the LaTeX is absent from the spoken form.
  "lost-content",
  "other",
])
export type MathSpeechEvaluationIssueType = z.infer<typeof MathSpeechEvaluationIssueType>

export const DEFAULT_MATH_SPEECH_EVALUATION_ISSUE_TYPES: MathSpeechEvaluationIssueType[] = [
  "wrong-value",
  "wrong-structure",
  "unreadable-notation",
  "lost-content",
  "other",
]

export const MathSpeechEvaluationSeverity = z.enum(["low", "medium", "high"])
export type MathSpeechEvaluationSeverity = z.infer<typeof MathSpeechEvaluationSeverity>

export const MathSpeechEvaluationConfig = z.object({
  enable_math_speech_evaluation: z.boolean().optional(),
  judge_model: z.string().min(1).optional(),
  max_retries: z.number().int().min(0).optional(),
  temperature: z.number().min(0).max(2).optional(),
  judge_instructions: z.string().min(1).optional(),
  additional_guidance: z.string().min(1).optional(),
  severity_threshold: MathSpeechEvaluationSeverity.optional(),
  issue_types: z.array(MathSpeechEvaluationIssueType).min(1).optional(),
  generate_suggestions: z.boolean().optional(),
  /**
   * Judge every converted entry rather than only those the walker flags as
   * low confidence. Escalation alone catches weaknesses we already know about;
   * a full pass also finds ones we do not, at the cost of a call per entry.
   */
  evaluate_all_entries: z.boolean().optional(),
})
export type MathSpeechEvaluationConfig = z.infer<typeof MathSpeechEvaluationConfig>

export interface ResolvedMathSpeechEvaluationConfig {
  enable_math_speech_evaluation: boolean
  judge_model: string
  max_retries: number
  temperature: number
  judge_instructions: string
  additional_guidance: string | null
  severity_threshold: MathSpeechEvaluationSeverity
  issue_types: MathSpeechEvaluationIssueType[]
  generate_suggestions: boolean
  evaluate_all_entries: boolean
}

export function resolveMathSpeechEvaluationConfig(
  config: MathSpeechEvaluationConfig | null | undefined,
): ResolvedMathSpeechEvaluationConfig {
  return {
    enable_math_speech_evaluation: config?.enable_math_speech_evaluation ?? true,
    judge_model: config?.judge_model ?? DEFAULT_MATH_SPEECH_EVALUATION_JUDGE_MODEL,
    max_retries: config?.max_retries ?? DEFAULT_MATH_SPEECH_EVALUATION_MAX_RETRIES,
    temperature: config?.temperature ?? DEFAULT_MATH_SPEECH_EVALUATION_TEMPERATURE,
    judge_instructions:
      config?.judge_instructions ?? DEFAULT_MATH_SPEECH_EVALUATION_JUDGE_INSTRUCTIONS,
    additional_guidance: config?.additional_guidance ?? null,
    severity_threshold:
      config?.severity_threshold ?? DEFAULT_MATH_SPEECH_EVALUATION_SEVERITY_THRESHOLD,
    issue_types: config?.issue_types ?? DEFAULT_MATH_SPEECH_EVALUATION_ISSUE_TYPES,
    generate_suggestions: config?.generate_suggestions ?? true,
    evaluate_all_entries: config?.evaluate_all_entries ?? false,
  }
}

export const MathSpeechEvaluationItem = z.object({
  entry_id: z.string().min(1),
  page_id: z.string().min(1).optional(),
  /** The LaTeX as stored in the text catalog. */
  latex: z.string(),
  /** What `latexToSpeech` produced, and what is spoken unless overridden. */
  walker_text: z.string(),
  /** Whether the walker's output states the same mathematics as the LaTeX. */
  acceptable: z.boolean(),
  /** Set when a reviewer keeps the walker's output despite the flag. */
  accepted_anyway: z.boolean().optional(),
  accepted_anyway_at: z.string().datetime().optional(),
  /**
   * What a reviewer decided should actually be spoken — the judge's
   * suggestion as accepted, or their own wording. Only this field can
   * displace the walker's output; a suggestion no one has looked at never
   * reaches the voice.
   */
  resolved_text: z.string().min(1).optional(),
  resolved_at: z.string().datetime().optional(),
  rationale: z.string().min(1),
  issue_type: MathSpeechEvaluationIssueType.optional(),
  severity: MathSpeechEvaluationSeverity.optional(),
  /** The judge's spoken form, offered to the reviewer — never applied
   *  automatically, since an unreviewed model edit to maths is the failure
   *  this whole flow exists to prevent. */
  suggested_text: z.string().min(1).optional(),
  /** Why the entry was judged: the walker asked for review, or a full pass. */
  flagged_by: z.enum(["walker-low-confidence", "full-pass"]).optional(),
  /** Hashes invalidate a stale verdict once the source or output changes. */
  latex_hash: z.string().min(1).optional(),
  walker_hash: z.string().min(1).optional(),
})
export type MathSpeechEvaluationItem = z.infer<typeof MathSpeechEvaluationItem>

export const MathSpeechEvaluationSummary = z
  .object({
    total: z.number().int().min(0),
    acceptable: z.number().int().min(0),
    unacceptable: z.number().int().min(0),
    accepted_anyway: z.number().int().min(0).optional(),
    /** Converted entries the walker was confident about and never judged. */
    not_evaluated: z.number().int().min(0).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.acceptable + value.unacceptable !== value.total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["total"],
        message: "total must equal acceptable + unacceptable",
      })
    }
  })
export type MathSpeechEvaluationSummary = z.infer<typeof MathSpeechEvaluationSummary>

export const MathSpeechEvaluationProvider = z.literal("adt-llm")
export type MathSpeechEvaluationProvider = z.infer<typeof MathSpeechEvaluationProvider>

export const MathSpeechEvaluationJudgeMetadata = z.object({
  model: z.string().min(1),
  instructions: z.string().min(1),
  additional_guidance: z.string().min(1).nullable().optional(),
  max_retries: z.number().int().min(0).optional(),
  temperature: z.number().min(0).max(2).optional(),
  severity_threshold: MathSpeechEvaluationSeverity.optional(),
  issue_types: z.array(MathSpeechEvaluationIssueType).optional(),
  generate_suggestions: z.boolean().optional(),
  evaluate_all_entries: z.boolean().optional(),
})
export type MathSpeechEvaluationJudgeMetadata = z.infer<typeof MathSpeechEvaluationJudgeMetadata>

export const MathSpeechEvaluationRunEntry = z.object({
  entry_id: z.string().min(1),
  page_id: z.string().min(1).optional(),
  latex: z.string().min(1),
  walker_text: z.string(),
  latex_hash: z.string().min(1).optional(),
  walker_hash: z.string().min(1).optional(),
})
export type MathSpeechEvaluationRunEntry = z.infer<typeof MathSpeechEvaluationRunEntry>

export const MathSpeechEvaluationRunRequest = z.object({
  book_label: z.string().min(1),
  language: z.string().min(1),
  catalog_version: z.number().int().min(1),
  eval_config_hash: z.string().min(1),
  judge_model: z.string().min(1).optional(),
  max_retries: z.number().int().min(0).optional(),
  temperature: z.number().min(0).max(2).optional(),
  judge_instructions: z.string().min(1).optional(),
  additional_guidance: z.string().min(1).optional(),
  severity_threshold: MathSpeechEvaluationSeverity.optional(),
  issue_types: z.array(MathSpeechEvaluationIssueType).min(1).optional(),
  generate_suggestions: z.boolean().optional(),
  entries: z.array(MathSpeechEvaluationRunEntry).min(1),
})
export type MathSpeechEvaluationRunRequest = z.infer<typeof MathSpeechEvaluationRunRequest>

export const MathSpeechEvaluationResult = z.object({
  generated_at: z.string().datetime(),
  provider: MathSpeechEvaluationProvider,
  language: z.string().min(1),
  catalog_version: z.number().int().min(1),
  eval_config_hash: z.string().min(1),
  judge: MathSpeechEvaluationJudgeMetadata.optional(),
  summary: MathSpeechEvaluationSummary,
  items: z.array(MathSpeechEvaluationItem),
})
export type MathSpeechEvaluationResult = z.infer<typeof MathSpeechEvaluationResult>
