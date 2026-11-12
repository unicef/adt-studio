import { describe, expect, it } from "vitest"
import { normalizeHtmlSectionSemantics } from "../html-semantics.js"

describe("normalizeHtmlSectionSemantics", () => {
  it("keeps non-ASCII text and attributes literal and escapes only what HTML requires (#907)", () => {
    const html = `<section data-section-type="text_only"><p data-id="tx1" title="Año">Niño á ¿Qué? “x” &amp; &lt;</p></section>`
    const out = normalizeHtmlSectionSemantics(html)
    expect(out).toContain('<p data-id="tx1" title="Año">Niño á ¿Qué? “x” &amp; &lt;</p>')
    expect(out).not.toMatch(/&#x/)
  })
})
