import { plural } from "@lingui/core/macro"
import { useLingui } from "@lingui/react/macro"
import {
  ArrowDownAZ,
  Ban,
  CircleHelp,
  Link2,
  ListChecks,
  ListOrdered,
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
    if (type === "activity_ordering") return t`Ordering`
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
    if (type === "activity_sorting") return t`Group items into categories.`
    if (type === "activity_ordering") return t`Arrange all items into one correct sequence.`
    if (type === "activity_other") return t`A Studio activity that fits none of the types.`
    return t`Made outside ADT Studio and kept as it is.`
  }
}

/** The name people recognize a page by: its first heading, else its file. */
export function pageName(item: ActivityReviewItem): string {
  // Headings often end with the punctuation of the sentence they open ("Caro estudante,").
  return item.heading?.trim().replace(/[\s,;:]+$/, "") || item.href
}

/** The page's type is accepted and only its accessibility checks failed, so it
 * needs confirming, not a type (#1155). */
export function failsOnlyChecks(item: ActivityReviewItem): boolean {
  return item.reasons.length > 0 && item.reasons.every((reason) => reason === "invalid-structure")
}

/** Whether the pages to review all need a type, all only fail checks, or both. */
export function activityReviewKind(items: ActivityReviewItem[]): "type" | "checks" | "mixed" {
  const pending = items.filter((item) => item.status === "needs-review")
  const checks = pending.filter(failsOnlyChecks).length
  if (checks === 0) return "type"
  return checks === pending.length ? "checks" : "mixed"
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

/**
 * What each accessibility check a page failed means, by rule id (the rule
 * `name` in the pipeline's validate-activity-structure.ts). Null for an id
 * Studio doesn't know yet: the caller shows the pipeline's own message.
 */
export function useActivityCheckLabel() {
  const { t } = useLingui()
  return (check: string): string | null => {
    switch (check) {
      case "option-label-class": return t`An answer option’s label is missing the class the reader needs`
      case "radio-has-name": return t`A choice button has no group name`
      case "label-wraps-radio": return t`A choice button isn’t inside its label`
      case "checkbox-has-name": return t`A checkbox has no group name`
      case "label-wraps-checkbox": return t`A checkbox isn’t inside its label`
      case "unique-items": return t`Two items share the same activity id`
      case "has-options": return t`The activity has no words or phrases to underline`
      case "items-present": return t`An underline option has no item id`
      case "question-group-present": return t`An underline option isn’t in a question group`
      case "options-have-text": return t`An underline option has no text`
      case "word-level-fully-tokenized": return t`A sentence isn’t fully split into selectable words`
      case "fieldset-paired-radios": return t`A true-or-false question doesn’t have exactly two answers`
      case "validation-mark-present": return t`A true-or-false answer has no mark to show the result`
      case "markers-well-formed": return t`A blank is written in the wrong format`
      case "inputs-have-item": return t`An answer field has no item id`
      case "inputs-have-aria-label": return t`A text box has no accessible name`
      case "drop-zones-accessible": return t`A drop zone has no accessible name`
      case "cards-accessible": return t`A card has no accessible name or can’t be used with a keyboard`
      case "inputs-have-label": return t`A field has no accessible name`
      case "section-has-label": return t`The activity has no accessible name`
      case "has-live-region": return t`Results aren’t announced to screen readers`
      case "ordering-contract": return t`The ordering list or its items aren’t marked up as the reader expects`
      default: return null
    }
  }
}

/** A page's failed checks, each once and in first-seen order, with how many
 * times it failed. A known rule id is named; an unknown one keeps its message. */
export function groupFailedChecks(item: ActivityReviewItem): Array<{ check: string | null; message: string; count: number }> {
  const groups = new Map<string, { check: string | null; message: string; count: number }>()
  item.validationErrors.forEach((message, index) => {
    const check = item.failedChecks?.[index] ?? null
    const key = check ?? message
    const group = groups.get(key)
    if (group) group.count += 1
    else groups.set(key, { check, message, count: 1 })
  })
  return [...groups.values()]
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
  if (type === "activity_ordering") {
    return { icon: ListOrdered, tileClassName: "bg-violet-500/15 text-violet-700 dark:text-violet-300" }
  }
  return { icon: Puzzle, tileClassName: "bg-violet-500/15 text-violet-700 dark:text-violet-300" }
}
