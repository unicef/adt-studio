import { describe, expect, it } from "vitest"
import { shouldBlockNavigation, type NavigationLocation } from "./unsavedNavigation"

const pipeline = (
  routeId: string,
  params: Record<string, string>,
  pathname = "/pipeline/book",
): NavigationLocation => ({ routeId, pathname, params: { label: "book", ...params }, search: {} })

const workspace = () => pipeline("/_app/pipeline/$label/", {})
const page = (pageId: string) =>
  pipeline("/_app/pipeline/$label/pages/$pageId", { pageId }, `/pipeline/book/pages/${pageId}`)
const step = (slug: string) =>
  pipeline("/_app/pipeline/$label/$step/", { step: slug }, `/pipeline/book/${slug}`)
const settings = (slug: string, tab: string) =>
  pipeline(
    "/_app/pipeline/$label/$step/settings/$tab",
    { step: slug, tab },
    `/pipeline/book/${slug}/settings/${tab}`,
  )
const bookSettings = (section: string) =>
  pipeline(
    "/_app/pipeline/$label/settings/$section",
    { section },
    `/pipeline/book/settings/${section}`,
  )
const preview = () => pipeline("/_app/pipeline/$label/preview", {}, "/pipeline/book/preview")
const library: NavigationLocation = {
  routeId: "/_app/library",
  pathname: "/library",
  params: {},
  search: {},
}

const block = (
  current: NavigationLocation,
  next: NavigationLocation,
  ephemeralDirtyTabs: string[] = [],
) => shouldBlockNavigation({ current, next, hasUnsaved: true, ephemeralDirtyTabs })

describe("shouldBlockNavigation", () => {
  it("never blocks when nothing is unsaved", () => {
    const clean = shouldBlockNavigation({
      current: settings("captions", "prompt"),
      next: library,
      hasUnsaved: false,
      ephemeralDirtyTabs: ["prompt"],
    })
    expect(clean).toBe(false)
  })

  it("blocks leaving the book", () => {
    expect(block(workspace(), library)).toBe(true)
    expect(block(settings("captions", "prompt"), library)).toBe(true)
  })

  it("allows moving between the book's own screens", () => {
    expect(block(page("p1"), page("p2"))).toBe(false)
    expect(block(workspace(), step("captions"))).toBe(false)
    expect(block(page("p1"), preview())).toBe(false)
    expect(block(step("captions"), workspace())).toBe(false)
  })

  it("allows entering settings but blocks leaving them", () => {
    expect(block(step("captions"), settings("captions", "prompt"))).toBe(false)
    expect(block(settings("captions", "prompt"), step("captions"))).toBe(true)
    expect(block(settings("captions", "prompt"), workspace())).toBe(true)
  })

  it("blocks jumping to another stage's settings", () => {
    expect(block(settings("captions", "prompt"), settings("quizzes", "prompt"))).toBe(true)
  })

  it("allows switching tabs within the same stage's settings", () => {
    expect(block(settings("captions", "general"), settings("captions", "prompt"))).toBe(false)
  })

  it("blocks reaching Overview, which re-runs the stage", () => {
    expect(block(settings("captions", "general"), settings("captions", "overview"))).toBe(true)
    expect(block(settings("captions", "overview"), settings("captions", "overview"))).toBe(false)
  })

  it("blocks leaving a tab whose edits are only in memory", () => {
    expect(block(settings("captions", "general"), settings("captions", "prompt"), ["general"])).toBe(
      true,
    )
    expect(block(settings("captions", "general"), settings("captions", "general"), ["general"])).toBe(
      false,
    )
  })

  describe("the book settings hub", () => {
    it("allows switching sections inside one group", () => {
      expect(block(bookSettings("general"), bookSettings("fonts"))).toBe(false)
      expect(block(bookSettings("information"), bookSettings("models"))).toBe(false)
    })

    it("blocks switching between the book and storyboard groups", () => {
      expect(block(bookSettings("information"), bookSettings("fonts"))).toBe(true)
      expect(block(bookSettings("fonts"), bookSettings("api-keys"))).toBe(true)
    })

    it("blocks leaving the hub but not entering it", () => {
      expect(block(bookSettings("information"), workspace())).toBe(true)
      expect(block(bookSettings("fonts"), page("p1"))).toBe(true)
      expect(block(workspace(), bookSettings("information"))).toBe(false)
    })

    it("blocks leaving a section whose edits are only in memory", () => {
      expect(block(bookSettings("information"), bookSettings("models"), ["information"])).toBe(true)
      expect(block(bookSettings("information"), bookSettings("information"), ["information"])).toBe(
        false,
      )
    })
  })

  it("keeps the classic UI keyed on its pathname and search tab", () => {
    const classic = (tab: string, pathname = "/books/book/captions/settings"): NavigationLocation => ({
      routeId: "/books/$label/$step/settings",
      pathname,
      params: { label: "book", step: "captions" },
      search: { tab },
    })
    expect(block(classic("general"), classic("prompt"))).toBe(false)
    expect(block(classic("general"), classic("overview"))).toBe(true)
    expect(block(classic("general"), classic("general", "/books/book/captions"))).toBe(true)
    expect(block(classic("general"), classic("prompt"), ["general"])).toBe(true)
  })
})
