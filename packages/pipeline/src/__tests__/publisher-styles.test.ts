import { describe, expect, it } from "vitest"
import { JSDOM } from "jsdom"
import { PublisherDocument, type PublisherSource } from "@adt/types"
import { analyzePublisherStyles } from "../publisher-styles.js"
import { renderPublisherPage } from "../publisher-render.js"

function source(pageNumber: number, sectionType = "text"): PublisherSource {
  const pageId = `pg${String(pageNumber).padStart(3, "0")}`
  return {
    pageId, pageNumber,
    sectioning: { reasoning: "test", sections: [{ sectionId: `${pageId}_sec001`, sectionType, backgroundColor: "#FFFFFF", textColor: "#123456", pageNumber, isPruned: false, nodes: [
      { nodeId: `${pageId}_title`, role: "heading", headingLevel: 2, text: "A shared world", isPruned: false },
      { nodeId: `${pageId}_group`, structure: "callout", isPruned: false, children: [
        { nodeId: `${pageId}_text`, role: "paragraph", text: "Every leaf matters <script>alert(1)</script>", isPruned: false },
        { nodeId: `${pageId}_image`, role: "image", isPruned: false },
      ] },
      { nodeId: `${pageId}_hidden`, role: "paragraph", text: "Excluded", isPruned: true },
    ] }] },
    positioned: { pageWidth: 600, pageHeight: 800, renderWidth: 1200, renderHeight: 1600, drawItems: [
      { kind: "paragraph", textId: `${pageId}_text`, text: "Every leaf matters <script>alert(1)</script>", top: 40, left: 40, lineHeight: 24, segments: [{ text: "Every leaf matters <script>alert(1)</script>", style: { "font-family": "Georgia", "font-size": "18px", color: "#123456", "font-weight": "700" } }] },
    ] },
  }
}

describe("publisher design experiment", () => {
  it("clusters repeated PDF styles across pages with source evidence", () => {
    const doc = analyzePublisherStyles([source(1), source(2)], "source", "fingerprint")
    const body = doc.styles.find((s) => s.role === "paragraph")!
    expect(body).toMatchObject({ fontFamily: "Georgia", fontSize: 18, fontWeight: 700, color: "#123456", origin: "pdf", evidence: { count: 2, pageIds: ["pg001", "pg002"] } })
    expect(doc.pages[0].textStyles.pg001_text).toBe(doc.pages[1].textStyles.pg002_text)
    expect(doc.components.find((c) => c.structure === "callout")?.evidence.count).toBe(2)
    expect(doc.pages[0].textStyles.pg001_hidden).toBeUndefined()
  })

  it("maps page categories deterministically and uses finite shared masters", () => {
    const doc = analyzePublisherStyles([source(1, "chapter"), source(2, "activity"), source(3, "glossary"), source(4)], "editorial", "a")
    expect(doc.pages.map((p) => p.reason)).toEqual(["chapter", "exercise", "reference", "image"])
    expect(doc.styles.every((s) => s.origin === "preset")).toBe(true)
    expect(analyzePublisherStyles([source(1, "chapter"), source(2, "activity"), source(3, "glossary"), source(4)], "editorial", "a")).toEqual(doc)
  })

  it("preserves leaf ids, source text, heading semantics, and images while escaping markup", () => {
    const doc = analyzePublisherStyles([source(1)], "source", "a")
    const rendered = renderPublisherPage(doc, doc.pages[0].id, "/api/books/book/images")
    const dom = new JSDOM(rendered.html).window.document
    expect(dom.querySelectorAll("script")).toHaveLength(0)
    expect(dom.querySelector("h2")?.getAttribute("data-id")).toBe("pg001_title")
    expect(dom.querySelector('[data-id="pg001_text"]')?.textContent).toBe("Every leaf matters <script>alert(1)</script>")
    expect(dom.querySelector("img")?.getAttribute("src")).toBe("/api/books/book/images/pg001_image")
    expect(dom.querySelector('[data-id="pg001_hidden"]')).toBeNull()
    expect(renderPublisherPage(doc, doc.pages[0].id, "/api/books/book/images")).toEqual(rendered)
  })

  it("edits one class across every page without changing content bindings", () => {
    const doc = analyzePublisherStyles([source(1), source(2)], "editorial", "a")
    const edited = structuredClone(doc)
    edited.styles[0].color = "#FF0000"
    for (const page of doc.pages) {
      const before = renderPublisherPage(doc, page.id, "/images")
      const after = renderPublisherPage(edited, page.id, "/images")
      expect(after.html).toBe(before.html)
      expect(after.css).toContain("color:#FF0000")
    }
  })

  it("supports extraction-only PDFs, merges wrapped lines, and labels the inference", () => {
    const input = source(1)
    delete input.sectioning
    const paragraph = input.positioned!.drawItems[0]
    if (paragraph.kind !== "paragraph") throw new Error("bad fixture")
    paragraph.mergedParagraphId = "block"
    input.positioned!.drawItems.push({ ...paragraph, textId: "pg001_next", text: "Second line", segments: [{ text: "Second line" }] })
    const doc = analyzePublisherStyles([input], "source", "a")
    expect(doc.pages[0].id).toBe("pg001")
    expect(doc.pages[0].nodes).toHaveLength(1)
    expect(doc.pages[0].nodes[0].text).toContain("Second line")
    expect(renderPublisherPage(doc, "pg001", "/images").warnings).toContain("extraction-only")
  })

  it("rejects CSS injection, broken references, duplicate identities, and invalid dimensions", () => {
    const doc = analyzePublisherStyles([source(1)], "editorial", "a")
    for (const patch of [{ color: "red;}body{display:none" }, { fontFamily: "Arial; background:url(https://evil.test)" }, { id: "x</style><script>" }, { fontSize: 0 }]) {
      expect(PublisherDocument.safeParse({ ...doc, styles: [{ ...doc.styles[0], ...patch }, ...doc.styles.slice(1)] }).success).toBe(false)
    }
    expect(PublisherDocument.safeParse({ ...doc, pages: [{ ...doc.pages[0], masterId: "pub-missing" }] }).success).toBe(false)
    expect(PublisherDocument.safeParse({ ...doc, styles: [...doc.styles, doc.styles[0]] }).success).toBe(false)
  })

  it("learns reusable landscape and portrait object variants from PDF geometry", () => {
    const landscape = source(1)
    const portrait = source(2)
    landscape.positioned!.drawItems.push({ kind: "image", imageId: "pg001_image", bounds: { x: 30, y: 100, width: 500, height: 200 } })
    portrait.positioned!.drawItems.push({ kind: "image", imageId: "pg002_image", bounds: { x: 30, y: 100, width: 200, height: 500 } })
    const doc = analyzePublisherStyles([landscape, portrait], "source", "a")
    const objects = doc.components.filter((c) => c.structure === "image")
    expect(objects).toHaveLength(2)
    expect(objects.map((c) => [c.origin, c.imageHeight])).toEqual([["pdf", 280], ["pdf", 540]])
  })
})
