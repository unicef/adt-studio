import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import type { ExtractedPage } from "@adt/pdf"
import { createBookStorage, openBookDb, withBookWriter, writeSectioningLifecycle } from "@adt/storage"
import { AccessibilityAssessmentOutput, type TaskInfo } from "@adt/types"
import { errorHandler } from "../middleware/error-handler.js"
import { exportAdt, exportScorm } from "../services/export-service.js"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { unzipSync } from "fflate"
import { packageAdtWeb, loadBookConfig } from "@adt/pipeline"
import { createBookRoutes } from "./books.js"
import type { TaskService } from "../services/task-service.js"
import { createPackageRoutes } from "./package.js"

describe("Package routes", () => {
  let tmpDir: string
  let webAssetsDir: string
  let app: Hono

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "package-routes-"))
    webAssetsDir = path.join(tmpDir, "web-assets")
    fs.mkdirSync(webAssetsDir, { recursive: true })

    app = new Hono()
    app.onError(errorHandler)
    app.route("/api", createPackageRoutes(tmpDir, webAssetsDir))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function createTestBook(label: string): void {
    const storage = createBookStorage(label, tmpDir)
    storage.close()
  }

  function createRenderedBook(label: string): void {
    const storage = createBookStorage(label, tmpDir)
    const page: ExtractedPage = {
      pageId: "pg001",
      pageNumber: 1,
      text: "Page one",
      pageImage: {
        imageId: "pg001_page",
        pageId: "pg001",
        buffer: Buffer.from("fake-png-800x1200"),
        format: "png",
        width: 800,
        height: 1200,
        hash: "page-hash",
      },
      images: [],
    }

    storage.putExtractedPage(page)
    storage.putNodeData("page-sectioning", "pg001", {
      reasoning: "ok",
      sections: [
        {
          sectionId: "pg001_sec001",
          sectionType: "content",
          backgroundColor: "#ffffff",
          textColor: "#000000",
          pageNumber: 1,
          isPruned: false,
          nodes: [],
        },
      ],
    })
    storage.putNodeData("web-rendering", "pg001", {
      sections: [
        {
          sectionId: "pg001_sec001",
          sectionIndex: 0,
          sectionType: "content",
          reasoning: "ok",
          html: '<main><p data-id="pg001_n0001">Original text</p><img data-id="pg001_page" src="cover.png"></main>',
        },
      ],
    })
    storage.close()
  }

  function createWebAssets(): void {
    for (const bundle of ["base.bundle.min.js", "base.bundle.local.js"]) fs.writeFileSync(path.join(webAssetsDir, bundle), "window.__ADT_BUNDLE_TEST__ = true;")
    fs.mkdirSync(path.join(webAssetsDir, "libs/fontawesome/css"), { recursive: true })
    fs.writeFileSync(path.join(webAssetsDir, "libs/fontawesome/css/all.min.css"), ".icon { display: inline; }")
    fs.writeFileSync(path.join(webAssetsDir, "base.js"), 'window.__ADT_BUNDLE_TEST__ = "ok";\n')
    fs.writeFileSync(path.join(webAssetsDir, "fonts.css"), "body { font-family: serif; }")
    fs.writeFileSync(
      path.join(webAssetsDir, "tailwind_css.css"),
      "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
    )
  }

  it("uses the configured prompts directory for both admission and publication", async () => {
    createRenderedBook("custom-prompts")
    const prompts = path.join(tmpDir, "external-prompts")
    fs.mkdirSync(prompts)
    fs.writeFileSync(path.join(prompts, "web_generation_html.liquid"), "custom prompt")
    const routes = new Hono().onError(errorHandler).route("/api", createPackageRoutes(tmpDir, path.resolve("assets/adt"), undefined, undefined, prompts))
    const url = "/api/books/custom-prompts/package-adt"
    const first = await routes.request(url, { method: "POST" })
    expect(first.status, await first.clone().text()).toBe(200)
    const second = await routes.request(url, { method: "POST" })
    expect(second.status, await second.clone().text()).toBe(200)
  })

  it.each(["page-sectioning", "fixed-layout-sectioning"])("packages healthy pages beside unreadable selected %s without rewriting history", async node => {
    const label = "corrupt-neighbor", directory = path.join(tmpDir, label)
    createRenderedBook(label)
    createWebAssets()
    const storage = createBookStorage(label, tmpDir)
    storage.putExtractedPage({ pageId: "pg002", pageNumber: 2, text: "Page two", pageImage: { imageId: "pg002_page", buffer: Buffer.from("retained image two"), hash: "two", width: 800, height: 1200, format: "png" }, images: [] })
    for (const name of ["page-sectioning", "web-rendering"]) storage.putNodeData(name, "pg002", JSON.parse(JSON.stringify(storage.getLatestNodeData(name, "pg001")!.data).replaceAll("pg001", "pg002")))
    if (node === "fixed-layout-sectioning") storage.putNodeData(node, "pg002", storage.getLatestNodeData("page-sectioning", "pg002")!.data)
    storage.close()
    const run = () => app.request(`/api/books/${label}/package-adt`, { method: "POST" })
    expect((await run()).status).toBe(200)
    const raw = <T,>(read: (db: ReturnType<typeof openBookDb>) => T): T => withBookWriter(directory, () => {
      const db = openBookDb(path.join(directory, label + ".db"))
      try { return read(db) } finally { db.close() }
    })
    const original = raw(db => db.get("SELECT data FROM node_data WHERE node=? AND item_id=? AND version=1", [node, "pg002"]) as { data: string })
    raw(db => db.run("UPDATE node_data SET data=? WHERE node=? AND item_id=? AND version=1", ["{broken", node, "pg002"]))
    const history = () => raw(db => db.all("SELECT * FROM node_data WHERE node IN ('page-sectioning','fixed-layout-sectioning','web-rendering') ORDER BY node,item_id,version"))
    const before = history()
    const result = await run()
    expect(result.status, await result.clone().text()).toBe(200)
    expect((await result.json()).warnings).toEqual(expect.arrayContaining([expect.objectContaining({ pageId: "pg002" })]))
    expect(await (await app.request(`/api/books/${label}/package-adt/status`)).json()).toMatchObject({ complete: false })
    const zip = unzipSync(new Uint8Array(await new Response((await exportAdt(label, tmpDir)).stream).arrayBuffer()))
    expect(zip["pg001_sec001.html"]).toBeDefined()
    expect(zip["pg002_sec001.html"]).toBeUndefined()
    expect(history()).toEqual(before)
    raw(db => db.run("UPDATE node_data SET data=? WHERE node=? AND item_id=? AND version=1", [original.data, node, "pg002"]))
    expect((await run()).status).toBe(200)
    expect(await (await app.request(`/api/books/${label}/package-adt/status`)).json()).toMatchObject({ complete: true })
  })

  it("returns a typed recovery refusal and retains unknown journal and prior package bytes", async () => {
    createRenderedBook("journal-refusal")
    const routes = new Hono().onError(errorHandler).route("/api", createPackageRoutes(tmpDir, path.resolve("assets/adt")))
    const url = "/api/books/journal-refusal/package-adt"
    expect((await routes.request(url, { method: "POST" })).status).toBe(200)
    const book = path.join(tmpDir, "journal-refusal")
    const html = fs.readFileSync(path.join(book, "adt", "pg001_sec001.html"))
    fs.writeFileSync(path.join(book, ".adt-package-work", "format"), "unknown-format")
    // Changed source forces a rebuild rather than the legitimate cache hit.
    const storage = createBookStorage("journal-refusal", tmpDir)
    storage.putNodeData("metadata", "book", { title: "Changed title" })
    storage.close()
    const response = await routes.request(url, { method: "POST" })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "PACKAGE_RECOVERY_UNSAFE" })
    expect(fs.readFileSync(path.join(book, ".adt-package-work", "format"), "utf8")).toBe("unknown-format")
    expect(fs.readFileSync(path.join(book, "adt", "pg001_sec001.html")).equals(html)).toBe(true)
  })

  // Independent Codex C3: unchanged source hashes cannot prove a usable bundle.
  it.each(["runtime", "entry", "stylesheet", "manifest", "directory", "image"])(
    "rebuilds a cached package with an unavailable required %s file",
    { timeout: 30_000 }, async (kind) => {
      createRenderedBook("damaged-package")
      const routes = new Hono().onError(errorHandler).route("/api", createPackageRoutes(tmpDir, path.resolve("assets/adt")))
      const url = "/api/books/damaged-package/package-adt"
      expect((await routes.request(url, { method: "POST" })).status).toBe(200)
      const adt = path.join(tmpDir, "damaged-package", "adt")
      const html = fs.readFileSync(path.join(adt, "pg001_sec001.html"), "utf8")
      const runtime = html.match(/assets\/(base\.bundle\.(?:min|local)\.js)/)![1]
      const relative = kind === "runtime" || kind === "directory" ? `assets/${runtime}`
        : kind === "image" ? html.match(/src="(images\/[^"]+)"/)![1]
        : kind === "entry" ? "index.html" : kind === "stylesheet" ? "content/tailwind_output.css" : "content/pages.json"
      const file = path.join(adt, relative)
      const originalBytes = fs.readFileSync(file)
      expect(fs.statSync(file).isFile()).toBe(true)
      fs.unlinkSync(file)
      if (kind === "directory") fs.mkdirSync(file)
      const status = await routes.request(`${url}/status`)
      expect(await status.json()).toMatchObject({ complete: false })
      await expect(exportAdt("damaged-package", tmpDir)).rejects.toThrow("PACKAGE_FILES_INCOMPLETE")
      // A directory in a required file's place may be refused safely. Missing
      // regular files must be rebuilt, and a later cache hit retains the repair.
      const repaired = await routes.request(url, { method: "POST" })
      if (kind === "directory" && repaired.status !== 200) return
      expect(repaired.status, await repaired.clone().text()).toBe(200)
      expect(fs.statSync(file).isFile()).toBe(true)
      expect(fs.readFileSync(file)).toEqual(originalBytes)
      expect(await (await routes.request(`${url}/status`)).json()).toMatchObject({ complete: true })
      const before = fs.statSync(file).mtimeMs
      expect((await routes.request(url, { method: "POST" })).status).toBe(200)
      expect(fs.statSync(file).mtimeMs).toBe(before)
    },
  )

  it.each([
    '<input type="image" src="images/missing-input.png" alt="Submit">',
    '<svg><use href="images/missing-sprite.svg#icon"/></svg>',
    '<svg><use xlink:href="images/missing-sprite.svg#icon"/></svg>',
    '<link rel="stylesheet" href="missing-custom.css">',
    '<link rel="StyleSheet" href="missing-custom.css">',
    '<link rel="STYLESHEET" href="missing-custom.css">',
    '<link rel="alternate STYLESHEET" title="Alternate" href="missing-custom.css">',
    '<img srcset="images/pg001_page.png 1x,images/missing.png 2x">',
    '<img src="/images/pg001_page.png">',
    '<style>.hero { background-image: image-set("images/missing.png" 1x) }</style>',
    '<style>:root { --hero: "images/missing.png" } .hero { background-image: image-set(var(--hero) 1x) }</style>',
    '<style>.hero { background-image: image-set(var(--missing, "images/missing.png") 1x) }</style>',
  ])("validates staged dependencies before replacing a downloadable publication: %s", async missing => {
    const label = "staged-validation"
    createRenderedBook(label)
    createWebAssets()
    const run = () => app.request(`/api/books/${label}/package-adt`, { method: "POST" })
    expect((await run()).status).toBe(200)
    const readZip = async () => unzipSync(new Uint8Array(await new Response((await exportAdt(label, tmpDir)).stream).arrayBuffer()))
    const original = await readZip()
    const s = createBookStorage(label, tmpDir)
    const saved = s.getLatestNodeData("web-rendering", "pg001")!.data as { sections: Array<{ html: string }> }
    const broken = structuredClone(saved)
    broken.sections[0].html += missing
    s.putNodeData("web-rendering", "pg001", broken)
    s.close()
    const result = await run()
    expect(result.status).toBe(409)
    expect(await result.json()).toMatchObject({ code: "PACKAGE_FILES_INCOMPLETE" })
    expect(await readZip()).toEqual(original)
    const repair = createBookStorage(label, tmpDir)
    repair.putNodeData("web-rendering", "pg001", saved)
    repair.close()
    expect((await run()).status).toBe(200)
  })

  it("never writes an unsafe imported section into another book or the prior publication", async () => {
    const label = "contained-package"
    createRenderedBook(label)
    createWebAssets()
    const run = () => app.request(`/api/books/${label}/package-adt`, { method: "POST" })
    expect((await run()).status).toBe(200)
    const previous = fs.readFileSync(path.join(tmpDir, label, "adt/pg001_sec001.html"))
    const neighbor = path.join(tmpDir, "neighbor")
    fs.mkdirSync(neighbor)
    const canary = path.join(neighbor, "private.html")
    fs.writeFileSync(canary, "PRIVATE NEIGHBOR")
    const s = createBookStorage(label, tmpDir)
    const source = s.getLatestNodeData("page-sectioning", "pg001")!.data as { sections: Array<{ sectionId: string }> }
    const rendering = s.getLatestNodeData("web-rendering", "pg001")!.data as { sections: Array<{ sectionId: string; html: string }> }
    source.sections[0].sectionId = "../../../../neighbor/private"
    rendering.sections[0].sectionId = source.sections[0].sectionId
    rendering.sections[0].html = "<main>Foreign content</main>"
    s.putNodeData("page-sectioning", "pg001", source)
    s.putNodeData("web-rendering", "pg001", rendering)
    s.close()
    expect((await run()).status).toBe(409)
    expect(fs.readFileSync(canary, "utf8")).toBe("PRIVATE NEIGHBOR")
    expect(fs.readFileSync(path.join(tmpDir, label, "adt/pg001_sec001.html"))).toEqual(previous)
  })

  it("rejects a missing configured catalog on download, repairs it on rebuild, and checks the SCORM manifest only for SCORM", { timeout: 30_000 }, async () => {
    const label = "languages"
    createRenderedBook(label)
    createWebAssets()
    fs.writeFileSync(path.join(tmpDir, label, "config.yaml"), "output_languages: [en, fr]\n")
    const url = `/api/books/${label}/package-adt`
    const run = () => app.request(url, { method: "POST" })
    expect((await run()).status).toBe(200)
    const adt = path.join(tmpDir, label, "adt"), file = "content/i18n/fr/texts.json"
    const original = fs.readFileSync(path.join(adt, file))
    fs.unlinkSync(path.join(adt, file))
    expect(await (await app.request(url + "/status")).json()).toMatchObject({ complete: false })
    await expect(exportAdt(label, tmpDir)).rejects.toMatchObject({ code: "PACKAGE_FILES_INCOMPLETE" })
    expect((await run()).status).toBe(200)
    const downloads = new Hono().onError(errorHandler).route("/", createBookRoutes(tmpDir))
    const download = await downloads.request(`/books/${label}/export-adt`)
    expect(download.status).toBe(200)
    expect(download.headers.get("Content-Disposition")).toContain("-adt.zip")
    const zip = unzipSync(new Uint8Array(await download.arrayBuffer()))
    expect(Buffer.from(zip[file])).toEqual(original)
    fs.unlinkSync(path.join(adt, "imsmanifest.xml"))
    await expect(exportScorm(label, tmpDir)).rejects.toMatchObject({ code: "PACKAGE_FILES_INCOMPLETE" })
    expect(await (await app.request(url + "/status")).json()).toMatchObject({ complete: true })
  })

  it("opens a legitimate older reflowable package despite an unreadable unselected rendering", async () => {
    const label = "older-reflow"; createRenderedBook(label); createWebAssets()
    const dir = path.join(tmpDir, label), id = "pg001_sec001"
    const s = createBookStorage(label, tmpDir)
    s.putNodeData("web-rendering", "pg001", s.getLatestNodeData("web-rendering", "pg001")!.data); s.close()
    expect((await app.request(`/api/books/${label}/package-adt`, { method: "POST" })).status).toBe(200)
    fs.unlinkSync(path.join(dir, "adt/.build-owners"))
    const db = openBookDb(path.join(dir, label + ".db"))
    db.run("UPDATE node_data SET data='{' WHERE node='web-rendering' AND item_id='pg001' AND version=1"); db.close()
    const routes = new Hono().onError(errorHandler).route("/api", createBookRoutes(tmpDir))
    const html = await routes.request(`/api/books/${label}/adt/v-old/${id}.html`)
    expect(html.status).toBe(200); expect(await html.text()).toContain("Original text")
    const result = await exportAdt(label, tmpDir)
    expect(Buffer.from(unzipSync(new Uint8Array(await new Response(result.stream).arrayBuffer()))[id + ".html"]).toString()).toContain("Original text")
    const check = openBookDb(path.join(dir, label + ".db"))
    expect(check.get("SELECT data FROM node_data WHERE node='web-rendering' AND item_id='pg001' AND version=1")).toEqual({ data: "{" })
    check.close()
  })

  it("does not reread every packaged page for reader assets and rechecks prune, restore and repackage", async () => {
    const label = "reader-cost"; createRenderedBook(label); createWebAssets()
    const url = `/api/books/${label}`, id = "pg001_sec001", file = id + ".html"
    const run = () => app.request(url + "/package-adt", { method: "POST" })
    expect((await run()).status).toBe(200)
    const routes = new Hono().onError(errorHandler).route("/api", createBookRoutes(tmpDir))
    const get = (name: string) => routes.request(url + "/adt/v-book/" + name)
    const diskPage = fs.realpathSync(path.join(tmpDir, label, "adt", file))
    const reads = vi.spyOn(fs, "readFileSync")
    try {
      const count = () => reads.mock.calls.filter(([arg]) => arg === diskPage).length
      for (const asset of ["assets/config.json", "content/pages.json", "assets/fonts.css", "assets/offline-preloader.js", "content/i18n/en/texts.json"]) {
        const response = await get(asset)
        expect(response.status, asset).toBe(200)
      }
      // The cold proof reads the page once. No page-content reads for later assets.
      expect(count()).toBe(1)
      const s = createBookStorage(label, tmpDir)
      const original = s.getLatestNodeData("page-sectioning", "pg001")!.data as { sections: { isPruned: boolean }[] }
      s.putNodeData("page-sectioning", "pg001", { ...original, sections: original.sections.map(section => ({ ...section, isPruned: true })) }); s.close()
      expect((await get(file)).status).toBe(404)
      const restore = createBookStorage(label, tmpDir); restore.putNodeData("page-sectioning", "pg001", original); restore.close()
      expect((await get(file)).status).toBe(200)
      // An in-place file edit changes neither its directory entry nor SQL.
      fs.writeFileSync(diskPage, "Other owner's bytes")
      for (const url of [file, file + "/"]) {
        const changed = await get(url); expect(changed.status).toBe(307); expect(await changed.text()).not.toContain("Other owner's bytes")
        expect(changed.headers.get("Location")).toContain("/adt-preview/" + file)
      }
      expect((await run()).status).toBe(200)
      expect(await (await get(file)).text()).toContain("Original text")
      fs.writeFileSync(path.join(tmpDir, label, "adt/assets/offline-preloader.js"), "Retired content is embedded here")
      const oldScript = await get("assets/offline-preloader.js")
      expect(oldScript.status).toBe(307); expect(await oldScript.text()).not.toContain("Retired content")
      await expect(exportAdt(label, tmpDir)).rejects.toMatchObject({ code: "PACKAGE_FILES_INCOMPLETE" })
    } finally { reads.mockRestore() }
  })

  it.each(["file", "directory"])("refuses a required %s symlink skipped by ZIP, then repairs the actual member", { timeout: 30_000 }, async kind => {
    const label = "symbolic"; createRenderedBook(label); createWebAssets()
    const url = `/api/books/${label}/package-adt`
    const run = () => app.request(url, { method: "POST" })
    expect((await run()).status).toBe(200)
    const adt = path.join(tmpDir, label, "adt"), member = "content/i18n/en/texts.json"
    const from = path.join(adt, kind === "file" ? member : "content/i18n/en"), to = from + ".saved"
    fs.renameSync(from, to)
    try { fs.symlinkSync(to, from, kind === "file" ? "file" : "junction") }
    catch (error) { if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") return; throw error }
    expect(await (await app.request(url + "/status")).json()).toMatchObject({ complete: false })
    await expect(exportAdt(label, tmpDir)).rejects.toMatchObject({ code: "PACKAGE_FILES_INCOMPLETE" })
    expect((await run()).status).toBe(200)
    const result = await exportAdt(label, tmpDir)
    expect(unzipSync(new Uint8Array(await new Response(result.stream).arrayBuffer()))[member]).toBeDefined()
  })

  it.each(["previous", "published"])("reopens a complete package on first read after writer death at %s rename", { timeout: 30_000 }, async boundary => {
    const label = "swap-crash"; createRenderedBook(label); createWebAssets()
    const url = `/api/books/${label}/package-adt`, dir = path.join(tmpDir, label)
    expect((await app.request(url, { method: "POST" })).status).toBe(200)
    const old = fs.readFileSync(path.join(dir, "adt/pg001_sec001.html"))
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import fs from "node:fs"; import path from "node:path";
      import {createBookStorage} from ${JSON.stringify(pathToFileURL(path.resolve("packages/storage/dist/index.js")).href)};
      import {packageAdtWeb} from ${JSON.stringify(pathToFileURL(path.resolve("packages/pipeline/dist/index.js")).href)};
      const [bookDir, assets, edge] = process.argv.slice(1), label = path.basename(bookDir);
      const db = createBookStorage(label, path.dirname(bookDir));
      const rename = fs.renameSync; fs.renameSync = (a,b) => {
        rename(a,b);
        if (b === path.join(bookDir, edge === "previous" ? ".adt-package-work/previous" : "adt")) process.exit(86);
      };
      await packageAdtWeb(db, { bookDir, label, webAssetsDir: assets, language:"en", outputLanguages:["en"], title:"Replacement" });
    `, dir, webAssetsDir, boundary], { encoding: "utf8", timeout: 20000 })
    expect(child.status, child.stderr).toBe(86)
    expect(fs.existsSync(path.join(dir, "adt"))).toBe(boundary === "published")
    const status = await app.request(url + "/status")
    expect(status.status, await status.clone().text()).toBe(200)
    expect(await status.json()).toMatchObject({ hasAdt: true, complete: true })
    const result = await exportAdt(label, tmpDir)
    const html = Buffer.from(unzipSync(new Uint8Array(await new Response(result.stream).arrayBuffer()))["pg001_sec001.html"])
    if (boundary === "previous") expect(html).toEqual(old)
    else expect(html.toString()).toContain("Replacement")
  })

  it("invalid part windows reject both cache paths without changing the previous package", { timeout: 30_000 }, async () => {
    const label = "invalid-part"; createRenderedBook(label); createWebAssets()
    const dir = path.join(tmpDir, label), url = `/api/books/${label}/package-adt`
    const run = () => app.request(url, { method: "POST" })
    expect((await run()).status).toBe(200)
    const adt = path.join(dir, "adt")
    const snapshot = () => Object.fromEntries(fs.readdirSync(adt, { recursive: true, encoding: "utf8" }).filter(f => fs.statSync(path.join(adt, f)).isFile()).map(f => [f, fs.readFileSync(path.join(adt, f))]))
    fs.writeFileSync(path.join(dir, "part.json"), "{")
    for (const cache of ["hit", "miss"]) {
      if (cache === "miss") fs.unlinkSync(path.join(adt, ".build-hash"))
      const before = snapshot()
      for (const res of [await app.request(url + "/status"), await run()]) {
        expect(res.status).toBe(409)
        expect(await res.json()).toMatchObject({ code: "SECTIONING_WINDOW_INVALID" })
      }
      expect(snapshot()).toEqual(before)
    }
    fs.unlinkSync(path.join(dir, "part.json"))
    expect((await run()).status).toBe(200)
    expect(await (await app.request(url + "/status")).json()).toMatchObject({ complete: true })
  })

  it("keeps the exact published bundle visible throughout a build and rejects a late window change", { timeout: 30_000 }, async () => {
    const label = "window-race"; createRenderedBook(label); createWebAssets()
    const dir = path.join(tmpDir, label), url = `/api/books/${label}/package-adt`
    expect((await app.request(url, { method: "POST" })).status).toBe(200)
    const adt = path.join(dir, "adt"), sentinel = path.join(adt, "last-complete.marker")
    fs.writeFileSync(sentinel, "last good artifact")
    const bytes = () => Object.fromEntries(fs.readdirSync(adt, { recursive: true, encoding: "utf8" }).filter(f => fs.statSync(path.join(adt, f)).isFile()).map(f => [f, fs.readFileSync(path.join(adt, f))]))
    const before = bytes(); let changed = false
    const storage = createBookStorage(label, tmpDir)
    try {
      await expect(packageAdtWeb(storage, { label, bookDir: dir, language: "en", outputLanguages: ["en"], title: label, webAssetsDir, config: loadBookConfig(label, tmpDir) }, {
        emit(event) {
          if (!changed && event.type === "step-progress" && event.message === "Writing manifests...") {
            expect(bytes()).toEqual(before)
            fs.writeFileSync(path.join(dir, "part.json"), "invalid")
            changed = true
          }
        },
      })).rejects.toMatchObject({ code: "SECTIONING_WINDOW_INVALID" })
    } finally { storage.close() }
    expect(changed).toBe(true)
    expect(bytes()).toEqual(before)
    fs.unlinkSync(path.join(dir, "part.json"))
    expect((await app.request(url, { method: "POST" })).status).toBe(200)
  })

  function easyReadOutput(text: string) {
    return {
      blocks: [
        {
          pageId: "pg001",
          pageNumber: 1,
          sectionId: "pg001_sec001",
          sectionIndex: 0,
          sectionType: "content",
          entries: [
            {
              sourceId: "pg001_n0001",
              easyReadId: "pg001_n0001_easy_read",
              originalText: "Original text",
              text,
              pageId: "pg001",
              sectionId: "pg001_sec001",
              sectionIndex: 0,
            },
          ],
        },
      ],
      generatedAt: "2026-05-20T00:00:00.000Z",
    }
  }

  function overwriteEasyReadVersion(label: string, text: string): void {
    const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
    try {
      db.run(
        "UPDATE node_data SET data = ? WHERE node = ? AND item_id = ? AND version = ?",
        [JSON.stringify(easyReadOutput(text)), "easy-read", "book", 1],
      )
    } finally {
      db.close()
    }
  }

  describe("POST /api/books/:label/package-adt", () => {
    it("retains usable cached output after a preference change", async () => {
      createRenderedBook("stale-mode")
      createWebAssets()
      const first = await app.request("/api/books/stale-mode/package-adt", { method: "POST" })
      expect(first.status).toBe(200)
      const dir = path.join(tmpDir, "stale-mode")
      const hash = fs.readFileSync(path.join(dir, "adt", ".build-hash"), "utf8")
      writeSectioningLifecycle(dir, "dynamic", false)
      const response = await app.request("/api/books/stale-mode/package-adt", { method: "POST" })
      expect(response.status).toBe(200)
      expect(fs.readFileSync(path.join(dir, "adt", ".build-hash"), "utf8")).toBe(hash)
    })
    it("returns 404 for missing book", async () => {
      const res = await app.request("/api/books/missing/package-adt", {
        method: "POST",
      })
      expect(res.status).toBe(404)
    })

    it("returns 409 when no pages have web rendering", async () => {
      createTestBook("book1")

      const res = await app.request("/api/books/book1/package-adt", {
        method: "POST",
      })

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error).toContain("web rendering")
    })

    it("returns no warnings when rendering and sectioning agree", { timeout: 20_000 }, async () => {
      createRenderedBook("book-clean")
      createWebAssets()

      const res = await app.request("/api/books/book-clean/package-adt", { method: "POST" })

      expect(res.status).toBe(200)
      const body = await res.json() as { warnings?: unknown[] }
      expect(body.warnings).toEqual([])
    })

    it("reports sections omitted from the bundle, and still reports them on a cache hit", { timeout: 30_000 }, async () => {
      createRenderedBook("book-orphan")
      createWebAssets()

      // Give the page a second rendering entry with no sectioning row behind
      // it — the state restoring an older `page-sectioning` version leaves,
      // since that does not resync `web-rendering`. Packaging cannot invent a
      // sectionId for it (ids are never reused, so a positional guess could
      // name a real section) so it drops the section.
      const storage = createBookStorage("book-orphan", tmpDir)
      storage.putNodeData("web-rendering", "pg001", {
        sections: [
          { sectionId: "pg001_sec001", sectionIndex: 0, sectionType: "content", reasoning: "ok", html: "<main><p>Kept</p></main>" },
          { sectionIndex: 1, sectionType: "content", reasoning: "ok", html: "<main><p>Orphan</p></main>" },
        ],
      })
      storage.close()

      const res = await app.request("/api/books/book-orphan/package-adt", { method: "POST" })
      expect(res.status).toBe(200)
      const body = await res.json() as {
        warnings?: Array<{ kind: string; pageId: string; sectionIndex: number }>
      }
      expect(body.warnings).toEqual([
        { kind: "orphaned-rendering", pageId: "pg001", sectionIndex: 1 },
      ])

      // Packaging again hits the build cache and skips the work. The bundle on
      // disk is still short, so the warning has to come back with it — reading
      // it off the cached sidecar rather than vanishing.
      const cached = await app.request("/api/books/book-orphan/package-adt", { method: "POST" })
      expect(cached.status).toBe(200)
      const cachedBody = await cached.json() as {
        warnings?: Array<{ kind: string; pageId: string; sectionIndex: number }>
      }
      expect(cachedBody.warnings).toEqual(body.warnings)

      // A build cached before the sidecar existed — the state every book is in
      // on upgrade. The hash still matches, so without treating a missing
      // sidecar as a stale cache this returns a clean result over the same
      // short bundle.
      fs.rmSync(path.join(tmpDir, "book-orphan", "adt", ".build-warnings"))
      const upgraded = await app.request("/api/books/book-orphan/package-adt", { method: "POST" })
      expect(upgraded.status).toBe(200)
      const upgradedBody = await upgraded.json() as {
        warnings?: Array<{ kind: string; pageId: string; sectionIndex: number }>
      }
      expect(upgradedBody.warnings).toEqual(body.warnings)
    })

    it("stores accessibility assessment output after packaging", { timeout: 20_000 }, async () => {
      createRenderedBook("book-a11y")
      createWebAssets()

      const res = await app.request("/api/books/book-a11y/package-adt", {
        method: "POST",
      })

      expect(res.status).toBe(200)

      const storage = createBookStorage("book-a11y", tmpDir)
      const row = storage.getLatestNodeData("accessibility-assessment", "book")
      storage.close()

      expect(row?.version).toBe(1)
      const parsed = AccessibilityAssessmentOutput.safeParse(row?.data)
      expect(parsed.success).toBe(true)
      expect(parsed.success && parsed.data.summary.pageCount).toBe(1)
    })

    it("repackages when Easy Read content changes even if the stored version is unchanged", { timeout: 20_000 }, async () => {
      createRenderedBook("book-easy-cache")
      fs.writeFileSync(path.join(tmpDir, "book-easy-cache", "config.yaml"), "easy_read:\n  enabled: true\n")
      createWebAssets()

      const storage = createBookStorage("book-easy-cache", tmpDir)
      storage.putNodeData("easy-read", "book", easyReadOutput("First easy text"))
      storage.close()

      const firstRes = await app.request("/api/books/book-easy-cache/package-adt", {
        method: "POST",
      })
      expect(firstRes.status).toBe(200)
      const firstBody = await firstRes.json() as { version?: string }
      expect(firstBody.version).toMatch(/^[a-f0-9]{16}$/)

      const textsPath = path.join(tmpDir, "book-easy-cache", "adt", "content", "i18n", "en", "texts.json")
      const configPath = path.join(tmpDir, "book-easy-cache", "adt", "assets", "config.json")
      expect(JSON.parse(fs.readFileSync(textsPath, "utf-8")).pg001_n0001_easy_read).toBe("First easy text")
      expect(JSON.parse(fs.readFileSync(configPath, "utf-8")).bundleVersion).toBe(firstBody.version)

      overwriteEasyReadVersion("book-easy-cache", "Updated easy text")
      const updatedStorage = createBookStorage("book-easy-cache", tmpDir)
      const updatedEasyRead = updatedStorage.getLatestNodeData("easy-read", "book")?.data as ReturnType<typeof easyReadOutput>
      updatedStorage.close()
      expect(updatedEasyRead.blocks[0]?.entries[0]?.text).toBe("Updated easy text")

      const secondRes = await app.request("/api/books/book-easy-cache/package-adt", {
        method: "POST",
      })
      expect(secondRes.status).toBe(200)
      const secondBody = await secondRes.json() as { version?: string }
      expect(secondBody.version).toMatch(/^[a-f0-9]{16}$/)
      expect(JSON.parse(fs.readFileSync(textsPath, "utf-8")).pg001_n0001_easy_read).toBe("Updated easy text")
      expect(secondBody.version).not.toBe(firstBody.version)
      expect(JSON.parse(fs.readFileSync(configPath, "utf-8")).bundleVersion).toBe(secondBody.version)
    })

    it("repackages when a sign-language video assignment changes", { timeout: 20_000 }, async () => {
      const label = "book-sign-language-cache"
      createRenderedBook(label)
      createWebAssets()

      const storage = createBookStorage(label, tmpDir)
      storage.putSignLanguageVideo(
        "video-1",
        Buffer.from("video-content"),
        "video.mp4",
        "video/mp4",
      )
      storage.close()

      const packageBook = async () => {
        const response = await app.request(`/api/books/${label}/package-adt`, {
          method: "POST",
        })
        expect(response.status).toBe(200)
        return await response.json() as { version: string }
      }
      const videosPath = path.join(
        tmpDir,
        label,
        "adt",
        "content",
        "i18n",
        "en",
        "videos.json",
      )
      const configPath = path.join(tmpDir, label, "adt", "assets", "config.json")

      const unassignedPackage = await packageBook()
      expect(JSON.parse(fs.readFileSync(videosPath, "utf-8"))).toEqual({})
      expect(JSON.parse(fs.readFileSync(configPath, "utf-8")).features.signLanguage).toBe(false)

      const assignedStorage = createBookStorage(label, tmpDir)
      assignedStorage.assignSignLanguageVideo("video-1", "pg001_sec001")
      assignedStorage.close()

      const assignedPackage = await packageBook()
      expect(assignedPackage.version).not.toBe(unassignedPackage.version)
      expect(JSON.parse(fs.readFileSync(videosPath, "utf-8"))).toEqual({
        pg001_sec001: "sl_pg001_sec001.mp4",
      })
      expect(JSON.parse(fs.readFileSync(configPath, "utf-8")).features.signLanguage).toBe(true)

      const unassignedStorage = createBookStorage(label, tmpDir)
      unassignedStorage.assignSignLanguageVideo("video-1", null)
      unassignedStorage.close()

      const unassignedAgainPackage = await packageBook()
      expect(unassignedAgainPackage.version).not.toBe(assignedPackage.version)
      expect(JSON.parse(fs.readFileSync(videosPath, "utf-8"))).toEqual({})
      expect(JSON.parse(fs.readFileSync(configPath, "utf-8")).features.signLanguage).toBe(false)
    })

    it("reuses an active packaging task for duplicate preview requests", async () => {
      createRenderedBook("book-package-dedupe")
      createWebAssets()

      const activeTasks: TaskInfo[] = []
      let submitCount = 0
      const taskService: TaskService = {
        submitTask(label, kind, description) {
          submitCount += 1
          const taskId = `task-${submitCount}`
          activeTasks.push({
            taskId,
            kind,
            status: "running",
            description,
            url: `/books/${label}/preview`,
          })
          return { taskId }
        },
        getActiveTasks() {
          return activeTasks
        },
      }
      const taskApp = new Hono()
      taskApp.onError(errorHandler)
      taskApp.route("/api", createPackageRoutes(tmpDir, webAssetsDir, undefined, taskService))

      const firstRes = await taskApp.request("/api/books/book-package-dedupe/package-adt", {
        method: "POST",
      })
      const secondRes = await taskApp.request("/api/books/book-package-dedupe/package-adt", {
        method: "POST",
      })

      expect(firstRes.status).toBe(200)
      expect(secondRes.status).toBe(200)
      expect(await firstRes.json()).toMatchObject({ status: "submitted", taskId: "task-1" })
      expect(await secondRes.json()).toMatchObject({ status: "submitted", taskId: "task-1" })
      expect(submitCount).toBe(1)
    })
  })

  describe("GET /api/books/:label/package-adt/status", () => {
    it.each([
      { mode: "dynamic" as const, ready: false, pending: true },
      { mode: "dynamic" as const, ready: true, pending: true },
      { mode: "page" as const, ready: true, pending: false },
    ])("keeps usable packages accessible independently of lifecycle metadata: %j", async ({ mode, ready, pending }) => {
      createRenderedBook("retained")
      const dir = path.join(tmpDir, "retained")
      createWebAssets()
      expect((await app.request("/api/books/retained/package-adt", { method: "POST" })).status).toBe(200)
      const pagesPath = path.join(dir, "adt/content/pages.json")
      const pages = fs.readFileSync(pagesPath, "utf8")
      writeSectioningLifecycle(dir, mode, ready, pending)
      const response = await app.request("/api/books/retained/package-adt/status")
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ hasAdt: true, complete: true })
      expect(fs.readFileSync(pagesPath, "utf8")).toBe(pages)

      // Compatible warning-bearing output remains available under SPEC-0001.
      writeSectioningLifecycle(dir, "dynamic", true, false)
      fs.writeFileSync(path.join(dir, "adt", ".build-warnings"), JSON.stringify([{ kind: "orphaned-rendering", pageId: "pg001", sectionIndex: 2 }]))
      const usable = await app.request("/api/books/retained/package-adt/status")
      const usableStatus = await usable.json()
      expect(usableStatus).toMatchObject({ hasAdt: true })
      expect(usableStatus.complete).toBe(true)
    })

    it("returns hasAdt=false when pages.json is missing", async () => {
      createTestBook("book2")

      const res = await app.request("/api/books/book2/package-adt/status")
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ label: "book2", hasAdt: false, complete: false })
    })

    it("returns hasAdt=false when pages.json is invalid JSON", async () => {
      createTestBook("book3")
      const pagesPath = path.join(tmpDir, "book3", "adt", "content", "pages.json")
      fs.mkdirSync(path.dirname(pagesPath), { recursive: true })
      fs.writeFileSync(pagesPath, "{not-json")

      const res = await app.request("/api/books/book3/package-adt/status")
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ label: "book3", hasAdt: false, complete: false })
    })

    it("returns hasAdt=false when pages.json has no href entries", async () => {
      createTestBook("book4")
      const pagesPath = path.join(tmpDir, "book4", "adt", "content", "pages.json")
      fs.mkdirSync(path.dirname(pagesPath), { recursive: true })
      fs.writeFileSync(pagesPath, JSON.stringify([{ section_id: "pg001" }]))

      const res = await app.request("/api/books/book4/package-adt/status")
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ label: "book4", hasAdt: false, complete: false })
    })

    it("returns hasAdt=true with current usable rendering and a packaged href", async () => {
      createRenderedBook("book5")
      createWebAssets()
      expect((await app.request("/api/books/book5/package-adt", { method: "POST" })).status).toBe(200)
      const res = await app.request("/api/books/book5/package-adt/status")
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ label: "book5", hasAdt: true, complete: true })
    })
  })
})
