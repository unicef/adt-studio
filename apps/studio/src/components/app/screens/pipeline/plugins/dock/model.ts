import { useLingui } from "@lingui/react/macro"
import { Accessibility, Languages, Sparkles, Wrench, type LucideIcon } from "lucide-react"
import type { StageGroup } from "@/components/pipeline/stage-config"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"

export type DockKey = StageGroup | "accessibility"
export type DockLayout = "groups" | "flat" | "path"
export type NextCue = "chip" | "card" | "menu"
export type DockOrder = "none" | "arrow" | "cluster"

export interface KeyedGroup {
  key: DockKey
  items: DockItem[]
}

export interface DockNext {
  key: string
  slug: string
  title: string
  body: string
}

export const GROUP_ICON: Partial<Record<DockKey, LucideIcon>> = {
  convert: Wrench,
  accessibility: Accessibility,
  enhancements: Sparkles,
  localization: Languages,
}

export const ACCESSIBILITY_SLUGS: readonly string[] = ["captions", "toc", "easy-read", "sign-language"]

export const GROUP_ORDER: DockKey[] = ["convert", "accessibility", "enhancements", "localization"]

export const STEP_ORDER: readonly string[] = ["captions", "toc", "easy-read", "sign-language", "quizzes", "glossary", "translate", "speech"]

export const CONTENT_KEYS: readonly DockKey[] = ["accessibility", "enhancements"]

export function keyOf(item: DockItem): DockKey {
  return ACCESSIBILITY_SLUGS.includes(item.slug) ? "accessibility" : item.group
}

export function sectionsFor(open: string | null): DockKey[] {
  if (!open) return []
  if (open === "content") return [...CONTENT_KEYS]
  if (open === "all" || open === "features") return [...CONTENT_KEYS, "localization"]
  return [open as DockKey]
}

export function useGroupCopy() {
  const { t } = useLingui()
  return (group: DockKey): { name: string; hint: string } =>
    group === "convert"
      ? { name: t`Setup`, hint: t`How your PDF became the storyboard.` }
      : group === "accessibility"
        ? { name: t`Accessibility`, hint: t`Recommended, so every reader can use the book.` }
        : group === "enhancements"
          ? { name: t`Enhancements`, hint: t`Optional extras for learning, in any order.` }
          : group === "localization"
            ? { name: t`Languages & voices`, hint: t`Best done last: translates everything above.` }
            : { name: t`More`, hint: "" }
}
