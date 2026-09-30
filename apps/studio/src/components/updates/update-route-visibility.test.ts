import { describe, expect, it } from "vitest"
import { isPipelineRoute } from "./UpdateDialogProvider"

describe("isPipelineRoute", () => {
  it.each([
    "/books/raven",
    "/books/raven/book",
    "/books/raven/storyboard/12",
    "/books/raven/debug",
    "/books/LP-4-Volcanoes-2/settings",
  ])("treats %s as pipeline", (path) => {
    expect(isPipelineRoute(path)).toBe(true)
  })

  it.each([
    "/books/new",
    "/books/import",
    "/",
    "/library",
    "/handoffs",
    "/settings/about",
    "/onboarding",
  ])("leaves %s alone", (path) => {
    expect(isPipelineRoute(path)).toBe(false)
  })
})
