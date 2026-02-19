import { describe, expect, it } from "vitest"
import { getTargetStepsForRange, isFinalPipelineStepForUiStep } from "./step-run-range"
import { PIPELINE_TO_UI_STEP, ALL_MAPPED_STEP_NAMES } from "./step-mapping"
import type { StepName } from "./use-pipeline"
import {
  getInvalidationKeysForUiStep,
  getMetadataInvalidationKeys,
} from "./step-run-invalidation"

/**
 * All StepName values — keep in sync with the StepName type in use-pipeline.ts.
 * If a new step is added to StepName, add it here and the test below will
 * tell you to add it to step-mapping.ts.
 */
const ALL_STEP_NAMES: StepName[] = [
  "extract",
  "metadata",
  "text-classification",
  "book-summary",
  "translation",
  "image-classification",
  "page-sectioning",
  "web-rendering",
  "image-captioning",
  "glossary",
  "quiz-generation",
  "text-catalog",
  "catalog-translation",
  "tts",
  "package-web",
]

describe("step mapping exhaustiveness", () => {
  it("every StepName is mapped to a UI step", () => {
    for (const step of ALL_STEP_NAMES) {
      expect(
        ALL_MAPPED_STEP_NAMES.has(step),
        `StepName "${step}" is not mapped in step-mapping.ts — add it to UI_STEP_PIPELINE_STEPS`
      ).toBe(true)
    }
  })

  it("PIPELINE_TO_UI_STEP covers every StepName", () => {
    for (const step of ALL_STEP_NAMES) {
      expect(
        PIPELINE_TO_UI_STEP[step],
        `StepName "${step}" has no entry in PIPELINE_TO_UI_STEP`
      ).toBeDefined()
    }
  })
})

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
    expect(isFinalPipelineStepForUiStep("extract", "book-summary")).toBe(true)
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
