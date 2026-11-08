import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { Hono } from "hono"
import { createBookStorage, readExtractionManifest, readSectioningLifecycle } from "@adt/storage"
import { extractionOptionsFromConfig, loadBookConfig } from "@adt/pipeline"
import { extractPDF } from "../../../../packages/pipeline/src/pdf-extraction.js"
import { createBookRoutes } from "../routes/books.js"
import { errorHandler } from "../middleware/error-handler.js"
import { createBook } from "./book-service.js"

let root: string
let configPath: string
const label = "fresh-mode"
const source = path.resolve("tests/fixtures/raven.pdf")
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sectioning-first-extract-"))
  configPath = path.join(root, "global.yaml")
  fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\npage_sectioning:\n  mode: dynamic\n")
  createBook(label, fs.readFileSync(source), root)
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

async function changeMode() {
  const app = new Hono().onError(errorHandler).route("/", createBookRoutes(root, undefined, configPath))
  const response = await app.request(`/books/${label}/config`, {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ config: { start_page: 1, end_page: 1, page_sectioning: { mode: "page" } } }),
  })
  expect(response.status, await response.text()).toBe(200)
}

it("allows first extraction after an imported book changes Sectioning mode", async () => {
  await changeMode()
  const dir = path.join(root, label)
  expect(readSectioningLifecycle(dir)?.mode).toBe("page")
  const sidecar = fs.readFileSync(path.join(dir, ".sectioning-lifecycle.json"))
  const storage = createBookStorage(label, root)
  try {
    const config = loadBookConfig(label, root, configPath)
    expect(await extractPDF(extractionOptionsFromConfig(path.join(dir, label + ".pdf"), config), storage, { emit() {} })).toBe("extracted")
    expect(storage.getPages().map(page => page.pageId)).toEqual(["pg001"])
    expect(readExtractionManifest(dir)?.status).toBe("complete")
    expect(fs.readFileSync(path.join(dir, label + ".pdf")).equals(fs.readFileSync(source))).toBe(true)
    expect(fs.readFileSync(path.join(dir, ".sectioning-lifecycle.json"))).toEqual(sidecar)
  } finally { storage.close() }
}, 30_000)

it.each(["generated-history", "unknown-file", "malformed-sidecar", "sidecar-directory", "sidecar-symlink"])(
  "a preference sidecar does not bypass initial extraction protection for %s", async kind => {
    await changeMode()
    const dir = path.join(root, label), sidecar = path.join(dir, ".sectioning-lifecycle.json")
    const storage = createBookStorage(label, root)
    try {
      if (kind === "generated-history") storage.putNodeData("web-rendering", "pg001", { retained: "manual output" })
      if (kind === "unknown-file") fs.writeFileSync(path.join(dir, "retained.txt"), "keep")
      if (kind === "malformed-sidecar") fs.writeFileSync(sidecar, "{invalid")
      if (kind === "sidecar-directory") { fs.unlinkSync(sidecar); fs.mkdirSync(sidecar) }
      if (kind === "sidecar-symlink") { fs.unlinkSync(sidecar); fs.symlinkSync(configPath, sidecar) }
      const dbBefore = fs.readFileSync(path.join(dir, label + ".db"))
      const configBefore = fs.readFileSync(path.join(dir, "config.yaml"))
      await expect(extractPDF({ pdfPath: source, startPage: 1, endPage: 1 }, storage, { emit() {} }))
        .rejects.toMatchObject({ code: "EXTRACTION_LEGACY" })
      expect(fs.readFileSync(path.join(dir, label + ".db")).equals(dbBefore)).toBe(true)
      expect(fs.readFileSync(path.join(dir, "config.yaml"))).toEqual(configBefore)
      expect(fs.readFileSync(path.join(dir, label + ".pdf")).equals(fs.readFileSync(source))).toBe(true)
      expect(readExtractionManifest(dir)).toBeNull()
    } finally { storage.close() }
  },
)
