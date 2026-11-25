import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { SetupSettingId } from "@adt/types"
import { PRESETS, RENDER_STRATEGIES } from "@/components/wizard/core/constants"
import { SETTING_VALUE } from "../../../engine/words"

/**
 * The settings in the old wizard's own names (the user insists on them): Preset, Render Strategy,
 * Page Grouping, Section Mode, Activities, Figure Extraction, with the wizard's value labels.
 */
export const SETTING_LABEL: Record<SetupSettingId, MessageDescriptor> = {
  preset: msg`Preset`,
  renderStrategy: msg`Render Strategy`,
  pageGrouping: msg`Page Grouping`,
  sectioningMode: msg`Section Mode`,
  activitiesGenerator: msg`Activities`,
  figureExtraction: msg`Figure Extraction`,
}

const PRESET_VALUES = PRESETS.filter((p) => p.id !== "custom").map((p) => ({ value: p.id as string, title: p.title }))
const STRATEGY_VALUES = RENDER_STRATEGIES.filter((r) => !("hidden" in r && r.hidden)).map((r) => ({ value: r.id as string, title: r.title }))

/** Every value a setting can take here, in the wizard's order, with its wizard label. */
export const SETTING_OPTIONS: Record<SetupSettingId, { value: string | boolean; title: MessageDescriptor }[]> = {
  preset: PRESET_VALUES,
  renderStrategy: STRATEGY_VALUES,
  pageGrouping: [
    { value: "single", title: msg`Single Page` },
    { value: "spread", title: msg`Spread` },
  ],
  sectioningMode: [
    { value: "page", title: msg`Per Page` },
    { value: "dynamic", title: msg`Dynamic` },
  ],
  activitiesGenerator: [
    { value: true, title: msg`On` },
    { value: false, title: msg`Off` },
  ],
  figureExtraction: [
    { value: "auto", title: msg`Auto` },
    { value: "off", title: msg`Off` },
  ],
}

export function valueTitle(id: SetupSettingId, value: string | boolean | undefined): MessageDescriptor | undefined {
  return SETTING_OPTIONS[id].find((o) => o.value === value)?.title
}

/** "It's a story." — the kind of book, said once the readings agree on it. */
export const KIND_SAYS: Record<string, MessageDescriptor> = {
  story: msg`It's a story.`,
  textbook: msg`It's a school book.`,
  reference: msg`It's an information book.`,
}

/** Why a question is put to the user, in the assistant's voice. */
export const ASK_WHY: Record<string, MessageDescriptor> = {
  "readings-disagree": msg`My two readings disagree on this one, so I'd rather ask you.`,
  "few-body-pages": msg`The book has only a few pages to go on, so I'd rather ask you.`,
}

/** The questions, short enough to read at a glance (the engine's long wording is behind "Why?"). */
export const QUESTION_SHORT: Record<string, MessageDescriptor> = {
  genre: msg`What is this book mostly?`,
  exercises: msg`Does the reader write or mark answers?`,
  composition: msg`Where are the words on a page?`,
  diagrams: msg`Are there labelled pictures, like maps or diagrams?`,
}

/** One line under each answer. */
export const FACT_HINT: Record<string, Record<string, MessageDescriptor>> = {
  genre: { story: msg`Characters and events, start to end.`, textbook: msg`Lessons with tasks for the learner.`, reference: msg`Information to look up, no tasks.` },
  exercises: { none: msg`Only reading, colouring or drawing.`, some: msg`Answers to write on a few pages.`, many: msg`Answers to write on most pages.` },
  composition: { "text-in-art": msg`Inside the picture, even on a calm part like the sky.`, "text-beside-art": msg`In their own area outside the picture.`, "text-mostly": msg`Mostly text, few pictures.` },
  diagrams: { none: msg`Only illustrations or photos.`, some: msg`A few maps, charts or diagrams.`, many: msg`Maps, charts or diagrams on many pages.` },
}

/** A setting's value in plain words ("Picture beside the words"); the wizard label when there are none. */
export function plainTitle(id: SetupSettingId, value: string | boolean | undefined): MessageDescriptor | undefined {
  return SETTING_VALUE[id]?.[String(value)]?.name ?? valueTitle(id, value)
}
