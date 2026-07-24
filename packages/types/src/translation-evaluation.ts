import { z } from "zod"

export const DEFAULT_TRANSLATION_EVALUATION_JUDGE_INSTRUCTIONS = `
Review the translated text-catalog entries against the source entries.

Use the full page context and book metadata when judging each entry.
Decide whether each translation is acceptable overall.
Use these criteria:
- preserve meaning faithfully
- sound fluent and natural in the target language
- keep important terminology correct and consistent
- avoid important omissions or unsupported additions
- preserve meaningful formatting markers and placeholders when they affect meaning

Return a concise rationale for entries that need attention.
When an entry needs attention, return suggested_text only when a clear correction is possible.
Suggested text must be a complete replacement translation, not a partial edit.
Suggested text must preserve every source meaning unit, including roles, names, numbers, actions, quoted text, and important modifiers.
For terminology-only issues, make the smallest possible edit that fixes the terminology while preserving the rest of the translation.
Treat existing translations on the page as local terminology memory. Repeated source roles, names, objects, and domain terms should keep the same target-language term unless user guidance says otherwise.
For terminology-only fixes, preserve the current translation's structure, role order, punctuation, and wording as much as possible.
Do not fix one issue by omitting, weakening, or changing another part of the source meaning.
Only return suggested_text if you would mark that suggested replacement acceptable under the same review criteria.
`.trim()

export const DEFAULT_TRANSLATION_EVALUATION_JUDGE_MODEL = "openai:gpt-5.4"
export const DEFAULT_TRANSLATION_EVALUATION_MAX_RETRIES = 3
export const DEFAULT_TRANSLATION_EVALUATION_TEMPERATURE = 0
export const DEFAULT_TRANSLATION_EVALUATION_SEVERITY_THRESHOLD = "medium"

export const TranslationEvaluationIssueType = z.enum([
  "meaning",
  "fluency",
  "terminology",
  "omission-or-addition",
  "formatting",
  "context",
  "other",
])
export type TranslationEvaluationIssueType = z.infer<typeof TranslationEvaluationIssueType>

export const TranslationEvaluationSeverity = z.enum(["low", "medium", "high"])
export type TranslationEvaluationSeverity = z.infer<typeof TranslationEvaluationSeverity>

export const DEFAULT_TRANSLATION_EVALUATION_ISSUE_TYPES: TranslationEvaluationIssueType[] = [
  "meaning",
  "fluency",
  "terminology",
  "omission-or-addition",
  "formatting",
  "context",
  "other",
]

export const TranslationEvaluationContextOptions = z.object({
  book_metadata: z.boolean().optional(),
  visible_page_entries: z.boolean().optional(),
  source_language: z.boolean().optional(),
  target_language: z.boolean().optional(),
})
export type TranslationEvaluationContextOptions = z.infer<typeof TranslationEvaluationContextOptions>

export const DEFAULT_TRANSLATION_EVALUATION_CONTEXT_OPTIONS: Required<TranslationEvaluationContextOptions> = {
  book_metadata: true,
  visible_page_entries: true,
  source_language: true,
  target_language: true,
}

export const TranslationEvaluationConfig = z.object({
  enable_translation_evaluation: z.boolean().optional(),
  judge_model: z.string().min(1).optional(),
  max_retries: z.number().int().min(0).optional(),
  // Legacy field retained so existing book configs continue to parse. Page
  // evaluation is sequential and no longer derives execution behavior from it.
  batch_size: z.number().int().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  judge_instructions: z.string().min(1).optional(),
  additional_guidance: z.string().min(1).optional(),
  strictness: z.enum(["lenient", "balanced", "strict"]).optional(),
  severity_threshold: TranslationEvaluationSeverity.optional(),
  issue_types: z.array(TranslationEvaluationIssueType).min(1).optional(),
  generate_suggestions: z.boolean().optional(),
  only_suggest_when_confident: z.boolean().optional(),
  context: TranslationEvaluationContextOptions.optional(),
  target_audience: z.string().min(1).optional(),
  style_guidance: z.string().min(1).optional(),
  terminology_guidance: z.string().min(1).optional(),
})
export type TranslationEvaluationConfig = z.infer<typeof TranslationEvaluationConfig>

export interface ResolvedTranslationEvaluationConfig {
  enable_translation_evaluation: boolean
  judge_model: string
  max_retries: number
  temperature: number
  judge_instructions: string
  additional_guidance: string | null
  strictness: "lenient" | "balanced" | "strict"
  severity_threshold: TranslationEvaluationSeverity
  issue_types: TranslationEvaluationIssueType[]
  generate_suggestions: boolean
  only_suggest_when_confident: boolean
  context: Required<TranslationEvaluationContextOptions>
  target_audience: string | null
  style_guidance: string | null
  terminology_guidance: string | null
}

export function resolveTranslationEvaluationConfig(
  config: TranslationEvaluationConfig | null | undefined,
): ResolvedTranslationEvaluationConfig {
  return {
    enable_translation_evaluation: config?.enable_translation_evaluation ?? true,
    judge_model: config?.judge_model ?? DEFAULT_TRANSLATION_EVALUATION_JUDGE_MODEL,
    max_retries: config?.max_retries ?? DEFAULT_TRANSLATION_EVALUATION_MAX_RETRIES,
    temperature: config?.temperature ?? DEFAULT_TRANSLATION_EVALUATION_TEMPERATURE,
    judge_instructions: config?.judge_instructions ?? DEFAULT_TRANSLATION_EVALUATION_JUDGE_INSTRUCTIONS,
    additional_guidance: config?.additional_guidance ?? null,
    strictness: config?.strictness ?? "balanced",
    severity_threshold: config?.severity_threshold ?? DEFAULT_TRANSLATION_EVALUATION_SEVERITY_THRESHOLD,
    issue_types: config?.issue_types ?? DEFAULT_TRANSLATION_EVALUATION_ISSUE_TYPES,
    generate_suggestions: config?.generate_suggestions ?? true,
    only_suggest_when_confident: config?.only_suggest_when_confident ?? true,
    context: {
      ...DEFAULT_TRANSLATION_EVALUATION_CONTEXT_OPTIONS,
      ...(config?.context ?? {}),
    },
    target_audience: config?.target_audience ?? null,
    style_guidance: config?.style_guidance ?? null,
    terminology_guidance: config?.terminology_guidance ?? null,
  }
}

export const TranslationEvaluationSummary = z
  .object({
    total: z.number().int().min(0),
    acceptable: z.number().int().min(0),
    unacceptable: z.number().int().min(0),
    accepted_anyway: z.number().int().min(0).optional(),
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
export type TranslationEvaluationSummary = z.infer<typeof TranslationEvaluationSummary>

export const TranslationEvaluationItem = z.object({
  entry_id: z.string().min(1),
  acceptable: z.boolean(),
  accepted_anyway: z.boolean().optional(),
  accepted_anyway_at: z.string().datetime().optional(),
  page_id: z.string().min(1).optional(),
  source_text: z.string().optional(),
  translated_text: z.string().optional(),
  rationale: z.string().min(1),
  issue_types: z.array(TranslationEvaluationIssueType).optional(),
  severity: TranslationEvaluationSeverity.optional(),
  suggested_text: z.string().min(1).optional(),
  suggestion_validated: z.boolean().optional(),
  suggestion_validation_rationale: z.string().min(1).optional(),
  source_hash: z.string().min(1).optional(),
  translated_hash: z.string().min(1).optional(),
})
export type TranslationEvaluationItem = z.infer<typeof TranslationEvaluationItem>

export const TranslationEvaluationProvider = z.literal("adt-llm")
export type TranslationEvaluationProvider = z.infer<typeof TranslationEvaluationProvider>

export const TranslationEvaluationJudgeMetadata = z.object({
  model: z.string().min(1),
  instructions: z.string().min(1),
  additional_guidance: z.string().min(1).nullable().optional(),
  max_retries: z.number().int().min(0).optional(),
  // Legacy result field retained for previously saved evaluations.
  batch_size: z.number().int().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  strictness: z.enum(["lenient", "balanced", "strict"]).optional(),
  severity_threshold: TranslationEvaluationSeverity.optional(),
  issue_types: z.array(TranslationEvaluationIssueType).optional(),
  generate_suggestions: z.boolean().optional(),
  only_suggest_when_confident: z.boolean().optional(),
  context: TranslationEvaluationContextOptions.optional(),
  target_audience: z.string().min(1).nullable().optional(),
  style_guidance: z.string().min(1).nullable().optional(),
  terminology_guidance: z.string().min(1).nullable().optional(),
})
export type TranslationEvaluationJudgeMetadata = z.infer<typeof TranslationEvaluationJudgeMetadata>

export const TranslationEvaluationMetadata = z.object({
  failed_pages: z.number().int().min(0).optional(),
  selected_entry_count: z.number().int().min(0).optional(),
  page_id: z.string().min(1).nullable().optional(),
  page_ids: z.array(z.string().min(1)).optional(),
  scope_hash: z.string().min(1).optional(),
  selected_entry_ids: z.array(z.string().min(1)).optional(),
  book_metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
export type TranslationEvaluationMetadata = z.infer<typeof TranslationEvaluationMetadata>

export const TranslationEvaluationRunEntry = z.object({
  entry_id: z.string().min(1),
  source_text: z.string(),
  translated_text: z.string(),
  source_hash: z.string().min(1).optional(),
  translated_hash: z.string().min(1).optional(),
})
export type TranslationEvaluationRunEntry = z.infer<typeof TranslationEvaluationRunEntry>

export const TranslationEvaluationRunPage = z.object({
  page_id: z.string().min(1),
  entries: z.array(TranslationEvaluationRunEntry).min(1),
})
export type TranslationEvaluationRunPage = z.infer<typeof TranslationEvaluationRunPage>

export const TranslationEvaluationRunRequest = z.object({
  book_label: z.string().min(1),
  language: z.string().min(1),
  source_language: z.string().min(1).optional(),
  source_catalog_version: z.number().int().min(1),
  translation_version: z.number().int().min(1),
  eval_config_hash: z.string().min(1),
  scope_hash: z.string().min(1),
  judge_model: z.string().min(1).optional(),
  max_retries: z.number().int().min(0).optional(),
  temperature: z.number().min(0).max(2).optional(),
  judge_instructions: z.string().min(1).optional(),
  additional_guidance: z.string().min(1).optional(),
  strictness: z.enum(["lenient", "balanced", "strict"]).optional(),
  severity_threshold: TranslationEvaluationSeverity.optional(),
  issue_types: z.array(TranslationEvaluationIssueType).min(1).optional(),
  generate_suggestions: z.boolean().optional(),
  only_suggest_when_confident: z.boolean().optional(),
  context: TranslationEvaluationContextOptions.optional(),
  target_audience: z.string().min(1).optional(),
  style_guidance: z.string().min(1).optional(),
  terminology_guidance: z.string().min(1).optional(),
  book_metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  pages: z.array(TranslationEvaluationRunPage).min(1),
})
export type TranslationEvaluationRunRequest = z.infer<typeof TranslationEvaluationRunRequest>

export const TranslationEvaluationResult = z.object({
  generated_at: z.string().datetime(),
  provider: TranslationEvaluationProvider,
  language: z.string().min(1),
  source_language: z.string().min(1).optional(),
  source_catalog_version: z.number().int().min(1),
  translation_version: z.number().int().min(1),
  eval_config_hash: z.string().min(1),
  judge: TranslationEvaluationJudgeMetadata.optional(),
  summary: TranslationEvaluationSummary,
  items: z.array(TranslationEvaluationItem),
  metadata: TranslationEvaluationMetadata.optional(),
})
export type TranslationEvaluationResult = z.infer<typeof TranslationEvaluationResult>
