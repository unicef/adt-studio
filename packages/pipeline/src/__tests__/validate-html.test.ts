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
      <section>
        <p data-id="unknown_id">Hello</p>
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Unknown data-id: "unknown_id"')
    )
  })

  it("allows duplicate data-id", () => {
    const html = `
      <section>
        <p data-id="pg001_gp001">Hello</p>
        <p data-id="pg001_gp001">World</p>
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("detects text nodes outside data-id elements", () => {
    const html = `
      <section>
        <p>Bare text without data-id</p>
      </section>
    `
    const result = validateSectionHtml(html, [], [])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining("Text node outside any data-id element")
    )
  })

  it("exempts text inside style tags", () => {
    const html = `
      <section>
        <style>.container { color: red; }</style>
        <p data-id="pg001_gp001">Hello</p>
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(true)
  })

  it("rejects script tags", () => {
    const html = `
      <section>
        <script>console.log("hello")</script>
        <p data-id="pg001_gp001">Hello</p>
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining("Disallowed tag: <script>")
    )
  })

  it("accepts image data-ids", () => {
    const html = `
      <section>
        <p data-id="pg001_gp001">Hello</p>
        <img data-id="pg001_im001" src="placeholder" alt="test" />
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["pg001_gp001"],
      ["pg001_im001"]
    )
    expect(result.valid).toBe(true)
  })

  it("fails when no section tag is found", () => {
    const result = validateSectionHtml("<p>no section</p>", [], [])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining("No <section> tag found")
    )
  })

  it("fails on empty HTML", () => {
    const result = validateSectionHtml("", [], [])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining("No <section> tag found")
    )
  })

  it("allows nested elements within data-id parents", () => {
    const html = `
      <section>
        <div data-id="pg001_gp001">
          <strong>Bold text inside data-id parent</strong>
        </div>
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(true)
  })

  it("rewrites image src to server URL when imageUrlPrefix provided", () => {
    const html = `
      <section>
        <p data-id="pg001_gp001">Hello</p>
        <img data-id="pg001_im001" src="placeholder" alt="test" />
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["pg001_gp001"],
      ["pg001_im001"],
      "/api/books/my-book/images"
    )
    expect(result.valid).toBe(true)
    expect(result.sectionHtml).toContain('src="/api/books/my-book/images/pg001_im001"')
    expect(result.sectionHtml).not.toContain('src="placeholder"')
  })

  it("does not rewrite image src when no imageUrlPrefix", () => {
    const html = `
      <section>
        <img data-id="pg001_im001" src="placeholder" alt="test" />
      </section>
    `
    const result = validateSectionHtml(
      html,
      [],
      ["pg001_im001"]
    )
    expect(result.valid).toBe(true)
    expect(result.sectionHtml).toContain('src="placeholder"')
  })

  it("returns sectionHtml with outer section tag", () => {
    const html = `
      <html><body>
        <section role="article">
          <p data-id="pg001_gp001">Hello</p>
        </section>
      </body></html>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(true)
    expect(result.sectionHtml).toContain("<section")
    expect(result.sectionHtml).toContain("pg001_gp001")
    expect(result.sectionHtml).not.toContain("<html>")
    expect(result.sectionHtml).not.toContain("<body>")
  })

  it("rejects event handler attributes", () => {
    const html = `
      <section>
        <img data-id="pg001_im001" src="placeholder" onerror="alert(1)" />
      </section>
    `
    const result = validateSectionHtml(html, [], ["pg001_im001"])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Event handler attribute not allowed: "onerror"')
    )
  })

  it("rejects javascript URLs", () => {
    const html = `
      <section>
        <a data-id="pg001_gp001" href="javascript:alert(1)">Click</a>
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Unsafe URL in attribute "href"')
    )
  })

  it("rejects activity_gen_ IDs by default", () => {
    const html = `
      <section>
        <p data-id="pg001_gp001">Question</p>
        <div data-id="activity_gen_opt1">Option A</div>
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Unknown data-id: "activity_gen_opt1"')
    )
  })

  it("allows activity_gen_ IDs when allowActivityGeneratedIds is true", () => {
    const html = `
      <section>
        <p data-id="pg001_gp001">Question</p>
        <div data-id="activity_gen_opt1">Option A</div>
        <div data-id="activity_gen_opt2">Option B</div>
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["pg001_gp001"],
      [],
      undefined,
      { allowActivityGeneratedIds: true }
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("still rejects non-activity_gen_ unknown IDs even with allowActivityGeneratedIds", () => {
    const html = `
      <section>
        <p data-id="pg001_gp001">Question</p>
        <div data-id="activity_gen_opt1">Option A</div>
        <div data-id="totally_unknown">Bad</div>
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["pg001_gp001"],
      [],
      undefined,
      { allowActivityGeneratedIds: true }
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Unknown data-id: "totally_unknown"')
    )
    // The activity_gen_ one should not appear in errors
    expect(result.errors).not.toContainEqual(
      expect.stringContaining("activity_gen_opt1")
    )
  })
})
