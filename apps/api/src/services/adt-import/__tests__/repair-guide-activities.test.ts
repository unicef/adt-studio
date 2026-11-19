import { describe, expect, it } from "vitest"

import { activityPagesBlock } from "../repair-guide.js"

const liveRegion = "This custom activity has no live region for feedback. Add an aria-live=\"polite\" status element."
const sectionName = "The activity <section> has no accessible name. Add aria-labelledby=\"<heading-id>\"."

const page = (sectionId: string, validationErrors: string[]) => ({
  sectionId,
  href: `${sectionId}.html`,
  declaredType: null,
  detectedType: "activity_custom" as const,
  suggestedType: "activity_custom" as const,
  kind: "custom" as const,
  status: "needs-review" as const,
  supportsStudioEditing: false,
  reasons: ["invalid-structure" as const],
  signals: ["interactive-control"],
  validationErrors,
  textPreview: "Long page text that the assistant reads from the page itself.",
  previewHtml: "<section></section>",
})

// #1183: the same check message repeats on most activity pages of a book.
describe("activityPagesBlock", () => {
  const block = activityPagesBlock([
    page("pg001_sec001", [liveRegion, sectionName]),
    page("pg002_sec001", [liveRegion]),
  ]).join("\n")

  it("spells each failed check out once and refers to it by number", () => {
    expect(block.split(liveRegion)).toHaveLength(2)
    expect(block).toContain(`1. ${liveRegion}`)
    expect(block).toContain(`2. ${sectionName}`)
    expect(block).toContain("- pg001_sec001.html (section pg001_sec001): suggested activity_custom; invalid-structure; signals interactive-control; failed checks 1, 2")
    expect(block).toContain("- pg002_sec001.html (section pg002_sec001): suggested activity_custom; invalid-structure; signals interactive-control; failed checks 1")
  })

  it("counts a check that fails more than once on a page", () => {
    const twice = activityPagesBlock([page("pg003_sec001", [sectionName, sectionName])]).join("\n")
    expect(twice).toContain("failed checks 1 (2 times)")
  })

  it("explains each reason once", () => {
    expect(block.match(/^- invalid-structure: /gm)).toHaveLength(1)
  })

  it("leaves out the text preview, which the assistant reads from the page", () => {
    expect(block).not.toContain("Long page text")
  })
})
