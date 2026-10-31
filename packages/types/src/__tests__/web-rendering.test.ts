import { describe, expect, it } from "vitest"
import { htmlEditLLMSchema } from "../web-rendering.js"

describe("htmlEditLLMSchema", () => {
  it("describes the feasibility contract so book-level prompt overrides still receive it", () => {
    expect(htmlEditLLMSchema.shape.feasible.description).toContain("new or changed images")
    expect(htmlEditLLMSchema.shape.unsupported_reason.description).toContain("Empty when feasible is true")
    expect(htmlEditLLMSchema.shape.content.description).toContain("unchanged when feasible is false")
  })
})
