import { describe, it, expect } from "vitest"
import type {
  PageSectioningOutput,
  PageSectioningSection,
  WebRenderingOutput,
} from "@adt/types"
import { propagateSectioningTextToRendering } from "../propagate-sectioning-text.js"

const LABEL = "test-book"

function leaf(nodeId: string, text: string, role = "paragraph") {
  return { nodeId, isPruned: false, role, text }
}

function section(
  sectionId: string,
  nodes: PageSectioningSection["nodes"]
): PageSectioningSection {
  return {
    sectionId,
    sectionType: "text",
    backgroundColor: "#fff",
    textColor: "#000",
    pageNumber: 1,
    isPruned: false,
    nodes,
  }
}

function html(body: string, sectionId = "pg001_sec001"): string {
  return `<div class="container content" id="content"><section data-section-type="text" data-section-id="${sectionId}" class="space-y-6">${body}</section></div>`
}

function rendering(sections: Array<{ sectionIndex: number; html: string }>): WebRenderingOutput {
  return {
    sections: sections.map((s) => ({
      sectionIndex: s.sectionIndex,
      sectionType: "text",
      reasoning: "",
      html: s.html,
    })),
  }
}

describe("propagateSectioningTextToRendering", () => {
  it("rewrites rendered text to match an edited section tree", () => {
    const sectioning: PageSectioningOutput = {
      reasoning: "",
      sections: [
        section("pg001_sec001", [
          leaf("pg001_tx001", "Heading"),
          leaf("pg001_tx002", "The user rewrote this sentence entirely."),
        ]),
      ],
    }
    const stored = rendering([
      {
        sectionIndex: 0,
        html: html(
          `<h1 data-id="pg001_tx001">Heading</h1><p data-id="pg001_tx002">Original body text.</p>`
        ),
      },
    ])

    const result = propagateSectioningTextToRendering(sectioning, stored, LABEL)

    expect(result.changed).toBe(true)
    expect(result.needsRerender).toBe(false)
    expect(result.updatedSectionIndices).toEqual([0])
    expect(result.rendering.sections[0].html).toContain(
      "The user rewrote this sentence entirely."
    )
    expect(result.rendering.sections[0].html).not.toContain("Original body text.")
  })

  it("preserves surrounding markup, classes, and attributes", () => {
    const sectioning: PageSectioningOutput = {
      reasoning: "",
      sections: [section("pg001_sec001", [leaf("pg001_tx001", "New copy")])],
    }
    const stored = rendering([
      {
        sectionIndex: 0,
        html: html(
          `<p class="text-lg leading-relaxed text-gray-800" data-id="pg001_tx001">Old copy</p>`
        ),
      },
    ])

    const result = propagateSectioningTextToRendering(sectioning, stored, LABEL)

    const out = result.rendering.sections[0].html
    expect(out).toContain('class="text-lg leading-relaxed text-gray-800"')
    expect(out).toContain('data-section-type="text"')
    expect(out).toContain('id="content"')
    expect(out).toContain("New copy")
  })

  it("is a no-op when no text changed", () => {
    const sectioning: PageSectioningOutput = {
      reasoning: "",
      sections: [section("pg001_sec001", [leaf("pg001_tx001", "Unchanged")])],
    }
    const stored = rendering([
      { sectionIndex: 0, html: html(`<p data-id="pg001_tx001">Unchanged</p>`) },
    ])

    const result = propagateSectioningTextToRendering(sectioning, stored, LABEL)

    expect(result.changed).toBe(false)
    expect(result.updatedSectionIndices).toEqual([])
    expect(result.skipped).toEqual([])
    // Same object identity — callers can skip the write entirely.
    expect(result.rendering).toBe(stored)
  })

  it("is idempotent", () => {
    const sectioning: PageSectioningOutput = {
      reasoning: "",
      sections: [section("pg001_sec001", [leaf("pg001_tx001", "Edited")])],
    }
    const stored = rendering([
      { sectionIndex: 0, html: html(`<p data-id="pg001_tx001">Original</p>`) },
    ])

    const first = propagateSectioningTextToRendering(sectioning, stored, LABEL)
    const second = propagateSectioningTextToRendering(
      sectioning,
      first.rendering,
      LABEL
    )

    expect(first.changed).toBe(true)
    expect(second.changed).toBe(false)
    expect(second.rendering.sections[0].html).toBe(
      first.rendering.sections[0].html
    )
  })

  it("flags a leaf added to the tree but absent from the HTML", () => {
    const sectioning: PageSectioningOutput = {
      reasoning: "",
      sections: [
        section("pg001_sec001", [
          leaf("pg001_tx001", "Existing"),
          leaf("pg001_tx002", "Newly added paragraph"),
        ]),
      ],
    }
    const stored = rendering([
      { sectionIndex: 0, html: html(`<p data-id="pg001_tx001">Existing</p>`) },
    ])

    const result = propagateSectioningTextToRendering(sectioning, stored, LABEL)

    expect(result.needsRerender).toBe(true)
    expect(result.changed).toBe(false)
    expect(result.skipped[0].reason).toBe("structural")
    // The stale section is left exactly as it was rather than half-patched.
    expect(result.rendering.sections[0].html).toBe(stored.sections[0].html)
  })

  it("flags a leaf removed from the tree but still in the HTML", () => {
    const sectioning: PageSectioningOutput = {
      reasoning: "",
      sections: [section("pg001_sec001", [leaf("pg001_tx001", "Kept")])],
    }
    const stored = rendering([
      {
        sectionIndex: 0,
        html: html(
          `<p data-id="pg001_tx001">Kept</p><p data-id="pg001_tx002">Deleted</p>`
        ),
      },
    ])

    const result = propagateSectioningTextToRendering(sectioning, stored, LABEL)

    expect(result.needsRerender).toBe(true)
    expect(result.skipped[0].reason).toBe("structural")
  })

  it("treats a pruned node as structural drift", () => {
    const sectioning: PageSectioningOutput = {
      reasoning: "",
      sections: [
        section("pg001_sec001", [
          leaf("pg001_tx001", "Kept"),
          { nodeId: "pg001_tx002", isPruned: true, role: "paragraph", text: "Hidden" },
        ]),
      ],
    }
    const stored = rendering([
      {
        sectionIndex: 0,
        html: html(
          `<p data-id="pg001_tx001">Kept</p><p data-id="pg001_tx002">Hidden</p>`
        ),
      },
    ])

    const result = propagateSectioningTextToRendering(sectioning, stored, LABEL)

    expect(result.needsRerender).toBe(true)
  })

  it("matches sections by sectionIndex, not array position", () => {
    // The renderer skips sections with no renderable content, so rendering
    // .sections is sparse: here only index 1 was rendered.
    const sectioning: PageSectioningOutput = {
      reasoning: "",
      sections: [
        section("pg001_sec001", []),
        section("pg001_sec002", [leaf("pg001_tx002", "Second section, edited")]),
      ],
    }
    const stored = rendering([
      {
        sectionIndex: 1,
        html: html(`<p data-id="pg001_tx002">Second section</p>`, "pg001_sec002"),
      },
    ])

    const result = propagateSectioningTextToRendering(sectioning, stored, LABEL)

    expect(result.changed).toBe(true)
    expect(result.updatedSectionIndices).toEqual([1])
    expect(result.rendering.sections[0].html).toContain("Second section, edited")
  })

  it("updates only the edited section and leaves siblings untouched", () => {
    const sectioning: PageSectioningOutput = {
      reasoning: "",
      sections: [
        section("pg001_sec001", [leaf("pg001_tx001", "Untouched")]),
        section("pg001_sec002", [leaf("pg001_tx002", "Changed")]),
      ],
    }
    const stored = rendering([
      { sectionIndex: 0, html: html(`<p data-id="pg001_tx001">Untouched</p>`) },
      {
        sectionIndex: 1,
        html: html(`<p data-id="pg001_tx002">Before</p>`, "pg001_sec002"),
      },
    ])

    const result = propagateSectioningTextToRendering(sectioning, stored, LABEL)

    expect(result.updatedSectionIndices).toEqual([1])
    expect(result.rendering.sections[0].html).toBe(stored.sections[0].html)
    expect(result.rendering.sections[1].html).toContain("Changed")
  })

  it("does not treat image nodes as text", () => {
    const sectioning: PageSectioningOutput = {
      reasoning: "",
      sections: [
        section("pg001_sec001", [
          { nodeId: "pg001_im001", isPruned: false, role: "image" },
          leaf("pg001_tx001", "Caption-adjacent copy, edited"),
        ]),
      ],
    }
    const stored = rendering([
      {
        sectionIndex: 0,
        html: html(
          `<img data-id="pg001_im001" src="/api/books/test-book/images/pg001_im001" alt="" /><p data-id="pg001_tx001">Original</p>`
        ),
      },
    ])

    const result = propagateSectioningTextToRendering(sectioning, stored, LABEL)

    expect(result.needsRerender).toBe(false)
    expect(result.changed).toBe(true)
    const out = result.rendering.sections[0].html
    expect(out).toContain("Caption-adjacent copy, edited")
    // The <img> keeps its original src — we pass no imageUrlPrefix, so the
    // validator's src-rewriting pass never runs.
    expect(out).toContain('src="/api/books/test-book/images/pg001_im001"')
  })

  it("leaves structurally sound sections alone when a sibling drifts", () => {
    const sectioning: PageSectioningOutput = {
      reasoning: "",
      sections: [
        section("pg001_sec001", [leaf("pg001_tx001", "Edited fine")]),
        section("pg001_sec002", [
          leaf("pg001_tx002", "Kept"),
          leaf("pg001_tx003", "Added"),
        ]),
      ],
    }
    const stored = rendering([
      { sectionIndex: 0, html: html(`<p data-id="pg001_tx001">Before</p>`) },
      {
        sectionIndex: 1,
        html: html(`<p data-id="pg001_tx002">Kept</p>`, "pg001_sec002"),
      },
    ])

    const result = propagateSectioningTextToRendering(sectioning, stored, LABEL)

    expect(result.changed).toBe(true)
    expect(result.needsRerender).toBe(true)
    expect(result.updatedSectionIndices).toEqual([0])
    expect(result.rendering.sections[0].html).toContain("Edited fine")
    expect(result.rendering.sections[1].html).toBe(stored.sections[1].html)
  })

  it("flags a section that has content but was never rendered", () => {
    const sectioning: PageSectioningOutput = {
      reasoning: "",
      sections: [
        section("pg001_sec001", [leaf("pg001_tx001", "Rendered")]),
        section("pg001_sec002", [leaf("pg001_tx002", "Never rendered")]),
      ],
    }
    const stored = rendering([
      { sectionIndex: 0, html: html(`<p data-id="pg001_tx001">Rendered</p>`) },
    ])

    const result = propagateSectioningTextToRendering(sectioning, stored, LABEL)

    expect(result.needsRerender).toBe(true)
    expect(result.skipped.map((s) => s.sectionIndex)).toContain(1)
  })

  it("ignores an empty section the renderer skips by design", () => {
    const sectioning: PageSectioningOutput = {
      reasoning: "",
      sections: [
        section("pg001_sec001", [leaf("pg001_tx001", "Rendered")]),
        section("pg001_sec002", []),
      ],
    }
    const stored = rendering([
      { sectionIndex: 0, html: html(`<p data-id="pg001_tx001">Rendered</p>`) },
    ])

    const result = propagateSectioningTextToRendering(sectioning, stored, LABEL)

    expect(result.needsRerender).toBe(false)
    expect(result.skipped).toEqual([])
  })

  // A rendering node that exists but has no sections is drift. The separate
  // "page was never rendered" case is short-circuited by the caller.
  it("reports drift when the rendering has no sections at all", () => {
    const sectioning: PageSectioningOutput = {
      reasoning: "",
      sections: [section("pg001_sec001", [leaf("pg001_tx001", "Text")])],
    }
    const result = propagateSectioningTextToRendering(
      sectioning,
      { sections: [] },
      LABEL
    )

    expect(result.changed).toBe(false)
    expect(result.needsRerender).toBe(true)
  })

  it("stays quiet when neither side has content", () => {
    const result = propagateSectioningTextToRendering(
      { reasoning: "", sections: [] },
      { sections: [] },
      LABEL
    )

    expect(result.changed).toBe(false)
    expect(result.needsRerender).toBe(false)
  })
})
