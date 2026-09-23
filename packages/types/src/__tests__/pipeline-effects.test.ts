import { describe, expect, it } from "vitest"
import {
  IMAGE_SET_CHANGE_CLEAR_NODE_TYPES,
  IMAGE_SET_CHANGE_CLEAR_STAGES,
  IMAGE_SET_CHANGE_CLEAR_STEPS,
  getStageClearNodes,
  getStageRerunClearNodes,
  getCacheResourcesForNode,
  getCacheResourcesForStageOutput,
  getCacheResourcesForStageClear,
} from "../pipeline-effects.js"
import { STAGE_ORDER } from "../pipeline.js"

describe("pipeline effects", () => {
  it("keeps image-set reset nodes, steps, and warning stages aligned", () => {
    expect(IMAGE_SET_CHANGE_CLEAR_NODE_TYPES).toContain("image-captioning")
    expect(IMAGE_SET_CHANGE_CLEAR_STEPS).toContain("image-translation")
    expect(IMAGE_SET_CHANGE_CLEAR_STAGES).toEqual([
      "captions",
      "easy-read",
      "translate",
      "speech",
      "package",
    ])
  })

  it("includes transitive downstream nodes in clear set", () => {
    expect(getStageClearNodes("quizzes")).toEqual([
      "quiz-generation",
      "catalog-translation",
      "core-tts-catalog",
      "image-translation",
      "text-catalog-translation",
      "tts",
      "word-timestamps",
      "package-web",
      "accessibility-assessment",
    ])
  })

  it("spares the glossary node only when the glossary stage is re-run", () => {
    expect(getStageClearNodes("glossary")).toContain("glossary")
    expect(getStageRerunClearNodes("glossary", "glossary")).not.toContain("glossary")
    expect(getStageRerunClearNodes("storyboard", "package")).not.toContain("glossary")
    expect(getStageClearNodes("storyboard")).toContain("glossary")
    expect(getStageRerunClearNodes("storyboard", "storyboard")).toContain("glossary")
  })

  it("keeps merge inputs while clearing derived speech timestamps", () => {
    const translateRerun = getStageRerunClearNodes("translate", "translate")
    expect(translateRerun).not.toContain("core-tts-catalog")

    const speechRerun = getStageRerunClearNodes("speech", "speech")
    expect(speechRerun).not.toContain("tts")
    expect(speechRerun).toContain("word-timestamps")
  })

  it("derives stage-clear cache resources from cleared nodes", () => {
    expect(getCacheResourcesForStageClear("quizzes")).toEqual([
      "pages",
      "quizzes",
      "text-catalog",
      "tts",
      "step-status",
      "debug",
    ])
  })

  it("derives stage-output cache resources from produced nodes", () => {
    expect(getCacheResourcesForStageOutput("translate")).toEqual([
      "pages",
      "text-catalog",
      "tts",
      "step-status",
    ])
    expect(getCacheResourcesForStageOutput("speech")).toEqual([
      "tts",
      "step-status",
    ])
    expect(getCacheResourcesForNode("word-timestamps")).toEqual(["tts"])
  })

  it("maps metadata node to book/list resources", () => {
    expect(getCacheResourcesForNode("metadata")).toEqual(["books", "book"])
  })

  it("never clears the reading order when a stage is re-run", () => {
    // `reading-order` holds the user's own arrangement of the book, not stage
    // output. Adding it to a stage's output nodes would make every storyboard
    // re-run delete it with no way back — the single most destructive mistake
    // available in this area, and an easy one to make by pattern-matching on
    // the other node names.
    for (const stage of STAGE_ORDER) {
      expect(getStageClearNodes(stage)).not.toContain("reading-order")
      expect(getStageRerunClearNodes(stage)).not.toContain("reading-order")
    }
  })
})
