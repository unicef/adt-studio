import { msg } from "@lingui/core/macro"

const SOURCE_ACTIVITY_PRESET = { key: "replicate", label: msg`From the book`, mode: "auto",
  template: msg`Recreate an exercise from this page as an interactive activity. Preserve its language, wording, numbers and learning objective. If essential content is missing, explain what is needed instead of inventing it.` } as const

export const ACTIVITY_PRESETS = [
  SOURCE_ACTIVITY_PRESET,
  { key: "multiple-choice", label: msg`Multiple choice`, mode: "templated",
    template: msg`Generate a 4-option multiple-choice question testing comprehension of this page.` },
  { key: "multi-select", label: msg`Select all that apply`, mode: "templated",
    template: msg`Create a multi-select activity based on this page. Clearly ask the learner to select all correct answers.` },
  { key: "fill-in-the-blank", label: msg`Fill in the blank`, mode: "templated",
    template: msg`Generate a fill-in-the-blank activity with 3 sentences based on this page.` },
  { key: "true-false", label: msg`True / false`, mode: "templated",
    template: msg`Generate 3 true/false statements about the content of this page.` },
  { key: "matching", label: msg`Matching pairs`, mode: "templated",
    template: msg`Create a matching activity from this page. Learners must be able to select an item and its destination using a keyboard or taps, as well as drag it.` },
  { key: "sorting", label: msg`Sorting`, mode: "templated",
    template: msg`Create a sorting activity from this page with clearly named categories and keyboard and tap alternatives to dragging.` },
  { key: "ordering", label: msg`Ordering`, mode: "templated",
    template: msg`Create an ordering activity from this page with one defensible sequence. Include visible controls for moving items without dragging.` },
  { key: "table", label: msg`Complete a table`, mode: "templated",
    template: msg`Create a table-completion activity from this page. Give every answer field its row and column context.` },
  { key: "underline", label: msg`Mark words`, mode: "templated",
    template: msg`Create an underline-text activity using a passage from this page. Keep sentence context and make each selectable word operable by keyboard.` },
  { key: "open-ended", label: msg`Open-ended question`, mode: "templated",
    template: msg`Generate an open-ended reflection question about this page.` },
] as const

export const AI_ACTIVITY_PRESETS = [
  SOURCE_ACTIVITY_PRESET,
  { key: "suggest", label: msg`Suggest an activity`, mode: "auto",
    template: msg`Create an activity based on this page. Choose a suitable activity type and layout for its content and learning objective.` },
] as const
