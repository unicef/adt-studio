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
import { getBook, getBookConfig, updateBookConfig } from "./book-service.js"
import { createBookRoutes } from "../routes/books.js"
import { errorHandler } from "../middleware/error-handler.js"
import { createTaskService } from "./task-service.js"
import { createBookEventBus } from "./book-event-bus.js"
import { createStageRoutes } from "../routes/stages.js"
import { createStageService } from "./stage-service.js"
import { createPageErrorDecisions } from "./page-error-decisions.js"

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
  it("does not announce a task that failed writer admission", async () => {
    const bus = createBookEventBus()
    const events: unknown[] = []
    bus.addListener(label, (event) => events.push(event))
    const tasks = createTaskService(bus, root)
    let release!: () => void
    const held = withBookWriter(dir, () => new Promise<void>((resolve) => { release = resolve }))
    const executor = vi.fn(async () => undefined)
    try {
      expect(() => tasks.submitTask(label, "re-render", "busy task", executor)).toThrow(/active writer/)
      expect(executor).not.toHaveBeenCalled()
      expect(tasks.getActiveTasks(label)).toEqual([])
      expect(events).toEqual([])
    } finally { release(); await held }
  })
  it("holds admission for a live task after its submitting request returns", async () => {
    const tasks = createTaskService(createBookEventBus(), root)
    let finish!: () => void
    tasks.submitTask(label, "re-render", "test writer", () => new Promise<void>((resolve) => { finish = resolve }))
    const before = snapshot()
    try {
      expect(() => updateBookConfig(label, root, config("page"), globalConfig)).toThrow(/active writer/)
      expect(getBookConfig(label, root)).toBeNull()
      expect(snapshot()).toEqual(before)
    } finally { finish() }
    await vi.waitFor(() => expect(tasks.getActiveTasks(label)[0]?.status).toBe("completed"))
    updateBookConfig(label, root, config("page"), globalConfig)
    expect(readSectioningLifecycle(dir)?.mode).toBe("page")
  })

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
  it("rolls back a partial SQLite invalidation and recovers the published YAML", () => {
    const dbPath = path.join(dir, `${label}.db`)
    const db = openBookDb(dbPath)
    db.exec("CREATE TRIGGER fail_mode_invalidation BEFORE DELETE ON step_runs WHEN OLD.step = 'translation' BEGIN SELECT RAISE(ABORT, 'injected db failure'); END")
    db.close()
    const before = runs()
    expect(() => updateBookConfig(label, root, config("page"), globalConfig)).toThrow("injected db failure")
    expect(() => runs()).toThrow(/recovery is pending/)
    withBookWriter(dir, () => {
      const inspect = openBookDb(dbPath)
      expect(inspect.all("SELECT step FROM step_runs")).toHaveLength(before.length)
      inspect.exec("DROP TRIGGER fail_mode_invalidation")
      inspect.close()
    })
    recoverSectioningTransition(dir)
    expect(runs().some((run) => run.step === "translation")).toBe(false)
  })

  it("defaults an omitted effective mode to Dynamic without invalidating", () => {
    fs.writeFileSync(globalConfig, "structure_types: {}\nrole_types: {}\n")
    const before = runs()
    updateBookConfig(label, root, {}, globalConfig)
    expect(runs()).toEqual(before)
  })

  it("recovers an ambiguous YAML rename success without discarding its journal", () => {
    const before = snapshot()
    const rename = fs.renameSync
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      rename(from, to)
      if (String(to).endsWith("config.yaml")) throw new Error("lost rename acknowledgement")
    })
    expect(() => updateBookConfig(label, root, config("page"), globalConfig)).toThrow("lost rename acknowledgement")
    vi.restoreAllMocks()
    expect(fs.existsSync(path.join(dir, SECTIONING_JOURNAL))).toBe(true)
    expect(() => runs()).toThrow(/recovery is pending/)
    recoverSectioningTransition(dir)
    expect(readSectioningLifecycle(dir)).toMatchObject({ mode: "page", sectioningReady: false })
    expect(runs().some((run) => run.step === "page-sectioning")).toBe(false)
    expect(snapshot()).toEqual(before)
  })

  it("keeps a conflicting external config edit and the recovery journal for inspection", () => {
    const before = snapshot()
    const rename = fs.renameSync
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(to).endsWith(".sectioning-lifecycle.json")) throw new Error("lifecycle unavailable")
      rename(from, to)
    })
    expect(() => updateBookConfig(label, root, config("page"), globalConfig)).toThrow("lifecycle unavailable")
    vi.restoreAllMocks()
    const proposed = fs.readFileSync(path.join(dir, "config.yaml"), "utf8")
    const journal = fs.readFileSync(path.join(dir, SECTIONING_JOURNAL), "utf8")
    const external = `${proposed}\nconcurrency: 7\n`
    fs.writeFileSync(path.join(dir, "config.yaml"), external)
    expect(() => recoverSectioningTransition(dir)).toThrow(/conflicts with config.yaml/)
    expect(fs.readFileSync(path.join(dir, "config.yaml"), "utf8")).toBe(external)
    expect(fs.readFileSync(path.join(dir, SECTIONING_JOURNAL), "utf8")).toBe(journal)
    expect(() => runs()).toThrow(/recovery is pending/)
    // Explicitly restore the journal's proposed configuration, then retry.
    fs.writeFileSync(path.join(dir, "config.yaml"), proposed)
    recoverSectioningTransition(dir)
    expect(snapshot()).toEqual(before)
    expect(readSectioningLifecycle(dir)?.mode).toBe("page")
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
  it("does not expose retained completion as current after conservative invalidation", async () => {
    writeSectioningLifecycle(dir, "dynamic", false)
    expect(getBook(label, root).completedStages).toEqual(["extract"])
    const bus = createBookEventBus()
    const decisions = createPageErrorDecisions(bus)
    const stages = createStageService({ run: vi.fn(async () => undefined) }, bus, decisions)
    const app = new Hono().onError(errorHandler).route("/", createStageRoutes(stages, bus, decisions, root, root, root, globalConfig))
    const response = await app.request(`/books/${label}/step-status`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.stages.sectioning).toBe("idle")
    expect(body.stages.storyboard).toBe("idle")
    expect(body.stages.extract).toBe("done")
  })
  it("invalidating Sectioning completion also revokes its lifecycle readiness", () => {
    writeSectioningLifecycle(dir, "dynamic", true)
    const before = snapshot()
    const storage = createBookStorage(label, root)
    try { storage.clearStepRuns(["translation"]) } finally { storage.close() }
    expect(() => prepareSectioningRun(label, root, "storyboard", "storyboard", globalConfig)).toThrow(/Sectioning has not completed/)
    expect(snapshot()).toEqual(before)
    expect(readSectioningLifecycle(dir)?.sectioningReady).toBe(false)
  })
  it("uses the persisted part window rather than inferred contiguous PDF pages", () => {
    const db = openBookDb(path.join(dir, `${label}.db`))
    db.run("INSERT INTO pages (page_id, page_number, text) VALUES (?, ?, ?)", ["pg007", 7, "part page"])
    db.close()
    const s = createBookStorage(label, root)
    s.putNodeData("page-sectioning", "pg007", value())
    fs.writeFileSync(path.join(dir, "part.json"), JSON.stringify({
      adtPart: 1, sourceLabel: label, title: null, range: { startPage: 5, endPage: 10 },
      pageCount: 100, fingerprint: {}, identityHash: "id", semanticsHash: "sem",
      createdAt: "2026-01-01T00:00:00.000Z", partLabelSuggestion: "sample-p005-010",
    }))
    const cfg = loadBookConfig(label, root, globalConfig)
    cfg.page_sectioning = { mode: "page" }
    try { expect(() => assertPersistedSectioning(s, cfg, dir)).not.toThrow() } finally { s.close() }
  })

  it("validates the active version and preserves rendering on failure", () => {
    const s = createBookStorage(label, root)
    const before = snapshot()
    const cfg = loadBookConfig(label, root, globalConfig)
    cfg.page_sectioning = { mode: "page" }
    expect(() => assertPersistedSectioning(s, cfg, dir)).toThrow(/1 page/)
    expect(snapshot()).toEqual(before)
    s.close()
  })

  it.each(["config", "sectioning", "rollback", "rendering", "pages", "lifecycle"])("rejects an edit to %s after preflight, without publishing any page", (target) => {
    const s = createBookStorage(label, root)
    s.setCurrentNodeVersion("page-sectioning", "pg002", 2)
    writeSectioningLifecycle(dir, "dynamic", true)
    const publication = createStoryboardPublication(s, label, root, globalConfig)
    publication.storage.putNodeData("web-rendering", "pg002", { sections: [{ html: "new" }] })
    if (target === "config") fs.writeFileSync(globalConfig, "structure_types: {}\nrole_types: {}\nconcurrency: 2\n")
    else if (target === "sectioning") s.putNodeData("page-sectioning", "pg002", value())
    else if (target === "rollback") s.setCurrentNodeVersion("page-sectioning", "pg002", 1)
    else if (target === "rendering") s.putNodeData("web-rendering", "pg002", { sections: [{ html: "concurrent manual edit" }] })
    else if (target === "lifecycle") writeSectioningLifecycle(dir, "dynamic", false)
    else {
      const db = openBookDb(path.join(dir, `${label}.db`))
      db.run("INSERT INTO pages (page_id, page_number, text) VALUES (?, ?, ?)", ["pg007", 7, "new source page"])
      db.close()
    }
    const old = s.getAllNodeVersions("web-rendering", "pg002")
    expect(() => publication.publish()).toThrow(/changed after preflight/)
    expect(s.getAllNodeVersions("web-rendering", "pg002")).toEqual(old)
    s.close()
  })

  it("rolls back all staged rendering versions when a later page fails to persist", () => {
    const s = createBookStorage(label, root)
    const db = openBookDb(path.join(dir, `${label}.db`))
    db.run("INSERT INTO pages (page_id, page_number, text) VALUES (?, ?, ?)", ["pg007", 7, "second page"])
    s.putNodeData("page-sectioning", "pg007", value())
    s.putNodeData("web-rendering", "pg007", { sections: [{ html: "second retained page" }] })
    writeSectioningLifecycle(dir, "dynamic", true)
    const before = snapshot()
    const oldRuns = runs()
    const publication = createStoryboardPublication(s, label, root, globalConfig)
    publication.storage.putNodeData("web-rendering", "pg002", { sections: [{ html: "first staged page" }] })
    publication.storage.putNodeData("web-rendering", "pg007", { sections: [{ html: "second staged page" }] })
    db.exec("CREATE TRIGGER fail_render_publication BEFORE INSERT ON node_data WHEN NEW.node = 'web-rendering' AND NEW.item_id = 'pg007' BEGIN SELECT RAISE(ABORT, 'injected render failure'); END")
    try {
      expect(() => publication.publish()).toThrow("injected render failure")
      expect(snapshot()).toEqual(before)
      expect(runs()).toEqual(oldRuns)
    } finally { db.close(); s.close() }
  })

  it("publishes a successful rendering version while retaining all downstream entities", () => {
    const s = createBookStorage(label, root)
    s.putNodeData("image-captioning", "book", { manual: "retained" })
    writeSectioningLifecycle(dir, "dynamic", true)
    fs.mkdirSync(path.join(dir, "adt"))
    expect(getBook(label, root).completedStages).toContain("preview")
    const publication = createStoryboardPublication(s, label, root, globalConfig)
    publication.storage.putNodeData("web-rendering", "pg002", { sections: [{ html: "new" }] })
    publication.publish()
    expect(s.getAllNodeVersions("web-rendering", "pg002")).toHaveLength(2)
    expect(s.getLatestNodeData("image-captioning", "book")?.data).toEqual({ manual: "retained" })
    expect(s.getStepRuns().some((run) => run.step === "image-captioning")).toBe(false)
    expect(getBook(label, root).completedStages).not.toContain("preview")
    expect(fs.existsSync(path.join(dir, "adt"))).toBe(true)
    s.close()
  })

  it("fails closed on unknown provenance and on unsafe Sectioning replacement", () => {
    const before = snapshot()
    expect(() => prepareSectioningRun(label, root, "storyboard", "storyboard", globalConfig)).toThrow(/provenance is unknown/)
    expect(() => prepareSectioningRun(label, root, "sectioning", "storyboard", globalConfig)).toThrow(/manual or unknown-origin/)
    expect(snapshot()).toEqual(before)
  })
})
