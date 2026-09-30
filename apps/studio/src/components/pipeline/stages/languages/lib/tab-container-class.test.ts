import { describe, expect, it } from "vitest"
import { tabContainerClass } from "./tab-container-class"

describe("tabContainerClass", () => {
  // The voices tab is a six-column table; max-w-2xl left ~130px per voice cell,
  // too narrow for `en-US-JennyNeural` or the ElevenLabs voice picker.
  it("gives the voices tab more room than the single-column forms", () => {
    expect(tabContainerClass("voices")).toContain("max-w-5xl")
    expect(tabContainerClass("general")).toContain("max-w-2xl")
  })

  // The prompt tab is a full-height editor that manages its own padding — it
  // must not inherit the forms' p-4/space-y-6.
  it("leaves the full-height prompt tab unpadded and unconstrained", () => {
    expect(tabContainerClass("prompt")).toBe("h-full w-full")
  })

  it("falls back to the constrained form layout for unknown tabs", () => {
    expect(tabContainerClass("something-new")).toBe("p-4 max-w-2xl space-y-6")
  })
})
