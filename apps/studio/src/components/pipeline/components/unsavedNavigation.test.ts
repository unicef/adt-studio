import { describe, expect, it } from "vitest"
import { shouldBlockNavigation, type NavigationLocation } from "./unsavedNavigation"
import type { FloatingSaveScope } from "./floating-save"

const pipeline = (
  routeId: string,
  params: Record<string, string>,
  pathname = "/pipeline/book",
): NavigationLocation => ({ routeId, pathname, params: { label: "book", ...params }, search: {} })

const workspace = () => pipeline("/_app/pipeline/$label/", {})
const page = (pageId: string) =>
  pipeline("/_app/pipeline/$label/pages/$pageId", { pageId }, `/pipeline/book/pages/${pageId}`)
const step = (slug: string, search: Record<string, string> = {}): NavigationLocation => ({
  ...pipeline("/_app/pipeline/$label/$step/", { step: slug }, `/pipeline/book/${slug}`),
  search,
})
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
  dirtyScopes: FloatingSaveScope[] = [],
) => shouldBlockNavigation({ current, next, hasUnsaved: true, ephemeralDirtyTabs, dirtyScopes })

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
    expect(block(workspace(), page("p1"))).toBe(false)
    expect(block(preview(), workspace())).toBe(false)
  })

  describe("a stage screen", () => {
    it("blocks leaving it, since its drafts unmount with it", () => {
      expect(block(step("captions"), workspace())).toBe(true)
      expect(block(step("captions"), page("p1"))).toBe(true)
      expect(block(step("captions"), preview())).toBe(true)
      expect(block(step("captions"), step("glossary"))).toBe(true)
      expect(block(step("captions"), settings("captions", "prompt"))).toBe(true)
      expect(block(step("captions"), library)).toBe(true)
    })

    it("allows moving between its own pages when no draft belongs to a page", () => {
      expect(block(step("easy-read"), step("easy-read", { page: "p1" }))).toBe(false)
      expect(block(step("easy-read", { page: "p1" }), step("easy-read", { page: "p2" }))).toBe(false)
      expect(block(step("easy-read", { page: "p1" }), step("easy-read"))).toBe(false)
    })

    it("blocks changing or closing the page a draft belongs to", () => {
      const scoped = [{ page: "p1" }]
      expect(block(step("sectioning", { page: "p1" }), step("sectioning", { page: "p2" }), [], scoped)).toBe(true)
      expect(block(step("sectioning", { page: "p1" }), step("sectioning"), [], scoped)).toBe(true)
      expect(block(step("sectioning", { page: "p1" }), step("sectioning", { page: "p1" }), [], scoped)).toBe(false)
    })

    it("blocks opening a page's detail from a gallery draft of that same page", () => {
      expect(block(step("captions"), step("captions", { page: "p1" }), [], [{ page: "p1" }])).toBe(true)
      expect(block(step("captions"), step("captions", { page: "p2" }), [], [{ page: "p1" }])).toBe(true)
    })

    it("ignores search changes that don't touch the draft's page or language", () => {
      const pageScoped = [{ page: "p1" }]
      expect(block(step("captions"), step("captions", { language: "en" }), [], pageScoped)).toBe(false)
      expect(block(step("sectioning", { page: "p1" }), step("sectioning", { page: "p1", language: "en" }), [], pageScoped)).toBe(false)
      expect(block(step("translate", { language: "en" }), step("translate", { language: "en", page: "p1" }), [], [{ language: "en" }])).toBe(false)
    })

    it("never asks when only the interface language changes", () => {
      const scoped = [{ language: "en" }]
      expect(block(step("translate", { language: "en", lang: "en" }), step("translate", { language: "en", lang: "pt-BR" }), [], scoped)).toBe(false)
      expect(block(step("sectioning", { page: "p1", lang: "en" }), step("sectioning", { page: "p1", lang: "fr" }), [], [{ page: "p1" }])).toBe(false)
    })

    it("blocks switching the content language a draft belongs to", () => {
      const scoped = [{ language: "en" }]
      expect(block(step("translate", { language: "en" }), step("translate", { language: "es" }), [], scoped)).toBe(true)
      expect(block(step("translate", { language: "en" }), step("translate"), [], scoped)).toBe(true)
    })
  })

  it("allows entering settings but blocks leaving them", () => {
    expect(block(workspace(), settings("captions", "prompt"))).toBe(false)
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
