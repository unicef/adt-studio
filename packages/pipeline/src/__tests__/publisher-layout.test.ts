import { describe, expect, it, vi } from "vitest"
import { JSDOM } from "jsdom"
import { PublisherDocument, type ContentNodeData, type PublisherSource } from "@adt/types"
import { inferPublisherRegions } from "../publisher-layout.js"
import { analyzePublisherStyles } from "../publisher-styles.js"
import { renderPage, buildRenderStrategyResolver, collectReferencedImageIds } from "../web-rendering.js"
import { renderPublisherPage } from "../publisher-render.js"

const text = (id: string, content: string, role = "paragraph"): ContentNodeData => ({ nodeId: id, text: content, role, isPruned: false })
const fixture = (): PublisherSource => ({
  pageId: "pg001", pageNumber: 1,
  sectioning: { reasoning: "Mixed weather page", sections: [{ sectionId: "pg001_sec001", sectionType: "text_and_images", backgroundColor: "#FFFFFF", textColor: "#000000", pageNumber: 1, isPruned: false, nodes: [
    { nodeId: "heading", structure: "heading", isPruned: false, children: [{ ...text("title", "Air Is Matter", "section_heading"), headingLevel: 2 }] },
    { nodeId: "body", structure: "paragraph", isPruned: false, children: [text("sentence-a", "The air is matter."), text("sentence-b", "It has mass.")] },
    { nodeId: "aside", structure: "sidebar", isPruned: false, children: [text("aside-text", "Think about water.")] },
    text("wide", "Gravity pulls air toward the center of Earth."),
    { nodeId: "figure", structure: "image_group", isPruned: false, children: [{ nodeId: "pg001_im001", role: "image", isPruned: false }, text("caption", "Wind turns turbines.", "caption")] },
    { ...text("pruned", "Do not show this."), isPruned: true },
  ] }] },
  positioned: { pageWidth: 600, pageHeight: 800, renderWidth: 1200, renderHeight: 1600, drawItems: [
    ...[
      ["line-1", "Air Is Matter", 40, 40, 180],
      ["line-2", "The air is matter. It has mass.", 40, 100, 320],
      ["line-3", "Think about water.", 400, 100, 150],
      ["line-4", "Gravity pulls air toward the center of Earth.", 40, 250, 500],
      ["line-5", "Wind turns turbines.", 40, 650, 300],
    ].map(([id, content, x, y, width]) => ({ kind: "paragraph" as const, textId: String(id), text: String(content), left: Number(x), top: Number(y), lineHeight: 24, segments: [{ text: String(content), style: { "font-size": "18px" } }], blockBounds: { x: Number(x), y: Number(y), width: Number(width), height: 24 } })),
    { kind: "image", imageId: "pg001_im001", bounds: { x: 40, y: 310, width: 500, height: 300 } },
  ] },
})

const nodes = (source: PublisherSource) => source.sectioning!.sections[0].nodes

describe("publisher layout regions", () => {
  it("selects saved mixed regions instead of the two-column template and never calls the model", async () => {
    const source = fixture()
    const doc = analyzePublisherStyles([source], "editorial", "a")
    const model = vi.fn(() => { throw new Error("Unexpected model") })
    const engine = { render: vi.fn(() => Promise.resolve("wrong two-column template")) }
    const resolve = buildRenderStrategyResolver({ default_render_strategy: "publisher_styles", render_strategies: { publisher_styles: { render_type: "template", config: { template: "publisher_styles" } }, two_column: { render_type: "template", config: { template: "two_column_render" } } } })
    const input = { label: "book", pageId: source.pageId, sectioning: source.sectioning!, pageImageBase64: "", images: new Map([...collectReferencedImageIds(source.sectioning!.sections)].map((id) => [id, { base64: "fixture" }])), publisherDesign: { version: 4, document: doc } }
    const result = await renderPage(input, resolve, model, engine)
    expect(result.sections[0].html).toContain('data-layout="sidebar-right"')
    expect(result.sections[0].html).toContain('data-publisher-design-version="4"')
    expect(model).not.toHaveBeenCalled()
    expect(engine.render).not.toHaveBeenCalled()
    await expect(renderPage({ ...input, publisherDesign: undefined }, resolve, model, engine)).rejects.toThrow("Save a design in Styles")
    const missing = structuredClone(doc)
    delete missing.pages[0].regions
    await expect(renderPage({ ...input, publisherDesign: { version: 4, document: missing } }, resolve, model, engine)).rejects.toThrow("No saved layout")
  })

  it("composes full-width headings, a text/sidebar band, wide prose and a full-width figure", () => {
    const source = fixture()
    const result = inferPublisherRegions(nodes(source), source)
    expect(result.map((r) => r.template)).toEqual(["full-width", "sidebar-right", "full-width", "full-width"])
    expect(result[1]).toMatchObject({ origin: "pdf", slots: [{ column: 0, nodeIds: ["body"] }, { column: 1, nodeIds: ["aside"] }] })
    expect(result.flatMap((r) => r.slots.flatMap((s) => s.nodeIds))).toEqual(["heading", "body", "aside", "wide", "figure"])
    expect(inferPublisherRegions(nodes(source), source)).toEqual(result)
  })

  it("keeps a sidebar's original reading order even when its visual column is on the right", () => {
    const source = fixture()
    const list = nodes(source)
    ;[list[1], list[2]] = [list[2], list[1]]
    const doc = analyzePublisherStyles([source], "editorial", "a")
    expect(doc.pages[0].regions![1].slots.map((s) => s.column)).toEqual([1, 0])
    const html = new JSDOM(renderPublisherPage(doc, doc.pages[0].id, "/images").html).window.document
    expect([...html.querySelectorAll(".pub-slot>[data-id]")].map((e) => e.getAttribute("data-id"))).toEqual(["heading", "aside", "body", "wide", "figure"])
    expect(html.querySelectorAll('.pub-paragraph>span')).toHaveLength(2)
    expect(html.querySelector('[data-id="body"]')?.textContent).toBe("The air is matter. It has mass.")
  })

  it("detects a narrow tall image beside two stacked image groups", () => {
    const source = fixture()
    source.sectioning!.sections[0].nodes = ["tall", "top", "bottom"].map((nodeId) => ({ nodeId, role: "image", isPruned: false }))
    source.positioned!.drawItems = [
      { kind: "image", imageId: "tall", bounds: { x: 40, y: 100, width: 100, height: 500 } },
      { kind: "image", imageId: "top", bounds: { x: 220, y: 100, width: 300, height: 220 } },
      { kind: "image", imageId: "bottom", bounds: { x: 220, y: 350, width: 300, height: 220 } },
    ]
    expect(inferPublisherRegions(nodes(source), source)).toMatchObject([{ template: "sidebar-left", slots: [{ column: 0, nodeIds: ["tall"] }, { column: 1, nodeIds: ["top", "bottom"] }] }])
  })

  it("supports three equal columns and declines geometry that would reorder content", () => {
    const source = fixture()
    source.sectioning!.sections[0].nodes = ["a", "b", "c"].map((nodeId) => ({ nodeId, role: "image", isPruned: false }))
    source.positioned!.drawItems = [40, 220, 400].map((x, i) => ({ kind: "image", imageId: ["a", "b", "c"][i], bounds: { x, y: 100, width: 140, height: 300 } }))
    expect(inferPublisherRegions(nodes(source), source)[0].template).toBe("three-column")
    source.positioned!.drawItems[2] = { kind: "image", imageId: "c", bounds: { x: 40, y: 260, width: 140, height: 140 } }
    expect(inferPublisherRegions(nodes(source), source).every((r) => r.template === "full-width")).toBe(true)
  })

  it("falls back to semantic regions without coordinates and renders old saved designs", () => {
    const source = fixture()
    delete source.positioned
    expect(inferPublisherRegions(nodes(source), source)[1]).toMatchObject({ template: "sidebar-right", origin: "semantic" })
    const doc = analyzePublisherStyles([source], "editorial", "a")
    delete doc.pages[0].regions
    expect(PublisherDocument.safeParse(doc).success).toBe(true)
    expect(renderPublisherPage(doc, doc.pages[0].id, "/images").html).not.toContain('class="pub-region"')
  })

  it("rejects missing, duplicate, pruned, nested or reordered assignments and invalid slots", () => {
    const doc = analyzePublisherStyles([fixture()], "editorial", "a")
    for (const ids of [["missing"], ["heading", "heading"], ["pruned"], ["title"], ["body"]]) {
      const copy = structuredClone(doc)
      copy.pages[0].regions![0].slots[0].nodeIds = ids
      expect(PublisherDocument.safeParse(copy).success).toBe(false)
    }
    const invalid = structuredClone(doc)
    invalid.pages[0].regions![1].slots[1].column = 0
    expect(PublisherDocument.safeParse(invalid).success).toBe(false)
    const emptyColumn = structuredClone(doc)
    emptyColumn.pages[0].regions![0].template = "three-column"
    expect(PublisherDocument.safeParse(emptyColumn).success).toBe(false)
  })
})
