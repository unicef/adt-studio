import { describe, expect, it } from "vitest"
import { rerunBlock } from "./rerunGate"

describe("rerunBlock", () => {
  const ready = { hasUnsaved: false, prereqMet: true, hasProvider: true }

  it("lets a ready stage re-run", () => {
    expect(rerunBlock(ready)).toBeNull()
  })

  it("holds a re-run while the screen has unsaved edits, before any other reason", () => {
    expect(rerunBlock({ ...ready, hasUnsaved: true })).toBe("unsaved")
    expect(rerunBlock({ hasUnsaved: true, prereqMet: false, hasProvider: false })).toBe("unsaved")
  })

  it("then explains a missing upstream stage, then missing AI access", () => {
    expect(rerunBlock({ ...ready, prereqMet: false })).toBe("prereq")
    expect(rerunBlock({ ...ready, hasProvider: false })).toBe("provider")
  })
})
