// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getKidsModePreviewOverride, isKidsPreviewContext } from "./kids-preview"

function setLocation(pathname = "/", search = "") {
  window.history.replaceState(null, "", `${pathname}${search}`)
}

beforeEach(() => {
  sessionStorage.clear()
  setLocation()
})

afterEach(() => {
  sessionStorage.clear()
  setLocation()
})

describe("isKidsPreviewContext", () => {
  it("is false for a standalone shipped book", () => {
    expect(isKidsPreviewContext()).toBe(false)
  })

  it("is true on a Studio packaged-preview route", () => {
    setLocation("/api/books/demo/adt/v-123/page.html")
    expect(isKidsPreviewContext()).toBe(true)
  })

  it("does not trust an iframe alone because exported books may be embedded", () => {
    Object.defineProperty(window, "parent", { value: {}, configurable: true })
    expect(isKidsPreviewContext()).toBe(false)
    Object.defineProperty(window, "parent", { value: window, configurable: true })
  })
})

describe("getKidsModePreviewOverride", () => {
  it("returns null when not in a preview context, regardless of the query param", () => {
    setLocation("/book/page.html", "?kidsMode=on")
    expect(getKidsModePreviewOverride()).toBeNull()
  })

  it("returns null in a preview context with no override present anywhere", () => {
    setLocation("/api/books/demo/adt/page.html")
    expect(getKidsModePreviewOverride()).toBeNull()
  })

  it("reads ?kidsMode=off in a preview context", () => {
    setLocation("/api/books/demo/adt/page.html", "?kidsMode=off")
    expect(getKidsModePreviewOverride()).toBe("off")
  })

  it("reads ?kidsMode=on in a preview context", () => {
    setLocation("/api/books/demo/adt/page.html", "?kidsMode=on")
    expect(getKidsModePreviewOverride()).toBe("on")
  })

  it("ignores unrecognized values for the query param", () => {
    setLocation("/api/books/demo/adt/page.html", "?kidsMode=maybe")
    expect(getKidsModePreviewOverride()).toBeNull()
  })

  it("persists the override to sessionStorage so it survives a simulated reload", () => {
    setLocation("/api/books/demo/adt/page.html", "?kidsMode=on")
    expect(getKidsModePreviewOverride()).toBe("on")
    expect(sessionStorage.getItem("kidsModePreviewOverride")).toBe("on")

    // Simulate a full-page reload inside the book: each page turn is a new
    // document load, so the query string is gone — but the tab-scoped
    // sessionStorage entry survives.
    setLocation("/api/books/demo/adt/next.html")
    expect(getKidsModePreviewOverride()).toBe("on")
  })

  it("a later query param overrides a previously stored value", () => {
    setLocation("/api/books/demo/adt/page.html", "?kidsMode=on")
    expect(getKidsModePreviewOverride()).toBe("on")

    setLocation("/api/books/demo/adt/page.html", "?kidsMode=off")
    expect(getKidsModePreviewOverride()).toBe("off")
    expect(sessionStorage.getItem("kidsModePreviewOverride")).toBe("off")
  })

  it("stops applying once the preview context is left, even if sessionStorage still holds a value", () => {
    setLocation("/api/books/demo/adt/page.html", "?kidsMode=on")
    expect(getKidsModePreviewOverride()).toBe("on")

    setLocation("/book/page.html")
    expect(getKidsModePreviewOverride()).toBeNull()
  })
})
