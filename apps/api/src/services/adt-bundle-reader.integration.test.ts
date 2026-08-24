import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { createBookStorage, openBookDb } from "@adt/storage"
import { packageAdtWeb } from "@adt/pipeline"
import { AdtBundleImportPreview } from "@adt/types"
import { extractAdtBundleArchiveFiles, readAdtBundle } from "./adt-bundle-reader.js"
import { assessAdtImportCompatibility } from "./adt-import-compatibility.js"
import { previewAdtRecoveryImport } from "./adt-import-preview.js"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-bundle-reader-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function createWebAssets(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "base.bundle.min.js"), "window.__ADT_TEST__ = true;\n")
  fs.writeFileSync(path.join(dir, "base.bundle.local.js"), "window.__ADT_TEST__ = true;\n")
  fs.writeFileSync(path.join(dir, "base.bundle.min.js.map"), '{"version":3,"sources":[],"mappings":""}')
  fs.writeFileSync(path.join(dir, "fonts.css"), "body { font-family: serif; }")
  fs.mkdirSync(path.join(dir, "libs", "fontawesome", "css"), { recursive: true })
  fs.writeFileSync(path.join(dir, "libs", "fontawesome", "css", "all.min.css"), "")
  fs.writeFileSync(
    path.join(dir, "tailwind_css.css"),
    "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
  )
}

function zipDirectory(dir: string): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) walk(absolute)
      else files[path.relative(dir, absolute).split(path.sep).join("/")] = fs.readFileSync(absolute)
    }
  }
  walk(dir)
  return zipSync(files)
}

describe("readAdtBundle with a real packageAdtWeb archive", () => {
  it("round-trips the emitted manifest and supported projections", async () => {
    const label = "reader-integration"
    const bookDir = path.join(tmpDir, label)
    const webAssetsDir = path.join(tmpDir, "web-assets")
    createWebAssets(webAssetsDir)
    fs.mkdirSync(bookDir, { recursive: true })

    const db = openBookDb(path.join(bookDir, `${label}.db`))
    db.run(
      "INSERT INTO pages (page_id, page_number, text) VALUES (?, ?, ?)",
      ["pg001", 1, "Hello"],
    )
    db.close()

    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putNodeData("web-rendering", "pg001", {
        sections: [
          {
            sectionIndex: 0,
            sectionType: "content",
            reasoning: "ok",
            html: '<section data-section-id="pg001_sec001" data-section-type="content"><p data-id="pg001_t001">Hello</p></section>',
          },
        ],
      })
      storage.putNodeData("page-sectioning", "pg001", {
        reasoning: "ok",
        sections: [
          {
            sectionId: "pg001_sec001",
            sectionType: "content",
            nodes: [],
            backgroundColor: "#fff",
            textColor: "#000",
            pageNumber: 1,
            isPruned: false,
          },
        ],
      })
      storage.putNodeData("glossary", "book", {
        items: [
          {
            id: "gl001",
            word: "Earth",
            definition: "Our planet",
            variations: [],
            emojis: ["🌍"],
          },
        ],
        pageCount: 1,
        generatedAt: "2026-01-01T00:00:00.000Z",
      })
      storage.putNodeData("toc-generation", "book", {
        entries: [
          {
            id: "toc-1",
            title: "Opening",
            sectionId: "pg001_sec001",
            href: "index.html",
            chapterId: "pg001_t001",
            level: 1,
          },
        ],
        pageCount: 1,
        generatedAt: "2026-01-01T00:00:00.000Z",
      })
      storage.putNodeData("text-catalog-translation", "es", {
        entries: [
          { id: "pg001_t001", text: "Hola" },
          { id: "gl001", text: "Tierra" },
          { id: "gl001_def", text: "Nuestro planeta" },
        ],
        generatedAt: "2026-01-01T00:00:00.000Z",
      })

      await packageAdtWeb(storage, {
        bookDir,
        label,
        language: "en",
        outputLanguages: ["es"],
        title: "Reader integration",
        webAssetsDir,
      })
    } finally {
      storage.close()
    }

    const archive = Buffer.from(zipDirectory(path.join(bookDir, "adt")))
    const bundle = readAdtBundle(archive)
    expect(bundle.manifest.book.label).toBe(label)
    expect(bundle.manifest.languages).toEqual({ source: "en", output: ["es"] })
    expect(bundle.toc[0].title).toBe("Opening")
    expect(bundle.glossaries.en.Earth.id).toBe("gl001")
    expect(bundle.texts.es.pg001_t001).toBe("Hola")
    expect(bundle.texts.en.pg001_t001).toBe("Hello")
    expect(bundle.ignoredEdits).toEqual({
      sourceTextsChanged: false,
      pageHtmlChanged: [],
      pageHtmlMissing: [],
    })
    expect(assessAdtImportCompatibility(bundle, extractAdtBundleArchiveFiles(archive))).toEqual({
      supported: true,
      issues: [],
    })
    const preview = previewAdtRecoveryImport(archive)
    expect(preview).toMatchObject({
      contentChanged: false,
      exportComparisonStatus: "unchanged",
    })
    // The response shape is the shared `@adt/types` contract the Studio client
    // derives from. Parsing a real preview here is what stops the two sides
    // drifting: an added or renamed field fails this instead of only breaking
    // at runtime in the browser.
    expect(() => AdtBundleImportPreview.parse(preview)).not.toThrow()

    const editedFiles = unzipSync(archive)
    editedFiles["index.html"] = strToU8(
      strFromU8(editedFiles["index.html"]).replace("Hello", "Edited externally"),
    )
    const editedTexts = JSON.parse(
      strFromU8(editedFiles["content/i18n/en/texts.json"]),
    ) as Record<string, string>
    editedTexts.pg001_t001 = "Edited externally"
    editedFiles["content/i18n/en/texts.json"] = strToU8(JSON.stringify(editedTexts))
    expect(previewAdtRecoveryImport(Buffer.from(zipSync(editedFiles)))).toMatchObject({
      contentChanged: true,
      exportComparisonStatus: "changed",
    })

    const unverifiableFiles = unzipSync(archive)
    const unverifiableManifest = JSON.parse(
      strFromU8(unverifiableFiles["manifest.json"]),
    ) as Record<string, unknown>
    delete unverifiableManifest.frozen
    unverifiableFiles["manifest.json"] = strToU8(JSON.stringify(unverifiableManifest))
    expect(previewAdtRecoveryImport(Buffer.from(zipSync(unverifiableFiles)))).toMatchObject({
      contentChanged: false,
      exportComparisonStatus: "unavailable",
    })
  })
})
