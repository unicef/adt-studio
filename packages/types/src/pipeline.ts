import { z } from "zod"

// ── Steps: atomic processing operations ─────────────────────────

export const StepName = z.enum([
  "extract",
  "metadata",
  "book-summary",
  "book-outline",
  "image-filtering",
  "image-segmentation",
  "image-cropping",
  "image-meaningfulness",
  "page-sectioning",
  "translation",
  "web-rendering",
  "quiz-generation",
  "image-captioning",
  "glossary",
  "toc-generation",
  "text-catalog",
  "easy-read",
  "catalog-translation",
  "core-tts-catalog",
  "image-translation",
  "tts",
  "word-timestamps",
  "package-web",
  "accessibility-assessment",
])
export type StepName = z.infer<typeof StepName>

// ── Stages: high-level groupings visible in UI ──────────────────

export const StageName = z.enum([
  "extract",
  "sectioning",
  "storyboard",
  "quizzes",
  "captions",
  "glossary",
  "toc",
  "easy-read",
  "translate",
  "speech",
  "package",
])
export type StageName = z.infer<typeof StageName>

export const ModelDefaultKind = z.enum([
  "llm",
  "image-generation",
  "speech-generation",
])
export type ModelDefaultKind = z.infer<typeof ModelDefaultKind>

// ── Pipeline definition ─────────────────────────────────────────

export interface StepDef {
  name: StepName
  label: string
  /** Which task-level model default this step inherits when not overridden. */
  modelDefault?: ModelDefaultKind
  /** Steps within the same stage that must complete first */
  dependsOn?: StepName[]
  /** Step processes pages individually and emits page-level progress */
  pageProgress?: boolean
}

export interface StageDef {
  name: StageName
  label: string
  steps: StepDef[]
  /** Stages that must complete before this one can start */
  dependsOn: StageName[]
}

export const PIPELINE: StageDef[] = [
  {
    name: "extract",
    label: "Extract",
    dependsOn: [],
    steps: [
      { name: "extract", label: "PDF Extraction", pageProgress: true },
      { name: "metadata", label: "Metadata", modelDefault: "llm", dependsOn: ["extract"] },
      { name: "book-summary", label: "Book Summary", modelDefault: "llm", dependsOn: ["metadata"] },
      { name: "book-outline", label: "Book Outline", modelDefault: "llm", dependsOn: ["book-summary"] },
      { name: "image-filtering", label: "Image Filtering", dependsOn: ["extract"], pageProgress: true },
      { name: "image-meaningfulness", label: "Image Meaningfulness", modelDefault: "llm", dependsOn: ["image-filtering"], pageProgress: true },
      { name: "image-segmentation", label: "Image Segmentation", modelDefault: "llm", dependsOn: ["image-meaningfulness"], pageProgress: true },
      { name: "image-cropping", label: "Image Cropping", modelDefault: "llm", dependsOn: ["image-segmentation"], pageProgress: true },
    ],
  },
  {
    name: "sectioning",
    label: "Sectioning",
    dependsOn: ["extract"],
    steps: [
      { name: "page-sectioning", label: "Page Structuring", modelDefault: "llm", pageProgress: true },
      { name: "translation", label: "Translation", modelDefault: "llm", dependsOn: ["page-sectioning"], pageProgress: true },
    ],
  },
  {
    name: "storyboard",
    label: "Storyboard",
    dependsOn: ["sectioning"],
    steps: [
      { name: "web-rendering", label: "Web Rendering", modelDefault: "llm", pageProgress: true },
    ],
  },
  {
    name: "quizzes",
    label: "Quizzes",
    dependsOn: ["storyboard"],
    steps: [
      { name: "quiz-generation", label: "Quiz Generation", modelDefault: "llm" },
    ],
  },
  {
    name: "captions",
    label: "Image Captions",
    dependsOn: ["storyboard"],
    steps: [
      { name: "image-captioning", label: "Image Captioning", modelDefault: "llm" },
    ],
  },
  {
    name: "glossary",
    label: "Glossary",
    dependsOn: ["storyboard"],
    steps: [
      { name: "glossary", label: "Glossary Generation", modelDefault: "llm" },
    ],
  },
  {
    name: "toc",
    label: "Table of Contents",
    dependsOn: ["storyboard"],
    steps: [
      { name: "toc-generation", label: "TOC Generation", modelDefault: "llm" },
    ],
  },
  {
    name: "easy-read",
    label: "Easy Read",
    dependsOn: ["storyboard"],
    steps: [
      { name: "text-catalog", label: "Text Catalog" },
      { name: "easy-read", label: "Easy Read", modelDefault: "llm", dependsOn: ["text-catalog"] },
    ],
  },
  {
    name: "translate",
    label: "Translate",
    dependsOn: ["easy-read", "quizzes", "captions", "glossary", "toc"],
    steps: [
      { name: "catalog-translation", label: "Catalog Translation", modelDefault: "llm" },
      { name: "core-tts-catalog", label: "TTS Normalization", modelDefault: "llm", dependsOn: ["catalog-translation"] },
      { name: "image-translation", label: "Image Translation", modelDefault: "image-generation", dependsOn: ["catalog-translation"] },
    ],
  },
  {
    name: "speech",
    label: "Speech",
    dependsOn: ["translate"],
    steps: [
      { name: "tts", label: "Speech Generation", modelDefault: "speech-generation" },
      { name: "word-timestamps", label: "Word Highlighting", dependsOn: ["tts"] },
    ],
  },
  {
    name: "package",
    label: "Package",
    dependsOn: ["speech"],
    steps: [
      { name: "package-web", label: "Web Package" },
      {
        name: "accessibility-assessment",
        label: "Accessibility Assessment",
        dependsOn: ["package-web"],
      },
    ],
  },
]

// ── Derived lookups ─────────────────────────────────────────────

/** Ordered stage names */
export const STAGE_ORDER: StageName[] = PIPELINE.map((s) => s.name)

/** Map step name → parent stage name */
export const STEP_TO_STAGE: Record<StepName, StageName> = Object.fromEntries(
  PIPELINE.flatMap((stage) => stage.steps.map((step) => [step.name, stage.name]))
) as Record<StepName, StageName>

/** Map stage name → stage definition */
export const STAGE_BY_NAME: Record<StageName, StageDef> = Object.fromEntries(
  PIPELINE.map((stage) => [stage.name, stage])
) as Record<StageName, StageDef>

/** All step names that appear in the pipeline */
export const ALL_STEP_NAMES: ReadonlySet<StepName> = new Set(
  PIPELINE.flatMap((stage) => stage.steps.map((step) => step.name))
)

/** Pipeline steps grouped by the task-level model default they inherit. */
const ALL_STEPS = PIPELINE.flatMap((stage) => stage.steps)
export const STEPS_BY_DEFAULT_MODEL_KIND: Record<ModelDefaultKind, readonly StepDef[]> = {
  llm: ALL_STEPS.filter((step) => step.modelDefault === "llm"),
  "image-generation": ALL_STEPS.filter(
    (step) => step.modelDefault === "image-generation",
  ),
  "speech-generation": ALL_STEPS.filter(
    (step) => step.modelDefault === "speech-generation",
  ),
}

/** Steps that process pages individually and emit page-level progress */
export const PAGE_PROGRESS_STEPS: ReadonlySet<StepName> = new Set(
  PIPELINE.flatMap((stage) => stage.steps.filter((step) => step.pageProgress).map((step) => step.name))
)

/**
 * Stages that aggregate across the whole book (no per-page step). Running one of
 * these over a partially-merged split book yields output that silently omits the
 * pages not yet merged back, so the UI warns before running them.
 */
export const BOOK_LEVEL_STAGES: ReadonlySet<StageName> = new Set(
  PIPELINE.filter((stage) => !stage.steps.some((step) => step.pageProgress)).map((stage) => stage.name)
)
