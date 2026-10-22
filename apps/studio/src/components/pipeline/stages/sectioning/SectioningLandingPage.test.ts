import { describe, expect, it } from "vitest"
import { resolveSectioningStartStage } from "./SectioningLandingPage.helpers"

describe("resolveSectioningStartStage", () => {
  it("starts at Sectioning for any book with pages, even without completed Extract", () => {
    expect(resolveSectioningStartStage(false, true)).toBe("sectioning")
  })

  it("includes Extract only for books without extracted pages", () => {
    expect(resolveSectioningStartStage(false, false)).toBe("extract")
  })

  it("does not rerun Extract when it is already complete or running", () => {
    expect(resolveSectioningStartStage(true, false)).toBe("sectioning")
  })
})
