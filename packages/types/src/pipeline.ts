import { z } from "zod"

// ── Steps: atomic processing operations ─────────────────────────

export const StepName = z.enum([
  "extract",
  "metadata",
  "book-summary",
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

// ── Pipeline definition ─────────────────────────────────────────

export interface StepDef {
  name: StepName
  label: string
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
      { name: "metadata", label: "Metadata", dependsOn: ["extract"] },
      { name: "book-summary", label: "Book Summary", dependsOn: ["metadata"] },
      { name: "image-filtering", label: "Image Filtering", dependsOn: ["extract"], pageProgress: true },
      { name: "image-segmentation", label: "Image Segmentation", dependsOn: ["image-filtering"], pageProgress: true },
      { name: "image-meaningfulness", label: "Image Meaningfulness", dependsOn: ["image-segmentation"], pageProgress: true },
      { name: "image-cropping", label: "Image Cropping", dependsOn: ["image-segmentation"], pageProgress: true },
    ],
  },
  {
    name: "sectioning",
    label: "Sectioning",
    dependsOn: ["extract"],
    steps: [
      { name: "page-sectioning", label: "Page Structuring", pageProgress: true },
      { name: "translation", label: "Translation", dependsOn: ["page-sectioning"], pageProgress: true },
    ],
  },
  {
    name: "storyboard",
    label: "Storyboard",
    dependsOn: ["sectioning"],
    steps: [
      { name: "web-rendering", label: "Web Rendering", pageProgress: true },
    ],
  },
  {
    name: "quizzes",
    label: "Quizzes",
    dependsOn: ["storyboard"],
    steps: [
      { name: "quiz-generation", label: "Quiz Generation" },
    ],
  },
  {
    name: "captions",
    label: "Image Captions",
    dependsOn: ["storyboard"],
    steps: [
      { name: "image-captioning", label: "Image Captioning" },
    ],
  },
  {
    name: "glossary",
    label: "Glossary",
    dependsOn: ["storyboard"],
    steps: [
      { name: "glossary", label: "Glossary Generation" },
    ],
  },
  {
    name: "toc",
    label: "Table of Contents",
    dependsOn: ["storyboard"],
    steps: [
      { name: "toc-generation", label: "TOC Generation" },
    ],
  },
  {
    name: "easy-read",
    label: "Easy Read",
    dependsOn: ["storyboard"],
    steps: [
      { name: "text-catalog", label: "Text Catalog" },
      { name: "easy-read", label: "Easy Read", dependsOn: ["text-catalog"] },
    ],
  },
  {
    name: "translate",
    label: "Translate",
    dependsOn: ["easy-read", "quizzes", "captions", "glossary", "toc"],
    steps: [
      { name: "catalog-translation", label: "Catalog Translation" },
      { name: "image-translation", label: "Image Translation", dependsOn: ["catalog-translation"] },
    ],
  },
  {
    name: "speech",
    label: "Speech",
    dependsOn: ["translate"],
    steps: [
      { name: "tts", label: "Speech Generation" },
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

/** Steps that process pages individually and emit page-level progress */
export const PAGE_PROGRESS_STEPS: ReadonlySet<StepName> = new Set(
  PIPELINE.flatMap((stage) => stage.steps.filter((step) => step.pageProgress).map((step) => step.name))
)
