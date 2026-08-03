import { describe, expect, it } from "vitest"
import { parseBookStepSearch } from "./book-step-search"

describe("parseBookStepSearch", () => {
  it("keeps supported search values", () => {
    expect(parseBookStepSearch({
      tab: "reviewer",
      previewHref: "chapter.html",
      sectionId: "pg001_sec002",
      ignored: "value",
    })).toEqual({
      tab: "reviewer",
      previewHref: "chapter.html",
      sectionId: "pg001_sec002",
    })
  })

  it("drops empty and non-string values", () => {
    expect(parseBookStepSearch({ tab: "", previewHref: 3, sectionId: null })).toEqual({})
  })
})
