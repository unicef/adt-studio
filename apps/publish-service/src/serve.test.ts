import { describe, expect, it } from "vitest"
import { conditionalEtag } from "./serve.js"

describe("conditionalEtag", () => {
  it("strips the quotes browsers echo back", () => {
    expect(conditionalEtag('"abc123"')).toBe("abc123")
  })

  it("strips a weak validator prefix", () => {
    expect(conditionalEtag('W/"abc123"')).toBe("abc123")
  })

  it("passes a bare etag through", () => {
    expect(conditionalEtag("abc123")).toBe("abc123")
  })

  it("falls back to unconditional for lists, wildcard and empty values", () => {
    expect(conditionalEtag('"a", "b"')).toBeUndefined()
    expect(conditionalEtag("*")).toBeUndefined()
    expect(conditionalEtag("  ")).toBeUndefined()
    expect(conditionalEtag(undefined)).toBeUndefined()
  })
})
