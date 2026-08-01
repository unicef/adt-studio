import { describe, it, expect } from "vitest"
import type { PageSectioningSection } from "@adt/types"
import { buildSectioningSectionFromHtml } from "../tools/build-sectioning.js"

function baseSection(): PageSectioningSection {
  return {
    sectionId: "pg003_sec001",
    sectionType: "text_only",
    backgroundColor: "#fff8e7",
    textColor: "#1a1a1a",
    pageNumber: 12,
    isPruned: false,
    sourcePageIds: ["pg002"],
    nodes: [
      {
        nodeId: "pg003_root",
        isPruned: false,
        structure: "section",
        children: [
          { nodeId: "tx001", isPruned: false, role: "heading", text: "Chapter 3" },
          { nodeId: "tx002", isPruned: false, role: "caption", text: "A river" },
          { nodeId: "tx003", isPruned: false, role: "paragraph", text: "Body" },
        ],
      },
    ],
  }
}

const REWRITTEN =
  '<section data-id="pg003_sec001">' +
  '<h2 data-id="tx001">Chapter 3</h2>' +
  '<figcaption data-id="tx002">A river</figcaption>' +
  '<p data-id="tx004">Brand new line</p>' +
  "</section>"

describe("buildSectioningSectionFromHtml — replacing an existing section", () => {
  it("preserves metadata the rewrite doesn't own", () => {
    const base = baseSection()
    const result = buildSectioningSectionFromHtml({
      html: REWRITTEN,
      sectionId: base.sectionId,
      sectionType: base.sectionType,
      base,
    })

    expect(result.pageNumber).toBe(12)
    expect(result.backgroundColor).toBe("#fff8e7")
    expect(result.textColor).toBe("#1a1a1a")
    expect(result.sourcePageIds).toEqual(["pg002"])
  })

  it("carries prior leaf roles across by nodeId", () => {
    const base = baseSection()
    const result = buildSectioningSectionFromHtml({
      html: REWRITTEN,
      sectionId: base.sectionId,
      sectionType: base.sectionType,
      base,
    })

    const leaves = result.nodes[0].children ?? []
    const byId = new Map(leaves.map((n) => [n.nodeId, n]))
    // A heading must stay a heading — packaging's findHeadingText keys the
    // section's TOC entry off role === "heading".
    expect(byId.get("tx001")?.role).toBe("heading")
    expect(byId.get("tx002")?.role).toBe("caption")
    // A node the rewrite introduced has no prior role and falls back to text.
    expect(byId.get("tx004")?.role).toBe("text")
    // A node the rewrite dropped is gone rather than orphaned.
    expect(byId.has("tx003")).toBe(false)
  })

  it("does not carry role=\"image\" onto a node that is no longer an <img>", () => {
    const base: PageSectioningSection = {
      ...baseSection(),
      nodes: [
        {
          nodeId: "pg003_root",
          isPruned: false,
          structure: "section",
          children: [{ nodeId: "im001", isPruned: false, role: "image" }],
        },
      ],
    }
    // The rewrite replaced the <img> with a text element reusing its data-id.
    const result = buildSectioningSectionFromHtml({
      html: '<section><p data-id="im001">A river at dusk</p></section>',
      sectionId: base.sectionId,
      sectionType: base.sectionType,
      base,
    })

    const leaf = result.nodes[0].children?.[0]
    // role="image" here would make buildRenderContext look the node up in the
    // image store, miss, and drop it from the rendered output.
    expect(leaf?.role).toBe("text")
    expect(leaf?.text).toBe("A river at dusk")
  })

  it("still marks a real <img> as an image leaf", () => {
    const result = buildSectioningSectionFromHtml({
      html: '<section><img data-id="im001" src="x.png" alt="A river"></section>',
      sectionId: "pg003_sec001",
      sectionType: "text_only",
      base: baseSection(),
    })

    expect(result.nodes[0].children?.[0]).toMatchObject({
      nodeId: "im001",
      role: "image",
    })
  })

  it("falls back to defaults when there is no base section", () => {
    const result = buildSectioningSectionFromHtml({
      html: '<section><h2 data-id="tx001">New activity</h2></section>',
      sectionId: "pg003_s4",
      sectionType: "activity_custom_drag_drop",
    })

    expect(result.pageNumber).toBeNull()
    expect(result.backgroundColor).toBe("#ffffff")
    expect(result.textColor).toBe("#000000")
    expect(result.nodes[0].children?.[0]?.role).toBe("text")
  })

  it("always takes sectionId/sectionType from the arguments, not the base", () => {
    const base = baseSection()
    const result = buildSectioningSectionFromHtml({
      html: REWRITTEN,
      sectionId: "pg003_s9",
      sectionType: "activity_custom_crossword",
      base,
    })

    expect(result.sectionId).toBe("pg003_s9")
    expect(result.sectionType).toBe("activity_custom_crossword")
  })
})
