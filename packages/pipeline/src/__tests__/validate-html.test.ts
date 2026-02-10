import { describe, expect, it } from "vitest"
import { validateSectionHtml } from "../validate-html.js"

describe("validateSectionHtml", () => {
  it("passes valid HTML with correct data-ids", () => {
    const html = `
      <div id="content" class="container">
        <section role="article" data-section-type="text_only">
          <p data-id="pg001_gp001">Hello world</p>
        </section>
      </div>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("detects unknown data-id", () => {
    const html = `
      <div id="content" class="container">
        <p data-id="unknown_id">Hello</p>
      </div>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Unknown data-id: "unknown_id"')
    )
  })

  it("detects duplicate data-id", () => {
    const html = `
      <div id="content" class="container">
        <p data-id="pg001_gp001">Hello</p>
        <p data-id="pg001_gp001">World</p>
      </div>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Duplicate data-id: "pg001_gp001"')
    )
  })

  it("detects text nodes outside data-id elements", () => {
    const html = `
      <div id="content" class="container">
        <p>Bare text without data-id</p>
      </div>
    `
    const result = validateSectionHtml(html, [], [])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining("Text node outside any data-id element")
    )
  })

  it("exempts text inside style tags", () => {
    const html = `
      <style>.container { color: red; }</style>
      <div id="content" class="container">
        <p data-id="pg001_gp001">Hello</p>
      </div>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(true)
  })

  it("exempts text inside script tags", () => {
    const html = `
      <script>console.log("hello")</script>
      <div id="content" class="container">
        <p data-id="pg001_gp001">Hello</p>
      </div>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(true)
  })

  it("accepts image data-ids", () => {
    const html = `
      <div id="content" class="container">
        <p data-id="pg001_gp001">Hello</p>
        <img data-id="pg001_im001" src="placeholder" alt="test" />
      </div>
    `
    const result = validateSectionHtml(
      html,
      ["pg001_gp001"],
      ["pg001_im001"]
    )
    expect(result.valid).toBe(true)
  })

  it("handles empty HTML", () => {
    const result = validateSectionHtml("", [], [])
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("allows nested elements within data-id parents", () => {
    const html = `
      <div data-id="pg001_gp001">
        <strong>Bold text inside data-id parent</strong>
      </div>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(true)
  })
})
