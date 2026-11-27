import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { extractPdf } from "@adt/pdf"
import { createPublisherStylesRoutes } from "./publisher-styles.js"

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-publisher-")) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })
const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

describe("publisher prototype routes", () => {
  it("uses real PDF extraction, versions designs and proofs, restores, and leaves production output untouched", async () => {
    const extracted = await extractPdf({ pdfBuffer: fs.readFileSync("tests/fixtures/raven.pdf"), endPage: 2 })
    const storage = createBookStorage("demo", dir)
    for (const page of extracted.pages) {
      storage.putExtractedPage(page)
      storage.putNodeData("positioned-text", page.pageId, page.positionedText)
    }
    storage.putNodeData("web-rendering", "pg001", { untouched: true })
    storage.close()
    const app = createPublisherStylesRoutes(dir)
    const prefix = "/books/demo/publisher-styles"
    const analysis = await app.request(`${prefix}/analyze`, post({ preset: "source" }))
    expect(analysis.status).toBe(200)
    const document = await analysis.json()
    expect(document.pages).toHaveLength(2)
    expect(document.styles.some((s: { origin: string }) => s.origin === "pdf")).toBe(true)
    const first = await app.request(`${prefix}/generate`, post({ document, baseVersion: 0 }))
    expect(first.status).toBe(200)
    expect((await first.json()).generated).toMatchObject({ designVersion: 1, pageCount: 2 })
    const proof = await (await app.request(`${prefix}/storyboard`)).json()
    expect(proof.css).toContain("font-family:")
    expect(proof.pages[0].html).toContain("data-id=")
    expect(proof.pages[0].html).toContain('class="pub-region"')
    expect(proof.document.pages[0].regions).toEqual(document.pages[0].regions)
    const learning = await app.request(`${prefix}/learning-design`, post({ document, accent: "#007f5b" }))
    expect(learning.status).toBe(200)
    expect((await learning.json()).theme).toEqual({ accent: "#007f5b" })
    expect((await (await app.request(prefix)).json()).document.theme).toBeUndefined()
    expect((await app.request(`${prefix}/learning-design`, post({ document, accent: "red;background:url(x)" }))).status).toBe(400)
    document.styles[0].fontSize = 30
    const legacy = structuredClone(document)
    for (const page of legacy.pages) delete page.regions
    const layoutResponse = await app.request(`${prefix}/layouts`, post({ document: legacy }))
    expect(layoutResponse.status).toBe(200)
    const upgraded = await layoutResponse.json()
    expect(upgraded.styles).toEqual(legacy.styles)
    expect(upgraded.components).toEqual(legacy.components)
    expect(upgraded.masters).toEqual(legacy.masters)
    expect(upgraded.pages.every((p: { regions: unknown[] }) => p.regions.length > 0)).toBe(true)
    expect((await (await app.request(prefix)).json()).version).toBe(1)
    expect(await (await app.request(`${prefix}/storyboard`)).json()).toEqual(proof)
    expect((await app.request(`${prefix}/save`, post({ document, baseVersion: 0 }))).status).toBe(409)
    expect((await app.request(`${prefix}/save`, post({ document, baseVersion: 1 }))).status).toBe(200)
    expect(await (await app.request(`${prefix}/storyboard`)).json()).toEqual(proof)
    const restored = await (await app.request(`${prefix}/restore`, post({ version: 1, baseVersion: 2 }))).json()
    expect(restored.version).toBe(3)
    expect(restored.versions).toEqual([1, 2, 3])
    const verify = createBookStorage("demo", dir)
    expect(verify.getAllNodeVersions("web-rendering", "pg001")).toEqual([{ version: 1, data: { untouched: true } }])
    verify.putNodeData("positioned-text", "pg001", { ...extracted.pages[0].positionedText, pageWidth: 777 })
    verify.close()
    expect((await (await app.request(prefix)).json()).sourceChanged).toBe(true)
    expect((await app.request(`${prefix}/generate`, post({ document, baseVersion: 3 }))).status).toBe(409)
    expect((await app.request(`${prefix}/layouts`, post({ document }))).status).toBe(409)
    expect((await app.request(`${prefix}/learning-design`, post({ document, accent: "#007f5b" }))).status).toBe(409)
  })

  it("rejects invalid labels, absent books, bad JSON, and empty analysis", async () => {
    const app = createPublisherStylesRoutes(dir)
    expect((await app.request("/books/-bad/publisher-styles")).status).toBe(400)
    expect((await app.request("/books/missing/publisher-styles")).status).toBe(404)
    createBookStorage("empty", dir).close()
    expect((await app.request("/books/empty/publisher-styles/analyze", post({ preset: "source" }))).status).toBe(422)
    expect((await app.request("/books/empty/publisher-styles/save", { method: "POST", body: "{oops" })).status).toBe(400)
  })
})
