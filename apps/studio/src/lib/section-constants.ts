export const SECTION_TYPES = [
  // Content
  { value: "text_only", label: "Text Only" },
  { value: "text_and_single_image", label: "Text & Single Image" },
  { value: "text_and_images", label: "Text & Images" },
  { value: "images_only", label: "Images Only" },
  { value: "boxed_text", label: "Boxed Text" },
  // Activities
  { value: "activity_matching", label: "Activity: Matching" },
  { value: "activity_fill_in_a_table", label: "Activity: Fill in a Table" },
  { value: "activity_multiple_choice", label: "Activity: Multiple Choice" },
  { value: "activity_true_false", label: "Activity: True / False" },
  { value: "activity_open_ended_answer", label: "Activity: Open-Ended Answer" },
  { value: "activity_fill_in_the_blank", label: "Activity: Fill in the Blank" },
  { value: "activity_sorting", label: "Activity: Sorting" },
  // Structure
  { value: "front_cover", label: "Front Cover" },
  { value: "inside_cover", label: "Inside Cover" },
  { value: "back_cover", label: "Back Cover" },
  { value: "separator", label: "Separator" },
  { value: "credits", label: "Credits" },
  { value: "foreword", label: "Foreword" },
  { value: "table_of_contents", label: "Table of Contents" },
  // Other
  { value: "other", label: "Other" },
] as const

export const SECTION_TYPE_GROUPS = [
  {
    label: "Content",
    types: SECTION_TYPES.filter(
      (t) =>
        ["text_only", "text_and_single_image", "text_and_images", "images_only", "boxed_text"].includes(t.value)
    ),
  },
  {
    label: "Activities",
    types: SECTION_TYPES.filter((t) => t.value.startsWith("activity_")),
  },
  {
    label: "Structure",
    types: SECTION_TYPES.filter((t) =>
      ["front_cover", "inside_cover", "back_cover", "separator", "credits", "foreword", "table_of_contents"].includes(
        t.value
      )
    ),
  },
  {
    label: "Other",
    types: SECTION_TYPES.filter((t) => t.value === "other"),
  },
] as const

export function getSectionTypeLabel(value: string): string {
  const found = SECTION_TYPES.find((t) => t.value === value)
  return found?.label ?? value
}
