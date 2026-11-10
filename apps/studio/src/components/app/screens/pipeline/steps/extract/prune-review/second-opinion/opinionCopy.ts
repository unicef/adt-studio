import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import type { LeftOutCategory, LeftOutOpinionVerdict } from "@/api/client"

export const CATEGORY_LABEL: Record<LeftOutCategory, MessageDescriptor> = {
  "exercise-visual": msg`Exercise picture`,
  illustration: msg`Illustration`,
  photo: msg`Photo`,
  diagram: msg`Diagram`,
  icon: msg`Icon`,
  "logo-or-branding": msg`Logo or branding`,
  decoration: msg`Decoration`,
  "divider-or-border": msg`Line or border`,
  "text-as-image": msg`Text as a picture`,
  "blank-or-artifact": msg`Blank or glitch`,
  fragment: msg`Piece of a picture`,
}

export const VERDICT_LABEL: Record<LeftOutOpinionVerdict, MessageDescriptor> = {
  keep: msg`Second look: bring back`,
  remove: msg`Second look: leave out`,
  unsure: msg`Second look: not sure`,
}

export const VERDICT_TONE: Record<LeftOutOpinionVerdict, string> = {
  keep: "bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/30 dark:bg-emerald-400/15 dark:text-emerald-300 dark:ring-emerald-400/30",
  remove: "bg-muted text-muted-foreground ring-1 ring-border",
  unsure: "bg-amber-400/15 text-amber-800 ring-1 ring-amber-500/30 dark:text-amber-300",
}

export const VERDICT_DOT: Record<LeftOutOpinionVerdict, string> = {
  keep: "bg-emerald-500",
  remove: "bg-zinc-400 dark:bg-zinc-500",
  unsure: "bg-amber-400",
}
