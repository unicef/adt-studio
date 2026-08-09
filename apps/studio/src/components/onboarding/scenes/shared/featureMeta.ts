import { AudioLines, Languages, HelpCircle, BookOpen, type LucideIcon } from "lucide-react"

export type FeatureSlug = "speech" | "translate" | "quizzes" | "glossary"

/** Exact pipeline-stage icon + color per feature, mirroring stage-config.ts. */
export const FEATURE_META: Record<
  FeatureSlug,
  { Icon: LucideIcon; hex: string; tint: string }
> = {
  speech: { Icon: AudioLines, hex: "#e11d48", tint: "#fff1f2" },
  translate: { Icon: Languages, hex: "#db2777", tint: "#fdf2f8" },
  quizzes: { Icon: HelpCircle, hex: "#ea580c", tint: "#fff7ed" },
  glossary: { Icon: BookOpen, hex: "#65a30d", tint: "#f7fee7" },
}
