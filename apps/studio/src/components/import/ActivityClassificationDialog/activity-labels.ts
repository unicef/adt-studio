import { plural } from "@lingui/core/macro"
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


export function useActivityTypeDescription() {
  const { t } = useLingui()
  return (type: string): string => {
    if (type === "activity_quiz") return t`A generated comprehension quiz page.`
    if (type === "activity_multiple_choice") return t`Choose exactly one answer from several options.`
    if (type === "activity_multi_select") return t`Choose more than one correct answer.`
    if (type === "activity_true_false") return t`Decide whether a statement is true or false.`
    if (type === "activity_fill_in_the_blank") return t`Enter a missing word or short phrase.`
    if (type === "activity_fill_in_a_table") return t`Complete missing cells in a table.`
    if (type === "activity_open_ended_answer") return t`Write a free-form response.`
    if (type === "activity_underline_text") return t`Select or underline part of a text.`
    if (type === "activity_matching") return t`Pair related items from two groups.`
    if (type === "activity_sorting") return t`Arrange items into an order or categories.`
    if (type === "activity_other") return t`A Studio activity that fits none of the types.`
    return t`Made outside ADT Studio and kept as it is.`
  }
}

/** The name people recognize a page by: its first heading, else its file. */
export function pageName(item: ActivityReviewItem): string {
  // Headings often end with the punctuation of the sentence they open ("Caro estudante,").
  return item.heading?.trim().replace(/[\s,;:]+$/, "") || item.href
}

type ActivityControl = NonNullable<ActivityReviewItem["controls"]>[number]

/** "a text field", "2 checkboxes", "a text field and a button": what was
 * found on a page, in place of "interactive controls". */
export function useControlsLabel() {
  const { t } = useLingui()
  const one = (control: ActivityControl): string => {
    const count = control.count
    switch (control.kind) {
      case "text-field": return plural(count, { one: "a text field", other: "# text fields" })
      case "text-area": return plural(count, { one: "a text box", other: "# text boxes" })
      case "button": return plural(count, { one: "a button", other: "# buttons" })
      case "checkbox": return plural(count, { one: "a checkbox", other: "# checkboxes" })
      case "radio": return plural(count, { one: "a radio button", other: "# radio buttons" })
      case "select": return plural(count, { one: "a dropdown", other: "# dropdowns" })
      default: return plural(count, { one: "a draggable item", other: "# draggable items" })
    }
  }
  return (controls: ActivityReviewItem["controls"]): string => {
    if (!controls || controls.length === 0) return t`interactive controls`
    const [first, second] = controls.map(one)
    if (controls.length === 1) return first
    if (controls.length === 2) return t`${first} and ${second}`
    return t`${first}, ${second} and more`
  }
}

/** Types that fit the controls found, best first. A suggestion is shown, never
 * preselected: a person always confirms the type. */
export function suggestedTypesFor(controls: ActivityReviewItem["controls"]): string[] {
  const kinds = new Set((controls ?? []).map((control) => control.kind))
  const types: string[] = []
  if (kinds.has("text-field") || kinds.has("text-area")) types.push("activity_open_ended_answer", "activity_fill_in_the_blank")
  if (kinds.has("radio")) types.push("activity_multiple_choice", "activity_true_false")
  if (kinds.has("checkbox")) types.push("activity_multi_select")
  if (kinds.has("select")) types.push("activity_matching", "activity_fill_in_the_blank")
  if (kinds.has("draggable")) types.push("activity_sorting", "activity_matching")
  return [...new Set(types)].slice(0, 3)
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
  if (type === null) return { icon: Ban, tileClassName: "bg-muted text-muted-foreground" }
  if (type === "activity_quiz") {
    return { icon: CircleHelp, tileClassName: "bg-orange-500/15 text-orange-700 dark:text-orange-300" }
  }
  if (type === "activity_multiple_choice" || type === "activity_multi_select") {
    return { icon: ListChecks, tileClassName: "bg-violet-500/15 text-violet-700 dark:text-violet-300" }
  }
  if (type === "activity_true_false") {
    return { icon: ToggleLeft, tileClassName: "bg-violet-500/15 text-violet-700 dark:text-violet-300" }
  }
  if (type === "activity_fill_in_the_blank") {
    return { icon: Type, tileClassName: "bg-violet-500/15 text-violet-700 dark:text-violet-300" }
  }
  if (type === "activity_fill_in_a_table") {
    return { icon: Table2, tileClassName: "bg-violet-500/15 text-violet-700 dark:text-violet-300" }
  }
  if (type === "activity_open_ended_answer") {
    return { icon: MessageSquareText, tileClassName: "bg-violet-500/15 text-violet-700 dark:text-violet-300" }
  }
  if (type === "activity_underline_text") {
    return { icon: Underline, tileClassName: "bg-violet-500/15 text-violet-700 dark:text-violet-300" }
  }
  if (type === "activity_matching") {
    return { icon: Link2, tileClassName: "bg-violet-500/15 text-violet-700 dark:text-violet-300" }
  }
  if (type === "activity_sorting") {
    return { icon: ArrowDownAZ, tileClassName: "bg-violet-500/15 text-violet-700 dark:text-violet-300" }
  }
  return { icon: Puzzle, tileClassName: "bg-violet-500/15 text-violet-700 dark:text-violet-300" }
}
