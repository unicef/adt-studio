import { z } from "zod"

/**
 * Auto mode (issue #333, experiment lane): what the setup recommender found in
 * a PDF before the book exists, and the settings it picks. Facts about the
 * book are what the user confirms; settings follow from facts by a fixed
 * rulebook, so the response carries the settings for every fact combination
 * and the UI never re-implements the rules.
 */

export const SetupBookFactId = z.enum(["genre", "exercises", "composition", "diagrams"])
export type SetupBookFactId = z.infer<typeof SetupBookFactId>

export const SetupSettingId = z.enum([
  "preset",
  "renderStrategy",
  "pageGrouping",
  "sectioningMode",
  "activitiesGenerator",
  "figureExtraction",
])
export type SetupSettingId = z.infer<typeof SetupSettingId>

export const SetupSettings = z.object({
  preset: z.enum(["textbook", "storybook", "reference"]),
  renderStrategy: z.enum(["llm", "llm-overlay", "single_column", "two_column_story", "fixed_layout"]),
  pageGrouping: z.enum(["single", "spread"]),
  sectioningMode: z.enum(["page", "dynamic"]),
  activitiesGenerator: z.boolean(),
  figureExtraction: z.enum(["off", "auto"]),
})
export type SetupSettings = z.infer<typeof SetupSettings>

/** One setting with the rule that picked it. */
export const SetupSettingPick = z.object({
  value: z.union([z.string(), z.boolean()]),
  rule: z.string(),
})

export const SetupDecided = z.record(SetupSettingId, SetupSettingPick)
export type SetupDecided = z.infer<typeof SetupDecided>

export const SetupFact = z.object({
  id: SetupBookFactId,
  /** The value used: the page-label reading (proposal), unless only one reading ran. */
  value: z.string(),
  /** The question reading's answer (second opinion). Null when it did not run. */
  secondOpinion: z.string().nullable(),
  /** The question reading's own words, to show the user. */
  reason: z.string().nullable(),
  /** Pages that show this fact. */
  evidencePages: z.array(z.number().int()),
  /** Another answer would change at least one setting. */
  matters: z.boolean(),
  /** Another answer would change a setting that is fixed at import. */
  affectsLocked: z.boolean(),
  /** Put to the user, and why. */
  ask: z.boolean(),
  askReason: z.enum(["readings-disagree", "few-body-pages", "one-reading"]).nullable(),
})
export type SetupFact = z.infer<typeof SetupFact>

export const SetupPageRange = z.object({
  keepCover: z.boolean(),
  start: z.number().int(),
  end: z.number().int(),
  skipped: z.array(z.object({ from: z.number().int(), to: z.number().int(), why: z.enum(["opening", "end"]) })),
  startExact: z.boolean(),
  endExact: z.boolean(),
})
export type SetupPageRange = z.infer<typeof SetupPageRange>

/** One answer of the questions reading, as the model gave it. */
export const SetupQuestionAnswer = z.object({
  answer: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  evidencePages: z.array(z.number().int()),
  reason: z.string(),
})
export type SetupQuestionAnswer = z.infer<typeof SetupQuestionAnswer>

/**
 * The parsed responses of both AI readings, kept with the recommendation so a
 * person can see why a fact was read the way it was (maximum transparency).
 */
export const SetupReadings = z.object({
  /** The page-label reading: one label per page read, the whole-book guess, and the counted facts. Null when it failed. */
  labels: z
    .object({
      pages: z.array(
        z.object({
          page: z.number().int(),
          type: z.string(),
          textPlacement: z.string(),
          meaningfulFigure: z.boolean(),
        }),
      ),
      bookGenre: z.string(),
      facts: z.record(SetupBookFactId, z.string()),
      /** Facts whose count was a close call (under 60% agreement, a tie, or too few pages). */
      flags: z.array(SetupBookFactId),
      /** Answers tied for the top count, per fact. */
      ties: z.record(SetupBookFactId, z.array(z.string())),
      counts: z.object({
        body: z.number().int(),
        story: z.number().int(),
        textbook: z.number().int(),
        reference: z.number().int(),
        exercisePages: z.number().int(),
        figurePages: z.number().int(),
        placement: z.record(z.string(), z.number().int()),
      }),
    })
    .nullable(),
  /** The questions reading: the pages shown and each answer with its confidence and reason. Null when it failed. */
  questions: z
    .object({
      pages: z.array(z.number().int()),
      answers: z.record(SetupBookFactId, SetupQuestionAnswer),
      /** The language the reading saw on the pages (ISO 639-1), null when none. Optional: older runs don't have it. */
      language: z.string().nullable().optional(),
    })
    .nullable(),
})
export type SetupReadings = z.infer<typeof SetupReadings>

export const SetupRecommendation = z.object({
  id: z.string(),
  engine: z.literal("e3"),
  model: z.string(),
  pageCount: z.number().int(),
  /** A page that shows what the book is like, for the preview at the top. */
  previewPage: z.number().int(),
  measured: z.object({
    pageStorage: z.enum(["single-pages", "spreads-as-separate-pages", "spreads-as-wide-pages"]),
    pageStorageEvidence: z.array(z.number().int()),
    joinedPairs: z.number().int(),
    facingPairs: z.number().int(),
    textLayer: z.enum(["digital", "scanned", "scanned-with-ocr", "mixed"]),
    textLayerEvidence: z.array(z.number().int()),
    /** Pages with exercise cues (blanks, numbered tasks, instruction verbs), counted without AI. */
    exerciseCuePages: z.number().int().optional(),
    /** Exercise cues on at least 10% of the pages. */
    exerciseCues: z.boolean().optional(),
    /** Drawn (vector) diagrams on at least 10% of the pages. */
    vectorDiagrams: z.boolean().optional(),
    /** Share of text pages whose words sit over a large picture in the PDF. */
    textOverPicturesShare: z.number().optional(),
    medianChars: z.number(),
    language: z.string().nullable(),
  }),
  /**
   * The book's language (ISO 639-1) and where it came from: the questions reading, the PDF's text,
   * or the PDF's language tag. Null when nothing tells. Optional: older runs don't have it.
   */
  language: z
    .object({
      code: z.string().nullable(),
      source: z.enum(["ai", "text", "pdf-tag"]).nullable(),
    })
    .optional(),
  facts: z.array(SetupFact),
  /** Settings for the facts as proposed. */
  settings: SetupDecided,
  /** Settings for every combination of fact values, keyed "genre|exercises|composition|diagrams". */
  settingsByFacts: z.record(z.string(), SetupDecided),
  /** Pages that show each setting's pick. */
  settingEvidence: z.record(SetupSettingId, z.array(z.number().int())),
  lockedSettings: z.array(SetupSettingId),
  pageRange: SetupPageRange.nullable(),
  pageLabels: z.array(z.object({ page: z.number().int(), type: z.string() })),
  /** Both readings' parsed responses. Optional: recommendations saved before it was added don't have it. */
  readings: SetupReadings.optional(),
  /** Both AI readings ran; false when one failed and only the other was used. */
  secondOpinion: z.boolean(),
  timings: z.object({
    profileMs: z.number(),
    factsMs: z.number(),
    questionsMs: z.number().nullable(),
    labelsMs: z.number().nullable(),
    totalMs: z.number(),
    uploadBytes: z.number(),
  }),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    calls: z.number().int(),
    /** Per reading, null when it did not run. */
    labels: z.object({ inputTokens: z.number(), outputTokens: z.number() }).nullable(),
    questions: z.object({ inputTokens: z.number(), outputTokens: z.number() }).nullable(),
  }),
})
export type SetupRecommendation = z.infer<typeof SetupRecommendation>

export const setupFactsKey = (f: Record<SetupBookFactId, string>) =>
  `${f.genre}|${f.exercises}|${f.composition}|${f.diagrams}`
