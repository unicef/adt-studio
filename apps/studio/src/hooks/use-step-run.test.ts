import { describe, expect, it } from "vitest"
import { getTargetStepsForRange, isFinalPipelineStepForUiStep } from "./step-run-range"

describe("getTargetStepsForRange", () => {
  it("returns all steps in an inclusive valid range", () => {
    const steps = Array.from(getTargetStepsForRange("extract", "glossary"))
    expect(steps).toEqual([
      "extract",
      "storyboard",
      "quizzes",
      "captions",
      "glossary",
    ])
  })

  it("returns a single step for same from/to", () => {
    const steps = Array.from(getTargetStepsForRange("translations", "translations"))
    expect(steps).toEqual(["translations"])
  })

  it("falls back to endpoint set for invalid ranges", () => {
    const steps = Array.from(getTargetStepsForRange("preview", "extract"))
    expect(steps).toEqual(["preview", "extract"])
  })

  it("recognizes terminal sub-steps for ui steps", () => {
    expect(isFinalPipelineStepForUiStep("extract", "translation")).toBe(true)
    expect(isFinalPipelineStepForUiStep("storyboard", "web-rendering")).toBe(true)
    expect(isFinalPipelineStepForUiStep("extract", "metadata")).toBe(false)
  })
})
