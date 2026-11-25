import { describe, it, expect } from "vitest"
import { parseDocument } from "htmlparser2"
import { serializeHtml, serializeInnerHtml } from "../html-serialize.js"

const pass = (html: string) => serializeHtml(parseDocument(html))

describe("serializeHtml textarea handling", () => {
  it("leaves textarea text unchanged across repeated passes", () => {
    const start = "<textarea>Don&apos;t</textarea>"
    let html = start
    for (let i = 0; i < 4; i++) html = pass(html)
    expect(html).toBe(start)
  })

  it("keeps &amp;, quotes and non-ASCII stable", () => {
    const once = pass("<p><textarea>a &amp; b &quot;c&quot; é</textarea></p>")
    expect(pass(once)).toBe(once)
    expect(once).not.toContain("&amp;amp;")
  })

  it("does not mutate the parsed DOM", () => {
    const doc = parseDocument("<textarea>Don&apos;t</textarea>")
    serializeHtml(doc)
    expect(serializeHtml(doc)).toBe("<textarea>Don&apos;t</textarea>")
  })

  it("handles inner serialization and non-textarea text", () => {
    const doc = parseDocument("<div><textarea>x&apos;</textarea> &amp; y</div>")
    expect(serializeInnerHtml(doc.children[0] as never)).toBe("<textarea>x&apos;</textarea> &amp; y")
  })
})
