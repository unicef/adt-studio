import { describe, expect, it } from "vitest"
import { classifyCreateError } from "./useBookCreation"

describe("classifyCreateError", () => {
  it("recognises a name taken meanwhile (the API's 409 message)", () => {
    expect(classifyCreateError(new Error("Book already exists: volcanoes"))).toEqual({ kind: "taken", detail: "Book already exists: volcanoes" })
  })
  it("treats anything else as a failed create, keeping the message", () => {
    expect(classifyCreateError(new Error("Request failed: 500"))).toEqual({ kind: "failed", detail: "Request failed: 500" })
    expect(classifyCreateError("boom").kind).toBe("failed")
  })
})
