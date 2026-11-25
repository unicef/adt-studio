import { describe, expect, it } from "vitest"
import { activityReviewKind, failsOnlyChecks, suggestedTypesFor, type ActivityReviewItem } from "./activity-labels"

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

// #1155: a page whose type is accepted and that fails only accessibility
// checks doesn't need a type, so the review mustn't ask for one.
const item = (reasons: ActivityReviewItem["reasons"], status: ActivityReviewItem["status"] = "needs-review") => ({
  sectionId: "pg001_sec001", href: "pg001_sec001.html", declaredType: "activity_custom", detectedType: "activity_custom",
  suggestedType: "activity_custom", kind: "custom", status, supportsStudioEditing: false, reasons, signals: [],
  validationErrors: [], textPreview: "",
}) as ActivityReviewItem

describe("failsOnlyChecks", () => {
  it("is true only when every reason is a failed structure check", () => {
    expect(failsOnlyChecks(item(["invalid-structure"]))).toBe(true)
    expect(failsOnlyChecks(item(["invalid-structure", "type-mismatch"]))).toBe(false)
    expect(failsOnlyChecks(item(["interactive-unmarked"]))).toBe(false)
    expect(failsOnlyChecks(item([]))).toBe(false)
  })
})

describe("activityReviewKind", () => {
  it("says whether the pages to review need a type, only fail checks, or both", () => {
    expect(activityReviewKind([item(["invalid-structure"]), item(["invalid-structure"])])).toBe("checks")
    expect(activityReviewKind([item(["interactive-unmarked"])])).toBe("type")
    expect(activityReviewKind([item(["invalid-structure"]), item(["missing-marker"])])).toBe("mixed")
  })

  it("ignores confirmed pages", () => {
    expect(activityReviewKind([item(["invalid-structure"]), item(["interactive-unmarked"], "confirmed")])).toBe("checks")
  })
})
