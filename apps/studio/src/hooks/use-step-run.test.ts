import { describe, expect, it } from "vitest"
import { getTargetStepsForRange, isFinalPipelineStepForUiStep } from "./step-run-range"
import {
  getInvalidationKeysForUiStep,
  getMetadataInvalidationKeys,
} from "./step-run-invalidation"

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

describe("step run invalidation keys", () => {
  it("includes pages/book/list and step-status when extract completes", () => {
    const keys = getInvalidationKeysForUiStep("sample-book", "extract")
    expect(keys).toEqual([
      ["books", "sample-book", "pages"],
      ["books", "sample-book"],
      ["books"],
      ["books", "sample-book", "step-status"],
    ])
  })

  it("includes only step-specific key plus step-status for quizzes", () => {
    const keys = getInvalidationKeysForUiStep("sample-book", "quizzes")
    expect(keys).toEqual([
      ["books", "sample-book", "quizzes"],
      ["books", "sample-book", "step-status"],
    ])
  })

  it("refreshes book and books list when metadata completes", () => {
    const keys = getMetadataInvalidationKeys("sample-book")
    expect(keys).toEqual([
      ["books", "sample-book"],
      ["books"],
    ])
  })
})
