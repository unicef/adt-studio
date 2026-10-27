import { expect, it } from "vitest"
import { imagePassCompletionMessage } from "../image-pass-failures.js"

it("returns no message when every page succeeded", () => {
  expect(imagePassCompletionMessage([])).toBeUndefined()
})

it("names the pages that kept their images and the error that caused it", () => {
  expect(imagePassCompletionMessage([{ pageId: "pg003", error: "Cannot connect to API:\n  other side closed" }]))
    .toBe("Completed — 1 page(s) kept their extracted images unchanged after a failure: pg003 (Cannot connect to API: other side closed)")
})

it("lists at most five pages and truncates long errors", () => {
  const failures = Array.from({ length: 7 }, (_, index) => ({ pageId: `pg00${index + 1}`, error: "x".repeat(200) }))
  const message = imagePassCompletionMessage(failures)!
  expect(message).toContain("7 page(s)")
  expect(message).toContain("pg005 (")
  expect(message).not.toContain("pg006")
  expect(message).toMatch(/… and 2 more$/)
  expect(message).toContain("x".repeat(119) + "…")
})
