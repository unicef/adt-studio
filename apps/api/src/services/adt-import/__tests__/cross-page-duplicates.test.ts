import { strToU8, unzipSync, zipSync } from "fflate"
import { describe, expect, it } from "vitest"

import { createRecoveredCatalog, findCrossPageDuplicateIds } from "../catalog.js"
import { AdtImportError } from "../error.js"
import { previewAdtRecoveryImport } from "../preview.js"
import { json, makeCurrentBundleWithExternallyAddedPage } from "./fixtures.js"

const page = (sectionId: string, body: string) =>
  `<!doctype html><html><body><main id="content"><section data-section-id="${sectionId}" data-section-type="content">${body}</section></main></body></html>`

const pages = [
  { section_id: "pg001_sec001", href: "pg001_sec001.html" },
  { section_id: "pg001_sec002", href: "pg001_sec002.html" },
  { section_id: "pg002_sec001", href: "pg002_sec001.html" },
]
const img = '<img data-id="pg001_im001" src="images/pg001_im001.png" alt="A red ball">'
const pageHtml = {
  "pg001_sec001.html": page("pg001_sec001", `<h1 data-id="pg001_t001">Title</h1><p data-id="pg001_t002">One</p>${img}`),
  // The same heading, word for word, on the next section of the same PDF page.
  "pg001_sec002.html": page("pg001_sec002", `<h1 data-id="pg001_t001">Title</h1>${img}`),
  // A different text under an id that belongs to another page.
  "pg002_sec001.html": page("pg002_sec001", `<h1 data-id="pg001_t001">Title</h1><p data-id="pg001_t002">Changed</p>`),
}

// #1153: every id repeated across pages is listed at once, not one per attempt.
describe("findCrossPageDuplicateIds", () => {
  it("lists every repeated id once, with the pages that repeat it", () => {
    expect(findCrossPageDuplicateIds(pages, pageHtml)).toEqual([
      { id: "pg001_t001", hrefs: ["pg001_sec001.html", "pg001_sec002.html", "pg002_sec001.html"] },
      { id: "pg001_t002", hrefs: ["pg001_sec001.html", "pg002_sec001.html"] },
    ])
  })

  it("accepts one image with one caption on several pages, as the catalog does", () => {
    expect(findCrossPageDuplicateIds(pages, pageHtml).map((duplicate) => duplicate.id))
      .not.toContain("pg001_im001")
  })

  it("leaves an id repeated within one page to the page contract check", () => {
    const onePage = {
      "pg001_sec001.html": page("pg001_sec001", '<p data-id="pg001_t001">A</p><p data-id="pg001_t001">A</p>'),
    }
    expect(findCrossPageDuplicateIds(pages.slice(0, 1), onePage)).toEqual([])
  })
})

describe("createRecoveredCatalog with repeated ids", () => {
  it("throws by default, so a seed never imports a repeated id", () => {
    expect(() => createRecoveredCatalog({}, pages, pageHtml)).toThrow(AdtImportError)
  })

  it("keeps the first copy when asked, so the review can still be built", () => {
    const { catalog } = createRecoveredCatalog({}, pages, pageHtml, false, { onDuplicate: "keep-first" })
    expect(catalog.entries).toContainEqual({ id: "pg001_t002", text: "One" })
  })
})

function bundleWithRepeatedIds(): Buffer {
  const files = unzipSync(makeCurrentBundleWithExternallyAddedPage())
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]))
  manifest.editingContract.pageOrder.push({ sectionId: "pg003_sec001", href: "pg003_sec001.html" })
  manifest.editingContract.pageDataIds["pg002_sec001.html"] = ["pg001_t001", "pg002_t001"]
  manifest.editingContract.pageDataIds["pg003_sec001.html"] = ["pg002_t001"]
  files["manifest.json"] = json(manifest)
  files["content/pages.json"] = json([
    { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
    { section_id: "pg002_sec001", href: "pg002_sec001.html", page_number: 2 },
    { section_id: "pg003_sec001", href: "pg003_sec001.html", page_number: 3 },
  ])
  files["pg002_sec001.html"] = strToU8(page(
    "pg002_sec001",
    '<p data-id="pg001_t001">Original page</p><p data-id="pg002_t001">Page added outside Studio</p>',
  ))
  files["pg003_sec001.html"] = strToU8(page("pg003_sec001", '<p data-id="pg002_t001">Something else</p>'))
  return Buffer.from(zipSync(files))
}

describe("import review of repeated ids", () => {
  it("builds the review and lists every repeated id instead of failing as unreadable", () => {
    const { compatibility } = previewAdtRecoveryImport(bundleWithRepeatedIds())
    expect(compatibility.supported).toBe(false)
    expect(compatibility.issues.filter((issue) => issue.code === "cross-page-duplicate-data-id")).toEqual([
      { code: "cross-page-duplicate-data-id", pageHref: "index.html", detail: "pg001_t001 (also on pg002_sec001.html)" },
      { code: "cross-page-duplicate-data-id", pageHref: "pg002_sec001.html", detail: "pg002_t001 (also on pg003_sec001.html)" },
    ])
  })
})

function bundleWithManyRepeatedIds(count: number): Buffer {
  const files = unzipSync(makeCurrentBundleWithExternallyAddedPage())
  const ids = Array.from({ length: count }, (_, index) => `pg002_t${String(index + 1).padStart(3, "0")}`)
  const paragraphs = (text: string) => ids.map((id) => `<p data-id="${id}">${text} ${id}</p>`).join("")
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]))
  manifest.editingContract.pageOrder.push({ sectionId: "pg003_sec001", href: "pg003_sec001.html" })
  manifest.editingContract.pageDataIds["pg002_sec001.html"] = ids
  manifest.editingContract.pageDataIds["pg003_sec001.html"] = ids
  files["manifest.json"] = json(manifest)
  files["content/pages.json"] = json([
    { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
    { section_id: "pg002_sec001", href: "pg002_sec001.html", page_number: 2 },
    { section_id: "pg003_sec001", href: "pg003_sec001.html", page_number: 3 },
  ])
  files["pg002_sec001.html"] = strToU8(page("pg002_sec001", paragraphs("Original")))
  files["pg003_sec001.html"] = strToU8(page("pg003_sec001", paragraphs("Copy")))
  return Buffer.from(zipSync(files))
}

describe("repair request for repeated ids", () => {
  it("names every repeated id and its other pages, not only the report's examples", () => {
    const { compatibility, agentGuide } = previewAdtRecoveryImport(bundleWithManyRepeatedIds(12))
    expect(compatibility.issueCounts?.["cross-page-duplicate-data-id"]).toBe(12)
    for (let index = 1; index <= 12; index += 1) {
      const id = `pg002_t${String(index).padStart(3, "0")}`
      expect(agentGuide.repairPrompt).toContain(`   - pg002_sec001.html: ${id} (also on pg003_sec001.html)`)
    }
    expect(agentGuide.repairPrompt).toContain("found 12 times:")
    expect(agentGuide.repairPrompt).not.toMatch(/found 12 times; the first/)
  })
})
