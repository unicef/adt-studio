import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import { baseSourceHash, listGlobalLatest, saveBookSource } from "@adt/pipeline"
import { errorHandler } from "../middleware/error-handler.js"
import { createPackageRoutes } from "./package.js"

const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../adt-runtime")
const DOCK = "features/dock/components/DockIconButton.tsx"
const FAKE_BUNDLE = "window.__ADT_BUNDLE_TEST__ = true;"
const label = "reader-package"

describe("packaging a customized reader", () => {
  let root: string
  let booksDir: string
  let webAssetsDir: string
  let app: Hono

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-reader-package-"))
    booksDir = path.join(root, "books")
    webAssetsDir = path.join(root, "web-assets")
    fs.mkdirSync(booksDir)
    fs.mkdirSync(webAssetsDir, { recursive: true })
    for (const bundle of ["base.bundle.min.js", "base.bundle.local.js"]) fs.writeFileSync(path.join(webAssetsDir, bundle), FAKE_BUNDLE)
    fs.writeFileSync(path.join(webAssetsDir, "tailwind_css.css"), '@import "tailwindcss";\n')
    fs.mkdirSync(path.join(webAssetsDir, "libs/fontawesome/css"), { recursive: true })
    fs.writeFileSync(path.join(webAssetsDir, "libs/fontawesome/css/all.min.css"), ".icon { display: inline; }")
    fs.writeFileSync(path.join(webAssetsDir, "base.js"), "window.__ADT_BUNDLE_TEST__ = 1;\n")
    fs.writeFileSync(path.join(webAssetsDir, "fonts.css"), "body { font-family: serif; }")
    fs.symlinkSync(runtimeDir, path.join(root, "adt-runtime"), "junction")

    const storage = createBookStorage(label, booksDir)
    storage.putExtractedPage({
      pageId: "pg001",
      pageNumber: 1,
      text: "Page one",
      pageImage: { imageId: "pg001_page", pageId: "pg001", buffer: Buffer.from("fake-png-800x1200"), format: "png", width: 800, height: 1200, hash: "page-hash" },
      images: [],
    })
    storage.putNodeData("page-sectioning", "pg001", {
      reasoning: "ok",
      sections: [{ sectionId: "pg001_sec001", sectionType: "content", backgroundColor: "#ffffff", textColor: "#000000", pageNumber: 1, isPruned: false, nodes: [] }],
    })
    storage.putNodeData("web-rendering", "pg001", {
      sections: [{ sectionId: "pg001_sec001", sectionIndex: 0, sectionType: "content", reasoning: "ok", html: '<main><p data-id="pg001_n0001">Original text</p><img data-id="pg001_page" src="cover.png"></main>' }],
    })
    storage.close()

    app = new Hono().onError(errorHandler).route("/api", createPackageRoutes(booksDir, webAssetsDir))
  })

  afterEach(() => {
    fs.unlinkSync(path.join(root, "adt-runtime"))
    fs.rmSync(root, { recursive: true, force: true })
  })

  const adt = (...parts: string[]) => path.join(booksDir, label, "adt", ...parts)
  const pack = () => app.request(`/api/books/${label}/package-adt`, { method: "POST" })

  function save(sourcePath: string, content: string) {
    const storage = createBookStorage(label, booksDir)
    try {
      const baseVersion = storage.getLatestNodeData("reader-source", sourcePath)?.version ?? null
      saveBookSource(storage, {
        path: sourcePath,
        content,
        baseVersion,
        baseHash: baseSourceHash(runtimeDir, sourcePath),
        globalFiles: listGlobalLatest(path.join(booksDir, ".reader-source")),
      })
    } finally {
      storage.close()
    }
  }

  it("AC-9: a book without overrides ships the prebuilt bundles unchanged", async () => {
    const response = await pack()
    expect(response.status, await response.clone().text()).toBe(200)
    expect(fs.readFileSync(adt("assets", "base.bundle.min.js"), "utf8")).toBe(FAKE_BUNDLE)
    expect(JSON.parse(fs.readFileSync(adt("assets", "config.json"), "utf8")).readerSource).toBeUndefined()
  }, 60_000)

  it("AC-11 / AC-12 / AC-13: compiles overrides, styles their classes, records them and fails on broken source", async () => {
    const dock = fs.readFileSync(path.join(runtimeDir, "src", DOCK), "utf8")
    save(DOCK, `${dock}\nconsole.info("bg-[#123456]")\n`)
    save("styles/globals.css", '@import "tailwindcss";\n.reader-marker { color: red; }\n')

    const first = await pack()
    expect(first.status, await first.clone().text()).toBe(200)
    const bundle = fs.readFileSync(adt("assets", "base.bundle.min.js"), "utf8")
    expect(bundle).not.toBe(FAKE_BUNDLE)
    expect(bundle).toContain("bg-[#123456]")
    const css = fs.readFileSync(adt("content", "tailwind_output.css"), "utf8")
    expect(css).toContain("123456")
    expect(css).toContain(".reader-marker")
    expect(JSON.parse(fs.readFileSync(adt("assets", "config.json"), "utf8")).readerSource).toEqual([
      { path: DOCK, layer: "book", version: 1 },
      { path: "styles/globals.css", layer: "book", version: 1 },
    ])
    const firstVersion = (await first.json()).version

    save(DOCK, `${dock}\nexport const broken = (\n`)
    const failed = await pack()
    expect(failed.status).not.toBe(200)
    expect(await failed.text()).toContain("does not compile")
    expect(fs.readFileSync(adt("assets", "base.bundle.min.js"), "utf8")).toContain("bg-[#123456]")

    save(DOCK, `${dock}\nconsole.info("bg-[#654321]")\n`)
    const rebuilt = await pack()
    expect(rebuilt.status, await rebuilt.clone().text()).toBe(200)
    expect((await rebuilt.json()).version).not.toBe(firstVersion)
  }, 120_000)
})
