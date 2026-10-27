import { expect, it } from "vitest"
import { displayableNote, isAttentionNote } from "./step-notes"

it("surfaces warnings and summaries but not leftover progress counters", () => {
  expect(displayableNote("12/12")).toBeUndefined()
  expect(displayableNote(" 3 / 40 ")).toBeUndefined()
  expect(displayableNote("")).toBeUndefined()
  expect(displayableNote(undefined)).toBeUndefined()
  expect(displayableNote("13 headings")).toBe("13 headings")
  expect(displayableNote("Completed — 2 page(s) skipped")).toBe("Completed — 2 page(s) skipped")
})

it("flags only the runner's Completed — warnings as attention notes", () => {
  expect(isAttentionNote("Completed — 1 page(s) kept their extracted images unchanged after a failure: pg002 (boom)")).toBe(true)
  expect(isAttentionNote("313 terms from 94 pages")).toBe(false)
})
