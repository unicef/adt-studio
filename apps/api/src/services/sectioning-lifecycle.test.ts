import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Hono } from "hono"
import {
  createBookStorage, openBookDb, withBookWriter, recoverSectioningTransition,
  readSectioningLifecycle, writeSectioningLifecycle, SECTIONING_JOURNAL,
} from "@adt/storage"
import { PIPELINE } from "@adt/types"
import { createStoryboardPublication, sectioningInvalidationSteps, loadBookConfig, assertPersistedSectioning, prepareSectioningRun } from "@adt/pipeline"
import { getBookConfig, updateBookConfig } from "./book-service.js"
import { createBookRoutes } from "../routes/books.js"
import { errorHandler } from "../middleware/error-handler.js"

let root: string
let dir: string
let globalConfig: string
const label = "sample"
const value = (count = 1) => ({ reasoning: "manual", sections: Array.from({ length: count }, (_, n) => ({ sectionId: `pg002_sec${n + 8}`, sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 2, isPruned: false, nodes: [] })) })
const config = (mode: string) => ({ page_sectioning: { mode } })
const snapshot = () => {
  const db = openBookDb(path.join(dir, `${label}.db`))
  try { return ["pages", "node_data", "node_current", "images", "sign_language_videos"].map((table) => db.all(`SELECT * FROM ${table}`)) } finally { db.close() }
}
const runs = () => { const s = createBookStorage(label, root); try { return s.getStepRuns() } finally { s.close() } }
const seed = () => {
  const s = createBookStorage(label, root)
  s.putNodeData("page-sectioning", "pg002", value(2))
  s.putNodeData("page-sectioning", "pg002", value(1))
  s.setCurrentNodeVersion("page-sectioning", "pg002", 1)
  s.putNodeData("web-rendering", "pg002", { sections: [{ html: "kept" }] })
  for (const stage of PIPELINE) for (const step of stage.steps) s.markStepCompleted(step.name)
  s.close()
  const db = openBookDb(path.join(dir, `${label}.db`))
  db.run("INSERT INTO pages (page_id, page_number, text) VALUES (?, ?, ?)", ["pg002", 2, "book text"])
  db.close()
  fs.writeFileSync(path.join(dir, "images", "retained.png"), "untouched media")
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sectioning-lifecycle-"))
  dir = path.join(root, label)
  globalConfig = path.join(root, "global.yaml")
  fs.writeFileSync(globalConfig, "structure_types: {}\nrole_types: {}\npage_sectioning:\n  mode: dynamic\n")
  seed()
})
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }) })

describe("SPEC-0003 configuration publication", () => {
  it.each([["dynamic", "page"], ["page", "dynamic"]])("invalidates %s → %s without touching history, Extract or media", (oldMode, newMode) => {
    fs.writeFileSync(path.join(dir, "config.yaml"), `page_sectioning:\n  mode: ${oldMode}\n`)
    const before = snapshot()
    const extract = runs().filter((run) => !sectioningInvalidationSteps().includes(run.step as never))
    updateBookConfig(label, root, config(newMode), globalConfig)
    expect(runs()).toEqual(extract)
    expect(snapshot()).toEqual(before)
    expect(fs.readFileSync(path.join(dir, "images", "retained.png"), "utf8")).toBe("untouched media")
    expect(readSectioningLifecycle(dir)).toMatchObject({ mode: newMode, sectioningReady: false })
    expect(fs.existsSync(path.join(dir, SECTIONING_JOURNAL))).toBe(false)
  })

  it("resolves global inheritance, override removal, defaults and unrelated updates", () => {
    fs.writeFileSync(globalConfig, "structure_types: {}\nrole_types: {}\npage_sectioning:\n  mode: page\n")
    const before = runs()
    updateBookConfig(label, root, config("page"), globalConfig)
    updateBookConfig(label, root, {}, globalConfig)
    updateBookConfig(label, root, { concurrency: 3 }, globalConfig)
    expect(runs()).toEqual(before)
    fs.writeFileSync(path.join(dir, "config.yaml"), "structure_types: {}\nrole_types: {}\npage_sectioning:\n  mode: dynamic\n")
    updateBookConfig(label, root, {}, globalConfig)
    expect(runs().some((run) => run.step === "translation")).toBe(false)
    expect(loadBookConfig(label, root, globalConfig).page_sectioning?.mode).toBe("page")
  })

  it("invalid mode and running steps reject before any configuration/status/content write", () => {
    const before = snapshot()
    const beforeRuns = runs()
    expect(() => updateBookConfig(label, root, config("invented"), globalConfig)).toThrow()
    expect(getBookConfig(label, root)).toBeNull()
    expect(runs()).toEqual(beforeRuns)
    const s = createBookStorage(label, root); s.markStepStarted("tts"); s.close()
    const active = runs()
    expect(() => updateBookConfig(label, root, config("page"), globalConfig)).toThrow(/active writer/)
    expect(getBookConfig(label, root)).toBeNull()
    expect(runs()).toEqual(active)
    expect(snapshot()).toEqual(before)
  })

  it("returns structured HTTP 409 for a held writer from another process", async () => {
    const before = snapshot()
    // An actual child uses the same production admission and config service.
    const code = `import { withBookWriter } from ${JSON.stringify(path.resolve("packages/storage/dist/index.js"))}; import { spawnSync } from 'node:child_process'; withBookWriter(${JSON.stringify(dir)}, () => { const r = spawnSync(process.execPath, ['--input-type=module','-e', ${JSON.stringify(`import { updateBookConfig } from ${JSON.stringify(path.resolve("apps/api/dist/services/book-service.js"))}; try { updateBookConfig(${JSON.stringify(label)}, ${JSON.stringify(root)}, {page_sectioning:{mode:'page'}}, ${JSON.stringify(globalConfig)}) } catch (e) { console.log(e.code); process.exit(23) }`)}], {encoding:'utf8'}); console.log(r.status, r.stdout) });`
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 15000 })
    expect(child.status, child.stderr).toBe(0)
    expect(child.stdout).toContain("23 BOOK_BUSY")
    expect(snapshot()).toEqual(before)
    const s = createBookStorage(label, root); s.markStepStarted("web-rendering"); s.close()
    const app = new Hono().onError(errorHandler).route("/", createBookRoutes(root, root, globalConfig))
    const response = await app.request(`/books/${label}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: config("page") }) })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "BOOK_BUSY" })
  })

  it.each(["journal", "yaml", "lifecycle"])("recovers an injected %s publication failure", (boundary) => {
    const before = snapshot()
    const oldRuns = runs()
    const rename = fs.renameSync
    const suffix = boundary === "journal" ? SECTIONING_JOURNAL : boundary === "yaml" ? "config.yaml" : ".sectioning-lifecycle.json"
    const spy = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(to).endsWith(suffix)) throw new Error("injected disk failure")
      return rename(from, to)
    })
    expect(() => updateBookConfig(label, root, config("page"), globalConfig)).toThrow("injected disk failure")
    spy.mockRestore()
    if (boundary === "lifecycle") {
      expect(() => runs()).toThrow(/recovery is pending/)
      recoverSectioningTransition(dir)
      expect(runs().some((run) => run.step === "page-sectioning")).toBe(false)
      expect(readSectioningLifecycle(dir)?.mode).toBe("page")
    } else {
      recoverSectioningTransition(dir)
      expect(getBookConfig(label, root)).toBeNull()
      expect(runs()).toEqual(oldRuns)
    }
    expect(snapshot()).toEqual(before)
  })
  it.each(["journal", "yaml", "db", "lifecycle", "ack"])("recovers a process crash at the %s boundary", (boundary) => {
    const before = snapshot()
    const oldRuns = runs()
    const code = `
      import fs from 'node:fs';
      import sqlite from ${JSON.stringify(path.resolve("packages/storage/node_modules/node-sqlite3-wasm/dist/node-sqlite3-wasm.js"))};
      import { updateBookConfig } from ${JSON.stringify(path.resolve("apps/api/dist/services/book-service.js"))};
      const boundary = ${JSON.stringify(boundary)};
      const rename = fs.renameSync;
      fs.renameSync = (from, to) => {
        rename(from, to);
        if ((boundary === 'journal' && String(to).endsWith('.sectioning-transition.json')) ||
            (boundary === 'yaml' && String(to).endsWith('config.yaml')) ||
            (boundary === 'lifecycle' && String(to).endsWith('.sectioning-lifecycle.json'))) process.exit(71);
      };
      const run = sqlite.Database.prototype.run;
      sqlite.Database.prototype.run = function(sql, ...args) {
        const result = run.call(this, sql, ...args);
        if (boundary === 'db' && sql.startsWith('DELETE FROM step_runs')) process.exit(71);
        return result;
      };
      updateBookConfig(${JSON.stringify(label)}, ${JSON.stringify(root)}, {page_sectioning:{mode:'page'}}, ${JSON.stringify(globalConfig)});
      process.exit(71);
    `
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 15000 })
    expect(child.status, child.stderr).toBe(71)
    recoverSectioningTransition(dir)
    if (boundary === "journal") {
      expect(getBookConfig(label, root)).toBeNull()
      expect(runs()).toEqual(oldRuns)
    } else {
      expect(runs().some((run) => run.step === "page-sectioning")).toBe(false)
      expect(loadBookConfig(label, root, globalConfig).page_sectioning?.mode).toBe("page")
    }
    expect(snapshot()).toEqual(before)
    // Duplicate delivery after a lost acknowledgement must not invalidate twice.
    updateBookConfig(label, root, {page_sectioning: {mode: boundary === "journal" ? "dynamic" : "page"}}, globalConfig)
  })

})

describe("SPEC-0003 persisted data and publication", () => {
  it("validates the active version and preserves rendering on failure", () => {
    const s = createBookStorage(label, root)
    const before = snapshot()
    const cfg = loadBookConfig(label, root, globalConfig)
    cfg.page_sectioning = { mode: "page" }
    expect(() => assertPersistedSectioning(s, cfg, dir)).toThrow(/1 page/)
    expect(snapshot()).toEqual(before)
    s.close()
  })

  it.each(["config", "sectioning", "rollback"])("rejects an edit to %s after preflight, without publishing any page", (target) => {
    const s = createBookStorage(label, root)
    s.setCurrentNodeVersion("page-sectioning", "pg002", 2)
    writeSectioningLifecycle(dir, "dynamic", true)
    const publication = createStoryboardPublication(s, label, root, globalConfig)
    const old = s.getAllNodeVersions("web-rendering", "pg002")
    publication.storage.putNodeData("web-rendering", "pg002", { sections: [{ html: "new" }] })
    if (target === "config") fs.writeFileSync(globalConfig, "structure_types: {}\nrole_types: {}\nconcurrency: 2\n")
    else if (target === "sectioning") s.putNodeData("page-sectioning", "pg002", value())
    else s.setCurrentNodeVersion("page-sectioning", "pg002", 1)
    expect(() => publication.publish()).toThrow(/changed after preflight/)
    expect(s.getAllNodeVersions("web-rendering", "pg002")).toEqual(old)
    s.close()
  })

  it("publishes a successful rendering version while retaining all downstream entities", () => {
    const s = createBookStorage(label, root)
    s.putNodeData("image-captioning", "book", { manual: "retained" })
    writeSectioningLifecycle(dir, "dynamic", true)
    const publication = createStoryboardPublication(s, label, root, globalConfig)
    publication.storage.putNodeData("web-rendering", "pg002", { sections: [{ html: "new" }] })
    publication.publish()
    expect(s.getAllNodeVersions("web-rendering", "pg002")).toHaveLength(2)
    expect(s.getLatestNodeData("image-captioning", "book")?.data).toEqual({ manual: "retained" })
    expect(s.getStepRuns().some((run) => run.step === "image-captioning")).toBe(false)
    s.close()
  })

  it("fails closed on unknown provenance and on unsafe Sectioning replacement", () => {
    const before = snapshot()
    expect(() => prepareSectioningRun(label, root, "storyboard", "storyboard", globalConfig)).toThrow(/provenance is unknown/)
    expect(() => prepareSectioningRun(label, root, "sectioning", "storyboard", globalConfig)).toThrow(/manual or unknown-origin/)
    expect(snapshot()).toEqual(before)
  })
})
