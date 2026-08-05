import { z } from "zod"

/**
 * Editable (step-by-step) activities.
 *
 * An LLM-rendered activity section (`activity_fill_in_the_blank`,
 * `activity_multiple_choice`) can be converted into a structured, editable
 * form: the HTML is parsed into steps/options/blanks once, and from then on a
 * deterministic stepper renderer (adt-runtime React component) replaces the
 * stored section HTML at packaging time. The original `web-rendering` HTML is
 * never touched, so switching back to the classic presentation is a pure
 * toggle.
 *
 * Storage: node `editable-activity`, item = pageId, one entity per page
 * holding a map of sectionIndex → activity. Entirely separate from the
 * `web-rendering` node so the feature stays opt-in and self-contained.
 */

/** node_data node name for per-page editable activities. */
export const EDITABLE_ACTIVITY_NODE = "editable-activity"

/** Marker syntax shared with the FITB prompt/runtime: [[blank:item-N(:hint)?]] */
export const BLANK_MARKER_RE = /\[\[blank:(item-\d+)(?::([^\]]+))?\]\]/g

export const ActivityImage = z.object({
  /** Image catalog id (the `data-id` on the <img>), when known. */
  imageId: z.string().optional(),
  /** src as extracted (e.g. `images/foo.png`); packaging re-resolves from imageId. */
  src: z.string(),
  alt: z.string().optional(),
  /** Marked decorative in image captioning — hidden from assistive tech. */
  decorative: z.boolean().optional(),
  /** Relative width vs the widest option image, per the MC prompt contract. */
  widthPercent: z.number().min(1).max(100).optional(),
})
export type ActivityImage = z.infer<typeof ActivityImage>

export const ActivityText = z.object({
  text: z.string(),
  /** Text-catalog id — lets the reader swap translations at runtime. */
  dataId: z.string().optional(),
})
export type ActivityText = z.infer<typeof ActivityText>

/** Per-step feedback texts. LLM-generated on demand, editable in the studio —
 *  the player shows these instead of the generic "Correct!"/"Try again". */
export const StepFeedback = z.object({
  /** Shown when the learner answers correctly (may restate the answer). */
  correct: z.string().optional(),
  /** Shown on a wrong answer — a hint that guides without giving it away. */
  incorrect: z.string().optional(),
})
export type StepFeedback = z.infer<typeof StepFeedback>

export const FitbBlank = z.object({
  /** `item-N`. Either matches a `[[blank:item-N]]` marker in a sentence, or —
   *  when no sentence references it — renders as a standalone answer field
   *  (form-style activities: label/image + separate input). */
  itemId: z.string(),
  /** Acceptable answers (first = primary). Empty array = accept any input. */
  answers: z.array(z.string()),
  /** Placeholder hint shown inside the input (standalone blanks; inline
   *  blanks carry their hint in the marker itself). */
  hint: z.string().optional(),
})
export type FitbBlank = z.infer<typeof FitbBlank>

export const FitbSentence = z.object({
  /** Sentence text containing `[[blank:item-N(:hint)?]]` markers verbatim. */
  text: z.string(),
  dataId: z.string().optional(),
})
export type FitbSentence = z.infer<typeof FitbSentence>

export function blankItemIdsInText(text: string): string[] {
  const ids: string[] = []
  for (const m of text.matchAll(BLANK_MARKER_RE)) ids.push(m[1])
  return ids
}

export const FitbStep = z
  .object({
    /** Stable id for editing/rendering (extraction uses `step-N`). */
    id: z.string(),
    image: ActivityImage.optional(),
    /** May be empty for form-style steps (e.g. image + bare answer field). */
    sentences: z.array(FitbSentence),
    blanks: z.array(FitbBlank).min(1),
    feedback: StepFeedback.optional(),
  })
  .superRefine((step, ctx) => {
    const markerIds = step.sentences.flatMap((s) => blankItemIdsInText(s.text))
    const known = new Set(step.blanks.map((b) => b.itemId))
    for (const id of markerIds) {
      if (!known.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Step "${step.id}" marker ${id} has no matching blank entry`,
        })
      }
    }
    if (known.size !== step.blanks.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Step "${step.id}" has duplicate blank item ids`,
      })
    }
  })
export type FitbStep = z.infer<typeof FitbStep>

export const McOption = z.object({
  /** `item-N` from the radio's data-activity-item. */
  itemId: z.string(),
  text: ActivityText.optional(),
  image: ActivityImage.optional(),
  correct: z.boolean(),
  /** Shown after validation (quiz-style). Optional for in-page activities. */
  explanation: z.string().optional(),
})
export type McOption = z.infer<typeof McOption>

export const McStep = z
  .object({
    /** Radio group name from the source HTML (unique per step). */
    id: z.string(),
    prompt: ActivityText.optional(),
    /** Context image shown above the options (not itself an option). */
    image: ActivityImage.optional(),
    options: z.array(McOption).min(2),
    feedback: StepFeedback.optional(),
  })
  .superRefine((step, ctx) => {
    const correct = step.options.filter((o) => o.correct)
    if (correct.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Step "${step.id}" must have exactly one correct option (has ${correct.length})`,
      })
    }
    const ids = new Set(step.options.map((o) => o.itemId))
    if (ids.size !== step.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Step "${step.id}" has duplicate option item ids`,
      })
    }
  })
export type McStep = z.infer<typeof McStep>

// ── Open-ended (free-text) ─────────────────────────────────────────────────

export const OpenEndedStep = z.object({
  /** Stable id for editing/rendering (extraction uses `step-N`). */
  id: z.string(),
  image: ActivityImage.optional(),
  /** Question/prompt shown above the writing area. */
  prompt: ActivityText.optional(),
  /** `data-aria-id` from the source field — stable identity/provenance. */
  ariaId: z.string().optional(),
  /** Multi-line writing area (textarea) vs single-line input. */
  multiline: z.boolean().optional(),
  /** Placeholder hint shown inside the field. */
  hint: z.string().optional(),
  feedback: StepFeedback.optional(),
})
export type OpenEndedStep = z.infer<typeof OpenEndedStep>

// ── Underline the text ─────────────────────────────────────────────────────

export const UnderlineToken = z.object({
  /** `item-N` for a selectable word; absent for the plain text/whitespace
   *  between words (rendered but not clickable). */
  itemId: z.string().optional(),
  /** The token's visible text. */
  text: z.string(),
  /** Answer key: whether this word should be underlined. Only meaningful when
   *  `itemId` is set. */
  correct: z.boolean().optional(),
})
export type UnderlineToken = z.infer<typeof UnderlineToken>

export const UnderlineStep = z
  .object({
    /** question-group key from the source HTML (unique per step). */
    id: z.string(),
    image: ActivityImage.optional(),
    /** Optional prompt/instruction shown above the sentence. */
    prompt: ActivityText.optional(),
    /** The sentence, tokenized in reading order. Selectable words carry
     *  `itemId` (+`correct`); the rest is plain connective text. */
    tokens: z.array(UnderlineToken).min(1),
    /** `data-id` of the source sentence wrapper (read-aloud/provenance). */
    dataId: z.string().optional(),
    feedback: StepFeedback.optional(),
  })
  .superRefine((step, ctx) => {
    const selectable = step.tokens.filter((t) => t.itemId)
    if (selectable.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Step "${step.id}" has no selectable words`,
      })
    }
    const ids = selectable.map((t) => t.itemId)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Step "${step.id}" has duplicate token item ids`,
      })
    }
    // A step where nothing should be underlined is unwinnable (the learner
    // must select ≥1 word to check) — extraction drops such groups, and this
    // guards against a bad edit re-introducing one.
    if (selectable.length > 0 && !selectable.some((t) => t.correct)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Step "${step.id}" has no word marked correct in its answer key`,
      })
    }
  })
export type UnderlineStep = z.infer<typeof UnderlineStep>

export const EditableActivityTheme = z.object({
  /** Accent hex (#rrggbb). Absent = derive from the book's quiz palette. */
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  /** Option grid columns for image-based MC options. */
  optionColumns: z.number().int().min(1).max(4).optional(),
  imageSize: z.enum(["small", "medium", "large"]).optional(),
})
export type EditableActivityTheme = z.infer<typeof EditableActivityTheme>

const editableActivityBase = {
  /** Source section type (e.g. `activity_fill_in_the_blank`). */
  sectionType: z.string(),
  /** When false the section renders its classic HTML; data is kept. */
  enabled: z.boolean(),
  title: ActivityText.optional(),
  instructions: ActivityText.optional(),
  /** Shared word list the learner draws answers from (fill-in-the-blank cloze
   *  activities). Shown persistently on every step. Comma-separated source
   *  text; rendered as chips. Only fill-in-the-blank populates this today. */
  wordBank: ActivityText.optional(),
  theme: EditableActivityTheme.optional(),
  /** web-rendering version the structure was extracted from (transparency). */
  sourceRenderingVersion: z.number().int().optional(),
  extractionWarnings: z.array(z.string()).optional(),
}

export const EditableActivity = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fill-in-the-blank"),
    ...editableActivityBase,
    steps: z.array(FitbStep).min(1),
  }),
  z.object({
    kind: z.literal("multiple-choice"),
    ...editableActivityBase,
    steps: z.array(McStep).min(1),
  }),
  z.object({
    kind: z.literal("open-ended"),
    ...editableActivityBase,
    steps: z.array(OpenEndedStep).min(1),
  }),
  z.object({
    kind: z.literal("underline-text"),
    ...editableActivityBase,
    steps: z.array(UnderlineStep).min(1),
  }),
])
export type EditableActivity = z.infer<typeof EditableActivity>

/** Per-page entity: sectionIndex (stringified) → activity. */
export const EditableActivitiesEntity = z.object({
  activities: z.record(z.string(), EditableActivity),
})
export type EditableActivitiesEntity = z.infer<typeof EditableActivitiesEntity>

/** LLM output shape for on-demand feedback generation. */
export const activityFeedbackLLMSchema = z.object({
  reasoning: z.string(),
  steps: z.array(
    z.object({
      id: z.string(),
      correct: z.string(),
      incorrect: z.string(),
    }),
  ),
})

// ── Activity outline (classic editor grouping) ─────────────────────────────
// A type-agnostic, display-only description of an activity's rendered page:
// header texts plus per-item groups linking prompts, images, and answer
// fields. Built deterministically from the section tree (semantic roles)
// and the rendered HTML (input elements + card ancestry). It is purely an
// organizational index for the studio's activity editor — every edit still
// flows through the data-id / item-id channels, so a wrong outline can only
// mis-group the display, never corrupt content.

/** A text on the page. `dataId` (== section-tree nodeId) is the edit channel
 *  into the rendered HTML; `text` is the rendered text. */
export const ActivityOutlineText = z.object({
  dataId: z.string().optional(),
  text: z.string(),
})
export type ActivityOutlineText = z.infer<typeof ActivityOutlineText>

/** A writable answer field (text/number input, textarea, or select). */
export const ActivityOutlineInput = z.object({
  itemId: z.string().optional(),
  kind: z.enum(["text", "textarea", "select"]),
  placeholder: z.string().optional(),
  ariaLabel: z.string().optional(),
})
export type ActivityOutlineInput = z.infer<typeof ActivityOutlineInput>

/** One selectable option of a choice item (radio / checkbox). */
export const ActivityOutlineOption = z.object({
  itemId: z.string().optional(),
  /** For value-choice items: the value this option submits (e.g. "true"). */
  value: z.string().optional(),
  text: ActivityOutlineText.optional(),
  imageId: z.string().optional(),
})
export type ActivityOutlineOption = z.infer<typeof ActivityOutlineOption>

/**
 * How a choice item's answer key works:
 * - "single": options carry their own itemId; exactly one is truthy (MC)
 * - "multi":  options carry their own itemId; each is true/false (multi-select)
 * - "value":  options share one itemId; the answer is the chosen value (T/F)
 */
export const ActivityOutlineChoice = z.enum(["single", "multi", "value"])
export type ActivityOutlineChoice = z.infer<typeof ActivityOutlineChoice>

/** One question/item group: everything the learner sees for one answer. */
export const ActivityOutlineItem = z.object({
  /** Numbering caption ("1.", "(a)") when present. */
  number: ActivityOutlineText.optional(),
  /** Prompt/question sentences (and table-row cells), in page order. */
  prompts: z.array(ActivityOutlineText),
  imageIds: z.array(z.string()),
  inputs: z.array(ActivityOutlineInput),
  options: z.array(ActivityOutlineOption),
  choice: ActivityOutlineChoice.optional(),
})
export type ActivityOutlineItem = z.infer<typeof ActivityOutlineItem>

export const ActivityOutline = z.object({
  title: ActivityOutlineText.optional(),
  /** Decorative header chips (e.g. a "GRADE 3" label). */
  badges: z.array(ActivityOutlineText),
  /** Instruction sentences, in page order. */
  instructions: z.array(ActivityOutlineText),
  items: z.array(ActivityOutlineItem),
})
export type ActivityOutline = z.infer<typeof ActivityOutline>
