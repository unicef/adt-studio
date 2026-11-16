import { describe, expect, it } from "vitest"
import { LEGACY_SKIP_MESSAGE, type StepWarning } from "@adt/types"
import { formatStepWarnings } from "../step-warnings.js"

const every: StepWarning[] = [
  { kind: "pages-skipped", count: 3 },
  { kind: "pages-unchanged", pages: [{ pageId: "pg002", error: "HTTP 500" }] },
  { kind: "summary-missing", error: "timeout" },
  { kind: "source-assessment", warning: 2, critical: 1, incompletePages: 4 },
]

describe("formatStepWarnings (SPEC-0021 §Step warnings)", () => {
  it("renders nothing for no warnings", () => {
    expect(formatStepWarnings(undefined)).toBeUndefined()
    expect(formatStepWarnings([])).toBeUndefined()
  })

  it("renders one English sentence for all of a step's warnings", () => {
    expect(formatStepWarnings([{ kind: "pages-skipped", count: 3 }])).toBe("Completed with 3 page(s) skipped.")
    expect(formatStepWarnings(every)).toBe(
      "Completed with 3 page(s) skipped; 1 page(s) kept their extracted images unchanged after a failure: pg002 (HTTP 500); " +
      "no book summary after a failure: timeout; source assessment: 2 warning(s), 1 critical, not fully assessed on 4 page(s).",
    )
  })

  it("never equals the frozen legacy skip literal, so only text an older app wrote is adapted", () => {
    for (const warning of every) {
      expect(formatStepWarnings([warning])).not.toMatch(LEGACY_SKIP_MESSAGE)
    }
    for (const count of [1, 2, 99]) {
      expect(formatStepWarnings([{ kind: "pages-skipped", count }])).not.toMatch(LEGACY_SKIP_MESSAGE)
    }
  })
})
