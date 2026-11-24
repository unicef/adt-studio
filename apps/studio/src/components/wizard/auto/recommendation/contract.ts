/* eslint-disable lingui/no-unlocalized-strings -- recommender protocol: option ids and schema messages, never shown */
import { z } from "zod"

/**
 * The setup recommendation as the recommender returns it (adt-poc-llm, variant `poc-v1`, prompt
 * `adt-config-recommender-poc-v1`): one call, six decisions. Mirrors its V2 output schema and the
 * semantic checks it runs after parsing, so a response that passes here is one the backend could
 * have produced. When the API serves it, this schema moves to `@adt/types`.
 */

export const CONFIDENCE = ["low", "medium", "high"] as const
export type Confidence = (typeof CONFIDENCE)[number]

export const PRESET_IDS = ["textbook", "storybook", "reference"] as const
export const RENDER_STRATEGY_IDS = ["llm", "llm-overlay", "single_column", "two_column_story", "fixed_layout"] as const
export const PAGE_GROUPING_IDS = ["single", "spread"] as const
export const SECTIONING_MODE_IDS = ["page", "dynamic"] as const
export const ACTIVITIES_IDS = ["enabled", "disabled"] as const
export const FIGURE_EXTRACTION_IDS = ["off", "auto", "all"] as const

function decision<const T extends readonly [string, ...string[]]>(ids: T) {
  const choice = z.enum(ids)
  return z
    .object({
      choice,
      confidence: z.enum(CONFIDENCE),
      reason: z.string().min(1).max(500),
      alternative: choice.nullable(),
      ambiguityReason: z.string().min(1).max(500).nullable(),
      evidencePages: z.array(z.number().int().positive()),
    })
    .strict()
    .superRefine((d, ctx) => {
      if (d.alternative !== null && d.alternative === d.choice) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "alternative equals choice" })
      if (d.alternative !== null && d.confidence === "high") ctx.addIssue({ code: z.ZodIssueCode.custom, message: "high confidence cannot have an alternative" })
      if ((d.alternative === null) !== (d.ambiguityReason === null)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ambiguityReason goes with an alternative" })
      if (d.evidencePages.some((p, i) => i > 0 && d.evidencePages[i - 1] >= p)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "evidencePages must be unique and sorted" })
    })
}

export const recommendationSchema = z
  .object({
    preset: decision(PRESET_IDS),
    renderStrategy: decision(RENDER_STRATEGY_IDS),
    pageGrouping: decision(PAGE_GROUPING_IDS),
    sectioningMode: decision(SECTIONING_MODE_IDS),
    activitiesGenerator: decision(ACTIVITIES_IDS),
    figureExtraction: decision(FIGURE_EXTRACTION_IDS),
  })
  .strict()

export const setupResultSchema = z
  .object({
    provider: z.string(),
    model: z.string(),
    promptVersion: z.string(),
    userLanguage: z.string(),
    recommendation: recommendationSchema,
    usage: z.object({ inputTokens: z.number().optional(), outputTokens: z.number().optional(), totalTokens: z.number().optional() }).partial(),
    timing: z.object({ analyzerMs: z.number(), evidencePreparationMs: z.number(), inferenceMs: z.number(), totalMs: z.number() }).partial().optional(),
  })
  .passthrough()

export type Recommendation = z.infer<typeof recommendationSchema>
export type DecisionId = keyof Recommendation
export type Decision<K extends DecisionId = DecisionId> = Recommendation[K]
export type SetupResult = z.infer<typeof setupResultSchema>

/** What the frontend sends: the PDF, the language the reasons should be written in, and the pages to look at. */
export type SetupRequest = { file: File; userLanguage: string; pages?: { start: number; end: number } }

export const DECISION_IDS: DecisionId[] = ["preset", "renderStrategy", "pageGrouping", "sectioningMode", "activitiesGenerator", "figureExtraction"]

/** Decisions the AI couldn't settle between two specific options. */
export function ambiguousDecisions(rec: Recommendation): DecisionId[] {
  return DECISION_IDS.filter((id) => rec[id].alternative !== null)
}
