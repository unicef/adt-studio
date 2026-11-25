import { describe, expect, it } from "vitest"
import { onlyStylesChanged } from "./ReaderPreviewPane"

describe("onlyStylesChanged", () => {
  it("is true only when every changed draft is a stylesheet", () => {
    expect(onlyStylesChanged({}, { "styles/globals.css": "a" })).toBe(true)
    expect(onlyStylesChanged({ "styles/globals.css": "a" }, {})).toBe(true)
    expect(onlyStylesChanged({ "styles/globals.css": "a" }, { "styles/globals.css": "a", "boot.tsx": "x" })).toBe(false)
    expect(onlyStylesChanged({ "styles/globals.css": "a" }, { "styles/globals.css": "a" })).toBe(false)
    expect(onlyStylesChanged(null, { "styles/globals.css": "a" })).toBe(false)
  })
})
