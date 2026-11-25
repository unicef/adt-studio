import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { afterEach, beforeEach, expect, it } from "vitest"
import { Hono } from "hono"
import { createBookStorage, readExtractionManifest, readSectioningLifecycle } from "@adt/storage"
import { extractionOptionsFromConfig, loadBookConfig } from "@adt/pipeline"
import { extractPDF } from "../../../../packages/pipeline/src/pdf-extraction.js"
import { createBookRoutes } from "../routes/books.js"
import { errorHandler } from "../middleware/error-handler.js"
import { createBook } from "./book-service.js"
import { PROJECT_IDENTITY_FILE } from "@adt/types"

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

it.each([false, true])("allows first extraction after a preference change, with inert admission leftovers: %s", async leftovers => {
  await changeMode()
  const dir = path.join(root, label)
  expect(readSectioningLifecycle(dir)?.mode).toBe("page")
  const sidecar = fs.readFileSync(path.join(dir, ".sectioning-lifecycle.json"))
  const identity = fs.readFileSync(path.join(dir, PROJECT_IDENTITY_FILE))
  const storage = createBookStorage(label, root)
  try {
    if (leftovers) {
      const owner = { token: randomUUID(), pid: process.pid, host: os.hostname(), coordinatedDatabases: [] }
      fs.writeFileSync(path.join(dir, `.book-writer.json.preparing-${randomUUID()}`), JSON.stringify(owner))
      for (const phase of ["preparing", "completed"]) {
        const artifact = path.join(dir, `.book-writer.json.recovery.${phase}-${owner.token}`)
        fs.mkdirSync(artifact)
        fs.writeFileSync(path.join(artifact, "owner.json"), JSON.stringify({ format: "adt-book-admission-v1", rootToken: owner.token, owner }))
      }
    }
    const config = loadBookConfig(label, root, configPath)
    expect(await extractPDF(extractionOptionsFromConfig(path.join(dir, label + ".pdf"), config), storage, { emit() {} })).toBe("extracted")
    expect(storage.getPages().map(page => page.pageId)).toEqual(["pg001"])
    expect(readExtractionManifest(dir)?.status).toBe("complete")
    expect(fs.readFileSync(path.join(dir, label + ".pdf")).equals(fs.readFileSync(source))).toBe(true)
    expect(fs.readFileSync(path.join(dir, ".sectioning-lifecycle.json"))).toEqual(sidecar)
    expect(fs.readFileSync(path.join(dir, PROJECT_IDENTITY_FILE))).toEqual(identity)
  } finally { storage.close() }
}, 30_000)

it.each(["generated-history", "unknown-file", "malformed-sidecar", "sidecar-directory", "sidecar-symlink", "unknown-admission-file", "admission-extra-file", "admission-symlink", "malformed-project-identity", "project-identity-directory", "project-identity-symlink", "imported-project-identity", "mismatched-project-identity"])(
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
      const identityPath = path.join(dir, PROJECT_IDENTITY_FILE)
      if (kind === "malformed-project-identity") fs.writeFileSync(identityPath, "{invalid")
      if (kind === "project-identity-directory") { fs.unlinkSync(identityPath); fs.mkdirSync(identityPath) }
      if (kind === "project-identity-symlink") { fs.unlinkSync(identityPath); fs.symlinkSync(configPath, identityPath) }
      if (kind === "imported-project-identity" || kind === "mismatched-project-identity") {
        const identity = JSON.parse(fs.readFileSync(identityPath, "utf8"))
        if (kind === "imported-project-identity") identity.sourceKind = "imported-adt"
        else identity.sourceFingerprint = "0".repeat(64)
        fs.writeFileSync(identityPath, JSON.stringify(identity))
      }
      if (kind.startsWith("admission-") || kind === "unknown-admission-file") {
        const token = randomUUID(), artifact = path.join(dir, `.book-writer.json.recovery.preparing-${token}`)
        fs.mkdirSync(artifact)
        fs.writeFileSync(path.join(artifact, "owner.json"), kind === "unknown-admission-file" ? "keep unknown data" : JSON.stringify({
          format: "adt-book-admission-v1", rootToken: token, owner: { token, pid: process.pid, host: os.hostname() },
        }))
        if (kind === "admission-extra-file") fs.writeFileSync(path.join(artifact, "user-data"), "preserve")
        if (kind === "admission-symlink") {
          fs.unlinkSync(path.join(artifact, "owner.json"))
          fs.symlinkSync(configPath, path.join(artifact, "owner.json"))
        }
      }
      const dbBefore = fs.readFileSync(path.join(dir, label + ".db"))
      const configBefore = fs.readFileSync(path.join(dir, "config.yaml"))
      const identityBefore = fs.lstatSync(identityPath).isFile() ? fs.readFileSync(identityPath) : null
      await expect(extractPDF({ pdfPath: source, startPage: 1, endPage: 1 }, storage, { emit() {} }))
        .rejects.toMatchObject({ code: "EXTRACTION_LEGACY" })
      expect(fs.readFileSync(path.join(dir, label + ".db")).equals(dbBefore)).toBe(true)
      expect(fs.readFileSync(path.join(dir, "config.yaml"))).toEqual(configBefore)
      if (identityBefore) expect(fs.readFileSync(identityPath)).toEqual(identityBefore)
      expect(fs.readFileSync(path.join(dir, label + ".pdf")).equals(fs.readFileSync(source))).toBe(true)
      expect(readExtractionManifest(dir)).toBeNull()
    } finally { storage.close() }
  },
)
