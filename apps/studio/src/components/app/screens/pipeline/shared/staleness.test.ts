import { describe, expect, it } from "vitest"

import { isPageOutdated, isStoryboardInvalidated, type StalenessPage } from "./staleness"

const page = (over: Partial<StalenessPage>): StalenessPage => ({
  pageId: "p1",
  pageNumber: 1,
  hasRendering: true,
  hasCaptioning: false,
  textPreview: "",
  imageCount: 0,
  wordCount: 40,
  sectionCount: 2,
  prunedSections: [],
  renderingVersion: 3,
  sectioningVersion: 3,
  sections: [],
  extractionWarning: null,
  isDiscarded: false,
  ...over,
})

describe("isPageOutdated", () => {
  it("flags a page whose sections were saved after the render", () => {
    expect(isPageOutdated(page({ sectioningVersion: 4, renderingVersion: 3 }))).toBe(true)
  })

  it("keeps a page in sync when both versions match", () => {
    expect(isPageOutdated(page({}))).toBe(false)
  })

  it("never flags a page that was never rendered", () => {
    expect(
      isPageOutdated(page({ hasRendering: false, renderingVersion: null, sectioningVersion: 2 })),
    ).toBe(false)
  })

  it("never flags a discarded page — it is excluded from the render on purpose", () => {
    expect(
      isPageOutdated(page({ isDiscarded: true, sectioningVersion: 4, renderingVersion: 3 })),
    ).toBe(false)
  })

  it("ignores a render that is ahead of its sections", () => {
    expect(isPageOutdated(page({ sectioningVersion: 2, renderingVersion: 5 }))).toBe(false)
  })
})

describe("isStoryboardInvalidated", () => {
  it("reports renderings whose stage was reset by a sectioning edit", () => {
    expect(isStoryboardInvalidated(true, "idle")).toBe(true)
  })

  it("stays quiet while the stage still reads done", () => {
    expect(isStoryboardInvalidated(true, "done")).toBe(false)
  })

  it("stays quiet before anything is rendered", () => {
    expect(isStoryboardInvalidated(false, "idle")).toBe(false)
  })
})
