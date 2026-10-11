// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import type { PageDetail } from "@/api/client"
import { findRenderedSection, mergeQueuedRenderingEdit } from "./rendered-section"
const rendering = { sections: [
  { sectionIndex: 1, html: '<section data-section-id="s9">nine</section>' },
  { sectionIndex: 0, html: '<section data-section-id="s2">two</section>' },
] } as NonNullable<PageDetail["rendering"]>

describe("editor rendering correspondence", () => {
  it("uses stable IDs for reordered and sparse renderings regardless of recycled indexes", () => {
    expect(findRenderedSection(rendering, "s9")?.html).toContain("nine")
    expect(findRenderedSection(rendering, "s2")?.html).toContain("two")
    expect(findRenderedSection(rendering, "retired")).toBeUndefined()
  })
  it("does not infer correspondence from a missing, nested or duplicate ID", () => {
    expect(findRenderedSection(rendering, undefined)).toBeUndefined()
    expect(findRenderedSection({ sections: [rendering.sections[0], rendering.sections[0]] }, "s9")).toBeUndefined()
    expect(findRenderedSection({ sections: [{ ...rendering.sections[0], html: "<section>Legacy</section>" }] }, "s9")).toBeUndefined()
    expect(findRenderedSection({ sections: [{ ...rendering.sections[0], html: '<section data-section-id="s9"><section data-section-id="s9">Nested</section></section>' }] }, "s9")).toBeUndefined()
  })
  it("permits the positioned page only with explicit fixed mode and a single fixed-layout rendering", () => {
    const fixed = { sections: [{ ...rendering.sections[0], sectionType: "fixed-layout-page" }] }
    expect(findRenderedSection(fixed, "semantic-id")).toBeUndefined()
    expect(findRenderedSection(fixed, "semantic-id", true)?.html).toContain("nine")
    expect(findRenderedSection(rendering, "s9", true)).toBeUndefined()
    expect(findRenderedSection({ sections: [fixed.sections[0], fixed.sections[0]] }, "semantic-id", true)).toBeUndefined()
  })
})


describe("queued inspector HTML", () => {
  it("patches a sparse stable target without replacing the sibling whose stored index equals the source position", () => {
    const target = { ...rendering.sections[0], sectionIndex: 99 }
    const sibling = { ...rendering.sections[1], sectionIndex: 0 }
    const before = { sections: [sibling, target] }
    const html = '<section data-section-id="s9" class="edited">nine</section>'
    const after = mergeQueuedRenderingEdit(before, { sectionId: "s9", fixedLayout: false, html })!
    expect(after.sections[0]).toBe(sibling)
    expect(after.sections[0].html).toBe(sibling.html)
    expect(after.sections[1]).toEqual({ ...target, html })
    expect(after.sections[1].sectionIndex).toBe(99)
    expect(before.sections[1].html).toBe(target.html)
  })

  it("refuses duplicate, retired or changed identities without mutating any rendering", () => {
    const before = JSON.stringify(rendering)
    expect(mergeQueuedRenderingEdit(rendering, { sectionId: "retired", fixedLayout: false, html: rendering.sections[0].html })).toBeNull()
    expect(mergeQueuedRenderingEdit(rendering, { sectionId: "s9", fixedLayout: false, html: '<section data-section-id="s2">Changed identity</section>' })).toBeNull()
    expect(mergeQueuedRenderingEdit({ sections: [rendering.sections[0], rendering.sections[0]] }, { sectionId: "s9", fixedLayout: false, html: rendering.sections[0].html })).toBeNull()
    expect(JSON.stringify(rendering)).toBe(before)
  })

  it("keeps the positioned-page edit path explicit and separate from semantic correspondence", () => {
    const fixed = { sections: [{ ...rendering.sections[0], sectionType: "fixed-layout-page", sectionIndex: 99 }] }
    const html = '<section data-section-id="s9" style="color: red">nine</section>'
    expect(mergeQueuedRenderingEdit(fixed, { sectionId: "unrelated-semantic-id", fixedLayout: false, html })).toBeNull()
    expect(mergeQueuedRenderingEdit(fixed, { sectionId: "unrelated-semantic-id", fixedLayout: true, html })?.sections[0].html).toBe(html)
  })
})
