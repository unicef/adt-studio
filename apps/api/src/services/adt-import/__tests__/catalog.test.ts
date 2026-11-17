import { describe, expect, it } from "vitest"

import { AdtImportError } from "../error.js"
import { createRecoveredCatalog } from "../catalog.js"

const page = (sectionId: string, body: string) =>
  `<!doctype html><html><body><main><div id="content"><section data-section-id="${sectionId}" data-section-type="content">${body}</section></div></main></body></html>`

// F9: the exporter writes the same captioned <img> into every section it appears in.
describe("createRecoveredCatalog", () => {
  const img = '<img data-id="pg001_im001" src="images/pg001_im001.png" alt="A red ball">'
  const pages = [
    { section_id: "pg001_sec001", href: "pg001_sec001.html" },
    { section_id: "pg001_sec002", href: "pg001_sec002.html" },
  ]

  it("accepts one image with one caption in two sections of a page", () => {
    const { catalog } = createRecoveredCatalog(
      { pg001_t001: "One", pg001_t002: "Two", pg001_im001: "A red ball" },
      pages,
      {
        "pg001_sec001.html": page("pg001_sec001", `<p data-id="pg001_t001">One</p>${img}`),
        "pg001_sec002.html": page("pg001_sec002", `<p data-id="pg001_t002">Two</p>${img}`),
      },
    )
    expect(catalog.entries.filter((entry) => entry.id === "pg001_im001")).toHaveLength(1)
  })

  it("still refuses one id with two different texts", () => {
    expect(() => createRecoveredCatalog(
      { pg001_t001: "One", pg001_t002: "Two" },
      pages,
      {
        "pg001_sec001.html": page("pg001_sec001", '<p data-id="pg001_t001">One</p>'),
        "pg001_sec002.html": page("pg001_sec002", '<p data-id="pg001_t001">Something else</p>'),
      },
    )).toThrow(AdtImportError)
  })
})
