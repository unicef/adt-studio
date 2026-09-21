import { describe, expect, it } from "vitest"
import type { AdtPageEntry, PageSummarySection } from "@/api/client"
import { previewHrefForSection, previewSectionId } from "./previewTarget"

function section(
  sectionId: string,
  sectionIndex: number,
  isPruned = false,
): PageSummarySection {
  return {
    sectionId,
    sectionIndex,
    sectionType: "text",
    isActivity: false,
    isPruned,
    textPreview: "",
  }
}

describe("previewSectionId", () => {
  it("picks the first section that survived pruning", () => {
    const sections = [section("pg001_sec001", 0, true), section("pg001_sec002", 1)]
    expect(previewSectionId(sections, null)).toBe("pg001_sec002")
  })

  it("returns null when every section is pruned", () => {
    expect(previewSectionId([section("pg001_sec001", 0, true)], null)).toBeNull()
  })

  it("returns null without a page", () => {
    expect(previewSectionId(undefined, null)).toBeNull()
  })

  it("prefers the quiz page over the page sections", () => {
    expect(previewSectionId([section("pg001_sec001", 0)], 2)).toBe("qz003")
  })
})

const MANIFEST: AdtPageEntry[] = [
  { section_id: "pg001_sec001", href: "index.html" },
  { section_id: "pg012013_sec001", href: "pg012013_sec001.html" },
  { section_id: "qz001", href: "qz001.html" },
]

describe("previewHrefForSection", () => {
  it("resolves the book's first page to index.html", () => {
    expect(previewHrefForSection("pg001_sec001", MANIFEST)).toBe("index.html")
  })

  it("resolves a later section to its own file", () => {
    expect(previewHrefForSection("pg012013_sec001", MANIFEST)).toBe("pg012013_sec001.html")
  })

  it("resolves a quiz to its own file", () => {
    expect(previewHrefForSection("qz001", MANIFEST)).toBe("qz001.html")
  })

  it("returns undefined when the manifest has not loaded", () => {
    expect(previewHrefForSection("pg001_sec001", undefined)).toBeUndefined()
  })

  it("returns undefined for a section missing from the manifest", () => {
    expect(previewHrefForSection("pg009_sec001", MANIFEST)).toBeUndefined()
  })

  it("returns undefined without a section", () => {
    expect(previewHrefForSection(null, MANIFEST)).toBeUndefined()
  })
})
