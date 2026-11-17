import { describe, expect, it } from "vitest"
import { ReaderUiConfig } from "@adt/types"
import { normalizeReaderUi, sameReaderUi } from "./normalize"

describe("reader UI draft comparison", () => {
  it("equals what the API saves, even though validation reorders the keys", () => {
    // Insertion order as the editor builds it (preset first, then edits).
    const draft = {
      light: { popover: "#fffbf2", foreground: "#2b1d0e", primary: "#7c3aed" },
      layout: { panel_behavior: "push" as const, dock_position: "left" as const },
      radius: 1.25,
    }
    // What comes back from the server: zod returns keys in schema order.
    const saved = ReaderUiConfig.parse(normalizeReaderUi(draft))
    expect(Object.keys(saved.light ?? {})).toEqual(["foreground", "popover", "primary"])
    expect(sameReaderUi(draft, saved)).toBe(true)
  })

  it("still sees a real change", () => {
    expect(sameReaderUi({ light: { primary: "#000000" } }, { light: { primary: "#111111" } })).toBe(false)
  })

  it("ignores empty groups, blank values and the default font", () => {
    expect(sameReaderUi({ light: { primary: "  " }, dark: {}, layout: {}, font: "default" }, {})).toBe(true)
  })
})
