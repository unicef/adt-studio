import { describe, expect, it } from "vitest"
import {
  STAGES,
  STAGE_DESCRIPTIONS,
  getPipelineStages,
  isPipelineStage,
  isStageCompleted,
  toCamelLabel,
} from "./stage-config"

describe("stage-config", () => {
  it("returns pipeline stages in order and excludes the book overview stage", () => {
    const pipelineSlugs = getPipelineStages().map((stage) => stage.slug)
    expect(pipelineSlugs).toEqual([
      "extract",
      "storyboard",
      "quizzes",
      "captions",
      "glossary",
      "text-and-speech",
      "preview",
    ])
  })

  it("provides a description for every pipeline stage", () => {
    for (const stage of STAGES.filter(isPipelineStage)) {
      expect(STAGE_DESCRIPTIONS[stage.slug]).toBeTruthy()
    }
  })

  it("converts labels to upper camel case", () => {
    expect(toCamelLabel("my-book_label")).toBe("MyBookLabel")
  })

  it("tracks completion flags by stage slug", () => {
    expect(isStageCompleted("extract", { extract: true })).toBe(true)
    expect(isStageCompleted("extract", { storyboard: true })).toBe(false)
  })
})
