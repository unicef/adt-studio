import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { i18n } from "@lingui/core"

/** Section type values only — use {@link getSectionTypeLabel} for display text. */
export const SECTION_TYPES = [
  { value: "text_only" },
  { value: "text_and_single_image" },
  { value: "text_and_images" },
  { value: "images_only" },
  { value: "boxed_text" },
  { value: "activity_matching" },
  { value: "activity_fill_in_a_table" },
  { value: "activity_multiple_choice" },
  { value: "activity_multi_select" },
  { value: "activity_underline_text" },
  { value: "activity_true_false" },
  { value: "activity_open_ended_answer" },
  { value: "activity_fill_in_the_blank" },
  { value: "activity_sorting" },
  { value: "activity_other" },
  { value: "front_cover" },
  { value: "inside_cover" },
  { value: "back_cover" },
  { value: "separator" },
  { value: "credits" },
  { value: "foreword" },
  { value: "table_of_contents" },
  { value: "other" },
] as const

const SECTION_GROUP_LABEL_MESSAGES: Record<string, MessageDescriptor> = {
  content: msg`Content`,
  activities: msg`Activities`,
  structure: msg`Structure`,
  other: msg`Other`,
}

/** Grouped section types — use {@link getSectionTypeGroupLabel} for the group heading. */
export const SECTION_TYPE_GROUPS = [
  {
    id: "content" as const,
    types: SECTION_TYPES.filter(
      (t) =>
        ["text_only", "text_and_single_image", "text_and_images", "images_only", "boxed_text"].includes(t.value)
    ),
  },
  {
    id: "activities" as const,
    types: SECTION_TYPES.filter((t) => t.value.startsWith("activity_")),
  },
  {
    id: "structure" as const,
    types: SECTION_TYPES.filter((t) =>
      ["front_cover", "inside_cover", "back_cover", "separator", "credits", "foreword", "table_of_contents"].includes(
        t.value
      )
    ),
  },
  {
    id: "other" as const,
    types: SECTION_TYPES.filter((t) => t.value === "other"),
  },
] as const

const SECTION_TYPE_LABEL_MESSAGES: Record<string, MessageDescriptor> = {
  text_only: msg`Text Only`,
  text_and_single_image: msg`Text & Single Image`,
  text_and_images: msg`Text & Images`,
  images_only: msg`Images Only`,
  boxed_text: msg`Boxed Text`,
  activity_matching: msg`Activity: Matching`,
  activity_fill_in_a_table: msg`Activity: Fill in a Table`,
  activity_multiple_choice: msg`Activity: Multiple Choice`,
  activity_multi_select: msg`Activity: Multi-Select`,
  activity_underline_text: msg`Activity: Underline Text`,
  activity_true_false: msg`Activity: True / False`,
  activity_open_ended_answer: msg`Activity: Open-Ended Answer`,
  activity_fill_in_the_blank: msg`Activity: Fill in the Blank`,
  activity_sorting: msg`Activity: Sorting`,
  activity_other: msg`Activity: Other`,
  front_cover: msg`Front Cover`,
  inside_cover: msg`Inside Cover`,
  back_cover: msg`Back Cover`,
  separator: msg`Separator`,
  credits: msg`Credits`,
  foreword: msg`Foreword`,
  table_of_contents: msg`Table of Contents`,
  other: msg`Other`,
}

const SECTION_TYPE_DESC_MESSAGES: Record<string, MessageDescriptor> = {
  text_only: msg`A section containing only text content.`,
  text_and_single_image: msg`A section with text and a single image.`,
  text_and_images: msg`A section with text and multiple images.`,
  images_only: msg`A section containing only images.`,
  boxed_text: msg`A section with text in a highlighted box.`,
  activity_matching: msg`A matching activity where students connect related items.`,
  activity_fill_in_a_table: msg`A table-filling activity.`,
  activity_multiple_choice: msg`A multiple choice activity.`,
  activity_multi_select: msg`A select-all-that-apply activity where the learner can choose more than one option per question.`,
  activity_underline_text: msg`An activity where the learner underlines one or more words, phrases, or sentences directly in the text.`,
  activity_true_false: msg`A true or false activity.`,
  activity_open_ended_answer: msg`An open-ended answer activity.`,
  activity_fill_in_the_blank: msg`A fill-in-the-blank activity.`,
  activity_sorting: msg`A sorting activity.`,
  activity_other: msg`An activity that does not fit the standard categories.`,
  front_cover: msg`The front cover of the book.`,
  inside_cover: msg`The inside cover of the book.`,
  back_cover: msg`The back cover of the book.`,
  separator: msg`A separator page between sections.`,
  credits: msg`The credits page.`,
  foreword: msg`The foreword or introduction.`,
  table_of_contents: msg`The table of contents.`,
  other: msg`Any other section type.`,
}

export function getSectionTypeGroupLabel(groupId: string): string {
  const descriptor = SECTION_GROUP_LABEL_MESSAGES[groupId]
  return descriptor ? i18n._(descriptor) : groupId
}

export function getSectionTypeLabel(value: string): string {
  const descriptor = SECTION_TYPE_LABEL_MESSAGES[value]
  if (descriptor) return i18n._(descriptor)
  return value.replace(/_/g, " ")
}

export function getSectionTypeDescription(value: string): string | undefined {
  const descriptor = SECTION_TYPE_DESC_MESSAGES[value]
  return descriptor ? i18n._(descriptor) : undefined
}

export function getSectionTypeLabelMsg(value: string): MessageDescriptor | undefined {
  return SECTION_TYPE_LABEL_MESSAGES[value]
}

export function getSectionTypeDescMsg(value: string): MessageDescriptor | undefined {
  return SECTION_TYPE_DESC_MESSAGES[value]
}
