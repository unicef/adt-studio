import { describe, expect, it } from "vitest"
import {
  STAGES,
  STAGE_DESCRIPTIONS,
  getBookOverviewStages,
  getPipelineStages,
  isBookOverviewStage,
  isPipelineStage,
  isStageCompleted,
  toCamelLabel,
} from "./stage-config"

describe("stage-config", () => {
  it("returns pipeline stages in order and excludes the book overview stage", () => {
    const pipelineSlugs = getPipelineStages().map((stage) => stage.slug)
    expect(pipelineSlugs).toEqual([
      "extract",
      "sectioning",
      "storyboard",
      "captions",
      "quizzes",
      "glossary",
      "toc",
      "easy-read",
      "translate",
      "speech",
      "preview",
    ])
  })

  it("returns book overview stages including validation before preview and export", () => {
    const overviewSlugs = getBookOverviewStages().map((stage) => stage.slug)
    expect(overviewSlugs).toEqual([
      "extract",
      "sectioning",
      "storyboard",
      "captions",
      "quizzes",
      "glossary",
      "toc",
      "easy-read",
      "sign-language",
      "translate",
      "speech",
      "validation",
      "preview",
      "export",
    ])
  })

  it("includes validation as a non-pipeline stage", () => {
    expect(STAGES.map((stage) => stage.slug)).toContain("validation")
    expect(STAGES.filter(isBookOverviewStage).map((stage) => stage.slug)).toContain("validation")
  })

  it("provides a description for every non-book stage", () => {
    for (const stage of STAGES.filter(isBookOverviewStage)) {
      expect(STAGE_DESCRIPTIONS[stage.slug]).toBeTruthy()
    }

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
