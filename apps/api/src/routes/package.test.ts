import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import type { ExtractedPage } from "@adt/pdf"
import { createBookStorage, openBookDb, withBookWriter, writeSectioningLifecycle } from "@adt/storage"
import { AccessibilityAssessmentOutput, type TaskInfo } from "@adt/types"
import { errorHandler } from "../middleware/error-handler.js"
import { exportAdt, exportScorm, exportWebpub, exportEpub, exportPnld } from "../services/export-service.js"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { unzipSync } from "fflate"
import { packageAdtWeb, packageWebpub, packageFilesAvailable, loadBookConfig, processFixedLayoutPages } from "@adt/pipeline"
import { createBookRoutes } from "./books.js"
import { listBooks, getBook } from "../services/book-service.js"
import type { TaskService } from "../services/task-service.js"
import { createPackageRoutes } from "./package.js"
import { createAdtPreviewRoutes } from "./adt-preview.js"

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

  it("prepares and downloads 120 documents with bounded dependency reads and invalidation", { timeout: 90_000 }, async () => {
    const label = "large-bundle"
    createRenderedBook(label); createWebAssets()
    const storage = createBookStorage(label, tmpDir)
    try {
      const source = storage.getLatestNodeData("page-sectioning", "pg001")!.data
      const rendering = storage.getLatestNodeData("web-rendering", "pg001")!.data
      storage.transaction(() => {
        for (let n = 2; n <= 120; n++) {
          const id = `pg${String(n).padStart(3, "0")}`
          storage.putExtractedPage({ pageId: id, pageNumber: n, text: "Retained", images: [], pageImage: { imageId: `${id}_page`, buffer: Buffer.from("image"), format: "png", width: 800, height: 1200, hash: `image-${n}` } })
          for (const [node, data] of [["page-sectioning", source], ["web-rendering", rendering]] as const) storage.putNodeData(node, id, JSON.parse(JSON.stringify(data).replaceAll("pg001", id)))
        }
      })
    } finally { storage.close() }
    const prepared = await app.request(`/api/books/${label}/package-adt`, { method: "POST" })
    expect(prepared.status, await prepared.clone().text()).toBe(200)
    const adt = path.join(tmpDir, label, "adt")
    const zip = unzipSync(new Uint8Array(await new Response((await exportAdt(label, tmpDir)).stream).arrayBuffer()))
    expect(Object.keys(zip).filter(name => /^pg\d+_sec001\.html$/.test(name))).toHaveLength(120)
    const proofRoot = path.join(tmpDir, "uncached-proof")
    fs.cpSync(adt, proofRoot, { recursive: true })
    const reads = vi.spyOn(fs, "readFileSync")
    try {
      expect(packageFilesAvailable(proofRoot)).toBe(true)
      const htmlReads = reads.mock.calls.filter(([file]) => typeof file === "string" && file.endsWith(".html"))
      expect(htmlReads).toHaveLength(122) // each page, launch and generated navigation exactly once
      expect(new Set(htmlReads.map(([file]) => file)).size).toBe(122)
      reads.mockClear()
      expect(packageFilesAvailable(proofRoot)).toBe(true)
      expect(reads).not.toHaveBeenCalled()
      const last = path.join(proofRoot, "pg120_sec001.html"), original = fs.readFileSync(last)
      fs.appendFileSync(last, '<img src="images/missing-last-page.png">')
      expect(packageFilesAvailable(proofRoot)).toBe(false)
      fs.writeFileSync(last, original)
      expect(packageFilesAvailable(proofRoot)).toBe(true)
    } finally { reads.mockRestore() }
    // A missing dependency introduced on the last source page cannot replace
    // the previously published large reader or authorize a partial new ZIP.
    const before = fs.readFileSync(path.join(adt, "pg120_sec001.html"))
    const edited = createBookStorage(label, tmpDir)
    try {
      const row = edited.getLatestNodeData("web-rendering", "pg120")!.data as { sections: Array<{ html: string }> }
      row.sections[0].html += '<img src="images/not-present.png">'
      edited.putNodeData("web-rendering", "pg120", row)
    } finally { edited.close() }
    expect((await app.request(`/api/books/${label}/package-adt`, { method: "POST" })).status).toBe(409)
    expect(fs.readFileSync(path.join(adt, "pg120_sec001.html"))).toEqual(before)
  })

  it("keeps evicted freshly prepared independent packages unverified until rechecked", { timeout: 60_000 }, async () => {
    createWebAssets()
    const identities = new Set<string>()
    for (let n = 0; n < 10; n++) {
      const label = `fresh-${n}`
      createRenderedBook(label)
      expect((await app.request(`/api/books/${label}/package-adt`, { method: "POST" })).status).toBe(200)
      identities.add(JSON.parse(fs.readFileSync(path.join(tmpDir, label, "adt/.build-owners"), "utf8")).bookId)
      expect(getBook(label, tmpDir).previewStatus).toBe("complete")
    }
    expect(identities.size).toBe(10)
    const listed = listBooks(tmpDir).filter(book => book.label.startsWith("fresh-"))
    expect(listed).toHaveLength(10)
    expect(listed.every(book => ["complete", "unverified"].includes(book.previewStatus!))).toBe(true)
    expect(listed.some(book => book.previewStatus === "unverified")).toBe(true)
    expect(getBook("fresh-0", tmpDir).previewStatus).toBe("complete")
  })

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

  it("reports unavailable book identity as unverified history and preserves the prior package", async () => {
    const label = "missing-book-identity"
    createRenderedBook(label)
    createWebAssets()
    const url = `/api/books/${label}/package-adt`
    expect((await app.request(url, { method: "POST" })).status).toBe(200)
    const directory = path.join(tmpDir, label)
    const page = path.join(directory, "adt", "pg001_sec001.html")
    const before = fs.readFileSync(page)
    const db = openBookDb(path.join(directory, label + ".db"))
    try { db.run("DROP TABLE history_identity") } finally { db.close() }
    // The retained receipt no longer has verifiable origin, so a cache hit
    // cannot bypass the missing identity. No content is edited.
    const response = await app.request(url, { method: "POST" })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "HISTORY_RECOVERY_UNVERIFIED" })
    expect(fs.readFileSync(page)).toEqual(before)
  })

  it.each([false, true])("refuses missing secondary narration in warm and cold public reads, fixed=%s", async fixed => {
    const label = "secondary-voice"
    createRenderedBook(label); createWebAssets()
    if (fixed) {
      const storage = createBookStorage(label, tmpDir)
      try {
        storage.putNodeData("positioned-text", "pg001", { drawItems: [], pageWidth: 800, pageHeight: 1200, renderWidth: 800, renderHeight: 1200 })
        storage.putNodeData("image-filtering", "pg001", { images: [] })
        await processFixedLayoutPages(storage, `/api/books/${label}/images`)
      } finally { storage.close() }
    }
    const url = `/api/books/${label}/package-adt`
    expect((await app.request(url, { method: "POST" })).status).toBe(200)
    const adt = path.join(tmpDir, label, "adt"), locale = path.join(adt, "content/i18n/en")
    const primary = "primary.wav", secondary = "secondary.wav"
    fs.mkdirSync(path.join(locale, "audio"), { recursive: true })
    fs.writeFileSync(path.join(locale, "audio", primary), "primary audio")
    fs.writeFileSync(path.join(locale, "audio", secondary), "secondary audio")
    fs.writeFileSync(path.join(locale, "audios.json"), JSON.stringify({ narration: primary }))
    fs.writeFileSync(path.join(locale, "audio_voices.json"), JSON.stringify({ defaultVoice: "primary", voices: {
      primary: { label: "Primary", audios: { narration: primary } }, secondary: { label: "Secondary", audios: { narration: secondary } },
    } }))
    const readers = new Hono().onError(errorHandler).route("/", createBookRoutes(tmpDir))
    expect(await (await app.request(url + "/status")).json()).toMatchObject({ complete: true })
    expect(listBooks(tmpDir).find(book => book.label === label)?.previewStatus).toBe("complete")
    fs.unlinkSync(path.join(locale, "audio", secondary))
    expect(await (await app.request(url + "/status")).json()).toMatchObject({ complete: false })
    expect(listBooks(tmpDir).find(book => book.label === label)?.completedStages).not.toContain("preview")
    expect((await readers.request(`/books/${label}/export-adt`)).status).toBe(409)
    const cold = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { packageFilesAvailable } from ${JSON.stringify(pathToFileURL(path.resolve("packages/pipeline/dist/packaging/bundle-files.js")).href)};
      console.log(JSON.stringify({ available: packageFilesAvailable(process.argv[1]) }));
    `, adt], { encoding: "utf8", timeout: 10000 })
    expect(cold.status, cold.stderr).toBe(0)
    expect(JSON.parse(cold.stdout)).toEqual({ available: false })
    fs.writeFileSync(path.join(locale, "audio", secondary), "secondary audio")
    expect(await (await app.request(url + "/status")).json()).toMatchObject({ complete: true })
    const download = await readers.request(`/books/${label}/export-adt`)
    expect(download.status).toBe(200)
    const members = unzipSync(new Uint8Array(await download.arrayBuffer()))
    expect(Buffer.from(members[`content/i18n/en/audio/${secondary}`]).toString()).toBe("secondary audio")
    expect(Buffer.from(members[`content/i18n/en/audio/${primary}`]).toString()).toBe("primary audio")
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
    const failure = await result.json()
    expect(failure).toMatchObject({ code: "PACKAGE_FILES_INCOMPLETE" })
    if (!missing.includes('src="/')) {
      expect(failure.error).toContain('"document":"pg001_sec001.html"')
      expect(failure.error).toContain('"member":')
    }
    expect(failure.error).not.toContain(tmpDir)
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

  it.each([false, true])("validates complete SCORM XML without affecting web downloads, fixed=%s", async fixed => {
    const label = "scorm-xml"
    createRenderedBook(label); createWebAssets()
    if (fixed) {
      const storage = createBookStorage(label, tmpDir)
      try {
        storage.putNodeData("positioned-text", "pg001", { drawItems: [], pageWidth: 800, pageHeight: 1200, renderWidth: 800, renderHeight: 1200 })
        storage.putNodeData("image-filtering", "pg001", { images: [] })
        await processFixedLayoutPages(storage, `/api/books/${label}/images`)
      } finally { storage.close() }
    }
    expect((await app.request(`/api/books/${label}/package-adt`, { method: "POST" })).status).toBe(200)
    const adt = path.join(tmpDir, label, "adt"), manifest = path.join(adt, "imsmanifest.xml")
    const original = fs.readFileSync(manifest, "utf8")
    const readers = new Hono().onError(errorHandler).route("/", createBookRoutes(tmpDir))
    const download = () => readers.request(`/books/${label}/export-scorm`)
    const good = await download()
    expect(good.status).toBe(200)
    const archive = unzipSync(new Uint8Array(await good.arrayBuffer()))
    for (const damaged of [
      original.replace("</manifest>", ""),
      original.replace("</resource>", "</resources>"),
      original.replace('href="index.html"', "href=index.html"),
      original.replace('adlcp:scormtype', 'missing:scormtype'),
      original.replace("</metadata>", "<metadata>"),
    ]) {
      fs.writeFileSync(manifest, damaged)
      const refused = await download()
      expect(refused.status).toBe(409)
      expect(await refused.json()).toMatchObject({ code: "PACKAGE_FILES_INCOMPLETE" })
      expect(fs.readFileSync(manifest, "utf8")).toBe(damaged)
      const web = await readers.request(`/books/${label}/export-adt`)
      expect(web.status).toBe(200)
      await web.arrayBuffer()
    }
    fs.writeFileSync(manifest, "\uFEFF" + original.replaceAll("adlcp:", "sc:").replace("xmlns:adlcp", "xmlns:sc"))
    const prefixed = await download()
    expect(prefixed.status).toBe(200)
    await prefixed.arrayBuffer()
    fs.writeFileSync(manifest, original)
    const restored = await download()
    expect(restored.status).toBe(200)
    expect(unzipSync(new Uint8Array(await restored.arrayBuffer()))).toEqual(archive)
  })

  it("rejects another book's intact package while retaining same-book relocation", { timeout: 30_000 }, async () => {
    createWebAssets()
    for (const label of ["origin-a", "origin-b"]) {
      createRenderedBook(label)
      const storage = createBookStorage(label, tmpDir)
      const row = storage.getLatestNodeData("web-rendering", "pg001")!.data
      storage.putNodeData("web-rendering", "pg001", JSON.parse(JSON.stringify(row).replaceAll("Original text", label === "origin-a" ? "BOOK_A" : "BOOK_B_PRIVATE")))
      storage.close()
      expect((await app.request(`/api/books/${label}/package-adt`, { method: "POST" })).status).toBe(200)
    }
    const a = path.join(tmpDir, "origin-a"), b = path.join(tmpDir, "origin-b")
    fs.cpSync(a, path.join(tmpDir, "relocated"), { recursive: true })
    fs.renameSync(path.join(tmpDir, "relocated/origin-a.db"), path.join(tmpDir, "relocated/relocated.db"))
    const moved = unzipSync(new Uint8Array(await new Response((await exportAdt("relocated", tmpDir)).stream).arrayBuffer()))
    expect(Buffer.from(moved["pg001_sec001.html"]).toString()).toContain("BOOK_A")
    fs.rmSync(path.join(a, "adt"), { recursive: true })
    fs.cpSync(path.join(b, "adt"), path.join(a, "adt"), { recursive: true })
    const routes = new Hono().onError(errorHandler).route("/api", createBookRoutes(tmpDir))
    const response = await routes.request("/api/books/origin-a/adt/pg001_sec001.html")
    expect(response.status).toBe(307)
    expect(await response.text()).not.toContain("BOOK_B_PRIVATE")
    await expect(exportAdt("origin-a", tmpDir)).rejects.toMatchObject({ code: "PACKAGE_FILES_INCOMPLETE" })
    expect(await (await app.request("/api/books/origin-a/package-adt/status")).json()).toMatchObject({ complete: false })
    expect(fs.readFileSync(path.join(a, "adt/pg001_sec001.html"), "utf8")).toContain("BOOK_B_PRIVATE")
    expect((await app.request("/api/books/origin-a/package-adt", { method: "POST" })).status).toBe(200)
    const rebuilt = unzipSync(new Uint8Array(await new Response((await exportAdt("origin-a", tmpDir)).stream).arrayBuffer()))
    expect(Buffer.from(rebuilt["pg001_sec001.html"]).toString()).toContain("BOOK_A")
    expect(Buffer.from(rebuilt["pg001_sec001.html"]).toString()).not.toContain("BOOK_B_PRIVATE")
  })

  it("keeps older reflowable source readable and explicitly rebuilds its unbound package despite an unreadable unselected rendering", async () => {
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
    expect(html.status).toBe(307)
    expect(html.headers.get("Location")).toBe(`/api/books/${label}/adt-preview/${id}.html`)
    const live = new Hono().onError(errorHandler).route("/api", createAdtPreviewRoutes(tmpDir, webAssetsDir))
    const source = await live.request(`/api/books/${label}/adt-preview/${id}.html`)
    expect(source.status).toBe(200)
    expect(await source.text()).toContain("Original text")
    await expect(exportAdt(label, tmpDir)).rejects.toMatchObject({ code: "PACKAGE_FILES_INCOMPLETE" })
    expect(fs.readFileSync(path.join(dir, "adt", id + ".html"), "utf8")).toContain("Original text")
    expect((await app.request(`/api/books/${label}/package-adt`, { method: "POST" })).status).toBe(200)
    const result = await exportAdt(label, tmpDir)
    expect(Buffer.from(unzipSync(new Uint8Array(await new Response(result.stream).arrayBuffer()))[id + ".html"]).toString()).toContain("Original text")
    const check = openBookDb(path.join(dir, label + ".db"))
    expect(check.get("SELECT data FROM node_data WHERE node='web-rendering' AND item_id='pg001' AND version=1")).toEqual({ data: "{" })
    check.close()
  })

  it.each([8, 10, 40])("lists a cold %i-book library without verifying each package and reuses only current proven completeness", { timeout: 30_000 }, async count => {
    createRenderedBook("seed"); createWebAssets()
    expect((await app.request("/api/books/seed/package-adt", { method: "POST" })).status).toBe(200)
    for (let i = 0; i < count; i++) {
      const label = `copy-${i}`, dir = path.join(tmpDir, label)
      fs.cpSync(path.join(tmpDir, "seed"), dir, { recursive: true })
      fs.renameSync(path.join(dir, "seed.db"), path.join(dir, `${label}.db`))
    }
    const reads = vi.spyOn(fs, "readFileSync")
    const htmlReads = () => reads.mock.calls.filter(([file]) => typeof file === "string" && file.endsWith(".html")).length
    try {
      const cold = listBooks(tmpDir)
      expect(cold.filter(book => book.label.startsWith("copy-"))).toHaveLength(count)
      expect(htmlReads()).toBe(0)
      expect(cold.filter(book => book.label.startsWith("copy-")).every(book => book.previewStatus === "unverified")).toBe(true)
      const routes = new Hono().onError(errorHandler).route("/", createBookRoutes(tmpDir))
      let settled = false
      const listing = routes.request("/books").then(response => { settled = true; return response })
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(settled).toBe(false) // unrelated requests get a turn between books
      expect((await listing).status).toBe(200)
      expect(htmlReads()).toBe(0)
      expect(cold.find(book => book.label === "copy-0")?.completedStages).not.toContain("preview")
      // A single-book read performs the proof on demand and warms the Library.
      expect(getBook("copy-0", tmpDir).completedStages).toContain("preview")
      expect(htmlReads()).toBeGreaterThan(0)
      reads.mockClear()
      expect(listBooks(tmpDir).find(book => book.label === "copy-0")?.completedStages).toContain("preview")
      expect(htmlReads()).toBe(0)
      // Opening more books than either bounded proof cache can hold must not
      // classify evicted, valid books as known incomplete.
      for (let i = 0; i < count; i++) expect(getBook(`copy-${i}`, tmpDir).previewStatus).toBe("complete")
      reads.mockClear()
      const evicted = listBooks(tmpDir).filter(book => book.label.startsWith("copy-"))
      expect(evicted.every(book => book.previewStatus === "complete" || book.previewStatus === "unverified")).toBe(true)
      if (count > 8) expect(evicted.some(book => book.previewStatus === "unverified")).toBe(true)
      expect(htmlReads()).toBe(0)
      expect(getBook("copy-0", tmpDir).previewStatus).toBe("complete")
      reads.mockClear()
      fs.unlinkSync(path.join(tmpDir, "copy-0/adt/assets/config.json"))
      expect(listBooks(tmpDir).find(book => book.label === "copy-0")?.previewStatus).toBe("unverified")
      expect(htmlReads()).toBe(0)
      expect(getBook("copy-0", tmpDir).previewStatus).toBe("incomplete")
      reads.mockClear()
      fs.writeFileSync(path.join(tmpDir, "copy-0/adt/pg001_sec001.html"), "damaged")
      expect(listBooks(tmpDir).find(book => book.label === "copy-0")?.completedStages).not.toContain("preview")
      expect(htmlReads()).toBe(0)
    } finally { reads.mockRestore() }
  })

  it("revalidates asset bytes and current ownership before honoring conditional requests", async () => {
    const label = "conditional-assets"; createRenderedBook(label); createWebAssets()
    expect((await app.request(`/api/books/${label}/package-adt`, { method: "POST" })).status).toBe(200)
    const routes = new Hono().onError(errorHandler).route("/", createBookRoutes(tmpDir))
    const url = `/books/${label}/adt/v-deliberately-unchanged/assets/config.json`
    const first = await routes.request(url)
    expect(first.status).toBe(200)
    const etag = first.headers.get("ETag")
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/)
    expect(first.headers.get("Cache-Control")).toBe("private, no-cache")
    const canonicalAsset = fs.realpathSync(path.join(tmpDir, label, "adt/assets/config.json"))
    const conditional = () => routes.request(url, { headers: { "If-None-Match": etag! } })
    const reads = vi.spyOn(fs, "readFileSync")
    try {
      const repeated = await conditional()
      expect(repeated.status).toBe(304)
      expect(await repeated.text()).toBe("")
      expect(reads.mock.calls.filter(([file]) => file === canonicalAsset || file === path.join(tmpDir, label, "adt/assets/config.json"))).toHaveLength(0)
    } finally { reads.mockRestore() }
    const restarted = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
      import { createBookRoutes } from ${JSON.stringify(pathToFileURL(path.resolve("apps/api/dist/routes/books.js")).href)};
      const require=createRequire(${JSON.stringify(path.resolve("apps/api/package.json"))}); const { Hono }=require("hono");
      const [root,label,etag]=process.argv.slice(1), asset=fs.realpathSync(path.join(root,label,"adt/assets/config.json"));
      let reads=0; const read=fs.readFileSync; fs.readFileSync=function(file,...args){if(file===asset)reads++;return read.call(this,file,...args)};
      const response=await new Hono().route("/",createBookRoutes(root)).request('/books/'+label+'/adt/assets/config.json',{headers:{'If-None-Match':etag}});
      await response.arrayBuffer(); console.log(JSON.stringify({status:response.status,reads}));
    `, tmpDir, label, etag!], { encoding: "utf8", timeout: 20_000 })
    expect(restarted.status, restarted.stderr).toBe(0)
    expect(JSON.parse(restarted.stdout.trim())).toMatchObject({ status: 304, reads: expect.any(Number) })
    expect(JSON.parse(restarted.stdout.trim()).reads).toBeGreaterThan(0)
    fs.appendFileSync(path.join(tmpDir, label, "adt/assets/config.json"), " ")
    const changed = await conditional()
    expect(changed.status).toBe(200)
    expect(changed.headers.get("ETag")).not.toBe(etag)
    const asset = path.join(tmpDir, label, "adt/assets/config.json")
    const original = Buffer.from(await first.arrayBuffer())
    const priorStat = fs.statSync(asset)
    fs.writeFileSync(asset + ".new", Buffer.from("replacement"))
    fs.utimesSync(asset + ".new", priorStat.atime, priorStat.mtime)
    fs.renameSync(asset + ".new", asset)
    expect((await conditional()).status).toBe(200)
    fs.unlinkSync(asset)
    expect((await conditional()).status).toBe(404)
    const outside = path.join(tmpDir, "outside-asset.json")
    fs.writeFileSync(outside, original)
    fs.symlinkSync(outside, asset)
    expect((await conditional()).status).not.toBe(304)
    fs.unlinkSync(asset); fs.writeFileSync(asset, original)
    expect((await conditional()).status).toBe(304)
    const receiptFile = path.join(tmpDir, label, "adt/.build-owners")
    const receipt = fs.readFileSync(receiptFile)
    fs.writeFileSync(receiptFile, JSON.stringify({ ...JSON.parse(receipt.toString()), bookId: "foreign-book" }))
    expect((await conditional()).status).not.toBe(304)
    fs.writeFileSync(receiptFile, receipt)
    expect((await conditional()).status).toBe(304)
    const partFile = path.join(tmpDir, label, "part.json")
    fs.writeFileSync(partFile, JSON.stringify({ adtPart: 1, sourceLabel: label, title: null, range: { startPage: 2, endPage: 2 }, pageCount: 2, fingerprint: {}, identityHash: "id", semanticsHash: "sem", createdAt: "test", partLabelSuggestion: "part" }))
    expect((await conditional()).status).not.toBe(304)
    fs.unlinkSync(partFile)
    expect((await conditional()).status).toBe(304)
    for (const member of ["pg001_sec001.html", "assets/offline-preloader.js"]) {
      const sensitive = await routes.request(`/books/${label}/adt/v-old/${member}`, { headers: { "If-None-Match": etag! } })
      expect(sensitive.status).toBe(200)
      expect(sensitive.headers.get("Cache-Control")).toBe("no-store")
    }
    fs.symlinkSync(path.join(tmpDir, label, "adt/pg001_sec001.html"), path.join(tmpDir, label, "adt/page-alias.js"))
    const alias = await routes.request(`/books/${label}/adt/page-alias.js`, { headers: { "If-None-Match": etag! } })
    expect(alias.status).toBe(200)
    expect(alias.headers.get("Cache-Control")).toBe("no-store")
    expect(alias.headers.get("ETag")).toBeNull()
    const storage = createBookStorage(label, tmpDir)
    try { storage.putNodeData("web-rendering", "pg001", null) } finally { storage.close() }
    const retired = await conditional()
    expect(retired.status).not.toBe(304)
    expect(retired.headers.get("Cache-Control")).toBe("no-store")
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
      // The build records its ownership proof in the shared reader, so at most
      // one cold proof reads the page. No page-content reads for later assets.
      expect(count()).toBeLessThanOrEqual(1)
      const telemetry = createBookStorage(label, tmpDir)
      try {
        for (let i = 0; i < 12; i++) {
          telemetry.markStepStarted("web-rendering")
          telemetry.updateStepMessage("web-rendering", `${i}/12`)
          expect((await get("assets/config.json")).status).toBe(200)
        }
        expect(count()).toBeLessThanOrEqual(1)
        // A same-version raw rewrite followed by known progress must still
        // invalidate ownership; the node-version fingerprint alone cannot.
        const raw = openBookDb(path.join(tmpDir, label, label + ".db"))
        try {
          const before = raw.get("SELECT data FROM node_data WHERE node='page-sectioning' AND item_id='pg001' AND version=1") as { data: string }
          const changed = JSON.parse(before.data)
          changed.sections[0].isPruned = true
          raw.run("UPDATE node_data SET data=? WHERE node='page-sectioning' AND item_id='pg001' AND version=1", [JSON.stringify(changed)])
          telemetry.updateStepMessage("web-rendering", "After unexplained write")
          expect((await get(file)).status).toBe(404)
          raw.run("UPDATE node_data SET data=? WHERE node='page-sectioning' AND item_id='pg001' AND version=1", [before.data])
          expect((await get(file)).status).toBe(200)
        } finally { raw.close() }
      } finally { telemetry.close() }
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

  it.each(["staging", "previous", "published"])("recovers output and cleans only owned staging after SIGKILL at %s", { timeout: 30_000 }, async boundary => {
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
        if (edge !== "staging" && b === path.join(bookDir, edge === "previous" ? ".adt-package-work/previous" : "adt")) process.kill(process.pid, "SIGKILL");
      };
      await packageAdtWeb(db, { bookDir, label, webAssetsDir: assets, language:"en", outputLanguages:["en"], title:"Replacement",
        preparePublication: async () => { if (edge === "staging") process.kill(process.pid, "SIGKILL"); }
      });
    `, dir, webAssetsDir, boundary], { encoding: "utf8", timeout: 20000 })
    expect(child.signal, child.stderr).toBe("SIGKILL")
    expect(fs.existsSync(path.join(dir, "adt"))).toBe(boundary !== "previous")
    const status = await app.request(url + "/status")
    expect(status.status, await status.clone().text()).toBe(200)
    expect(await status.json()).toMatchObject({ hasAdt: true, complete: true })
    const result = await exportAdt(label, tmpDir)
    const html = Buffer.from(unzipSync(new Uint8Array(await new Response(result.stream).arrayBuffer()))["pg001_sec001.html"])
    if (boundary !== "published") expect(html).toEqual(old)
    else expect(html.toString()).toContain("Replacement")
    const work = path.join(dir, ".adt-package-work")
    const abandoned = fs.readdirSync(work).filter(name => name.startsWith("build-"))
    expect(abandoned).toHaveLength(1)
    const unknown = path.join(work, "build-manual")
    fs.mkdirSync(unknown); fs.writeFileSync(path.join(unknown, "notes"), "owner file")
    const alias = path.join(work, "build-alias")
    fs.symlinkSync(unknown, alias)
    const db = createBookStorage(label, tmpDir)
    try { await packageAdtWeb(db, { bookDir: dir, label, webAssetsDir, language: "en", outputLanguages: ["en"], title: "Next build" }) }
    finally { db.close() }
    expect(abandoned.filter(name => fs.existsSync(path.join(work, name)))).toEqual([])
    expect(fs.readFileSync(path.join(unknown, "notes"), "utf8")).toBe("owner file")
    expect(fs.lstatSync(alias).isSymbolicLink()).toBe(true)
  })

  it("enforces the mandatory part scope in retained packages and newly built reader content", { timeout: 30_000 }, async () => {
    const label = "part-membership"; createRenderedBook(label); createWebAssets()
    const dir = path.join(tmpDir, label), url = `/api/books/${label}/package-adt`
    const storage = createBookStorage(label, tmpDir)
    storage.putExtractedPage({ pageId: "pg002", pageNumber: 2, text: "OUTSIDE_PAGE_TWO", images: [], pageImage: { imageId: "pg002_page", buffer: Buffer.from("page two"), format: "png", hash: "two", width: 800, height: 1200 } })
    for (const node of ["page-sectioning", "web-rendering"]) storage.putNodeData(node, "pg002", JSON.parse(JSON.stringify(storage.getLatestNodeData(node, "pg001")!.data).replaceAll("pg001", "pg002").replaceAll("Original text", "OUTSIDE_PAGE_TWO")))
    storage.putNodeData("quiz-generation", "book", { generatedAt: "2026-11-11", language: "en", pagesPerQuiz: 1, quizzes: [1, 2].map(n => ({ quizId: `qz00${n}`, quizIndex: n - 1, afterPageId: `pg00${n}`, pageIds: [`pg00${n}`], question: n === 1 ? "Inside quiz" : "OUTSIDE_QUIZ", options: [{ text: "A", explanation: "A" }, { text: "B", explanation: "B" }], answerIndex: 0, reasoning: "fixture" })) })
    storage.close()
    const readers = new Hono().onError(errorHandler).route("/api", createBookRoutes(tmpDir)).route("/api", createAdtPreviewRoutes(tmpDir, webAssetsDir))
    expect((await app.request(url, { method: "POST" })).status).toBe(200)
    const derivedStorage = createBookStorage(label, tmpDir)
    try { packageWebpub(derivedStorage, { bookDir: dir, label, webAssetsDir, title: "Part", language: "en", outputLanguages: ["en"] }) } finally { derivedStorage.close() }
    fs.cpSync(path.join(dir, "webpub"), path.join(dir, "epub/OEBPS"), { recursive: true })
    fs.cpSync(path.join(dir, "webpub"), path.join(dir, "pnld"), { recursive: true })
    const prior = fs.readFileSync(path.join(dir, "adt/pg002_sec001.html"))
    // Prime the shared retained proof before changing only the part manifest.
    expect((await readers.request(`/api/books/${label}/adt/pg002_sec001.html`)).status).toBe(200)
    fs.writeFileSync(path.join(dir, "part.json"), JSON.stringify({ adtPart: 1, sourceLabel: label, title: null, range: { startPage: 1, endPage: 1 }, pageCount: 2, fingerprint: {}, identityHash: "fixture", semanticsHash: "fixture", createdAt: "2026-11-11", partLabelSuggestion: label }))
    for (const download of [exportAdt, exportScorm, exportWebpub, exportEpub, exportPnld]) await expect(download(label, tmpDir)).rejects.toMatchObject({ code: "PACKAGE_FILES_INCOMPLETE" })
    expect(fs.readFileSync(path.join(dir, "adt/pg002_sec001.html"))).toEqual(prior)
    expect(await (await app.request(url + "/status")).json()).toMatchObject({ complete: false })
    expect((await readers.request(`/api/books/${label}/adt/pg002_sec001.html`)).status).toBe(404)
    expect((await readers.request(`/api/books/${label}/adt-preview/pg002_sec001.html`)).status).toBe(404)
    expect(await (await readers.request(`/api/books/${label}/adt-preview/content/pages.json`)).json()).toEqual([expect.objectContaining({ section_id: "pg001_sec001" }), expect.objectContaining({ section_id: "qz001" })])
    expect((await app.request(url, { method: "POST" })).status).toBe(200)
    const zip = unzipSync(new Uint8Array(await new Response((await exportAdt(label, tmpDir)).stream).arrayBuffer()))
    expect(zip["pg001_sec001.html"]).toBeDefined()
    expect(zip["pg002_sec001.html"]).toBeUndefined()
    expect(zip["qz001.html"]).toBeDefined()
    expect(zip["qz002.html"]).toBeUndefined()
    const liveTexts = await (await readers.request(`/api/books/${label}/adt-preview/content/i18n/en/texts.json`)).text()
    expect(liveTexts).not.toContain("OUTSIDE_")
    for (const member of ["content/pages.json", "content/i18n/en/texts.json", "assets/offline-preloader.js"]) {
      expect(Buffer.from(zip[member]).toString()).not.toContain("pg002")
      expect(Buffer.from(zip[member]).toString()).not.toContain("qz002")
    }
    expect(await (await app.request(url + "/status")).json()).toMatchObject({ complete: true })
    const scopedStorage = createBookStorage(label, tmpDir)
    try { packageWebpub(scopedStorage, { bookDir: dir, label, webAssetsDir, title: "Part", language: "en", outputLanguages: ["en"] }) } finally { scopedStorage.close() }
    const webpub = unzipSync(new Uint8Array(await new Response((await exportWebpub(label, tmpDir)).stream).arrayBuffer()))
    expect(webpub["pg001_sec001.html"]).toBeDefined()
    expect(webpub["pg002_sec001.html"]).toBeUndefined()
    fs.writeFileSync(path.join(dir, "part.json"), "{")
    for (const route of ["adt/pg001_sec001.html", "adt/assets/offline-preloader.js", "adt-preview/content/pages.json"]) {
      const response = await readers.request(`/api/books/${label}/${route}`)
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: "SECTIONING_WINDOW_INVALID" })
    }
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
