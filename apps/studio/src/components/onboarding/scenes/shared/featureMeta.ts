import { AudioLines, Languages, HelpCircle, BookOpen, type LucideIcon } from "lucide-react"

export type FeatureSlug = "speech" | "translate" | "quizzes" | "glossary"

/** Exact pipeline-stage icon + color per feature, mirroring stage-config.ts. */
/* eslint-disable lingui/no-unlocalized-strings -- design tokens: color hexes + gradients, never user-facing */
export const FEATURE_META: Record<
  FeatureSlug,
  { Icon: LucideIcon; hex: string; tint: string; panel: string }
> = {
  speech: {
    Icon: AudioLines,
    hex: "#e11d48",
    tint: "#fff1f2",
    panel: "linear-gradient(150deg, #fb7185 0%, #e11d48 55%, #881337 100%)",
  },
  translate: {
    Icon: Languages,
    hex: "#db2777",
    tint: "#fdf2f8",
    panel: "linear-gradient(150deg, #f472b6 0%, #db2777 55%, #831843 100%)",
  },
  quizzes: {
    Icon: HelpCircle,
    hex: "#ea580c",
    tint: "#fff7ed",
    panel: "linear-gradient(150deg, #fb923c 0%, #ea580c 55%, #7c2d12 100%)",
  },
  glossary: {
    Icon: BookOpen,
    hex: "#65a30d",
    tint: "#f7fee7",
    panel: "linear-gradient(150deg, #a3e635 0%, #65a30d 52%, #365314 100%)",
  },
}
/* eslint-enable lingui/no-unlocalized-strings */
