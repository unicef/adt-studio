import { expect, it } from "vitest"
import { imagePassCompletionMessage, recordOptionalModelFailure, type ImagePassFailure } from "../image-pass-failures.js"

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

it("lists pages in id order regardless of completion order", () => {
  const message = imagePassCompletionMessage([{ pageId: "pg009", error: "b" }, { pageId: "pg002", error: "a" }])!
  expect(message.indexOf("pg002")).toBeLessThan(message.indexOf("pg009"))
})

it("records a failed model call against the page and returns undefined", async () => {
  const failures: ImagePassFailure[] = []
  const logged: string[] = []
  const result = await recordOptionalModelFailure(failures, "pg003", async () => { throw new Error("model down") }, (message) => logged.push(message))
  expect(result).toBeUndefined()
  expect(failures).toEqual([{ pageId: "pg003", error: "model down" }])
  expect(logged).toEqual(["model down"])
  expect(await recordOptionalModelFailure(failures, "pg004", async () => 42, () => {})).toBe(42)
  expect(failures).toHaveLength(1)
})

it("rethrows what the caller classifies as not a model failure, such as a cancellation", async () => {
  const failures: ImagePassFailure[] = []
  const cancelled = new Error("Run cancelled")
  await expect(recordOptionalModelFailure(failures, "pg001", async () => { throw cancelled }, () => {}, (err) => err === cancelled)).rejects.toBe(cancelled)
  expect(failures).toEqual([])
})
