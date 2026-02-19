import { describe, expect, it } from "vitest"
import { getTargetStepsForRange, isFinalPipelineStepForUiStep } from "./step-run-range"
import { ALL_MAPPED_STEP_NAMES, PIPELINE_TO_UI_STEP } from "./step-mapping"
import { StepName } from "@adt/types"
import {
  getInvalidationKeysForUiStep,
  getMetadataInvalidationKeys,
} from "./step-run-invalidation"

describe("step mapping exhaustiveness", () => {
  it("every pipeline StepName is mapped to a stage", () => {
    for (const step of StepName.options) {
      expect(
        ALL_MAPPED_STEP_NAMES.has(step),
        `StepName "${step}" is not in ALL_STEP_NAMES`,
      ).toBe(true)
    }
  })

  it("PIPELINE_TO_UI_STEP covers every StepName", () => {
    for (const step of StepName.options) {
      expect(
        PIPELINE_TO_UI_STEP[step],
        `StepName "${step}" has no entry in STEP_TO_STAGE`,
      ).toBeDefined()
    }
  })
})

describe("getTargetStepsForRange", () => {
  it("returns all stages in an inclusive valid range", () => {
    const steps = Array.from(getTargetStepsForRange("extract", "glossary"))
    expect(steps).toEqual([
      "extract",
      "storyboard",
      "quizzes",
      "captions",
      "glossary",
    ])
  })

  it("returns a single stage for same from/to", () => {
    const steps = Array.from(getTargetStepsForRange("text-and-speech", "text-and-speech"))
    expect(steps).toEqual(["text-and-speech"])
  })

  it("falls back to endpoint set for invalid ranges", () => {
    const steps = Array.from(getTargetStepsForRange("preview", "extract"))
    expect(steps).toEqual(["preview", "extract"])
  })

  it("recognizes terminal sub-steps for stages", () => {
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
