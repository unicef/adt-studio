import { expect, it } from "vitest"
import { replaceRenderedFigure, replaceSectioningFigure } from "../replace-figure.js"
import { PageSectioningOutput } from "@adt/types"

it("replaces only matching image tags, preserving text, scripts, layout and similar IDs", () => {
  const unchanged = `<p>pg001_im001</p><script>const example = '<img data-id="pg001_im001">';</script><!-- <img data-id="pg001_im001"> --><img data-id="pg001_im001_extra" src="/api/books/book/images/pg001_im001_extra">`
  const image = `<img alt="My drawing with src='example'" data-id='pg001_im001' src='/api/books/book/images/pg001_im001?v=4' srcset="old.png 2x" width="320" height="200" style="position:absolute;left:20px;object-fit:cover">`
  const html = replaceRenderedFigure(unchanged + image, "book", "pg001_im001", "cleanup_new")
  expect(html.startsWith(unchanged)).toBe(true)
  expect(html).toContain(`alt="My drawing with src='example'"`)
  expect(html).toContain('data-id="cleanup_new"')
  expect(html).toContain('src="/api/books/book/images/cleanup_new"')
  expect(html).not.toContain("srcset=")
  expect(html).toContain('width="320" height="200"')
  expect(html).toContain("position:absolute;left:20px;object-fit:contain!important")
})

it("finds unquoted attributes and source-only references and leaves unrelated HTML byte-identical", () => {
  expect(replaceRenderedFigure('<img src=/api/books/book/images/old>', "book", "old", "new"))
    .toContain('src="/api/books/book/images/new" data-id="new"')
  expect(replaceRenderedFigure("<p>unchanged &amp; text</p>", "book", "old", "new"))
    .toBe("<p>unchanged &amp; text</p>")
})

it("updates nested image leaves and placement keys without mutating captions or the source version", () => {
  const data = PageSectioningOutput.parse({ reasoning: "Keep", sections: [{
    sectionId: "pg001_sec001", sectionType: "content", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false,
    nodes: [{ nodeId: "group", structure: "image_group", isPruned: false, children: [
      { nodeId: "old", role: "image", isPruned: false }, { nodeId: "caption", role: "caption", text: "old", isPruned: false },
    ] }], placement: { old: { bounds: { x: 1, y: 2, width: 3, height: 4 } } },
  }] })
  const next = replaceSectioningFigure(data, "old", "new")
  expect(next.sections[0].nodes[0].children?.map((node) => node.nodeId)).toEqual(["new", "caption"])
  expect(next.sections[0].nodes[0].children?.[1].text).toBe("old")
  expect(next.sections[0].placement?.new).toEqual(data.sections[0].placement?.old)
  expect(next.sections[0].placement?.old).toBeUndefined()
  expect(data.sections[0].nodes[0].children?.[0].nodeId).toBe("old")
})
