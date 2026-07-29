/**
 * Sign-language videos can be attached to glossary items by assigning the
 * video's `sectionId` to the glossary item's text-catalog id (`gl001`,
 * `gl002`, … or `gl_manual_*`). These helpers keep the id computation and
 * detection in one place.
 */

/** Matches glossary text-catalog ids: `gl001`-style or `gl_manual_*`. */
const GLOSSARY_SECTION_ID_RE = /^gl(?:\d{3}|_manual_)/

/**
 * True when a sign-language video's `sectionId` points at a glossary item
 * (rather than a storyboard page section). Such videos must be excluded from
 * page-section assignment lists and counts in the Sign Language stage.
 */
export function isGlossaryVideoSectionId(sectionId: string | null | undefined): boolean {
  return !!sectionId && GLOSSARY_SECTION_ID_RE.test(sectionId)
}

/**
 * Text-catalog id for a glossary item. Mirrors the pipeline's
 * `getGlossaryItemTextId`: the item's own id when present, otherwise a
 * positional `gl001`-style id where `index` is the item's position in the
 * FULL items array (including pruned items — do not filter first).
 */
export function getGlossaryItemTextId(item: { id?: string }, index: number): string {
  return item.id?.trim() || `gl${String(index + 1).padStart(3, "0")}`
}
