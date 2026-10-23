import { describe, expect, it } from "vitest"
import { stageMarks } from "./useStageMarks"
import type { DescribedProblem } from "../problems/useDescribeProblem"

const problem: DescribedProblem = {
  level: "partial",
  fix: "retry",
  title: "2 pages couldn't be processed",
  body: "",
  details: "Failed on pg008009 and pg010011",
  pages: [
    { pageId: "pg008009", pageNumber: 8 },
    { pageId: "pg010011", pageNumber: 10 },
  ],
  items: 0,
}
const pages = [{ pageId: "pg001", missing: true }, { pageId: "pg008009", missing: false }, { pageId: "pg010011", missing: false }]

describe("stageMarks", () => {
  it("marks the pages named in the error", () => {
    const marks = stageMarks(true, problem, pages)
    expect([...marks.failedPageIds]).toEqual(["pg008009", "pg010011"])
    expect(marks.isFailed("pg008009")).toBe(true)
    expect(marks.isFailed("pg001")).toBe(false)
  })

  it("adds the stage's own failed-page rule", () => {
    expect(stageMarks(true, problem, pages, (page) => page.missing).failedCount).toBe(3)
  })

  it("marks nothing in banner-only mode or without a problem", () => {
    expect(stageMarks(false, problem, pages).failedCount).toBe(0)
    expect(stageMarks(true, null, pages).failedCount).toBe(0)
  })
})
