import { describe, expect, it, vi } from "vitest"

vi.mock("@lingui/core/macro", () => ({
  msg(strings: TemplateStringsArray, ...values: unknown[]) {
    let text = ""
    for (let index = 0; index < strings.length; index += 1) {
      text += strings[index]
      if (index < values.length) {
        text += String(values[index])
      }
    }
    return { id: text }
  },
}))

import { PLUGIN_SLUGS, FOUNDATION_SLUGS, type DockSlug } from "./plugins"
import { STEP_PREREQ, isStepLocked, type StageEvidence } from "./stepPrereq"

/** A book that has run nothing at all. */
const FRESH: StageEvidence = {
  covered: () => false,
  pageCount: 0,
  hasSections: false,
  hasRendering: false,
}

const evidence = (over: Partial<StageEvidence>): StageEvidence => ({ ...FRESH, ...over })

const EXTRACTED = evidence({ pageCount: 12 })
const SECTIONED = evidence({ pageCount: 12, hasSections: true })
const STORYBOARDED = evidence({ pageCount: 12, hasSections: true, hasRendering: true })

describe("STEP_PREREQ", () => {
  it("mirrors the old landing pages: everything downstream waits on Storyboard", () => {
    for (const slug of ["captions", "quizzes", "glossary", "toc", "easy-read", "translate"] as const) {
      expect(STEP_PREREQ[slug]).toBe("storyboard")
    }
  })

  it("keeps Speech behind Language, not Storyboard", () => {
    expect(STEP_PREREQ.speech).toBe("translate")
  })

  it("blocks sign language on Storyboard even though it is not a pipeline stage", () => {
    expect(STEP_PREREQ["sign-language"]).toBe("storyboard")
  })

  it("never blocks the foundations — they pull missing ancestors into the run", () => {
    for (const slug of FOUNDATION_SLUGS) {
      expect(STEP_PREREQ[slug]).toBeNull()
    }
  })

  it("covers every dock slug", () => {
    const slugs: DockSlug[] = [...FOUNDATION_SLUGS, ...PLUGIN_SLUGS]
    for (const slug of slugs) {
      expect(STEP_PREREQ).toHaveProperty(slug)
    }
  })
})

describe("isStepLocked", () => {
  it("leaves Extract and Sectioning open on a book that has run nothing", () => {
    expect(isStepLocked("extract", FRESH)).toBe(false)
    expect(isStepLocked("sectioning", FRESH)).toBe(false)
  })

  it("locks every plugin until a storyboard exists", () => {
    for (const slug of PLUGIN_SLUGS) {
      expect(isStepLocked(slug, SECTIONED)).toBe(true)
    }
  })

  it("unlocks the storyboard-gated plugins once pages are rendered", () => {
    for (const slug of ["captions", "quizzes", "glossary", "toc", "easy-read", "translate"] as const) {
      expect(isStepLocked(slug, STORYBOARDED)).toBe(false)
    }
  })

  it("keeps Speech locked after the storyboard, until Language has run", () => {
    expect(isStepLocked("speech", STORYBOARDED)).toBe(true)
    const translated = evidence({
      ...STORYBOARDED,
      covered: (stage) => stage === "translate",
    })
    expect(isStepLocked("speech", translated)).toBe(false)
  })

  it("trusts artifacts when completedStages is missing the flag", () => {
    // Older books carry renderings without "storyboard" in completedStages.
    expect(isStepLocked("glossary", STORYBOARDED)).toBe(false)
    expect(STORYBOARDED.covered("storyboard")).toBe(false)
  })

  it("still unlocks from the run status alone, before artifacts land", () => {
    const running = evidence({ covered: (stage) => stage === "storyboard" })
    expect(isStepLocked("glossary", running)).toBe(false)
  })

  it("does not treat a half-extracted book as sectioned", () => {
    expect(isStepLocked("glossary", EXTRACTED)).toBe(true)
  })
})
