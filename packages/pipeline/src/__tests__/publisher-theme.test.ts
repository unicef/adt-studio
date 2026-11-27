import { describe, expect, it } from "vitest"
import { JSDOM } from "jsdom"
import { PublisherDocument, type PublisherSource, type ContentNodeData } from "@adt/types"
import { analyzePublisherStyles, publisherNodes } from "../publisher-styles.js"
import { applyPublisherLearningDesign, publisherComponentColors, publisherContrast, publisherHeadingColor, publisherInk } from "../publisher-theme.js"
import { renderPublisherPage, renderPublisherSection } from "../publisher-render.js"

const text = (nodeId: string, text: string, role = "text", headingLevel?: number): ContentNodeData => ({ nodeId, text, role, headingLevel, isPruned: false })
function source(pageNumber = 1): PublisherSource {
  const pageId = `pg${String(pageNumber).padStart(3, "0")}`
  const group = (id: string, structure: string, children: ContentNodeData[]): ContentNodeData => ({ nodeId: `${pageId}_${id}`, structure, children, isPruned: false })
  return { pageId, pageNumber, sectioning: { reasoning: "Weather patterns", sections: [{ sectionId: `${pageId}_sec001`, sectionType: "text_only", pageNumber, backgroundColor: "#ffffff", textColor: "#000000", isPruned: false, nodes: [
    group("chapter", "heading", [text(`${pageId}_title`, "Water in the Atmosphere", "chapter_title", 1)]),
    group("question", "sidebar", [text(`${pageId}_question_heading`, "Big Question", "subheading"), group("question_body", "paragraph", [text(`${pageId}_question_text`, "Where does the rain come from?")])]),
    group("body", "paragraph", [text(`${pageId}_a`, "Water moves through the air."), text(`${pageId}_b`, "It falls as rain.")]),
    group("think", "sidebar", [group("nested_heading", "heading", [text(`${pageId}_think_heading`, "Think About Matter", "subheading")]), group("think_body", "paragraph", [text(`${pageId}_think_text`, "Ice, liquid water, and water vapor.")])]),
    group("vocabulary", "sidebar", [text(`${pageId}_vocabulary_heading`, "Vocabulary", "subheading"), group("definition_group", "group", [text(`${pageId}_term`, "weather", "label"), text(`${pageId}_definition`, "What the air is like today.")])]),
    { ...text(`${pageId}_pruned`, "Hidden"), isPruned: true },
  ] }] } }
}

describe("publisher learning design", () => {
  it("shares a finite library across pages without changing content, regions or source fingerprint", () => {
    const before = analyzePublisherStyles([source(1), source(2)], "editorial", "original")
    const input = structuredClone(before)
    const doc = applyPublisherLearningDesign(before, "#007f5b")
    expect(before).toEqual(input)
    expect(doc.sourceFingerprint).toBe("original")
    expect(doc.pages.map((p) => [p.nodes, p.regions, p.textStyles])).toEqual(before.pages.map((p) => [p.nodes, p.regions, p.textStyles]))
    expect(doc.components.filter((c) => c.treatment === "banner")).toHaveLength(1)
    expect(doc.components.find((c) => c.id === "pub-learning-question")?.evidence.count).toBe(2)
    expect(doc.components.find((c) => c.id === "pub-learning-vocabulary")?.header).toBe("tint")
    expect(applyPublisherLearningDesign(doc, "#007f5b")).toEqual(doc)
  })

  it("uses actual direct and nested heading content for named boxes and preserves every leaf in order", () => {
    const input = source()
    const doc = applyPublisherLearningDesign(analyzePublisherStyles([input], "editorial", "a"), "#007f5b")
    const output = renderPublisherSection({ version: 10, document: doc }, input.sectioning!.sections[0], 0, "/images")
    const dom = new JSDOM(output.html).window.document
    const leaves = publisherNodes(input.sectioning!.sections[0].nodes).filter((n) => !n.children)
    expect([...dom.querySelectorAll('.pub-text')].map((el) => [el.getAttribute("data-id"), el.textContent])).toEqual(leaves.map((n) => [n.nodeId, n.text]))
    expect([...dom.querySelectorAll('.pub-box-heading')].map((el) => el.textContent)).toEqual(["Big Question", "Think About Matter", "Vocabulary"])
    for (const aside of dom.querySelectorAll("aside")) expect(dom.getElementById(aside.getAttribute("aria-labelledby")!)?.tagName).toBe("H3")
    expect(dom.querySelectorAll("h1")).toHaveLength(1)
    expect(dom.querySelectorAll('[data-id="pg001_think_text"]')).toHaveLength(1)
  })

  it("chooses text with at least 4.5:1 contrast for dark, light, and mid-tone accents and custom fills", () => {
    const doc = applyPublisherLearningDesign(analyzePublisherStyles([source()], "editorial", "a"), "#007f5b")
    for (const accent of ["#ffffff", "#000000", "#ffff00", "#777777", "#007f5b", "#ff0000", "#3461df"]) {
      const themed = { ...doc, theme: { accent } }
      for (const c of doc.components.filter((c) => c.treatment !== "plain")) {
        const palette = publisherComponentColors(c, themed)
        expect(publisherContrast(palette.ink, palette.surface)).toBeGreaterThanOrEqual(4.5)
        expect(publisherContrast(palette.headerInk, palette.header)).toBeGreaterThanOrEqual(4.5)
      }
      expect(publisherContrast(publisherHeadingColor(accent, "#ffffff"), "#ffffff")).toBeGreaterThanOrEqual(4.5)
      expect(publisherContrast(publisherInk(accent), accent)).toBeGreaterThanOrEqual(4.5)
      const custom = publisherComponentColors({ ...doc.components[0], palette: "custom", treatment: "card", background: accent }, themed)
      expect(custom.surface).toBe(accent)
      expect(publisherContrast(custom.ink, custom.surface)).toBeGreaterThanOrEqual(4.5)
    }
    const first = renderPublisherPage(doc, doc.pages[0].id, "/images")
    const second = renderPublisherPage({ ...doc, theme: { accent: "#3461df" } }, doc.pages[0].id, "/images")
    expect(second.html).toEqual(first.html)
    expect(second.css).not.toEqual(first.css)
    expect(second.css).toContain("#3461df")
  })

  it("wraps only when source order puts the sidebar first and rejects unsafe colors", () => {
    const doc = analyzePublisherStyles([source()], "editorial", "a")
    const page = doc.pages[0]
    page.regions = [
      { id: "pub-region-top", template: "full-width", origin: "manual", slots: [{ column: 0, nodeIds: ["pg001_chapter"] }] },
      { id: "pub-region-wrap", template: "sidebar-right", origin: "manual", flow: "wrap", slots: [{ column: 1, nodeIds: ["pg001_question"] }, { column: 0, nodeIds: ["pg001_body", "pg001_think", "pg001_vocabulary"] }] },
    ]
    expect(renderPublisherPage(doc, page.id, "/images").html).toContain('data-flow="wrap"')
    expect(PublisherDocument.safeParse({ ...doc, theme: { accent: "red;}body{display:none" } }).success).toBe(false)
    page.regions[1].slots[0].column = 0
    page.regions[1].slots[1].column = 1
    expect(PublisherDocument.safeParse(doc).success).toBe(false)
  })
})
