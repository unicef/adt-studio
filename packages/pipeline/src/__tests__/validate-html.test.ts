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
        <section data-section-type="text_only">
          <p data-id="pg001_gp001">Hello world</p>
        </section>
      </div>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("allows optional text-ids to be omitted", () => {
    const html = `
      <div id="content"><section data-section-type="activity_fill_in_the_blank">
        <p data-id="pg001_n0001">Question?</p>
        <input type="text" data-activity-item="item-1" />
      </section></div>
    `
    const result = validateSectionHtml(
      html,
      ["pg001_n0001", "pg001_n0002", "pg001_n0003"],
      [],
      undefined,
      { optionalTextIds: new Set(["pg001_n0002", "pg001_n0003"]) }
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("still requires non-optional text-ids when optionalTextIds is set", () => {
    const html = `
      <section data-section-type="activity_fill_in_the_blank">
        <p data-id="pg001_n0002">Foo</p>
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["pg001_n0001", "pg001_n0002"],
      [],
      undefined,
      { optionalTextIds: new Set(["pg001_n0002"]) }
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Missing required text data-id: "pg001_n0001"')
    )
  })

  it("preserves the authoritative text data-id order", () => {
    const html = `
      <section>
        <div data-id="rescue_group">
          <h2 data-id="rescue_heading">Rescue</h2>
        </div>
        <img data-id="rescue_image" src="placeholder" alt="Rescue" />
        <div data-id="sense_group">
          <h2 data-id="sense_heading">Sense</h2>
        </div>
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["rescue_heading", "sense_heading"],
      ["rescue_image"],
      undefined,
      {
        allowedContainerIds: ["rescue_group", "sense_group"],
        expectedContentIdOrder: [
          "rescue_heading",
          "rescue_image",
          "sense_heading",
        ],
      },
    )

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("rejects text data-ids restored to the original image order", () => {
    const html = `
      <section>
        <h2 data-id="sense_heading">Sense</h2>
        <h2 data-id="rescue_heading">Rescue</h2>
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["rescue_heading", "sense_heading"],
      [],
      undefined,
      { expectedContentIdOrder: ["rescue_heading", "sense_heading"] },
    )

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining(
        'expected "rescue_heading" but found "sense_heading"',
      ),
    )
  })

  it("keeps relative order when optional text data-ids are omitted", () => {
    const html = `
      <section>
        <p data-id="body_1">First</p>
        <p data-id="body_2">Second</p>
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["page_number", "body_1", "footer", "body_2"],
      [],
      undefined,
      {
        optionalTextIds: new Set(["page_number", "footer"]),
        expectedContentIdOrder: ["page_number", "body_1", "footer", "body_2"],
      },
    )

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("rejects images restored to their original image order", () => {
    const html = `
      <section>
        <h2 data-id="rescue_heading">Rescue</h2>
        <h2 data-id="sense_heading">Sense</h2>
        <img data-id="rescue_image" src="placeholder" alt="Rescue" />
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["rescue_heading", "sense_heading"],
      ["rescue_image"],
      undefined,
      {
        expectedContentIdOrder: [
          "rescue_heading",
          "rescue_image",
          "sense_heading",
        ],
      },
    )

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining(
        'expected "rescue_image" but found "sense_heading"',
      ),
    )
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

  it("allows bare enumeration markers as text, but not bare prose", () => {
    const markers = `
      <section>
        <span>1.</span><span>10.</span><span>(i)</span><span>(vii)</span><span>(a)</span>
      </section>
    `
    expect(validateSectionHtml(markers, [], []).valid).toBe(true)

    const prose = `
      <section>
        <span>Salamu</span>
      </section>
    `
    const proseResult = validateSectionHtml(prose, [], [])
    expect(proseResult.valid).toBe(false)
    expect(proseResult.errors).toContainEqual(
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
        <section>
          <p data-id="pg001_gp001">Hello</p>
        </section>
      </body></html>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(true)
    expect(result.sectionHtml).toContain("<section")
    expect(result.sectionHtml).toContain("pg001_gp001")
    expect(result.sectionHtml).not.toContain('role="article"')
    expect(result.sectionHtml).not.toContain("<html>")
    expect(result.sectionHtml).not.toContain("<body>")
  })

  it("preserves div#content container when present", () => {
    const html = `
      <html><body>
        <div id="content" class="container" style="background-color: #FFFAF5;">
          <section>
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

  it("repairs malformed hex numeric entities without x prefix", () => {
    const html = `
      <section>
        <p data-id="tx001">&#41f;</p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "П"]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.sectionHtml).toMatch(/>(П|&#x41f;)<\/p>/)
  })

  it("repairs truncated numeric entities at end of text", () => {
    const html = `
      <section>
        <p data-id="tx001">Hello &#x41</p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "Hello A"]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.sectionHtml).toContain(">Hello A</p>")
  })

  it("ignores dangling truncated entity starters", () => {
    const html = `
      <section>
        <p data-id="tx001">Hello A&#</p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "Hello A"]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.sectionHtml).toContain(">Hello A</p>")
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
        <section data-section-type="text_only" data-section-id="pg001_sec001">
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
      <section data-section-type="text_only">
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

  it("accepts text differences up to 30 percent", () => {
    // 3 edits over max length 10 => similarity 0.7 (accepted)
    const html = `
      <section>
        <p data-id="tx001">abcXXXghij</p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "abcdefghij"]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.sectionHtml).toContain(">abcdefghij</p>")
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

  it("preserves [[blank:item-N]] markers and skips text replacement", () => {
    const html = `
      <section>
        <p class="fitb-sentence" data-id="tx001">The [[blank:item-1]] is a type of star.</p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "The sun is a type of star."]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    // The blank marker must be preserved — not replaced with the original text
    expect(result.sectionHtml).toContain("[[blank:item-1]]")
    expect(result.sectionHtml).not.toContain("The sun is a type of star.")
  })

  it("preserves blank markers when expected text has underscore placeholders", () => {
    const html = `
      <section>
        <p class="fitb-sentence" data-id="tx001">No lo [[blank:item-1]] ni [[blank:item-2]] la raíz.</p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "No lo ___ ni ___ la raíz."]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.sectionHtml).toContain("[[blank:item-1]]")
    expect(result.sectionHtml).toContain("[[blank:item-2]]")
  })

  it("preserves blank markers when expected text has dot placeholders", () => {
    const html = `
      <section>
        <p class="fitb-sentence" data-id="tx001">Definición extraída de [[blank:item-1]]</p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "Definición extraída de ........................................................."]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.sectionHtml).toContain("[[blank:item-1]]")
  })

  it("preserves blank markers with hint text and skips text replacement", () => {
    const html = `
      <section>
        <p class="fitb-sentence" data-id="tx001">The [[blank:item-1:Paris]] of France is beautiful.</p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "The capital of France is beautiful."]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.sectionHtml).toContain("[[blank:item-1:Paris]]")
  })

  it("rejects blank-marker text with low similarity to expected", () => {
    const html = `
      <section>
        <p class="fitb-sentence" data-id="tx001">Totally unrelated [[blank:item-1]] content here.</p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "The sun is a type of star."]])
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

  it("auto-adds fitb-sentence class when [[blank:item-N]] markers lack it", () => {
    const html = `
      <section>
        <p data-id="tx001">The [[blank:item-1]] is a type of star.</p>
      </section>
    `
    const expectedTexts = new Map([["tx001", "The ___ is a type of star."]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    // Auto-healed instead of failing: the class is always the correct action
    // when markers are present, so the validator adds it and passes.
    expect(result.valid).toBe(true)
    expect(result.errors).not.toContainEqual(
      expect.stringContaining('missing the "fitb-sentence" class')
    )
    expect(result.sectionHtml).toContain("fitb-sentence")
  })

  it("accepts [[blank:item-N]] markers when fitb-sentence is on an ancestor", () => {
    const html = `
      <section>
        <div class="fitb-sentence">
          <span data-id="tx001">The [[blank:item-1]] is a type of star.</span>
        </div>
      </section>
    `
    const expectedTexts = new Map([["tx001", "The ___ is a type of star."]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
  })

  it("accepts inline letter blanks: single-word source with single underscores replaced by markers", () => {
    const html = `
      <section>
        <span class="fitb-sentence" data-id="tx001">en[[blank:item-1]]ro</span>
      </section>
    `
    const expectedTexts = new Map([["tx001", "en_ro"]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.sectionHtml).toContain("[[blank:item-1]]")
  })

  it("accepts inline letter blanks with multiple underscores in a single word", () => {
    const html = `
      <section>
        <span class="fitb-sentence" data-id="tx001">[[blank:item-1]]eptiembr[[blank:item-2]]</span>
      </section>
    `
    const expectedTexts = new Map([["tx001", "_eptiembr_"]])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("strips orphan separator runs left behind after removing date-style blank runs", () => {
    const html = `
      <section>
        <label data-id="tx001">Fecha de nacimiento:</label>
      </section>
    `
    const expectedTexts = new Map([
      ["tx001", "Fecha de nacimiento: ___/___/___"],
    ])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.sectionHtml).toContain("Fecha de nacimiento:")
    expect(result.sectionHtml).not.toContain("//")
  })

  it("strips orphan separator runs with whitespace between the blanks", () => {
    const html = `
      <section>
        <label data-id="tx001">Tel&#xe9;fono:</label>
      </section>
    `
    const expectedTexts = new Map([
      ["tx001", "Teléfono: ___ - ___ - ___"],
    ])
    const result = validateSectionHtml(
      html,
      ["tx001"],
      [],
      undefined,
      { expectedTexts }
    )
    expect(result.valid).toBe(true)
    expect(result.sectionHtml).not.toMatch(/-\s*-/)
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


  it("normalizes shared activity_matching semantics during validation", () => {
    const html = `
      <section data-section-type="activity_matching">
        <div class="activity-item" tabindex="0" data-id="tx001" data-activity-item="item-1">Word</div>
        <div class="dropzone" tabindex="0" aria-label="Drop here" id="target1">
          <div id="dropzone-1" role="region" aria-live="polite"></div>
        </div>
      </section>
    `
    const result = validateSectionHtml(html, ["tx001"], [])
    expect(result.valid).toBe(true)
    expect(result.sectionHtml).toContain('class="activity-item" tabindex="0" data-id="tx001" data-activity-item="item-1" role="button"')
    expect(result.sectionHtml).toContain('class="dropzone" tabindex="0" aria-label="Drop here" id="target1" role="button"')
    expect(result.sectionHtml).toContain('id="dropzone-1" aria-live="polite" class="dropzone-slot"')
    expect(result.sectionHtml).not.toContain('role="region"')
  })


  it("normalizes shared activity_true_false semantics during validation", () => {
    const html = `
      <section data-section-type="activity_true_false">
        <label>
          <input type="radio" value="true" aria-label="True" class="sr-only peer" />
          <div class="choice-chip"></div>
        </label>
        <label>
          <input type="radio" value="false" aria-label="False" class="sr-only peer" />
          <div class="choice-chip"></div>
        </label>
      </section>
    `
    const result = validateSectionHtml(html, [], [])
    expect(result.valid).toBe(true)
    expect(result.sectionHtml).not.toContain('aria-label="True"')
    expect(result.sectionHtml).not.toContain('aria-label="False"')
    expect(result.sectionHtml).toContain('<span class="sr-only" data-generated-a11y-label="true">True</span>')
    expect(result.sectionHtml).toContain('<span class="sr-only" data-generated-a11y-label="true">False</span>')
  })


  it("normalizes shared activity_fill_in_a_table semantics during validation", () => {
    const html = `
      <section data-section-type="activity_fill_in_a_table">
        <table>
          <thead>
            <tr>
              <th data-id="tx001"></th>
              <th data-id="tx002">Found it!</th>
              <th data-id="tx003">Expression</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-id="tx004">0</td>
              <td data-id="tx005"></td>
              <td data-id="tx006"></td>
            </tr>
          </tbody>
        </table>
        <input type="text" id="field-1" data-activity-item="item-1" />
      </section>
    `
    const result = validateSectionHtml(html, ["tx001","tx002","tx003","tx004","tx005","tx006"], [])
    expect(result.valid).toBe(true)
    expect(result.sectionHtml).toContain('<td data-id="tx001"></td>')
    expect(result.sectionHtml).toContain('<th data-id="tx002" scope="col">Found it!</th>')
    expect(result.sectionHtml).toContain('<th data-id="tx004" scope="row">0</th>')
    expect(result.sectionHtml).toContain('data-activity-item="item-1" aria-label="Answer"')
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

describe("writable section types require editable inputs", () => {
  it("fails activity_open_ended_answer with no textarea/input/blank marker", () => {
    const html = `
      <section data-section-type="activity_open_ended_answer" data-section-id="pg001_section">
        <p data-id="pg001_gp001">Write your answer below:</p>
        <hr class="border-b border-gray-400" />
        <hr class="border-b border-gray-400" />
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining(
        'Section type "activity_open_ended_answer" requires at least one editable element'
      )
    )
  })

  it("passes activity_open_ended_answer when a <textarea> is present", () => {
    const html = `
      <section data-section-type="activity_open_ended_answer" data-section-id="pg001_section">
        <p data-id="pg001_gp001">Write your answer below:</p>
        <textarea class="w-full" aria-label="answer"></textarea>
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(true)
  })

  it("passes activity_fill_in_the_blank when a [[blank:item-N]] marker is present", () => {
    const html = `
      <section data-section-type="activity_fill_in_the_blank" data-section-id="pg001_section">
        <p class="fitb-sentence" data-id="pg001_gp001">The capital of France is [[blank:item-1]].</p>
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["pg001_gp001"],
      [],
      undefined,
      {
        expectedTexts: new Map([
          ["pg001_gp001", "The capital of France is ___."],
        ]),
      }
    )
    expect(result.valid).toBe(true)
  })

  it("fails activity_fill_in_a_table when no <input> elements are present", () => {
    const html = `
      <section data-section-type="activity_fill_in_a_table" data-section-id="pg001_section">
        <table>
          <tr>
            <td data-id="pg001_gp001">Name</td>
            <td><div class="border-b"></div></td>
          </tr>
        </table>
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining(
        'Section type "activity_fill_in_a_table" requires at least one editable element'
      )
    )
  })

  it("does not require editable elements for non-writable section types", () => {
    const html = `
      <section data-section-type="text_only" data-section-id="pg001_section">
        <p data-id="pg001_gp001">Just some prose.</p>
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(true)
  })

  it("enforces source-derived response counts on mixed page-mode sections", () => {
    const html = `
      <section data-section-type="text_and_images" data-section-id="pg001_section">
        <p data-id="q1">Name the first animal.</p>
        <input aria-label="First animal" data-activity-item="item-1" />
        <p data-id="q2">Name the second animal.</p>
      </section>
    `
    const result = validateSectionHtml(html, ["q1", "q2"], [], undefined, {
      minimumEditableElements: 2,
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining("at least 2 learner response prompt(s)")
    )
  })

  it("accepts one labelled response per source prompt", () => {
    const html = `
      <section data-section-type="text_and_images" data-section-id="pg001_section">
        <p data-id="q1">Name the first animal.</p>
        <input aria-label="First animal" data-activity-item="item-1" />
        <p data-id="q2">Name the second animal.</p>
        <input aria-label="Second animal" data-activity-item="item-2" />
      </section>
    `
    const result = validateSectionHtml(html, ["q1", "q2"], [], undefined, {
      minimumEditableElements: 2,
    })

    expect(result.valid).toBe(true)
  })

  it("counts one radio group as one learner response", () => {
    const html = `
      <section data-section-type="text_and_images" data-section-id="pg001_section">
        <fieldset data-id="q1">
          <legend>Choose the first answer.</legend>
          <label><input type="radio" name="q1" value="a" /> A</label>
          <label><input type="radio" name="q1" value="b" /> B</label>
        </fieldset>
        <fieldset data-id="q2">
          <legend>Choose the second answer.</legend>
          <label><input type="radio" name="q2" value="a" /> A</label>
          <label><input type="radio" name="q2" value="b" /> B</label>
        </fieldset>
      </section>
    `
    const result = validateSectionHtml(html, ["q1", "q2"], [], undefined, {
      minimumEditableElements: 2,
    })

    expect(result.valid).toBe(true)
  })

  it("counts native selects as learner responses", () => {
    const html = `
      <section data-section-type="text_and_images" data-section-id="pg001_section">
        <label data-id="q1">Choose the animal.
          <select aria-label="Animal"><option>Cat</option></select>
        </label>
      </section>
    `
    const result = validateSectionHtml(html, ["q1"], [], undefined, {
      minimumEditableElements: 1,
    })

    expect(result.valid).toBe(true)
  })

  it("accepts a select as the editable control for a writable activity", () => {
    const html = `
      <section data-section-type="activity_fill_in_the_blank" data-section-id="pg001_section">
        <label data-id="q1">Choose the animal.
          <select aria-label="Animal"><option>Cat</option></select>
        </label>
      </section>
    `
    const result = validateSectionHtml(html, ["q1"], [])

    expect(result.valid).toBe(true)
  })
})

describe("textbook blank placeholders may be omitted when editable element is provided", () => {
  it("accepts label text with underscores stripped when a <textarea> is added next to it", () => {
    const html = `
      <section data-section-type="activity_open_ended_answer" data-section-id="pg010_section">
        <div>
          <p data-id="pg010_gp001_tx001">Nombre:</p>
          <textarea aria-label="nombre"></textarea>
        </div>
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["pg010_gp001_tx001"],
      [],
      undefined,
      {
        expectedTexts: new Map([["pg010_gp001_tx001", "Nombre: ___"]]),
      }
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("accepts label with multiple stripped underscore runs (e.g. dates)", () => {
    const html = `
      <section data-section-type="activity_open_ended_answer" data-section-id="pg011_section">
        <div>
          <p data-id="pg011_gp002_tx003">Fecha de nacimiento:</p>
          <textarea aria-label="fecha"></textarea>
        </div>
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["pg011_gp002_tx003"],
      [],
      undefined,
      {
        expectedTexts: new Map([
          ["pg011_gp002_tx003", "Fecha de nacimiento: ___ / ___ / ___"],
        ]),
      }
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("preserves the rendered (stripped) text when underscores were dropped", () => {
    const html = `
      <section data-section-type="activity_open_ended_answer" data-section-id="pg010_section">
        <p data-id="pg010_gp009_tx003">¡Soy !</p>
        <textarea aria-label="soy"></textarea>
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["pg010_gp009_tx003"],
      [],
      undefined,
      {
        expectedTexts: new Map([["pg010_gp009_tx003", "¡Soy ___ !"]]),
      }
    )
    expect(result.valid).toBe(true)
    // Rendered HTML should keep the stripped version, not put the underscores back.
    expect(result.sectionHtml).not.toContain("___")
  })

  it("still rejects truly different text even with underscore stripping", () => {
    const html = `
      <section data-section-type="activity_open_ended_answer" data-section-id="pg010_section">
        <p data-id="pg010_gp001_tx001">Completely unrelated text here</p>
        <textarea aria-label="x"></textarea>
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["pg010_gp001_tx001"],
      [],
      undefined,
      {
        expectedTexts: new Map([["pg010_gp001_tx001", "Nombre: ___"]]),
      }
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Text mismatch for data-id "pg010_gp001_tx001"')
    )
  })
})

describe("hasEditableElement — input type filtering", () => {
  it("does not count <input type=\"radio\"> as a writable input", () => {
    const html = `
      <section data-section-type="activity_open_ended_answer" data-section-id="pg001_section">
        <p data-id="pg001_gp001">Question?</p>
        <input type="radio" value="a" />
        <input type="radio" value="b" />
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining(
        'Section type "activity_open_ended_answer" requires at least one editable element'
      )
    )
  })

  it("does not count <input type=\"checkbox\">, \"submit\", \"hidden\" as writable", () => {
    const html = `
      <section data-section-type="activity_fill_in_the_blank" data-section-id="pg001_section">
        <p data-id="pg001_gp001">Label</p>
        <input type="checkbox" />
        <input type="submit" value="Go" />
        <input type="hidden" name="x" value="1" />
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining(
        'Section type "activity_fill_in_the_blank" requires at least one editable element'
      )
    )
  })

  it("counts <input> with no type attribute as writable (defaults to text)", () => {
    const html = `
      <section data-section-type="activity_fill_in_the_blank" data-section-id="pg001_section">
        <p data-id="pg001_gp001">Name:</p>
        <input data-activity-item="item-1" aria-label="name" />
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(true)
  })

  it("counts <input type=\"text\"> as writable", () => {
    const html = `
      <section data-section-type="activity_fill_in_the_blank" data-section-id="pg001_section">
        <p data-id="pg001_gp001">Name:</p>
        <input type="text" data-activity-item="item-1" aria-label="name" />
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(true)
  })

  it("ignores [[blank:item-N]] markers inside <style> blocks", () => {
    const html = `
      <section data-section-type="activity_fill_in_the_blank" data-section-id="pg001_section">
        <style>/* [[blank:item-1]] */</style>
        <p data-id="pg001_gp001">Label</p>
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining(
        'Section type "activity_fill_in_the_blank" requires at least one editable element'
      )
    )
  })
})

describe("text replacement preserves nested editables", () => {
  it("does not destroy a <textarea> nested inside a data-id element", () => {
    const html = `
      <section data-section-type="activity_open_ended_answer" data-section-id="pg001_section">
        <p data-id="pg001_gp001">La capital es <textarea aria-label="capital"></textarea></p>
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["pg001_gp001"],
      [],
      undefined,
      {
        expectedTexts: new Map([["pg001_gp001", "La capital es ___"]]),
      }
    )
    expect(result.valid).toBe(true)
    // The nested textarea must survive — otherwise the page renders as
    // static text and the learner can no longer write an answer.
    expect(result.sectionHtml).toContain("<textarea")
  })

  it("does not destroy a nested <input> writable element", () => {
    const html = `
      <section data-section-type="activity_fill_in_the_blank" data-section-id="pg001_section">
        <p data-id="pg001_gp001">Nombre: <input type="text" data-activity-item="item-1" aria-label="nombre" /></p>
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["pg001_gp001"],
      [],
      undefined,
      {
        expectedTexts: new Map([["pg001_gp001", "Nombre: ___"]]),
      }
    )
    expect(result.valid).toBe(true)
    expect(result.sectionHtml).toContain("<input")
  })
})

describe("sr-only text exemption", () => {
  it("allows text inside an <label class=\"sr-only\"> without a data-id", () => {
    const html = `
      <section data-section-type="activity_fill_in_the_blank" data-section-id="pg001_section">
        <p data-id="pg001_gp001">Question?</p>
        <label class="sr-only" for="input-1">Respuesta sandía</label>
        <input id="input-1" type="text" data-activity-item="item-1" aria-labelledby="..." />
      </section>
    `
    const result = validateSectionHtml(html, ["pg001_gp001"], [])
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("allows text inside a nested <span class=\"sr-only\"> element", () => {
    const html = `
      <section data-section-type="text_only" data-section-id="pg001_section">
        <button>
          <i class="fas fa-volume" aria-hidden="true"></i>
          <span class="sr-only">Play audio</span>
        </button>
      </section>
    `
    const result = validateSectionHtml(html, [], [])
    expect(result.valid).toBe(true)
  })

  it("still flags text outside any data-id when sr-only is not present", () => {
    const html = `
      <section data-section-type="text_only" data-section-id="pg001_section">
        <p>Some text not wrapped in data-id</p>
      </section>
    `
    const result = validateSectionHtml(html, [], [])
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain("Text node outside any data-id element")
  })
})

describe("[placeholder:...] marker stripping", () => {
  it("matches expected text containing [placeholder:..........] against rendered text with [[blank:item-N:..........]]", () => {
    // Regression: TEXTBOOK_BLANK_RE was eating the dot-run INSIDE the
    // `[placeholder:...]` marker before PLACEHOLDER_MARKER_RE could strip
    // the wrapper, leaving a literal `[placeholder:]` in strippedExpected
    // that the rendered text could never match.
    const html = `
      <section data-section-type="activity_fill_in_the_blank" data-section-id="pg002_section">
        <p class="fitb-sentence" data-id="pg002_n0042">No lo [[blank:item-3:..........]] ni [[blank:item-4:..............]] la raíz.</p>
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["pg002_n0042"],
      [],
      undefined,
      {
        expectedTexts: new Map([
          ["pg002_n0042", "No lo [placeholder:..........] ni [placeholder:..............] la raíz."],
        ]),
      },
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("matches expected text containing [placeholder:...] against a single [[blank:item-N]] marker", () => {
    const html = `
      <section data-section-type="activity_fill_in_the_blank" data-section-id="pg002_section">
        <p class="fitb-sentence" data-id="pg002_n0048">[[blank:item-7:..................]] la tierra con las manos.</p>
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["pg002_n0048"],
      [],
      undefined,
      {
        expectedTexts: new Map([
          ["pg002_n0048", "[placeholder:..................] la tierra con las manos."],
        ]),
      },
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("strips [placeholder:...] markers from the rendered text when the LLM omits the blank marker", () => {
    // When the LLM emits a separate <input> instead of an inline [[blank:]] marker,
    // it should also strip the `[placeholder:...]` text — but if it doesn't, the
    // replacement should still substitute the cleaned text.
    const html = `
      <section data-section-type="activity_fill_in_the_blank" data-section-id="pg002_section">
        <p data-id="pg002_n0048">la tierra con las manos.</p>
        <input type="text" data-activity-item="item-7" aria-label="x" />
      </section>
    `
    const result = validateSectionHtml(
      html,
      ["pg002_n0048"],
      [],
      undefined,
      {
        expectedTexts: new Map([
          ["pg002_n0048", "[placeholder:..................] la tierra con las manos."],
        ]),
      },
    )
    expect(result.valid).toBe(true)
    expect(result.sectionHtml).not.toContain("[placeholder:")
  })
})
