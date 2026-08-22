import type { LucideIcon } from "lucide-react"
import { PIPELINE } from "@adt/types"
import { STAGES, type StageGroup } from "@/components/pipeline/stage-config"

export const FOUNDATION_SLUGS = ["extract", "sectioning"] as const

export const PLUGIN_SLUGS = [
  "captions",
  "quizzes",
  "glossary",
  "toc",
  "easy-read",
  "translate",
  "speech",
  "sign-language",
  "validation",
] as const

export type FoundationSlug = (typeof FOUNDATION_SLUGS)[number]
export type PluginSlug = (typeof PLUGIN_SLUGS)[number]
export type DockSlug = FoundationSlug | PluginSlug

export interface DockEntry {
  slug: DockSlug
  icon: LucideIcon
  hex: string
  group: StageGroup
}

function entry(slug: DockSlug): DockEntry {
  const stage = STAGES.find((s) => s.slug === slug)
  if (!stage) throw new Error(`Unknown pipeline stage: ${slug}`)
  const group = "group" in stage ? stage.group : undefined
  if (!group) throw new Error(`Pipeline stage has no group: ${slug}`)
  return { slug, icon: stage.icon, hex: stage.hex, group }
}

export const FOUNDATIONS: DockEntry[] = FOUNDATION_SLUGS.map(entry)
export const PLUGINS: DockEntry[] = PLUGIN_SLUGS.map(entry)

export const DOCK_GROUP_ORDER: StageGroup[] = [
  "convert",
  "enhancements",
  "localization",
  "packaging",
]

export interface DockGroup<T extends DockEntry> {
  key: StageGroup
  items: T[]
}

export function groupDockEntries<T extends DockEntry>(entries: T[]): DockGroup<T>[] {
  return DOCK_GROUP_ORDER.map((key) => ({
    key,
    items: entries.filter((item) => item.group === key),
  })).filter((group) => group.items.length > 0)
}

const STAGE_DEPENDENCIES = new Map<string, readonly string[]>(
  PIPELINE.map((stage) => [stage.name, stage.dependsOn]),
)

export function stageDependsOn(slug: string, upstream: string): boolean {
  return STAGE_DEPENDENCIES.get(slug)?.includes(upstream) ?? false
}

const DOCK_SLUG_SET: Set<string> = new Set<string>([...FOUNDATION_SLUGS, ...PLUGIN_SLUGS])

export function isDockSlug(slug: string): slug is DockSlug {
  return DOCK_SLUG_SET.has(slug)
}

export function findDockEntry(slug: string): DockEntry | undefined {
  return [...FOUNDATIONS, ...PLUGINS].find((p) => p.slug === slug)
}

export function tint(hex: string, alpha = 0.12): string {
  const value = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")
  return `${hex}${value}`
}
