import type { TocEntry } from "@adt/types"
import type { PageEntry } from "../reading-order.js"

/**
 * Put TOC entries in document order.
 *
 * The LLM emits entries in its own order, and the TOC editor persists whatever
 * order the user leaves — neither tracks the reading order, and a reorder never
 * rewrites the `toc-generation` node. Every consumer of a TOC needs document
 * order regardless: WebPub's nav nests a flat list by `level` as it walks it,
 * NCX `playOrder` must increase monotonically, and an EPUB whose nav disagrees
 * with its own spine is simply wrong.
 *
 * `pageList` is the packaged reading order, so its index *is* the position.
 * Entries whose section is not in it keep their relative order at the end
 * rather than being silently dropped — a TOC entry pointing at a pruned or
 * deleted section is the author's problem to see, not ours to hide.
 *
 * Shared by `content/toc.json`, the EPUB nav document and the PNLD nav
 * document, because three copies of this sort is how they drifted apart.
 */
export function sortTocEntriesByPageList(
  entries: readonly TocEntry[],
  pageList: readonly PageEntry[]
): TocEntry[] {
  const positionById = new Map(pageList.map((page, index) => [page.section_id, index]))
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const posA = positionById.get(a.entry.sectionId) ?? Infinity
      const posB = positionById.get(b.entry.sectionId) ?? Infinity
      return posA === posB ? a.index - b.index : posA - posB
    })
    .map(({ entry }) => entry)
}
