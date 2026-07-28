/**
 * Glossary state atoms.
 *
 * Loaded from `./content/i18n/<lang>/glossary.json` on boot and again on
 * every language change. Matches the shape produced by
 * `packages/pipeline:buildGlossaryJson` — keyed by the term itself.
 */
import { ephemeralAtom } from "@/shared/state/persist"

export interface GlossaryEntry {
  word: string
  definition: string
  variations: string[]
  emoji: string
  /** Bundle-relative href of the term's picture (`images/<file>`). */
  image?: string
  /** Bundle-relative href of the term's sign-language video
   *  (`content/i18n/<lang>/video/sl_<id>.<ext>`). */
  video?: string
}

export type GlossaryData = Record<string, GlossaryEntry>

/** All glossary terms for the current language, keyed by the canonical term. */
export const glossaryDataAtom = ephemeralAtom<GlossaryData>({})

/** Free-text filter for the "Book glossary" tab. */
export const glossaryFilterAtom = ephemeralAtom<string>("")

/**
 * Element clicked in `#content` that triggered an in-page glossary popover.
 * Set by the highlighter; cleared when the popover closes. Holds a virtual
 * reference object so Radix Popover can position relative to a DOM node
 * outside React's render tree.
 */
export const glossaryPopoverAnchorAtom = ephemeralAtom<{
  termKey: string
  rect: DOMRect
} | null>(null)
