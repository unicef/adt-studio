import type { EasyReadSectionBlock } from "@/api/client"

export interface EasyReadPage {
  pageId: string
  pageNumber: number
  blocks: EasyReadSectionBlock[]
}

export function entryCount(blocks: readonly EasyReadSectionBlock[]): number {
  return blocks.reduce((sum, block) => sum + block.entries.length, 0)
}

export function groupByPage(blocks: readonly EasyReadSectionBlock[]): EasyReadPage[] {
  const pages: EasyReadPage[] = []
  const indexOf = new Map<string, number>()
  for (const block of blocks) {
    let index = indexOf.get(block.pageId)
    if (index === undefined) {
      index = pages.length
      indexOf.set(block.pageId, index)
      pages.push({ pageId: block.pageId, pageNumber: block.pageNumber, blocks: [] })
    }
    pages[index].blocks.push(block)
  }
  return pages
}

export function filterBlocks(
  blocks: readonly EasyReadSectionBlock[],
  query: string,
  typeLabel: (sectionType: string) => string = (sectionType) => sectionType,
): EasyReadSectionBlock[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return [...blocks]
  const found: EasyReadSectionBlock[] = []
  for (const block of blocks) {
    const type = block.sectionType.replace(/_/g, " ").toLocaleLowerCase()
    if (type.includes(needle) || typeLabel(block.sectionType).toLocaleLowerCase().includes(needle)) {
      found.push(block)
      continue
    }
    const entries = block.entries.filter(
      (entry) => entry.originalText.toLocaleLowerCase().includes(needle) || entry.text.toLocaleLowerCase().includes(needle),
    )
    if (entries.length > 0) found.push(entries.length === block.entries.length ? block : { ...block, entries })
  }
  return found
}

export function firstLine(blocks: readonly EasyReadSectionBlock[]): string | undefined {
  for (const block of blocks) {
    for (const entry of block.entries) {
      const text = entry.text.trim() || entry.originalText.trim()
      if (text) return text
    }
  }
  return undefined
}

export function pageSearchText(blocks: readonly EasyReadSectionBlock[]): string {
  return blocks.flatMap((block) => block.entries.flatMap((entry) => [entry.text, entry.originalText])).join("\n")
}

export function takeEntries(blocks: readonly EasyReadSectionBlock[], limit: number): EasyReadSectionBlock[] {
  const kept: EasyReadSectionBlock[] = []
  let left = limit
  for (const block of blocks) {
    if (left <= 0) break
    if (block.entries.length <= left) {
      kept.push(block)
      left -= block.entries.length
    } else {
      kept.push({ ...block, entries: block.entries.slice(0, left) })
      left = 0
    }
  }
  return kept
}
