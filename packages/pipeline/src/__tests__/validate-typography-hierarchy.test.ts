import { describe, expect, it } from "vitest"
import { validateTypographyHierarchy } from "../validate-typography-hierarchy.js"

describe("validateTypographyHierarchy", () => {
  it("accepts authoritative H1/H2/H3 role mappings", () => {
    const html = `<section><h1 class="adt-h1" data-id="chapter">Chapter</h1><h2 class="adt-h2"><span data-id="section">Section</span></h2><h3 class="adt-h3" data-id="sub">Sub</h3></section>`
    expect(validateTypographyHierarchy(html, [
      { text_id: "chapter", text_type: "chapter_title" },
      { text_id: "section", text_type: "section_heading" },
      { text_id: "sub", text_type: "subheading" },
    ])).toEqual([])
  })

  it("rejects role/tag/class mismatches", () => {
    const html = `<section><h2 class="adt-h1" data-id="chapter">Chapter</h2><h1 class="adt-h2" data-id="section">Section</h1></section>`
    const errors = validateTypographyHierarchy(html, [
      { text_id: "chapter", text_type: "chapter_title" },
      { text_id: "section", text_type: "section_heading" },
    ])
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('chapter_title'),
      expect.stringContaining('section_heading'),
    ]))
  })

  it("keeps legacy heading tags aligned with their adt class", () => {
    expect(validateTypographyHierarchy(
      `<section><h1 class="adt-h2" data-id="legacy">Legacy</h1></section>`,
      [{ text_id: "legacy", text_type: "heading" }],
    )).toContainEqual(expect.stringContaining("must align"))
  })

  it("rejects utility and inline font-size overrides", () => {
    const html = `<section><h2 class="adt-h2 text-[1.15rem]" data-id="section">Section</h2><p style="font-size:12px">Body</p></section>`
    const errors = validateTypographyHierarchy(html, [
      { text_id: "section", text_type: "section_heading" },
    ])
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("font-size utility"),
      expect.stringContaining("inline font/font-size"),
    ]))
  })

  it("rejects conflicting hierarchy classes and alternate size override syntax", () => {
    const leaf = [{ text_id: "heading", text_type: "chapter_title" }]
    expect(validateTypographyHierarchy(
      `<h1 class="adt-h1 adt-h2" data-id="heading">Chapter</h1>`,
      leaf,
    )).toContainEqual(expect.stringContaining("chapter_title"))
    expect(validateTypographyHierarchy(
      `<h1 class="adt-h1 md:text-[min(3vw,2rem)]" data-id="heading">Chapter</h1>`,
      leaf,
    )).toContainEqual(expect.stringContaining("font-size utility"))
    expect(validateTypographyHierarchy(
      `<h1 class="adt-h1" style="font: 12px sans-serif" data-id="heading">Chapter</h1>`,
      leaf,
    )).toContainEqual(expect.stringContaining("inline font/font-size"))
    expect(validateTypographyHierarchy(
      `<style>.adt-h1 { font-size: 12px }</style><h1 class="adt-h1" data-id="heading">Chapter</h1>`,
      leaf,
    )).toContainEqual(expect.stringContaining("<style> block"))
    expect(validateTypographyHierarchy(
      `<h1 class="adt-h1"><span class="adt-h2" data-id="heading">Chapter</span></h1>`,
      leaf,
    )).toContainEqual(expect.stringContaining("semantic heading element"))
  })

  it("does not confuse arbitrary text colors with arbitrary font sizes", () => {
    expect(validateTypographyHierarchy(
      `<h1 class="adt-h1 text-[#123456]" data-id="heading">Chapter</h1>`,
      [{ text_id: "heading", text_type: "chapter_title" }],
    )).toEqual([])
  })

  it("allows activity control sizing without allowing heading overrides", () => {
    expect(validateTypographyHierarchy(
      `<section><p class="text-sm" data-id="body">Option</p><h4 class="adt-h4" data-id="heading">Try it</h4></section>`,
      [
        { text_id: "body", text_type: "text" },
        { text_id: "heading", text_type: "heading", heading_level: 4 },
      ],
      { allowNonHeadingFontSizes: true },
    )).toEqual([])

    expect(validateTypographyHierarchy(
      `<section><h4 class="adt-h4 text-xl" data-id="heading">Try it</h4></section>`,
      [{ text_id: "heading", text_type: "heading", heading_level: 4 }],
      { allowNonHeadingFontSizes: true },
    )).toContainEqual(expect.stringContaining("font-size utility"))
  })
})
