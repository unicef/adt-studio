import { useLingui } from "@lingui/react/macro"
import {
  ArrowDownAZ,
  Ban,
  CircleHelp,
  Link2,
  ListChecks,
  MessageSquareText,
  Puzzle,
  Table2,
  ToggleLeft,
  Type,
  Underline,
  type LucideIcon,
} from "lucide-react"

import type { AdtBundleImportPreview } from "@/api/client"

export type ActivityReview = AdtBundleImportPreview["activityReview"]
export type ActivityReviewItem = ActivityReview["items"][number]

export function hasDecision(
  decisions: Record<string, string | null>,
  sectionId: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(decisions, sectionId)
}


export function useActivityTypeLabel() {
  const { t } = useLingui()
  return (type: string): string => {
    if (type === "activity_quiz") return t`Quiz`
    if (type === "activity_multiple_choice") return t`Multiple choice`
    if (type === "activity_multi_select") return t`Multiple selection`
    if (type === "activity_true_false") return t`True or false`
    if (type === "activity_fill_in_the_blank") return t`Fill in the blank`
    if (type === "activity_fill_in_a_table") return t`Fill in a table`
    if (type === "activity_open_ended_answer") return t`Open-ended answer`
    if (type === "activity_underline_text") return t`Underline text`
    if (type === "activity_matching") return t`Matching`
    if (type === "activity_sorting") return t`Sorting`
    if (type === "activity_other") return t`Other activity`
    const customName = type.startsWith("activity_custom_")
      ? type.slice("activity_custom_".length).replaceAll("_", " ")
      : undefined
    return customName ? `${t`Custom activity`}: ${customName}` : t`Custom activity`
  }
}


export function useActivityReasonLabel() {
  const { t } = useLingui()
  return (reason: ActivityReviewItem["reasons"][number]): string => {
    if (reason === "missing-declaration") return t`This activity was added after export.`
    if (reason === "missing-marker") return t`The exported activity marker is missing.`
    if (reason === "type-mismatch") return t`The activity type changed after export.`
    if (reason === "interactive-unmarked") return t`Interactive controls were found without an activity marker.`
    if (reason === "invalid-structure") return t`The activity structure needs confirmation.`
    return t`The declared activity page is missing.`
  }
}


export function activityTypeVisual(type: string | null): {
  icon: LucideIcon
  tileClassName: string
} {
  if (type === null) return { icon: Ban, tileClassName: "bg-slate-100 text-slate-600" }
  if (type === "activity_quiz") {
    return { icon: CircleHelp, tileClassName: "bg-orange-50 text-orange-700" }
  }
  if (type === "activity_multiple_choice" || type === "activity_multi_select") {
    return { icon: ListChecks, tileClassName: "bg-violet-50 text-violet-700" }
  }
  if (type === "activity_true_false") {
    return { icon: ToggleLeft, tileClassName: "bg-violet-50 text-violet-700" }
  }
  if (type === "activity_fill_in_the_blank") {
    return { icon: Type, tileClassName: "bg-violet-50 text-violet-700" }
  }
  if (type === "activity_fill_in_a_table") {
    return { icon: Table2, tileClassName: "bg-violet-50 text-violet-700" }
  }
  if (type === "activity_open_ended_answer") {
    return { icon: MessageSquareText, tileClassName: "bg-violet-50 text-violet-700" }
  }
  if (type === "activity_underline_text") {
    return { icon: Underline, tileClassName: "bg-violet-50 text-violet-700" }
  }
  if (type === "activity_matching") {
    return { icon: Link2, tileClassName: "bg-violet-50 text-violet-700" }
  }
  if (type === "activity_sorting") {
    return { icon: ArrowDownAZ, tileClassName: "bg-violet-50 text-violet-700" }
  }
  return { icon: Puzzle, tileClassName: "bg-violet-50 text-violet-700" }
}
