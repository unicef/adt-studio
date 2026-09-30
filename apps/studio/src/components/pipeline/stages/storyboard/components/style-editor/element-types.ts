/* eslint-disable lingui/no-unlocalized-strings -- internal identifier keys, never displayed */

export type ElementType =
  | "text"
  | "image"
  | "container"
  | "interactive"
  | "list"
  | "media"

const INTERACTIVE_TAGS = new Set([
  "button",
  "input",
  "select",
  "textarea",
  "a",
  "label",
])
const LIST_TAGS = new Set(["ul", "ol", "li", "dl", "dt", "dd"])
const MEDIA_TAGS = new Set(["audio", "video"])

export interface ElementTypeInput {
  isImage: boolean
  isContainer: boolean
  tagName?: string
}

export function inferElementType({
  isImage,
  isContainer,
  tagName,
}: ElementTypeInput): ElementType {
  if (isImage) return "image"
  const tag = tagName?.toLowerCase()
  if (tag) {
    if (MEDIA_TAGS.has(tag)) return "media"
    if (INTERACTIVE_TAGS.has(tag)) return "interactive"
    if (LIST_TAGS.has(tag)) return "list"
  }
  if (isContainer) return "container"
  return "text"
}

export type SectionKey =
  | "typography"
  | "appearance"
  | "spacing"
  | "sizing"
  | "layout"
  | "position"
  | "borders"
  | "imageFit"

export const ALL_SECTION_KEYS: ReadonlyArray<SectionKey> = [
  "layout",
  "sizing",
  "position",
  "spacing",
  "typography",
  "appearance",
  "borders",
  "imageFit",
]

// `position` (offset + rotate + transform) applies to every element type —
// text, images and containers alike — so it's included in each set.
const VISIBLE_SECTIONS: Record<ElementType, ReadonlySet<SectionKey>> = {
  text: new Set(["typography", "appearance", "spacing", "sizing", "position"]),
  image: new Set([
    "imageFit",
    "sizing",
    "spacing",
    "borders",
    "appearance",
    "position",
  ]),
  container: new Set([
    "layout",
    "spacing",
    "sizing",
    "appearance",
    "borders",
    "typography",
    "position",
  ]),
  interactive: new Set([
    "typography",
    "appearance",
    "spacing",
    "sizing",
    "layout",
    "borders",
    "position",
  ]),
  list: new Set([
    "typography",
    "spacing",
    "layout",
    "sizing",
    "appearance",
    "position",
  ]),
  media: new Set([
    "imageFit",
    "sizing",
    "spacing",
    "borders",
    "appearance",
    "position",
  ]),
}

export function isSectionVisible(
  type: ElementType,
  section: SectionKey
): boolean {
  return VISIBLE_SECTIONS[type].has(section)
}

export function getVisibleSections(type: ElementType): SectionKey[] {
  return ALL_SECTION_KEYS.filter((k) => VISIBLE_SECTIONS[type].has(k))
}
