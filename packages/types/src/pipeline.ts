import { z } from "zod"

// ── Steps: atomic processing operations ─────────────────────────

export const StepName = z.enum([
  "extract",
  "metadata",
  "book-summary",
  "image-filtering",
  "image-cropping",
  "image-meaningfulness",
  "text-classification",
  "translation",
  "page-sectioning",
  "web-rendering",
  "quiz-generation",
  "image-captioning",
  "glossary",
  "text-catalog",
  "catalog-translation",
  "tts",
  "package-web",
])
export type StepName = z.infer<typeof StepName>

// ── Stages: high-level groupings visible in UI ──────────────────

export const StageName = z.enum([
  "extract",
  "storyboard",
  "quizzes",
  "captions",
  "glossary",
  "text-and-speech",
  "package",
])
export type StageName = z.infer<typeof StageName>

// ── Pipeline definition ─────────────────────────────────────────

export interface StepDef {
  name: StepName
  label: string
  /** Steps within the same stage that must complete first */
  dependsOn?: StepName[]
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
      { name: "extract", label: "PDF Extraction" },
      { name: "metadata", label: "Metadata", dependsOn: ["extract"] },
      { name: "image-filtering", label: "Image Filtering", dependsOn: ["extract"] },
      { name: "image-cropping", label: "Image Cropping", dependsOn: ["image-filtering"] },
      { name: "image-meaningfulness", label: "Image Meaningfulness", dependsOn: ["image-filtering"] },
      { name: "text-classification", label: "Text Classification", dependsOn: ["extract"] },
      { name: "book-summary", label: "Book Summary", dependsOn: ["text-classification"] },
      { name: "translation", label: "Translation", dependsOn: ["text-classification"] },
    ],
  },
  {
    name: "storyboard",
    label: "Storyboard",
    dependsOn: ["extract"],
    steps: [
      { name: "page-sectioning", label: "Page Sectioning" },
      { name: "web-rendering", label: "Web Rendering", dependsOn: ["page-sectioning"] },
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
    label: "Captions",
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
    name: "text-and-speech",
    label: "Text & Speech",
    dependsOn: ["quizzes", "captions", "glossary"],
    steps: [
      { name: "text-catalog", label: "Text Catalog" },
      { name: "catalog-translation", label: "Catalog Translation", dependsOn: ["text-catalog"] },
      { name: "tts", label: "Speech Generation", dependsOn: ["catalog-translation"] },
    ],
  },
  {
    name: "package",
    label: "Package",
    dependsOn: ["text-and-speech"],
    steps: [
      { name: "package-web", label: "Web Package" },
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
