import { describe, expect, it } from "vitest"
import { toBookMetadata } from "../metadata-model.js"

describe("toBookMetadata", () => {
  it("maps title and author into BookMetadata shape", () => {
    const result = toBookMetadata({
      title: "The Raven",
      author: "Edgar Allan Poe",
      format: "PDF 1.5",
    })

    expect(result).toEqual({
      title: "The Raven",
      authors: ["Edgar Allan Poe"],
      publisher: null,
      language_code: null,
      cover_page_number: null,
      reasoning: "Extracted from embedded PDF metadata.",
    })
  })

  it("normalizes empty metadata values", () => {
    const result = toBookMetadata({
      title: "   ",
      author: "",
    })

    expect(result.title).toBeNull()
    expect(result.authors).toEqual([])
  })
})
