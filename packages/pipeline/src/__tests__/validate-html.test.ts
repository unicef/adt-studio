import { describe, expect, it } from "vitest"
import {
  validateSectionHtml,
  levenshteinDistance,
  textSimilarity,
} from "../validate-html.js"

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

  it("rejects img tags without data-id", () => {
    const html = `
      <section>
        <img src="placeholder" alt="test" />
      </section>
    `
    const result = validateSectionHtml(html, [], ["pg001_im001"])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('<img> tag missing required "data-id" attribute')
    )
  })

  it("rejects img tags whose data-id is not an allowed image id", () => {
    const html = `
      <section>
        <img data-id="pg001_gp001" src="placeholder" alt="test" />
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], ["pg001_im001"])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Invalid image data-id: "pg001_gp001"')
    )
  })

  it("rejects image data-ids on non-img elements", () => {
    const html = `
      <section>
        <div data-id="pg001_im001">Not an image</div>
      </section>
    `
    const result = validateSectionHtml(html, [], ["pg001_im001"])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Image data-id "pg001_im001" must be used on an <img> tag')
    )
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

  it("returns sectionHtml with outer section tag when no content container", () => {
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

  it("preserves div#content container when present", () => {
    const html = `
      <html><body>
        <div id="content" class="container" style="background-color: #FFFAF5;">
          <section role="article">
            <p data-id="pg001_gp001">Hello</p>
          </section>
        </div>
      </body></html>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(true)
    expect(result.sectionHtml).toContain('<div id="content"')
    expect(result.sectionHtml).toContain("background-color")
    expect(result.sectionHtml).toContain("<section")
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

  it("detects text content mismatch for a data-id", () => {
    const html = `
      <section>
        <p data-id="pg001_gp001_tx001">The cat sat on the mat</p>
      </section>
    `
    const expectedTexts = new Map([["pg001_gp001_tx001", "The dog ran in the park"]])
    const result = validateSectionHtml(
      html,
      ["pg001_gp001_tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Text mismatch for data-id "pg001_gp001_tx001"')
    )
  })

  it("passes when text content matches expected", () => {
    const html = `
      <section>
        <p data-id="pg001_gp001_tx001">Hello world</p>
      </section>
    `
    const expectedTexts = new Map([["pg001_gp001_tx001", "Hello world"]])
    const result = validateSectionHtml(
      html,
      ["pg001_gp001_tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
  })

  it("normalizes whitespace when comparing text content", () => {
    const html = `
      <section>
        <p data-id="pg001_gp001_tx001">  Hello   world  </p>
      </section>
    `
    const expectedTexts = new Map([["pg001_gp001_tx001", "Hello world"]])
    const result = validateSectionHtml(
      html,
      ["pg001_gp001_tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
  })

  it("skips text check for image data-ids not in expectedTexts", () => {
    const html = `
      <section>
        <p data-id="pg001_gp001_tx001">Hello</p>
        <img data-id="pg001_im001" src="placeholder" alt="test" />
      </section>
    `
    const expectedTexts = new Map([["pg001_gp001_tx001", "Hello"]])
    const result = validateSectionHtml(
      html,
      ["pg001_gp001_tx001"],
      ["pg001_im001"],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
  })

  it("handles HTML entities in text comparison", () => {
    const html = `
      <section>
        <p data-id="pg001_gp001_tx001">Tom &amp; Jerry</p>
      </section>
    `
    const expectedTexts = new Map([["pg001_gp001_tx001", "Tom & Jerry"]])
    const result = validateSectionHtml(
      html,
      ["pg001_gp001_tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
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

  it("validates required section attributes when expected values are provided", () => {
    const html = `
      <div id="content" class="container">
        <section role="article" data-section-type="text_only" data-section-id="pg001_sec001">
          <p data-id="pg001_gp001_tx001">Hello</p>
        </section>
      </div>
    `
    const result = validateSectionHtml(
      html,
      ["pg001_gp001_tx001"],
      [],
      undefined,
      {
        expectedSectionType: "text_only",
        expectedSectionId: "pg001_sec001",
      }
    )
    expect(result.valid).toBe(true)
  })

  it("rejects missing section attributes when expected values are provided", () => {
    const html = `
      <section role="article" data-section-type="text_only">
        <p data-id="pg001_gp001_tx001">Hello</p>
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["pg001_gp001_tx001"],
      [],
      undefined,
      {
        expectedSectionType: "text_only",
        expectedSectionId: "pg001_sec001",
      }
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Missing required section attribute "data-section-id"')
    )
  })

  it("rejects multiple section tags", () => {
    const html = `
      <div id="content" class="container">
        <section data-section-type="text_only" data-section-id="pg001_sec001">
          <p data-id="pg001_gp001_tx001">First</p>
        </section>
        <section data-section-type="text_only" data-section-id="pg001_sec002">
          <p data-id="pg001_gp002_tx001">Second</p>
        </section>
      </div>
    `
    const result = validateSectionHtml(
      html,
      ["pg001_gp001_tx001", "pg001_gp002_tx001"],
      [],
      undefined,
      {
        expectedSectionType: "text_only",
        expectedSectionId: "pg001_sec001",
      }
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining("Expected exactly one <section> tag")
    )
  })

  it("auto-fixes slight text variance and returns valid", () => {
    const html = `
      <section>
        <p data-id="pg001_gp001_tx001">The cat sat on the mat.</p>
      </section>
    `
    const expectedTexts = new Map([
      ["pg001_gp001_tx001", "The cat sat on the mat"],
    ])
    const result = validateSectionHtml(
      html,
      ["pg001_gp001_tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.sectionHtml).toContain("The cat sat on the mat</p>")
    expect(result.sectionHtml).not.toContain("The cat sat on the mat.")
  })

  it("substitutes expected text even on exact match", () => {
    const html = `
      <section>
        <p data-id="tx001">Hello world</p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "Hello world"]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.sectionHtml).toContain("Hello world</p>")
  })

  it("still rejects text with substantial mismatch", () => {
    const html = `
      <section>
        <p data-id="tx001">Completely different content here</p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "The cat sat on the mat"]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Text mismatch for data-id "tx001"')
    )
  })

  it("substitutes text even when rejecting low-similarity mismatch", () => {
    const html = `
      <section>
        <p data-id="tx001">AAAA</p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "ZZZZ"]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(false)
    // Even on failure, the correct text is substituted in the HTML
    expect(result.sectionHtml).toContain("ZZZZ</p>")
  })

  it("replaces inline formatting children when substituting", () => {
    const html = `
      <section>
        <p data-id="tx001"><strong>Hello</strong> world!</p>
      </section>
    `
    // "Hello world!" vs "Hello world" — one char diff, high similarity
    const expectedTexts = new Map([["tx001", "Hello world"]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.sectionHtml).toContain(
      '<p data-id="tx001">Hello world</p>'
    )
    expect(result.sectionHtml).not.toContain("<strong>")
  })

  it("rejects short text with low similarity", () => {
    // "Hi" vs "No" — distance 2, maxLen 2, similarity 0.0
    const html = `
      <section>
        <p data-id="tx001">No</p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "Hi"]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(false)
  })

  it("handles multiple elements with mixed exact and slight variance", () => {
    const html = `
      <section>
        <p data-id="tx001">Hello world</p>
        <p data-id="tx002">The cat sat on the matt</p>
      </section>
    `
    const expectedTexts = new Map([
      ["tx001", "Hello world"],
      ["tx002", "The cat sat on the mat"],
    ])
    const result = validateSectionHtml(
      html,
      ["tx001", "tx002"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.sectionHtml).toContain("Hello world</p>")
    expect(result.sectionHtml).toContain("The cat sat on the mat</p>")
    expect(result.sectionHtml).not.toContain("matt")
  })

  it("auto-fix works alongside image URL rewriting", () => {
    const html = `
      <section>
        <p data-id="tx001">Hello world.</p>
        <img data-id="im001" src="placeholder" alt="test" />
      </section>
    `
    const expectedTexts = new Map([["tx001", "Hello world"]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      ["im001"],
      "/api/books/my-book/images",
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.sectionHtml).toContain("Hello world</p>")
    expect(result.sectionHtml).toContain(
      'src="/api/books/my-book/images/im001"'
    )
  })

  it("still rejects nested disallowed tags when expectedTexts is enabled", () => {
    const html = `
      <section>
        <p data-id="tx001">Safe text<script src="https://evil.example/x.js"></script></p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "Safe text"]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining("Disallowed tag: <script>")
    )
  })

  it("still rejects nested event handler attributes when expectedTexts is enabled", () => {
    const html = `
      <section>
        <p data-id="tx001">Safe text<span onmouseover="alert(1)"></span></p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "Safe text"]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Event handler attribute not allowed: "onmouseover"')
    )
  })

  it("still rejects nested unknown data-ids when expectedTexts is enabled", () => {
    const html = `
      <section>
        <p data-id="tx001">Safe text<span data-id="unknown_nested"></span></p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "Safe text"]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Unknown data-id: "unknown_nested"')
    )
  })

  it("does not substitute expected text on image data-ids", () => {
    const html = `
      <section>
        <img data-id="im001" src="placeholder" alt="test" />
      </section>
    `
    const expectedTexts = new Map([["im001", "SHOULD_NOT_APPEAR"]])
    const result = validateSectionHtml(
      html,
      [],
      ["im001"],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.sectionHtml).toContain('<img data-id="im001"')
    expect(result.sectionHtml).not.toContain("SHOULD_NOT_APPEAR")
  })
})

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0)
  })

  it("returns length of other string when one is empty", () => {
    expect(levenshteinDistance("", "abc")).toBe(3)
    expect(levenshteinDistance("abc", "")).toBe(3)
  })

  it("returns 0 for two empty strings", () => {
    expect(levenshteinDistance("", "")).toBe(0)
  })

  it("computes single insertion", () => {
    expect(levenshteinDistance("cat", "cats")).toBe(1)
  })

  it("computes single deletion", () => {
    expect(levenshteinDistance("cats", "cat")).toBe(1)
  })

  it("computes single substitution", () => {
    expect(levenshteinDistance("cat", "car")).toBe(1)
  })

  it("computes multi-edit distance", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3)
  })

  it("is symmetric", () => {
    expect(levenshteinDistance("abc", "xyz")).toBe(
      levenshteinDistance("xyz", "abc")
    )
  })
})

describe("textSimilarity", () => {
  it("returns 1.0 for identical strings", () => {
    expect(textSimilarity("hello", "hello")).toBe(1.0)
  })

  it("returns 1.0 for two empty strings", () => {
    expect(textSimilarity("", "")).toBe(1.0)
  })

  it("returns 0.0 for completely different single chars", () => {
    expect(textSimilarity("a", "b")).toBe(0.0)
  })

  it("computes correct ratio for small edits", () => {
    // "hello world" (11) vs "hello worl" (10) — distance 1, maxLen 11
    const sim = textSimilarity("hello world", "hello worl")
    expect(sim).toBeCloseTo(10 / 11, 5)
  })

  it("returns low similarity for very different strings", () => {
    expect(textSimilarity("abc", "xyz")).toBe(0.0)
  })
})
