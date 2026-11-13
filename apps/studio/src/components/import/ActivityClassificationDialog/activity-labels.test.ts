import { describe, expect, it } from "vitest"
import { suggestedTypesFor } from "./activity-labels"

describe("suggestedTypesFor", () => {
  it("suggests types that fit the controls found, best first", () => {
    expect(suggestedTypesFor([{ kind: "text-field", count: 1 }])).toEqual(["activity_open_ended_answer", "activity_fill_in_the_blank"])
    expect(suggestedTypesFor([{ kind: "checkbox", count: 2 }])).toEqual(["activity_multi_select"])
    expect(suggestedTypesFor([{ kind: "radio", count: 3 }])).toEqual(["activity_multiple_choice", "activity_true_false"])
    expect(suggestedTypesFor([{ kind: "draggable", count: 4 }])).toEqual(["activity_sorting", "activity_matching"])
  })

  it("suggests nothing for a lone button or unknown controls", () => {
    expect(suggestedTypesFor([{ kind: "button", count: 1 }])).toEqual([])
    expect(suggestedTypesFor(undefined)).toEqual([])
  })

  it("keeps at most three suggestions without repeats", () => {
    const types = suggestedTypesFor([{ kind: "text-field", count: 1 }, { kind: "select", count: 1 }, { kind: "radio", count: 2 }])
    expect(types).toHaveLength(3)
    expect(new Set(types).size).toBe(3)
  })
})
