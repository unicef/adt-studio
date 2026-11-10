import { describe, expect, it } from "vitest"
import type { EasyReadSectionBlock } from "@/api/client"
import { entryCount, filterBlocks, firstLine, groupByPage, pageSearchText, takeEntries } from "./easyReadPages"

function block(pageId: string, pageNumber: number, sectionIndex: number, sectionType: string, texts: Array<[string, string]>): EasyReadSectionBlock {
  return {
    pageId,
    pageNumber,
    sectionId: `${pageId}_sec${sectionIndex}`,
    sectionIndex,
    sectionType,
    entries: texts.map(([originalText, text], index) => ({
      sourceId: `${pageId}_${sectionIndex}_${index}`,
      easyReadId: `${pageId}_${sectionIndex}_${index}_er`,
      originalText,
      text,
      pageId,
      sectionId: `${pageId}_sec${sectionIndex}`,
      sectionIndex,
    })),
  }
}

const blocks = [
  block("pg001", 1, 0, "front_cover", [["ADAPTAÇÃO", "Adaptação"], ["  ", ""]]),
  block("pg002", 2, 0, "text_only", [["The inclement weather", "The bad weather"]]),
  block("pg002", 2, 1, "activity", [["Answer the question", "Answer this"], ["Draw a cat", "Draw a cat"]]),
]

describe("easyReadPages", () => {
  it("groups blocks by page in book order", () => {
    const pages = groupByPage(blocks)
    expect(pages.map((page) => [page.pageId, page.blocks.length])).toEqual([
      ["pg001", 1],
      ["pg002", 2],
    ])
    expect(entryCount(blocks)).toBe(5)
  })

  it("keeps only the entries that match, or the whole section when its type matches", () => {
    expect(filterBlocks(blocks, "bad").map((found) => found.entries.map((entry) => entry.text))).toEqual([["The bad weather"]])
    expect(filterBlocks(blocks, "INCLEMENT")[0].pageId).toBe("pg002")
    expect(filterBlocks(blocks, "cat")[0].entries).toHaveLength(1)
    expect(filterBlocks(blocks, "front cover")[0].entries).toHaveLength(2)
    expect(filterBlocks(blocks, "Capa", () => "Capa")).toHaveLength(3)
    expect(filterBlocks(blocks, "  ")).toHaveLength(3)
    expect(filterBlocks(blocks, "zzz")).toEqual([])
  })

  it("reads the first line and the search text of a page", () => {
    expect(firstLine(blocks)).toBe("Adaptação")
    expect(firstLine([block("pg009", 9, 0, "x", [["Only original", " "]])])).toBe("Only original")
    expect(firstLine([])).toBeUndefined()
    expect(pageSearchText(blocks.slice(1, 2))).toBe("The bad weather\nThe inclement weather")
  })

  it("takes the first entries across sections", () => {
    const taken = takeEntries(blocks.slice(1), 2)
    expect(taken.map((found) => found.entries.length)).toEqual([1, 1])
    expect(takeEntries(blocks, 0)).toEqual([])
  })
})
