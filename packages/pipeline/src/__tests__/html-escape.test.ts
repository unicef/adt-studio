import { describe, expect, it } from "vitest"
import { parseDocument } from "htmlparser2"
import { serializeHtml } from "../html-escape.js"

describe("serializeHtml (#907)", () => {
  it("keeps non-ASCII text and attributes as literal UTF-8", () => {
    const doc = parseDocument('<p title="Año “x”">Niño á ¿Qué? ¡Brrr! — “x”</p>')
    expect(serializeHtml(doc)).toBe('<p title="Año “x”">Niño á ¿Qué? ¡Brrr! — “x”</p>')
  })

  it("decodes existing numeric entities to literal characters", () => {
    const doc = parseDocument('<h1 title="A&#xf1;o">La explicaci&#xf3;n &#xa1;Brrr!</h1>')
    expect(serializeHtml(doc)).toBe('<h1 title="Año">La explicación ¡Brrr!</h1>')
  })

  it("still escapes the characters HTML requires", () => {
    const doc = parseDocument('<p title="a &amp; &quot;b&quot;">x &lt; y &amp;&amp; y &gt; z</p>')
    expect(serializeHtml(doc)).toBe('<p title="a &amp; &quot;b&quot;">x &lt; y &amp;&amp; y &gt; z</p>')
  })

  it("serializes a single element node", () => {
    const doc = parseDocument("<div><span>¿Qué?</span></div>")
    expect(serializeHtml(doc.children[0])).toBe("<div><span>¿Qué?</span></div>")
  })
})
