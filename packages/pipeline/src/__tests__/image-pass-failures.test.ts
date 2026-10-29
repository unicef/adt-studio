import { expect, it } from "vitest"
import { imagePassWarning, recordOptionalModelFailure, everyPageFailed, type ImagePassFailure } from "../image-pass-failures.js"
import { formatStepWarnings } from "../step-warnings.js"

it("returns no warning when every page succeeded", () => {
  expect(imagePassWarning([])).toBeUndefined()
})

it("names the pages that kept their images and the error that caused it, on one line", () => {
  expect(imagePassWarning([{ pageId: "pg003", error: "Cannot connect to API:\n  other side closed" }]))
    .toEqual({ kind: "pages-unchanged", pages: [{ pageId: "pg003", error: "Cannot connect to API: other side closed" }] })
})

it("keeps every page, in id order regardless of completion order, and truncates long errors", () => {
  const warning = imagePassWarning([{ pageId: "pg009", error: "b" }, { pageId: "pg002", error: "x".repeat(200) }])
  expect(warning?.kind === "pages-unchanged" && warning.pages.map((page) => page.pageId)).toEqual(["pg002", "pg009"])
  expect(warning?.kind === "pages-unchanged" && warning.pages[0].error).toBe("x".repeat(119) + "…")
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

it("treats a pass where every one of at least three attempted pages failed as a step failure", () => {
  const failed = (count: number) => Array.from({ length: count }, (_, index) => ({ pageId: `pg00${index + 1}`, error: "401" }))
  expect(everyPageFailed(failed(3), 3)).toBe(true)
  expect(everyPageFailed(failed(2), 3)).toBe(false)
  // One or two pages are too few to tell a provider problem from a page problem: a warning, not a failure.
  expect(everyPageFailed(failed(2), 2)).toBe(false)
  expect(everyPageFailed(failed(1), 1)).toBe(false)
  expect(everyPageFailed([], 0)).toBe(false)
})

it("renders step warnings as one English line for the CLI and the log", () => {
  expect(formatStepWarnings([])).toBeUndefined()
  expect(formatStepWarnings(undefined)).toBeUndefined()
  const pages = Array.from({ length: 7 }, (_, index) => ({ pageId: `pg00${index + 1}`, error: "boom" }))
  expect(formatStepWarnings([{ kind: "pages-skipped", count: 1 }, { kind: "pages-unchanged", pages }]))
    .toBe("Completed — 1 page(s) skipped; 7 page(s) kept their extracted images unchanged after a failure: pg001 (boom), pg002 (boom), pg003 (boom), pg004 (boom), pg005 (boom), … and 2 more")
  expect(formatStepWarnings([{ kind: "summary-missing", error: "HTTP 404" }])).toBe("Completed — no book summary after a failure: HTTP 404")
  expect(formatStepWarnings([{ kind: "source-assessment", warning: 2, critical: 1 }])).toBe("Completed — source assessment: 2 warning(s), 1 critical")
})
