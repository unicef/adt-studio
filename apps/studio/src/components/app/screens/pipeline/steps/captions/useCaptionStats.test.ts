import { describe, expect, it } from "vitest"
import { captionStats, pageMatchesCaptionFilter } from "./useCaptionStats"

const page = (pageId: string, captionCount: number, uncaptionedCount = 0, decorativeCount = 0) => ({
  pageId,
  captionCount,
  uncaptionedCount,
  decorativeCount,
})

describe("captionStats", () => {
  it("sums the page-summary counts and keeps only pages with captions or failures", () => {
    const pages = [page("pg001", 3, 1, 1), page("pg002", 0), page("pg003", 2), page("pg004", 0)]
    const stats = captionStats(pages, (id) => id === "pg004")
    expect(stats.total).toBe(5)
    expect(stats.toDescribe).toBe(1)
    expect(stats.decorative).toBe(1)
    expect(stats.navPages.map((entry) => entry.pageId)).toEqual(["pg001", "pg003", "pg004"])
  })

  it("filters pages by the images they hold", () => {
    const failed = (id: string) => id === "pg002"
    expect(pageMatchesCaptionFilter(page("pg001", 3, 1), "describe", failed)).toBe(true)
    expect(pageMatchesCaptionFilter(page("pg001", 3, 0), "describe", failed)).toBe(false)
    expect(pageMatchesCaptionFilter(page("pg001", 3, 0, 2), "decorative", failed)).toBe(true)
    expect(pageMatchesCaptionFilter(page("pg002", 1), "failed", failed)).toBe(true)
    expect(pageMatchesCaptionFilter(page("pg003", 1), "failed", failed)).toBe(false)
  })
})
