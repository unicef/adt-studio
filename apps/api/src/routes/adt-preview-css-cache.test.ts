import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"

// Count the whole-book reads behind the stylesheet: the text catalog snapshot
// is built once per gathering of every page's HTML.
const gathered = vi.hoisted(() => ({ count: 0 }))
vi.mock("@adt/pipeline", async original => {
  const real = await original<typeof import("@adt/pipeline")>()
  return {
    ...real,
    buildTextCatalogSnapshot: (...args: Parameters<typeof real.buildTextCatalogSnapshot>) => {
      gathered.count++
      return real.buildTextCatalogSnapshot(...args)
    },
  }
})
import { createAdtPreviewRoutes } from "./adt-preview.js"

let root: string
let assets: string
beforeEach(() => {
  gathered.count = 0
  root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-css-cache-"))
  assets = path.join(root, "web-assets")
  fs.mkdirSync(path.join(assets, "libs/fontawesome/css"), { recursive: true })
  for (const bundle of ["base.bundle.min.js", "base.bundle.local.js"]) fs.writeFileSync(path.join(assets, bundle), "window.__ADT_BUNDLE_TEST__ = true;")
  fs.writeFileSync(path.join(assets, "libs/fontawesome/css/all.min.css"), ".icon { display: inline; }")
  fs.writeFileSync(path.join(assets, "base.js"), "window.__ADT_BUNDLE_TEST__ = true;\n")
  fs.writeFileSync(path.join(assets, "fonts.css"), "body { font-family: serif; }")
  fs.writeFileSync(path.join(assets, "tailwind_css.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n")
})
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

function save(html: string): void {
  const storage = createBookStorage("book", root)
  try {
    if (!storage.getPages().length) {
      storage.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "Page one", images: [],
        pageImage: { imageId: "pg001_page", pageId: "pg001", buffer: Buffer.from("page"), format: "png", width: 800, height: 1200, hash: "page" } })
      storage.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [{ sectionId: "pg001_sec001", sectionType: "content",
        backgroundColor: "#ffffff", textColor: "#000000", pageNumber: 1, isPruned: false, nodes: [{ nodeId: "pg001_n0001", role: "paragraph", text: "Text", isPruned: false }] }] })
    }
    storage.putNodeData("web-rendering", "pg001", { sections: [{ sectionId: "pg001_sec001", sectionIndex: 0, sectionType: "content", reasoning: "", html }] })
  } finally { storage.close() }
}

it("answers an unchanged book without re-reading its pages, and refreshes after a save", { timeout: 60_000 }, async () => {
  save('<section data-section-id="pg001_sec001"><p data-id="pg001_n0001" class="w-[411px]">Text</p></section>')
  const app = new Hono().route("/api", createAdtPreviewRoutes(root, assets))
  const url = "/api/books/book/adt-preview/content/tailwind_output.css"
  const get = async () => { const response = await app.request(url); expect(response.status, await response.clone().text()).toBe(200); return response.text() }
  const draft = async (extraHtml: string) => {
    const response = await app.request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ extraHtml }) })
    expect(response.status, await response.clone().text()).toBe(200)
    return response.text()
  }

  const first = await get()
  expect(first).toContain("411px")
  expect(gathered.count).toBe(1)
  // Nothing changed: the stylesheet is reused without gathering every page.
  expect(await get()).toBe(first)
  expect(await get()).toBe(first)
  expect(gathered.count).toBe(1)

  // Unsaved edits are their own input: gathered once, then reused, and they
  // never leak into the saved book's stylesheet.
  const unsaved = await draft('<p class="w-[777px]">Draft</p>')
  expect(unsaved).toContain("777px")
  expect(await draft('<p class="w-[777px]">Draft</p>')).toBe(unsaved)
  expect(gathered.count).toBe(2)
  expect(await get()).not.toContain("777px")
  expect(gathered.count).toBe(2)

  // A content save changes the saved state, so the next request reads again.
  save('<section data-section-id="pg001_sec001"><p data-id="pg001_n0001" class="w-[422px]">Text</p></section>')
  const changed = await get()
  expect(changed).toContain("422px")
  expect(changed).not.toContain("411px")
  expect(gathered.count).toBe(3)
  expect(await get()).toBe(changed)
  expect(gathered.count).toBe(3)
})
