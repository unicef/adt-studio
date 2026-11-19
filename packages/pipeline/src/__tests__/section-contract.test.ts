import { describe, expect, it } from "vitest"

import { inspectImportedHtmlContract, stampImportedSectionContract } from "../adt-round-trip/html.js"

const page = (section: string) => `<!doctype html><html><body><main><div id="content">${section}</div></main></body></html>`

// F5: pages the packager writes must pass the importer's own contract.
describe("stampImportedSectionContract", () => {
  it("adds the section type an agent-written custom section leaves out", () => {
    const custom = `<section data-section-id="pg001_sec002"><section data-id="activity-root"></section><script>window.adtRegisterCustomActivity(document.currentScript.parentElement, {})</script></section>`
    const before = inspectImportedHtmlContract(page(custom), "pg001_sec002").issues.map((i) => i.code)
    expect(before).toContain("missing-section-type")
    const stamped = stampImportedSectionContract(custom, "pg001_sec002", "activity_custom_word_search")
    expect(stamped.startsWith('<section data-section-type="activity_custom_word_search" data-section-id="pg001_sec002">')).toBe(true)
    expect(inspectImportedHtmlContract(page(stamped), "pg001_sec002").issues).toEqual([])
  })

  it("fills an empty data-section-type", () => {
    const html = `<section data-section-id="s1" data-section-type=""><p>x</p></section>`
    expect(stampImportedSectionContract(html, "s1", "content")).toBe(
      `<section data-section-id="s1" data-section-type="content"><p>x</p></section>`,
    )
  })

  it("fills a bare data-section-type attribute", () => {
    expect(stampImportedSectionContract(`<section data-section-id="s1" data-section-type><p>x</p></section>`, "s1", "content"))
      .toBe(`<section data-section-id="s1" data-section-type="content"><p>x</p></section>`)
  })

  it("returns a valid section byte for byte", () => {
    const html = `<section data-section-id="s1" data-section-type="content" class="a"><p>Caf&eacute; <br/>x</p></section>`
    expect(stampImportedSectionContract(html, "s1", "content")).toBe(html)
  })

  it("never rewrites a section that belongs to another id, or HTML with no section", () => {
    const other = `<section data-section-id="other"><p>x</p></section>`
    expect(stampImportedSectionContract(other, "s1", "content")).toBe(other)
    const fixed = `<div data-fl-reference-width="800"><p data-id="t1">x</p></div>`
    expect(stampImportedSectionContract(fixed, "s1", "content")).toBe(fixed)
  })

})
