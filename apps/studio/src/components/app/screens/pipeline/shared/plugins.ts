import type { LucideIcon } from "lucide-react"
import { PIPELINE } from "@adt/types"
import { STAGES, type StageGroup } from "@/components/pipeline/stage-config"

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

/** Order the dock lays the groups out in, left to right. */
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

/**
 * Bucket dock entries by their stage group, in `DOCK_GROUP_ORDER`. Grouping by
 * key rather than by runs of adjacent entries keeps a group whole even when the
 * source order interleaves it with another (Sign Language sits after Language
 * in `PLUGIN_SLUGS`, yet belongs with the other enhancements).
 */
export function groupDockEntries<T extends DockEntry>(entries: T[]): DockGroup<T>[] {
  return DOCK_GROUP_ORDER.map((key) => ({
    key,
    items: entries.filter((item) => item.group === key),
  })).filter((group) => group.items.length > 0)
}

const STAGE_DEPENDENCIES = new Map<string, readonly string[]>(
  PIPELINE.map((stage) => [stage.name, stage.dependsOn]),
)

/**
 * Whether `slug` consumes `upstream`'s output, per the `PIPELINE` DAG. Drives
 * the dock connectors, so stages with no edge between them (every enhancement,
 * and Sign Language, which has no `PIPELINE` stage at all) read as independent.
 */
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

/** Translucent wash of a stage hex, legible over both light and dark surfaces. */
export function tint(hex: string, alpha = 0.12): string {
  const value = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")
  return `${hex}${value}`
}
