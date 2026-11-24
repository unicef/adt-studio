import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { SetupBookFactId, SetupSettingId } from "@adt/types"
import { BookOpen, Columns2, Image, LayoutTemplate, Puzzle, Rows3, type LucideIcon } from "lucide-react"
import { PRESETS, RENDER_STRATEGIES } from "@/components/wizard/core/constants"
import { SETTING_VALUE } from "../../engine/words"

/**
 * The old wizard's names for every setting and value (Preset, Render Strategy, Page Grouping Mode,
 * Section Mode, Activities, Figure Extraction), from the same message descriptors where they exist.
 */
export const SETTING_LABEL: Record<SetupSettingId, MessageDescriptor> = {
  preset: msg`Preset`,
  renderStrategy: msg`Render Strategy`,
  pageGrouping: msg`Page Grouping Mode`,
  sectioningMode: msg`Section Mode`,
  activitiesGenerator: msg`Activities`,
  figureExtraction: msg`Figure Extraction`,
}

export const SETTING_ICON: Record<SetupSettingId, LucideIcon> = {
  preset: BookOpen,
  renderStrategy: LayoutTemplate,
  pageGrouping: Columns2,
  sectioningMode: Rows3,
  activitiesGenerator: Puzzle,
  figureExtraction: Image,
}

export type Choice = { value: string; title: MessageDescriptor; hint: MessageDescriptor }

const strategy = (id: string): Choice => {
  const r = RENDER_STRATEGIES.find((s) => s.id === id)!
  return { value: id, title: r.title, hint: SETTING_VALUE.renderStrategy[id]?.means ?? r.description }
}

/** Every value a setting can take here, in the order the rail lists them. */
export const CHOICES: Record<SetupSettingId, Choice[]> = {
  preset: PRESETS.filter((p) => p.id !== "custom").map((p) => ({ value: p.id, title: p.title, hint: SETTING_VALUE.preset[p.id]?.means ?? p.description })),
  renderStrategy: ["llm", "llm-overlay", "single_column", "two_column_story", "fixed_layout"].map(strategy),
  pageGrouping: [
    { value: "single", title: msg`Single`, hint: msg`Every page becomes its own screen, one after another.` },
    { value: "spread", title: msg`Spread`, hint: msg`Facing pages join into one wide screen, so a picture across the gutter stays whole.` },
  ],
  sectioningMode: [
    { value: "page", title: msg`Page`, hint: msg`The entire page is treated as a single section.` },
    { value: "dynamic", title: msg`Dynamic`, hint: msg`Splits a page when it has several distinct activities.` },
  ],
  activitiesGenerator: [
    { value: "true", title: msg`On`, hint: SETTING_VALUE.activitiesGenerator.true.means },
    { value: "false", title: msg`Off`, hint: SETTING_VALUE.activitiesGenerator.false.means },
  ],
  figureExtraction: [
    { value: "auto", title: msg`Auto`, hint: SETTING_VALUE.figureExtraction.auto.means },
    { value: "off", title: msg`Off`, hint: SETTING_VALUE.figureExtraction.off.means },
  ],
}

export const choiceOf = (id: SetupSettingId, value: string | boolean): Choice | undefined => CHOICES[id].find((c) => c.value === String(value))

/** A short name for each fact, for the rail's "what we read" list. */
export const FACT_NAME: Record<SetupBookFactId, MessageDescriptor> = {
  genre: msg`Kind of book`,
  exercises: msg`Exercises for the reader`,
  composition: msg`Where the words sit`,
  diagrams: msg`Labelled pictures`,
}

export const PAGE_STORAGE: Record<string, MessageDescriptor> = {
  "single-pages": msg`One page per PDF page`,
  "spreads-as-separate-pages": msg`Facing pages that make one picture`,
  "spreads-as-wide-pages": msg`Two pages side by side on each PDF page`,
}

export const TEXT_LAYER_SHORT: Record<string, MessageDescriptor> = {
  digital: msg`Real text`,
  scanned: msg`Scanned pages`,
  "scanned-with-ocr": msg`Scan with hidden text`,
  mixed: msg`Some pages scanned`,
}
