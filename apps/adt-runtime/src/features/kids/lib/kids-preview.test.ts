// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getKidsModePreviewOverride, isKidsPreviewContext } from "./kids-preview"

function enterIframeContext() {
  Object.defineProperty(window, "parent", { value: {}, configurable: true })
}

function exitIframeContext() {
  Object.defineProperty(window, "parent", { value: window, configurable: true })
}

function setSearch(search: string) {
  window.history.replaceState(null, "", `/${search}`)
}

beforeEach(() => {
  sessionStorage.clear()
  exitIframeContext()
  setSearch("")
})

afterEach(() => {
  sessionStorage.clear()
  exitIframeContext()
  setSearch("")
})

describe("isKidsPreviewContext", () => {
  it("is false outside dev/iframe/onboarding-preview contexts", () => {
    expect(isKidsPreviewContext()).toBe(false)
  })

  it("is true when the runtime is iframed", () => {
    enterIframeContext()
    expect(isKidsPreviewContext()).toBe(true)
  })

  it("is true when the URL carries ?kidsOnboarding=preview, even standalone", () => {
    setSearch("?kidsOnboarding=preview")
    expect(isKidsPreviewContext()).toBe(true)
  })
})

describe("getKidsModePreviewOverride", () => {
  it("returns null when not in a preview context, regardless of the query param", () => {
    setSearch("?kidsMode=on")
    expect(getKidsModePreviewOverride()).toBeNull()
  })

  it("returns null in a preview context with no override present anywhere", () => {
    enterIframeContext()
    expect(getKidsModePreviewOverride()).toBeNull()
  })

  it("reads ?kidsMode=off in a preview context", () => {
    enterIframeContext()
    setSearch("?kidsMode=off")
    expect(getKidsModePreviewOverride()).toBe("off")
  })

  it("reads ?kidsMode=on in a preview context", () => {
    enterIframeContext()
    setSearch("?kidsMode=on")
    expect(getKidsModePreviewOverride()).toBe("on")
  })

  it("ignores unrecognized values for the query param", () => {
    enterIframeContext()
    setSearch("?kidsMode=maybe")
    expect(getKidsModePreviewOverride()).toBeNull()
  })

  it("persists the override to sessionStorage so it survives a simulated reload", () => {
    enterIframeContext()
    setSearch("?kidsMode=on")
    expect(getKidsModePreviewOverride()).toBe("on")
    expect(sessionStorage.getItem("kidsModePreviewOverride")).toBe("on")

    // Simulate a full-page reload inside the book: each page turn is a new
    // document load, so the query string is gone — but the tab-scoped
    // sessionStorage entry survives.
    setSearch("")
    expect(getKidsModePreviewOverride()).toBe("on")
  })

  it("a later query param overrides a previously stored value", () => {
    enterIframeContext()
    setSearch("?kidsMode=on")
    expect(getKidsModePreviewOverride()).toBe("on")

    setSearch("?kidsMode=off")
    expect(getKidsModePreviewOverride()).toBe("off")
    expect(sessionStorage.getItem("kidsModePreviewOverride")).toBe("off")
  })

  it("stops applying once the preview context is left, even if sessionStorage still holds a value", () => {
    enterIframeContext()
    setSearch("?kidsMode=on")
    expect(getKidsModePreviewOverride()).toBe("on")

    exitIframeContext()
    expect(getKidsModePreviewOverride()).toBeNull()
  })
})
