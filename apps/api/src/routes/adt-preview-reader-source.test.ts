import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import { errorHandler } from "../middleware/error-handler.js"
import { createAdtPreviewRoutes } from "./adt-preview.js"
import { createReaderSourceRoutes } from "./reader-source.js"

const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../adt-runtime")
const DOCK = "features/dock/components/DockIconButton.tsx"
const FAKE_BUNDLE = "window.__ADT_PREBUILT__ = true;"
const label = "reader-preview"

describe("previewing reader source drafts", () => {
  let root: string
  let app: Hono

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-reader-preview-"))
    const booksDir = path.join(root, "books")
    const webAssetsDir = path.join(root, "web-assets")
    fs.mkdirSync(booksDir)
    fs.mkdirSync(webAssetsDir)
    for (const bundle of ["base.bundle.min.js", "base.bundle.local.js"]) fs.writeFileSync(path.join(webAssetsDir, bundle), FAKE_BUNDLE)
    fs.writeFileSync(path.join(webAssetsDir, "tailwind_css.css"), '@import "tailwindcss";\n')
    fs.symlinkSync(runtimeDir, path.join(root, "adt-runtime"), "junction")
    createBookStorage(label, booksDir).close()
    app = new Hono()
      .onError(errorHandler)
      .route("/", createReaderSourceRoutes(booksDir, webAssetsDir))
      .route("/", createAdtPreviewRoutes(booksDir, webAssetsDir))
  })

  afterEach(() => {
    fs.unlinkSync(path.join(root, "adt-runtime"))
    fs.rmSync(root, { recursive: true, force: true })
  })

  const compile = (drafts: Record<string, string>) =>
    app.request(`/books/${label}/reader-source/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drafts }),
    })
  const bundle = async () => (await app.request(`/books/${label}/adt-preview/assets/base.bundle.min.js`)).text()
  const css = async () => (await app.request(`/books/${label}/adt-preview/content/tailwind_output.css`)).text()

  it("AC-26: the preview serves the draft build and its CSS, and falls back without drafts", async () => {
    expect(await bundle()).toBe(FAKE_BUNDLE)

    const dock = fs.readFileSync(path.join(runtimeDir, "src", DOCK), "utf8")
    const result = await (await compile({
      [DOCK]: `${dock}\nconsole.info("preview-draft-marker")\n`,
      "styles/globals.css": '@import "tailwindcss";\n.preview-draft-rule { color: red; }\n',
    })).json()
    expect(result.ok).toBe(true)

    const draftBundle = await bundle()
    expect(draftBundle).toContain("preview-draft-marker")
    expect(await css()).toContain(".preview-draft-rule")

    expect((await (await compile({})).json()).ok).toBe(true)
    expect(await bundle()).toBe(FAKE_BUNDLE)
    expect(await css()).not.toContain(".preview-draft-rule")
  }, 120_000)
})
