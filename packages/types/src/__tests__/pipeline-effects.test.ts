import { describe, expect, it } from "vitest"
import {
  getStageClearNodes,
  getCacheResourcesForNode,
  getCacheResourcesForStageOutput,
  getCacheResourcesForStageClear,
} from "../pipeline-effects.js"

describe("pipeline effects", () => {
  it("includes transitive downstream nodes in clear set", () => {
    expect(getStageClearNodes("quizzes")).toEqual([
      "quiz-generation",
      "text-catalog",
      "catalog-translation",
      "tts",
      "text-catalog-translation",
      "package-web",
    ])
  })

  it("derives stage-clear cache resources from cleared nodes", () => {
    expect(getCacheResourcesForStageClear("quizzes")).toEqual([
      "quizzes",
      "text-catalog",
      "tts",
      "step-status",
    ])
  })

  it("derives stage-output cache resources from produced nodes", () => {
    expect(getCacheResourcesForStageOutput("text-and-speech")).toEqual([
      "text-catalog",
      "tts",
      "step-status",
    ])
  })

  it("maps metadata node to book/list resources", () => {
    expect(getCacheResourcesForNode("metadata")).toEqual(["books", "book"])
  })
})
