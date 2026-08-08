import type { LucideIcon } from "lucide-react"
import { STAGES } from "@/components/pipeline/stage-config"

/** Stages that must run before the storyboard exists — they are not plugins. */
export const FOUNDATION_SLUGS = ["extract", "sectioning"] as const

/** Stages that enrich an existing storyboard and are reachable from the dock. */
export const PLUGIN_SLUGS = [
  "captions",
  "quizzes",
  "glossary",
  "toc",
  "easy-read",
  "translate",
  "speech",
  "sign-language",
] as const

export type FoundationSlug = (typeof FOUNDATION_SLUGS)[number]
export type PluginSlug = (typeof PLUGIN_SLUGS)[number]
export type DockSlug = FoundationSlug | PluginSlug

export interface DockEntry {
  slug: DockSlug
  icon: LucideIcon
  hex: string
}

function entry(slug: DockSlug): DockEntry {
  const stage = STAGES.find((s) => s.slug === slug)
  if (!stage) throw new Error(`Unknown pipeline stage: ${slug}`)
  return { slug, icon: stage.icon, hex: stage.hex }
}

export const FOUNDATIONS: DockEntry[] = FOUNDATION_SLUGS.map(entry)
export const PLUGINS: DockEntry[] = PLUGIN_SLUGS.map(entry)

const PLUGIN_SLUG_SET: Set<string> = new Set(PLUGIN_SLUGS)

export function isPluginSlug(slug: string): slug is PluginSlug {
  return PLUGIN_SLUG_SET.has(slug)
}

export function findPlugin(slug: string): DockEntry | undefined {
  return PLUGINS.find((p) => p.slug === slug)
}

/** Translucent wash of a stage hex, legible over both light and dark surfaces. */
export function tint(hex: string, alpha = 0.12): string {
  const value = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")
  return `${hex}${value}`
}
