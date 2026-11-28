import { describe, expect, it, vi } from "vitest"

// The provider links to the settings nav, whose tab labels are Lingui `msg` macros.
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray) => ({ id: strings.join("") }) }))

const { isPipelineRoute } = await import("./UpdateDialogProvider")

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
