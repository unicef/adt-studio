import { describe, expect, it, vi } from "vitest"

vi.mock("@lingui/core", () => ({ i18n: { _: (value: string) => value } }))
vi.mock("@lingui/core/macro", () => ({ msg: (parts: TemplateStringsArray) => parts.join("") }))
const { localizeExtractionError } = await import("./extraction-errors")

describe("extraction conflict guidance", () => {
  it.each([
    ["BOOK_BUSY", "active writer"],
    ["EXTRACTION_LEGACY", "no verified extraction"],
    ["EXTRACTION_INCOMPLETE", "Partial data has been kept"],
    ["EXTRACTION_SOURCE_CHANGED", "PDF has changed"],
    ["EXTRACTION_INPUTS_CHANGED", "settings have changed"],
    ["EXTRACTION_ASSETS_INVALID", "missing or damaged"],
    ["EXTRACTION_INPUT_INVALID", "invalid"],
    ["UNSAFE_RESUME_UNAVAILABLE", "no content was changed or generated"],
  ])("maps %s consistently for HTTP and queued errors", (code, text) => {
    expect(localizeExtractionError(`${code}: server diagnostic`)).toContain(text)
    expect(localizeExtractionError(`${code}: server diagnostic`)).not.toContain("server diagnostic")
  })
  it("preserves unrelated error messages", () => {
    expect(localizeExtractionError("A different failure")).toBe("A different failure")
  })
})
