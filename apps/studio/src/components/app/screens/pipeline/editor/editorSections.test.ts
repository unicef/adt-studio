// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import type { PageDetail } from "@/api/client"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { editorStatus, toEditorSections } from "./editorSections"
import { imageUrlCodec } from "./renderingDraft"

const codec = imageUrlCodec("/api")

function page(sections: Array<{ index: number; pruned?: boolean }>): PipelinePage {
  return {
    sections: sections.map(({ index, pruned }) => ({
      sectionId: `pg001_sec00${index + 1}`,
      sectionIndex: index,
      sectionType: "story",
      isActivity: false,
      isPruned: Boolean(pruned),
    })),
  } as unknown as PipelinePage
}

const rendering = {
  sections: [
    { sectionIndex: 0, sectionType: "story", reasoning: "", html: "<p> one </p>" },
    { sectionIndex: 2, sectionType: "story", reasoning: "", html: "<p>three</p>" },
  ],
} as NonNullable<PageDetail["rendering"]>

describe("toEditorSections", () => {
  it("keeps only live sections that have rendered html, normalized", () => {
    const sections = toEditorSections(page([{ index: 0 }, { index: 1 }, { index: 2 }]), rendering, codec)
    expect(sections.map((section) => section.sectionIndex)).toEqual([0, 2])
    expect(sections[0].html).toBe("<p> one </p>")
  })

  it("drops pruned sections", () => {
    const sections = toEditorSections(page([{ index: 0, pruned: true }, { index: 2 }]), rendering, codec)
    expect(sections.map((section) => section.sectionIndex)).toEqual([2])
  })

  it("returns nothing without a page or a rendering", () => {
    expect(toEditorSections(null, rendering, codec)).toEqual([])
    expect(toEditorSections(page([{ index: 0 }]), null, codec)).toEqual([])
  })
})

describe("editorStatus", () => {
  const base = { pageId: "pg001", loading: false, error: null, sectionCount: 1 }

  it("reports the editor lifecycle in priority order", () => {
    expect(editorStatus({ ...base, pageId: null })).toBe("idle")
    expect(editorStatus({ ...base, loading: true })).toBe("loading")
    expect(editorStatus({ ...base, error: new Error("boom") })).toBe("error")
    expect(editorStatus({ ...base, sectionCount: 0 })).toBe("empty")
    expect(editorStatus(base)).toBe("ready")
  })
})
