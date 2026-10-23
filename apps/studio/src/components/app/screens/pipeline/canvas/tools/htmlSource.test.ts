import { describe, expect, it } from "vitest"
import { compactHtml, formatHtml, hasLayoutWhitespace, htmlSourceCodec, tokenizeHtml } from "./htmlSource"
import { LAB_TRISTE_SECTIONS } from "./htmlSource.test.fixtures"

function roundTrips(html: string) {
  expect(compactHtml(formatHtml(html))).toBe(html)
}

describe("formatHtml / compactHtml round trip", () => {
  it("restores compact lab-triste sections byte for byte", () => {
    for (const id of ["pg016017", "pg026027"]) {
      const html = LAB_TRISTE_SECTIONS[id]
      expect(hasLayoutWhitespace(html)).toBe(false)
      const formatted = formatHtml(html)
      expect(formatted).not.toBe(html)
      expect(formatted.split("\n").length).toBeGreaterThan(3)
      roundTrips(html)
    }
  })

  it("restores every lab-triste section through the codec, including ones already written over several lines", () => {
    for (const html of Object.values(LAB_TRISTE_SECTIONS)) {
      const codec = htmlSourceCodec(html)
      expect(codec.compact(codec.format(html))).toBe(html)
    }
  })

  it("leaves sections that already have line breaks between tags exactly as they are", () => {
    const html = LAB_TRISTE_SECTIONS.pg006007
    const codec = htmlSourceCodec(html)
    expect(codec.readable).toBe(false)
    expect(codec.format(html)).toBe(html)
    expect(codec.compact(html)).toBe(html)
  })

  it("keeps the single space between inline tags", () => {
    const html = '<p><span>one</span> <span>two</span><b>three</b></p>'
    const formatted = formatHtml(html)
    expect(formatted).toContain("</span> <span>")
    expect(formatted).toContain("</span>\n  <b>")
    roundTrips(html)
  })

  it("never touches text nodes", () => {
    const html = "<div><p>  spaced   text\nwith a break  </p></div>"
    expect(formatHtml(html)).toContain("<p>  spaced   text\nwith a break  </p>")
    roundTrips(html)
  })

  it("leaves pre, textarea, script and style contents alone", () => {
    const html =
      '<div><pre class="x"><span>a</span><span>b</span></pre><textarea><b>x</b></textarea><script>if (a<b) {}</script><style>a>b{color:red}</style><pre></pre></div>'
    const formatted = formatHtml(html)
    expect(formatted).toContain('<pre class="x"><span>a</span><span>b</span></pre>')
    expect(formatted).toContain("<textarea><b>x</b></textarea>")
    expect(formatted).toContain("<script>if (a<b) {}</script>")
    expect(formatted).toContain("<style>a>b{color:red}</style>")
    expect(formatted).toContain("<pre></pre>")
    roundTrips(html)
  })

  it("keeps a newline the source already had inside pre", () => {
    const html = "<div><pre>\n<b>x</b>\n</pre></div>"
    expect(hasLayoutWhitespace(html)).toBe(false)
    roundTrips(html)
  })

  it("reads attributes that contain > as part of the tag", () => {
    const html = `<div title="a > b" data-x='c>d'><img alt="1 > 0"/><a href="#">x</a></div>`
    const tokens = tokenizeHtml(html)
    expect(tokens[0]).toMatchObject({ kind: "open", name: "div", value: `<div title="a > b" data-x='c>d'>` })
    expect(tokens[1]).toMatchObject({ kind: "open", name: "img", selfClosing: true })
    roundTrips(html)
  })

  it("handles comments, declarations and self-closing tags", () => {
    const html = "<!DOCTYPE html><!-- a <b> c --><section><br><img src=\"x\" /><hr/><p>t</p></section>"
    const formatted = formatHtml(html)
    expect(formatted).toContain("<!-- a <b> c -->\n<section>")
    expect(formatted).toContain('<br>\n  <img src="x" />\n  <hr/>\n  <p>t</p>\n</section>')
    roundTrips(html)
  })

  it("keeps a user edit inside a text node through the round trip", () => {
    const html = LAB_TRISTE_SECTIONS.pg026027
    const original = "Em conversa com Adelaide,"
    expect(html).toContain(original)
    const edit = (source: string) => source.replace(original, "Em  conversa\n com Adelaide, editado")
    expect(compactHtml(edit(formatHtml(html)))).toBe(edit(html))

    const plain = "<section><div><p>Primeira linha</p><p>Segunda</p></div></section>"
    const editPlain = (source: string) => source.replace("Segunda", " Segunda  linha ")
    expect(compactHtml(editPlain(formatHtml(plain)))).toBe(editPlain(plain))
  })

  it("keeps a space the user types between tags, but drops line breaks typed there", () => {
    const html = "<div><b>a</b><i>b</i></div>"
    expect(compactHtml("<div><b>a</b> <i>b</i></div>")).toBe("<div><b>a</b> <i>b</i></div>")
    expect(compactHtml("<div>\n  <b>a</b>\n\n<i>b</i></div>")).toBe(html)
  })

  it("treats a stray < in text as text", () => {
    const html = "<p>1 < 2 and 3 > 2</p><p>x</p>"
    roundTrips(html)
    expect(formatHtml(html)).toContain("<p>1 < 2 and 3 > 2</p>\n<p>x</p>")
  })
})
