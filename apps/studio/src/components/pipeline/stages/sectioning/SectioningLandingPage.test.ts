import { describe, expect, it } from "vitest"
import { resolveSectioningStartStage } from "./SectioningLandingPage.helpers"

describe("resolveSectioningStartStage", () => {
  it("starts at Sectioning for assembled books that already contain extracted pages", () => {
    expect(resolveSectioningStartStage(false, true)).toBe("sectioning")
  })

  it("includes Extract for normal books whose extraction is incomplete", () => {
    expect(resolveSectioningStartStage(false, false)).toBe("extract")
  })

  it("does not rerun Extract when it is already complete or running", () => {
    expect(resolveSectioningStartStage(true, false)).toBe("sectioning")
  })
})
