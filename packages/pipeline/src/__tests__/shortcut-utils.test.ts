import { describe, expect, it } from "vitest"
import { isTypingTarget } from "../../../../assets/adt/modules/activities/shortcut-utils.js"

describe("isTypingTarget", () => {
  it("returns true for interactive form elements", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true)
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true)
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true)
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(true)
  })

  it("returns true for contenteditable targets", () => {
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true)
  })

  it("returns false for non-interactive targets", () => {
    expect(isTypingTarget({ tagName: "DIV" })).toBe(false)
    expect(isTypingTarget({})).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
