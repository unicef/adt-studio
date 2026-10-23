import { describe, expect, it } from "vitest"
import { CORE_STAGE_ORDER, PIPELINE, STAGE_DEPENDENTS } from "../pipeline.js"

describe("CORE_STAGE_ORDER", () => {
  it("contains the single pipeline path before the DAG branches", () => {
    expect(CORE_STAGE_ORDER).toEqual(["extract", "sectioning", "storyboard"])
  })

  it("preserves pipeline order", () => {
    const pipelineOrder = PIPELINE.map((stage) => stage.name)
    expect(CORE_STAGE_ORDER.map((stage) => pipelineOrder.indexOf(stage))).toEqual([0, 1, 2])
  })
})

describe("STAGE_DEPENDENTS", () => {
  it("lists the direct dependents of each stage in pipeline order", () => {
    expect(STAGE_DEPENDENTS.extract).toEqual(["sectioning"])
    expect(STAGE_DEPENDENTS.storyboard).toEqual(["quizzes", "captions", "glossary", "toc", "easy-read"])
    expect(STAGE_DEPENDENTS.captions).toEqual(["translate"])
    expect(STAGE_DEPENDENTS.speech).toEqual(["package"])
    expect(STAGE_DEPENDENTS.package).toEqual([])
  })
})
