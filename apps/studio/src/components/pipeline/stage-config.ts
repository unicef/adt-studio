import {
  BookMarked,
  FileText,
  LayoutGrid,
  HelpCircle,
  Image,
  BookOpen,
  Languages,
  Eye,
  type LucideIcon,
} from "lucide-react"

export const STAGES = [
  { slug: "book", label: "Book", runningLabel: "Loading Book", icon: BookMarked, color: "bg-gray-500", textColor: "text-gray-600", bgLight: "bg-gray-50", bgDark: "bg-gray-700", borderColor: "border-gray-200" },
  { slug: "extract", label: "Extract", runningLabel: "Extracting", icon: FileText, color: "bg-blue-500", textColor: "text-blue-600", bgLight: "bg-blue-50", bgDark: "bg-blue-700", borderColor: "border-blue-200" },
  { slug: "storyboard", label: "Storyboard", runningLabel: "Building Storyboard", icon: LayoutGrid, color: "bg-violet-500", textColor: "text-violet-600", bgLight: "bg-violet-50", bgDark: "bg-violet-700", borderColor: "border-violet-200" },
  { slug: "quizzes", label: "Quizzes", runningLabel: "Generating Quizzes", icon: HelpCircle, color: "bg-orange-500", textColor: "text-orange-600", bgLight: "bg-orange-50", bgDark: "bg-orange-700", borderColor: "border-orange-200" },
  { slug: "captions", label: "Captions", runningLabel: "Captioning Images", icon: Image, color: "bg-teal-500", textColor: "text-teal-600", bgLight: "bg-teal-50", bgDark: "bg-teal-700", borderColor: "border-teal-200" },
  { slug: "glossary", label: "Glossary", runningLabel: "Generating Glossary", icon: BookOpen, color: "bg-lime-500", textColor: "text-lime-600", bgLight: "bg-lime-50", bgDark: "bg-lime-700", borderColor: "border-lime-200" },
  { slug: "text-and-speech", label: "Text & Speech", runningLabel: "Translating", icon: Languages, color: "bg-pink-500", textColor: "text-pink-600", bgLight: "bg-pink-50", bgDark: "bg-pink-700", borderColor: "border-pink-200" },
  { slug: "preview", label: "Preview", runningLabel: "Building Preview", icon: Eye, color: "bg-gray-500", textColor: "text-gray-600", bgLight: "bg-gray-50", bgDark: "bg-gray-700", borderColor: "border-gray-200" },
] as const satisfies ReadonlyArray<{
  slug: string
  label: string
  runningLabel: string
  icon: LucideIcon
  color: string
  textColor: string
  bgLight: string
  bgDark: string
  borderColor: string
}>

export type StageSlug = (typeof STAGES)[number]["slug"]
export type PipelineStageSlug = Exclude<StageSlug, "book">
export type StageDefinition = (typeof STAGES)[number]
export type PipelineStageDefinition = Extract<StageDefinition, { slug: PipelineStageSlug }>

export const STAGE_DESCRIPTIONS: Record<PipelineStageSlug, string> = {
  extract: "Extract text and images from each page of the PDF using AI-powered analysis.",
  storyboard: "Arrange extracted content into a structured storyboard with pages, sections, and layouts.",
  quizzes: "Generate comprehension quizzes and activities based on the book content.",
  captions: "Create descriptive captions for images to improve accessibility.",
  glossary: "Build a glossary of key terms and definitions found in the text.",
  "text-and-speech": "Translate the book content and generate audio narration.",
  preview: "Package and preview the final ADT web application.",
}

/** Stages that have a per-page navigation panel. */
export const STAGES_WITH_PAGES = new Set<StageSlug>([
  "storyboard",
  "quizzes",
  "captions",
  "text-and-speech",
])

const STAGE_SLUG_SET = new Set<StageSlug>(STAGES.map((stage) => stage.slug))

export function isStageSlug(slug: string): slug is StageSlug {
  return STAGE_SLUG_SET.has(slug as StageSlug)
}

export function hasStagePages(slug: string): boolean {
  return isStageSlug(slug) && STAGES_WITH_PAGES.has(slug)
}

export function isPipelineStage(stage: StageDefinition): stage is PipelineStageDefinition {
  return stage.slug !== "book"
}

export function getPipelineStages(): PipelineStageDefinition[] {
  return STAGES.filter(isPipelineStage)
}

export function toCamelLabel(label: string): string {
  return label
    .split(/[-_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("")
}

export function isStageCompleted(slug: string, completedStages: Record<string, boolean>): boolean {
  return !!completedStages[slug]
}
