import { afterEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage } from "@adt/storage"
import { getRenderSectioning, getRenderSectioningRow, renderedSectionId } from "../render-sectioning.js"

describe("render-sectioning resolver", () => {
  const tmpDirs: string[] = []
  afterEach(() => {
    for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true })
    tmpDirs.length = 0
  })

  function makeStorage() {
    const booksRoot = fs.mkdtempSync(path.join(os.tmpdir(), "adt-render-sectioning-"))
    tmpDirs.push(booksRoot)
    return createBookStorage("test-book", booksRoot)
  }

  const semantic = {
    reasoning: "semantic",
    sections: [
      { sectionId: "pg001_sec001", sectionType: "paragraph", nodes: [], isPruned: false, pageNumber: 1 },
    ],
  }
  const positioned = {
    reasoning: "fixed",
    sections: [
      { sectionId: "pg001_sec001", sectionType: "fixed-layout-page", nodes: [], placement: {}, isPruned: false, pageNumber: 1 },
    ],
  }

  function reasoningOf(row: ReturnType<typeof getRenderSectioningRow>): string | undefined {
    return (row?.data as { reasoning?: string } | undefined)?.reasoning
  }

  it("returns page-sectioning when no fixed-layout-sectioning exists (reflowable)", () => {
    const storage = makeStorage()
    try {
      storage.putNodeData("page-sectioning", "pg001", semantic)
      expect(reasoningOf(getRenderSectioningRow(storage, "pg001"))).toBe("semantic")
    } finally {
      storage.close()
    }
  })

  it("prefers fixed-layout-sectioning when present (fixed-layout)", () => {
    const storage = makeStorage()
    try {
      storage.putNodeData("page-sectioning", "pg001", semantic)
      storage.putNodeData("fixed-layout-sectioning", "pg001", positioned)
      expect(reasoningOf(getRenderSectioningRow(storage, "pg001"))).toBe("fixed")
    } finally {
      storage.close()
    }
  })

  it("returns null row when neither node exists", () => {
    const storage = makeStorage()
    try {
      expect(getRenderSectioningRow(storage, "pg001")).toBeNull()
      expect(getRenderSectioning(storage, "pg001")).toBeUndefined()
    } finally {
      storage.close()
    }
  })
})


describe("retained rendered ownership", () => {
  const rendering = (html: string, sectionId?: string) => ({ sectionIndex: 0, sectionType: "text", reasoning: "", html, sectionId })
  it("accepts a stable root inside layout wrappers and HTML documents", () => {
    expect(renderedSectionId(rendering('<div id="content"><section data-section-id="A"><p>Text</p></section></div>'))).toBe("A")
    expect(renderedSectionId(rendering('<!doctype html><html><head><title>Page</title></head><body><main><section data-section-id="A">Text</section></main></body></html>'))).toBe("A")
    expect(renderedSectionId(rendering('<div id="content">Positioned output</div>', "A"))).toBe("A")
  })
  it("trusts a consistent stored owner covering decorative siblings", () => {
    expect(renderedSectionId(rendering('<section data-section-id="A">Text</section><div class="decoration"></div>', "A"))).toBe("A")
    expect(renderedSectionId(rendering('<section data-section-id="A">Text</section><div></div>', "B"))).toBeUndefined()
  })
  it("does not let a descendant owner claim sibling content or contradictory metadata", () => {
    expect(renderedSectionId(rendering('<section><p>Unowned question</p><div data-section-id="B">Other content</div></section>'))).toBeUndefined()
    expect(renderedSectionId(rendering('<section data-section-id="A">A</section>', "B"))).toBeUndefined()
    expect(renderedSectionId(rendering('<section data-section-id="A">A</section><section data-section-id="B">B</section>'))).toBeUndefined()
    expect(renderedSectionId(rendering('<p data-id="stable-leaf">No proven section</p>'))).toBeUndefined()
  })
})
