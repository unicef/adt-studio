import { describe, expect, it } from "vitest"
import { CORE_STAGE_ORDER, PIPELINE } from "../pipeline.js"

describe("CORE_STAGE_ORDER", () => {
  it("contains the single pipeline path before the DAG branches", () => {
    expect(CORE_STAGE_ORDER).toEqual(["extract", "sectioning", "storyboard"])
  })

  it("preserves pipeline order", () => {
    const pipelineOrder = PIPELINE.map((stage) => stage.name)
    expect(CORE_STAGE_ORDER.map((stage) => pipelineOrder.indexOf(stage))).toEqual([0, 1, 2])
  })
})
