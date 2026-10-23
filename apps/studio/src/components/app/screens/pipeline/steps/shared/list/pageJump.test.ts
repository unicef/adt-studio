import { describe, expect, it } from "vitest"
import { findPageByNumber } from "./pageJump"

const pages = [
  { pageId: "pg001", pageNumber: 1 },
  { pageId: "pg008009", pageNumber: 8 },
  { pageId: "pg010011", pageNumber: 10 },
]

describe("findPageByNumber", () => {
  it("finds a page by either side of a spread", () => {
    expect(findPageByNumber(pages, "8")?.pageId).toBe("pg008009")
    expect(findPageByNumber(pages, "9")?.pageId).toBe("pg008009")
    expect(findPageByNumber(pages, " 1 ")?.pageId).toBe("pg001")
  })

  it("returns nothing for pages that aren't in the list", () => {
    expect(findPageByNumber(pages, "4")).toBeNull()
    expect(findPageByNumber(pages, "abc")).toBeNull()
  })
})
