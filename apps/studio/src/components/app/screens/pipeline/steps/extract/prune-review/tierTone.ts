import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Check, CircleAlert, Eye, type LucideIcon } from "lucide-react"
import type { ReasonKind } from "../page-detail/humanReason"
import type { Tier } from "./tier"

export const TIER_ICON: Record<Tier, LucideIcon> = {
  needed: CircleAlert,
  look: Eye,
  right: Check,
}

export const TIER_LABEL: Record<Tier, MessageDescriptor> = {
  needed: msg`Probably needed`,
  look: msg`Worth a look`,
  right: msg`Probably right`,
}

export const TIER_LONG: Record<Tier, MessageDescriptor> = {
  needed: msg`Probably needed: check these first`,
  look: msg`Worth a look`,
  right: msg`Probably right to leave out`,
}

export const TIER_CHIP: Record<Tier, string> = {
  needed: "bg-rose-500/12 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
  look: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  right: "bg-slate-500/12 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300",
}

export const TIER_TEXT: Record<Tier, string> = {
  needed: "text-rose-700 dark:text-rose-300",
  look: "text-amber-700 dark:text-amber-300",
  right: "text-muted-foreground",
}

export const TIER_SOLID: Record<Tier, string> = {
  needed: "bg-rose-600 text-white dark:bg-rose-400 dark:text-rose-950",
  look: "bg-amber-400 text-amber-950",
  right: "bg-slate-600 text-white dark:bg-slate-300 dark:text-slate-900",
}

export const TIER_OVER_IMAGE: Record<Tier, string> = {
  needed: TIER_SOLID.needed,
  look: TIER_SOLID.look,
  right: "bg-black/65 text-white",
}

export const TIER_BAR: Record<Tier, string> = {
  needed: "bg-rose-600 dark:bg-rose-400",
  look: "bg-amber-400",
  right: "bg-slate-400 dark:bg-slate-500",
}

export const TIER_BORDER: Record<Tier, string> = {
  needed: "border-rose-600 dark:border-rose-400",
  look: "border-amber-500 dark:border-amber-400",
  right: "border-slate-500/80 dark:border-slate-400/80",
}

export const TIER_STROKE: Record<Tier, string> = {
  needed: "border-2 border-solid",
  look: "border-2 border-dashed",
  right: "border border-dotted",
}

export const TIER_FILL: Record<Tier, string> = {
  needed: "bg-rose-500/12 dark:bg-rose-400/15",
  look: "bg-amber-500/15 dark:bg-amber-400/15",
  right: "bg-slate-500/12 dark:bg-slate-400/15",
}

export const TIER_RING: Record<Tier, string> = {
  needed: "shadow-[0_0_0_3px_rgb(225_29_72/0.28)]",
  look: "shadow-[0_0_0_3px_rgb(245_158_11/0.3)]",
  right: "shadow-[0_0_0_3px_rgb(100_116_139/0.28)]",
}

export const TIER_OUTLINE_RING: Record<Tier, string> = {
  needed: "ring-2 ring-rose-600 dark:ring-rose-400",
  look: "ring-2 ring-amber-400",
  right: "ring-1 ring-slate-400/70",
}

export const RIGHT_KIND_LABEL: Partial<Record<ReasonKind, MessageDescriptor>> = {
  "too-small": msg`tiny dots and lines`,
  "not-meaningful": msg`plain shapes`,
  blank: msg`one colour`,
  duplicate: msg`copies`,
  "full-page": msg`whole-page pictures`,
  segmented: msg`split into parts`,
  cropped: msg`replaced by a crop`,
}

export function capCount(count: number): string {
  return count > 99 ? "99+" : String(count)
}
