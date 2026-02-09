import { describe, expect, it } from "vitest"
import { parseBookLabel } from "../book.js"

describe("parseBookLabel", () => {
  it("returns valid labels", () => {
    expect(parseBookLabel("valid-book_1.2")).toBe("valid-book_1.2")
  })

  it("includes zod issue details for invalid labels", () => {
    expect(() => parseBookLabel("../escape")).toThrow(
      "Label must be filesystem-safe"
    )
  })
})
