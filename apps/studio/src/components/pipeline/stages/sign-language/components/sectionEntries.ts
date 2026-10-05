import { msg } from "@lingui/core/macro"
import type { I18n } from "@lingui/core"
import type { PageSummaryItem } from "@/api/client"
import type { SectionEntry } from "./types"

/**
 * The page sections a sign-language video can be attached to, in reading order.
 *
 * A page with a single section is labelled by its page alone — that is what a
 * reader thinks of as "the video for page 4". Only when a page carries several
 * sections does the label need to disambiguate which one. Pruned sections are
 * left out: they are not rendered, so a video on one would never play.
 *
 * Shared by the Sign Language landing and step so both offer the same list and
 * the same labels.
 */
export function buildSectionEntries(
  pages: PageSummaryItem[] | undefined,
  i18n: I18n,
): SectionEntry[] {
  if (!pages) return []
  return pages.flatMap((page) => {
    const sections = (page.sections ?? []).filter((section) => !section.isPruned)
    if (sections.length === 0) return []
    const pageLabel = i18n._(msg`Page ${page.pageNumber}`)
    if (sections.length === 1) {
      return [
        {
          sectionId: sections[0].sectionId,
          sectionIndex: sections[0].sectionIndex,
          pageNumber: page.pageNumber,
          pageLabel,
          sectionLabel: pageLabel,
        },
      ]
    }
    return sections.map((section, index) => ({
      sectionId: section.sectionId,
      sectionIndex: section.sectionIndex,
      pageNumber: page.pageNumber,
      pageLabel,
      sectionLabel: i18n._(msg`Page ${page.pageNumber} — Section ${index + 1}`),
    }))
  })
}
