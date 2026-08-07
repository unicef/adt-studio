import { z } from "zod"
import { ImageFilters } from "./image-filtering.js"
import { SpeechConfig } from "./speech.js"
import { CoreTtsConfig } from "./core-tts.js"
import { ReviewerValidationConfig } from "./reviewer-validation-config.js"
import { TranslationEvaluationConfig } from "./translation-evaluation.js"
import { REFLOWABLE_FONT_SETTINGS } from "./reflowable-fonts.js"

export const DEFAULT_LLM_MAX_RETRIES = 5
export const DEFAULT_LLM_MODEL_ID = "openai:gpt-5.4"
export const DEFAULT_IMAGE_GENERATION_MODEL_ID = "openai:gpt-image-2"
export const DEFAULT_OPENAI_TTS_MODEL_ID = "gpt-4o-mini-tts"
export const DEFAULT_ELEVENLABS_TTS_MODEL_ID = "eleven_multilingual_v2"
// Rachel — a stable ElevenLabs premade voice ID, used when no voice is
// configured for the elevenlabs provider.
export const DEFAULT_ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"

/**
 * Display names for the ElevenLabs voice IDs ADT Studio ships (the
 * `DEFAULT_ELEVENLABS_VOICE_ID` fallback and the entries in
 * `config/voices.yaml`).
 *
 * ElevenLabs voice IDs are opaque, and the UI normally resolves them to names
 * through the account's voice list. That lookup can't help in two common cases:
 * no ElevenLabs API key is configured (the key lives in browser storage, so a
 * fresh profile has none), and premade library voices that the user has not
 * added to their own workspace. Both left the UI showing a raw
 * `21m00Tcm4TlvDq8ikWAM`.
 *
 * These are the IDs a user sees before configuring anything, so their names are
 * known here and need no network call. The live list still wins when available —
 * it is authoritative and covers the user's own voices too.
 */
export const ELEVENLABS_SHIPPED_VOICE_NAMES: Record<string, string> = {
  [DEFAULT_ELEVENLABS_VOICE_ID]: "Rachel",
  // Río de la Plata Spanish, mapped to `es-uy` in config/voices.yaml.
  QK4xDwo9ESPHA4JNUpX3: "Tomás",
}

/**
 * Narration-oriented ElevenLabs `voice_settings` defaults, matching ElevenLabs'
 * own audiobook/narration recommendation.
 *
 * These are not cosmetic. ElevenLabs treats `voice_settings` as "voice settings
 * overriding stored settings for the given voice", so when the field is absent
 * the voice's own stored dashboard settings apply — arbitrary for community and
 * cloned voices. ElevenLabs documents that a non-zero `style` "can lead to
 * instability, including inconsistent speed, mispronunciation and the addition
 * of extra sounds", and that low `stability` broadens emotional range at the
 * cost of hallucinations. In practice that surfaces as filler sounds ("ehm",
 * "uh") the source text never contained, so we always send a resolved block.
 *
 * Lives here (rather than beside the synthesizer) because the Studio also needs
 * the numbers, to show what applies when a book overrides nothing.
 *
 * `speed` deliberately has no default: it is only sent when explicitly set, so
 * an unset value leaves ElevenLabs' own pacing alone rather than pinning it.
 */
export const DEFAULT_ELEVENLABS_VOICE_SETTINGS = {
  stability: 0.7,
  similarity_boost: 0.5,
  style: 0,
  use_speaker_boost: true,
} as const

export const LLMModelId = z
  .string()
  .trim()
  .regex(/^[a-zA-Z][a-zA-Z0-9]*:[a-zA-Z0-9][a-zA-Z0-9_.-]{0,159}$/)
  .transform((value) => value.toLowerCase())
export type LLMModelId = z.infer<typeof LLMModelId>

export const SpeechGenerationModelId = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,159}$/)
  .transform((value) => value.toLowerCase())
export type SpeechGenerationModelId = z.infer<typeof SpeechGenerationModelId>

export const DefaultModelConfig = z.object({
  model: LLMModelId,
})
export type DefaultModelConfig = z.infer<typeof DefaultModelConfig>

export const SpecializedModelDefaultsConfig = z.object({
  imageGeneration: LLMModelId,
  speechGeneration: SpeechGenerationModelId,
})
export type SpecializedModelDefaultsConfig = z.infer<
  typeof SpecializedModelDefaultsConfig
>

export const RateLimitConfig = z.object({
  requests_per_minute: z.number().int().min(1),
})
export type RateLimitConfig = z.infer<typeof RateLimitConfig>

export const StepConfig = z.object({
  prompt: z.string().optional(),
  model: z.string().optional(),
  max_retries: z.number().int().min(0).optional(),
  timeout: z.number().int().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
})
export type StepConfig = z.infer<typeof StepConfig>

export const QuizGenerationConfig = StepConfig.extend({
  pages_per_quiz: z.number().int().min(1).optional(),
  quiz_section_types: z.array(z.string()).optional(),
  /** Style quizzes to match the book (typography + derived color palette).
   *  Defaults to ON when absent. */
  match_book_style: z.boolean().optional(),
})
export type QuizGenerationConfig = z.infer<typeof QuizGenerationConfig>

export const EasyReadConfig = StepConfig.extend({
  enabled: z.boolean().optional(),
  batch_size: z.number().int().min(1).optional(),
  tts: z.boolean().optional(),
})
export type EasyReadConfig = z.infer<typeof EasyReadConfig>

export const PageSectioningConfig = StepConfig.extend({
  max_refinements: z.number().int().min(0).optional(),
  mode: z.enum(["page", "dynamic"]).catch("dynamic").optional(),
})
export type PageSectioningConfig = z.infer<typeof PageSectioningConfig>

export const ImageTranslationConfig = StepConfig.extend({
  enabled: z.boolean().optional(),
  /** Step-specific image model id. When unset, the book/platform default is used. */
  image_model: z.string().optional(),
  /** Image IDs the user has chosen to translate. Empty = no images regenerated. */
  selected_image_ids: z.array(z.string()).optional(),
})
export type ImageTranslationConfig = z.infer<typeof ImageTranslationConfig>

export const BookFormat = z.enum(["web", "webpub", "epub"])
export type BookFormat = z.infer<typeof BookFormat>

export const LayoutType = z.enum(["textbook", "storybook", "reference", "custom"])
export type LayoutType = z.infer<typeof LayoutType>

export const StyleguideName = z.string().regex(/^[a-zA-Z0-9_-]+$/)
export type StyleguideName = z.infer<typeof StyleguideName>

export const RenderType = z.enum(["llm", "template", "activity", "fixed_layout"])
export type RenderType = z.infer<typeof RenderType>

export const VisualRefinementStrategyConfig = z.object({
  enabled: z.boolean().optional(),
  max_iterations: z.number().int().min(1).max(50).optional(),
  prompt: z.string().optional(),
  timeout: z.number().int().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
})
export type VisualRefinementStrategyConfig = z.infer<typeof VisualRefinementStrategyConfig>

export const RenderStrategyConfig = z
  .object({
    render_type: RenderType,
    config: z
      .object({
        // llm / activity render type
        prompt: z.string().optional(),
        model: z.string().optional(),
        max_retries: z.number().int().min(0).optional(),
        timeout: z.number().int().min(1).optional(),
        temperature: z.number().min(0).max(2).optional(),
        // activity render type — answer generation prompt
        answer_prompt: z.string().optional(),
        // template render type
        template: z.string().optional(),
        // visual refinement — screenshot-based LLM feedback loop
        visual_refinement: VisualRefinementStrategyConfig.optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.render_type !== "activity" && value.config?.answer_prompt !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "answer_prompt is only supported for render_type: activity",
        path: ["config", "answer_prompt"],
      })
    }
  })
export type RenderStrategyConfig = z.infer<typeof RenderStrategyConfig>

export const AccessibilityAssessmentConfig = z.object({
  run_only_tags: z.array(z.string().min(1)).min(1).optional(),
  disabled_rules: z.array(z.string().min(1)).optional(),
})
export type AccessibilityAssessmentConfig = z.infer<typeof AccessibilityAssessmentConfig>

/**
 * How the glossary is realised in EPUB exports.
 *
 * - `word` (default) — EPUB 3 Dictionaries & Glossaries model only: in-text
 *   `glossref` anchors resolved against a non-linear `glossary.xhtml`.
 *   Spec-compliant readers (e.g. BookFusion) show definition popovers.
 * - `page` — visible glossary pages inserted into the reading flow instead,
 *   for readers that don't implement the glossary spec (Apple Books etc.).
 *   In-text terms link to their entry on the glossary page; each entry links
 *   back to the occurrences ("Page N") so the reader can return.
 * - `both` — the spec surface plus the in-flow glossary pages.
 */
export const EpubGlossaryMode = z.enum(["word", "page", "both"])
export type EpubGlossaryMode = z.infer<typeof EpubGlossaryMode>

export const EpubGlossaryConfig = z.object({
  mode: EpubGlossaryMode.optional(),
  /**
   * Where glossary pages are inserted (modes `page`/`both`): after the given
   * 1-indexed physical page number, or `end` for the back of the book. Each
   * glossary page collects the terms used since the previous placement; the
   * last placement also collects everything after it. Defaults to `["end"]`.
   */
  page_placements: z
    .array(z.union([z.number().int().min(1), z.literal("end")]))
    .optional(),
})
export type EpubGlossaryConfig = z.infer<typeof EpubGlossaryConfig>

/** Config for the generative agents (activity generation, layout mirror). */
export const AgentsConfig = z.object({
  /**
   * Model the agents run on, as `provider:model`. Defaults to the agents'
   * built-in model when unset. The request must carry the matching provider
   * key — agents never cross-wire credentials between providers.
   */
  model: LLMModelId.optional(),
})
export type AgentsConfig = z.infer<typeof AgentsConfig>

export const AppConfig = z
  .object({
    default_model: LLMModelId.optional(),
    default_image_generation_model: LLMModelId.optional(),
    default_speech_generation_model: SpeechGenerationModelId.optional(),
    structure_types: z.record(z.string(), z.string()),
    role_types: z.record(z.string(), z.string()),
    section_types: z.record(z.string(), z.string()).optional(),
    pruned_role_types: z.array(z.string()).optional(),
    pruned_section_types: z.array(z.string()).optional(),
    disabled_section_types: z.array(z.string()).optional(),
    page_sectioning: PageSectioningConfig.optional(),
    translation: StepConfig.optional(),
    metadata: StepConfig.optional(),
    book_summary: StepConfig.optional(),
    book_outline: StepConfig.optional(),
    quiz_generation: QuizGenerationConfig.optional(),
    easy_read: EasyReadConfig.optional(),
    default_render_strategy: z.string().optional(),
    render_strategies: z.record(z.string(), RenderStrategyConfig).optional(),
    /** Base font for reflowable (non-fixed-layout) output. `auto` (default)
     *  picks the detected serif/sans category's default; an explicit id
     *  overrides. Ignored for fixed-layout books (they keep original fonts). */
    reflowable_font: z.enum(REFLOWABLE_FONT_SETTINGS).optional(),
    visual_review_prompt: z.string().optional(),
    visual_review_max_iterations: z.number().int().min(1).max(50).optional(),
    section_render_strategies: z.record(z.string(), z.string()).optional(),
    storyboard_effort: z.enum(["high", "medium", "relaxed"]).optional(),
    storyboard_activity_mode: z
      .enum(["dynamic", "match_source", "template"])
      .optional(),
    image_filters: ImageFilters.optional(),
    font_assignment: StepConfig.optional(),
    image_meaningfulness: StepConfig.optional(),
    glossary: StepConfig.optional(),
    toc_generation: StepConfig.optional(),
    toc_mode: z.enum(["extract", "dynamic"]).optional(),
    concurrency: z.number().int().min(1).optional(),
    rate_limit: RateLimitConfig.optional(),
    editing_language: z.string().optional(),
    output_languages: z.array(z.string()).optional(),
    book_format: z.array(BookFormat).optional(),
    image_captioning: StepConfig.optional(),
    image_captioning_grade_level: z
      .enum(["early", "middle", "advanced"])
      .optional(),
    image_captioning_user_prompt: z.string().optional(),
    glossary_amount: z
      .enum(["concise", "standard", "comprehensive"])
      .optional(),
    glossary_user_prompt: z.string().optional(),
    glossary_seed_terms: z
      .array(
        z.object({
          id: z.string(),
          word: z.string(),
          definition: z.string(),
          variations: z.array(z.string()).default([]),
          emojis: z.array(z.string()).default([]),
        }),
      )
      .optional(),
    epub_glossary: EpubGlossaryConfig.optional(),
    image_translation: ImageTranslationConfig.optional(),
    image_segmentation: StepConfig.extend({
      min_side: z.number().int().min(0).optional(),
    }).optional(),
    image_cropping: StepConfig.optional(),
    layout_type: LayoutType.optional(),
    spread_mode: z.boolean().optional(),
    /**
     * Manual spread overrides for a single-page (non-`spread_mode`) book:
     * 1-indexed leading page numbers, each merged with the page that follows
     * it into a two-page spread. Lets a mostly-single book carry a few real
     * spreads. Ignored when `spread_mode` is true (that uses automatic pairing).
     */
    spread_pairs: z.array(z.number().int().min(1)).optional(),
    split_mode: z.boolean().optional(),
    vector_text_grouping: z.boolean().optional(),
    apply_body_background: z.boolean().optional(),
    generate_activities: z.boolean().optional(),
    start_page: z.number().int().min(1).optional(),
    end_page: z.number().int().min(1).optional(),
    speech: SpeechConfig.optional(),
    core_tts: CoreTtsConfig.optional(),
    styleguide: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
    default_settings: z
      .object({
        dock_layout: z
          .object({
            width: z.enum(["compact", "full"]).optional(),
            position: z.enum(["top", "bottom"]).optional(),
            align: z.enum(["center", "spread"]).optional(),
          })
          .optional(),
        theme: z.enum(["light", "dark", "system"]).optional(),
        icon_size: z.enum(["sm", "md", "lg"]).optional(),
        reduce_motion: z.boolean().optional(),
      })
      .optional(),
    locked_settings: z
      .array(z.enum(["dockLayout", "theme", "iconSize", "reduceMotion"]))
      .optional(),
    accessibility_assessment: AccessibilityAssessmentConfig.optional(),
    reviewer_validation: ReviewerValidationConfig.optional(),
    translation_evaluation: TranslationEvaluationConfig.optional(),
    /**
     * Generative agents (activity generation, layout mirror). `model` accepts
     * any `provider:model` id — the matching provider key must be sent with the
     * request (X-OpenAI-Key / X-Anthropic-API-Key / X-Google-API-Key).
     */
    agents: AgentsConfig.optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.start_page !== undefined &&
      value.end_page !== undefined &&
      value.end_page < value.start_page
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_page"],
        message: "end_page must be greater than or equal to start_page",
      })
    }
  })
export type AppConfig = z.infer<typeof AppConfig>

export interface TypeDef {
  key: string
  description: string
}
