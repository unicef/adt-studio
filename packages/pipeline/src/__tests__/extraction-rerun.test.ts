import { describe, expect, it } from "vitest"
import { PIPELINE } from "@adt/types"
import { decideExtractRerun, type ExtractRerunInput } from "../extraction-rerun.js"

const attemptId = "5f0c1d2e-3b4a-4c5d-8e6f-7a8b9c0d1e2f"
const extractSteps = PIPELINE.find(stage => stage.name === "extract")!.steps.map(step => step.name)
const done = extractSteps.map(step => ({ step, status: "done" }))
const input = (overrides: Partial<ExtractRerunInput> = {}): ExtractRerunInput => ({
  inspection: { extractOnly: true }, record: "complete", attemptId, pageCount: 3,
  stepRuns: done, isPart: false, runActive: false, ...overrides,
})

describe("SPEC-0003 decideExtractRerun", () => {
  it("offers nothing while a run is active or queued, whatever the book holds", () => {
    expect(decideExtractRerun(input({ runActive: true, record: "failed" }))).toEqual({ actions: [], attemptId, blockedReason: "run-active" })
  })

  it.each(["downstream-output", "not-pdf-source", "split-coordinator", "unrecognized-content"] as const)(
    "offers nothing on a book that is not Extract-only: %s", reason => {
      for (const record of ["complete", "failed", "none"] as const) {
        expect(decideExtractRerun(input({ inspection: { extractOnly: false, reason, detail: "node:page-sectioning" }, record })))
          .toEqual({ actions: [], attemptId, blockedReason: reason })
      }
    })

  it("needs no re-run action before the first extraction", () => {
    expect(decideExtractRerun(input({ record: "none", attemptId: null, pageCount: 0, stepRuns: [] })))
      .toEqual({ actions: [], attemptId: null, blockedReason: null })
  })

  it.each([["failed", attemptId, 2], ["extracting", attemptId, 0], ["unreadable", null, 1], ["failed", attemptId, 0]] as const)(
    "offers only retry for a %s extraction record", (record, id, pageCount) => {
      for (const isPart of [false, true]) {
        expect(decideExtractRerun(input({ record, attemptId: id, pageCount, isPart, stepRuns: [] })))
          .toEqual({ actions: ["retry"], attemptId: id, blockedReason: null })
      }
    })

  it("offers replace alone when every Extract step is done or skipped", () => {
    const skipped = done.map((run, index) => index % 2 ? { ...run, status: "skipped" } : run)
    expect(decideExtractRerun(input({ stepRuns: skipped }))).toEqual({ actions: ["replace"], attemptId, blockedReason: null })
    // Steps of later stages never make Extract resumable.
    expect(decideExtractRerun(input({ stepRuns: [...done, { step: "page-sectioning", status: "error" }] })).actions).toEqual(["replace"])
  })

  it.each(["error", "running", "missing"])("offers resume then replace when an Extract step is %s", status => {
    const stepRuns = status === "missing" ? done.slice(1) : [...done.slice(1), { step: done[0].step, status }]
    expect(decideExtractRerun(input({ stepRuns }))).toEqual({ actions: ["resume", "replace"], attemptId, blockedReason: null })
  })

  it("treats an older book with pages and no extraction record like a complete one", () => {
    expect(decideExtractRerun(input({ record: "none", attemptId: null }))).toEqual({ actions: ["replace"], attemptId: null, blockedReason: null })
    expect(decideExtractRerun(input({ record: "none", attemptId: null, stepRuns: [] }))).toEqual({ actions: ["resume", "replace"], attemptId: null, blockedReason: null })
  })

  it("never offers replace on a part book", () => {
    expect(decideExtractRerun(input({ isPart: true, stepRuns: [] }))).toEqual({ actions: ["resume"], attemptId, blockedReason: null })
    expect(decideExtractRerun(input({ isPart: true }))).toEqual({ actions: [], attemptId, blockedReason: "part-book" })
  })

  it("refuses a complete record without pages", () => {
    expect(decideExtractRerun(input({ pageCount: 0 }))).toEqual({ actions: [], attemptId, blockedReason: "extraction-inconsistent" })
  })
})
