import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { strToU8, unzipSync, zipSync } from "fflate"
import { loadBookConfig, packageAdtWeb, readerSettingsFromConfig } from "@adt/pipeline"
import { createBookStorage } from "@adt/storage"

import { readAdtBundle } from "../bundle-reader.js"
import { previewAdtRecoveryImport } from "../preview.js"
import {
  makeBundleWithFillInTheBlankAnswers,
  makeCurrentBundleWithExternallyAddedPage,
  makeFixedLayoutBundle,
  renameInArchive,
  seedFromArchive,
  temporaryRoots,
} from "./fixtures.js"

// The PR #803 review asked for these two round trips end to end: import an
// exported ADT, export it again with the real packager, and check what comes
// out. The seed tests only check what is stored.

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

function createWebAssets(dir: string): void {
  fs.mkdirSync(path.join(dir, "libs", "fontawesome", "css"), { recursive: true })
  fs.writeFileSync(path.join(dir, "base.bundle.min.js"), "window.__ADT_TEST__ = true;\n")
  fs.writeFileSync(path.join(dir, "base.bundle.local.js"), "window.__ADT_TEST__ = true;\n")
  fs.writeFileSync(path.join(dir, "base.bundle.min.js.map"), '{"version":3,"sources":[],"mappings":""}')
  fs.writeFileSync(path.join(dir, "fonts.css"), "body { font-family: serif; }")
  fs.writeFileSync(path.join(dir, "libs", "fontawesome", "css", "all.min.css"), "")
  fs.writeFileSync(path.join(dir, "tailwind_css.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n")
  // Fixed-layout pages load the runtime's auto-fit script from assets/.
  fs.writeFileSync(path.join(dir, "auto-fit.js"), "window.__ADT_AUTO_FIT__ = true;\n")
}

function zipDirectory(dir: string): Buffer {
  const files: Record<string, Uint8Array> = {}
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) walk(absolute)
      else files[path.relative(dir, absolute).split(path.sep).join("/")] = fs.readFileSync(absolute)
    }
  }
  walk(dir)
  return Buffer.from(zipSync(files))
}

/** Import `archive`, export the new project again, and return the new archive. */
async function importThenExport(archive: Buffer): Promise<Buffer> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-reexport-"))
  temporaryRoots.push(root)
  const booksDir = path.join(root, "books")
  const webAssetsDir = path.join(root, "web-assets")
  fs.mkdirSync(booksDir)
  createWebAssets(webAssetsDir)

  const source = readAdtBundle(archive)
  const session = seedFromArchive(archive, booksDir)
  const bookDir = path.join(booksDir, session.label)
  const storage = createBookStorage(session.label, booksDir)
  try {
    await packageAdtWeb(storage, {
      bookDir,
      label: session.label,
      language: source.manifest.languages.source,
      outputLanguages: source.manifest.languages.output,
      title: source.title,
      webAssetsDir,
      // As the export service does: the book config's reader settings.
      ...readerSettingsFromConfig(loadBookConfig(session.label, booksDir)),
    })
  } finally {
    storage.close()
  }
  return zipDirectory(path.join(bookDir, "adt"))
}

describe("import, then export again", () => {
  // #1198: the reader's defaults and locks survive the round trip.
  it("keeps the reader's default and locked settings", async () => {
    const files = unzipSync(makeCurrentBundleWithExternallyAddedPage())
    const config = JSON.parse(new TextDecoder().decode(files["assets/config.json"]))
    files["assets/config.json"] = strToU8(JSON.stringify({
      ...config,
      defaultSettings: { dockLayout: { width: "full", position: "bottom", align: "spread" }, theme: "dark", iconSize: "md", reduceMotion: false },
      lockedSettings: ["dockLayout", "theme", "iconSize", "reduceMotion"],
    }))
    const exported = unzipSync(await importThenExport(Buffer.from(zipSync(files))))
    const exportedConfig = JSON.parse(new TextDecoder().decode(exported["assets/config.json"]))
    expect(exportedConfig.defaultSettings).toEqual({
      dockLayout: { width: "full", position: "bottom", align: "spread" },
      theme: "dark",
      iconSize: "md",
      reduceMotion: false,
    })
    expect(exportedConfig.lockedSettings).toEqual(["dockLayout", "theme", "iconSize", "reduceMotion"])
  })

  it("keeps a quiz's exported id instead of renumbering it by position (review #4)", async () => {
    // The reviewer's case: the book's only remaining quiz is qz002.
    const archive = renameInArchive(makeFixedLayoutBundle(), "qz001", "qz002")
    const exported = await importThenExport(archive)
    const bundle = readAdtBundle(exported)
    const source = bundle.manifest.languages.source

    const quizPages = bundle.pages.map((page) => page.section_id).filter((id) => id.startsWith("qz"))
    expect(quizPages).toEqual(["qz002"])
    const quizTextIds = Object.keys(bundle.texts[source]).filter((id) => id.startsWith("qz"))
    expect(quizTextIds).toContain("qz002_que")
    expect(quizTextIds.some((id) => id.startsWith("qz001"))).toBe(false)
    expect(bundle.texts[source].qz002_que).toBe("Which rock is molten?")
  })

  it("carries a standard activity's answer key into the exported page (review #6)", async () => {
    const exported = await importThenExport(makeBundleWithFillInTheBlankAnswers())
    const bundle = readAdtBundle(exported)
    const page = bundle.pageHtml["pg002_sec001.html"]

    expect(page).toContain("window.correctAnswers = JSON.parse(")
    const key = page.match(/window\.correctAnswers = JSON\.parse\('([^']*)'\)/)?.[1]
    expect(JSON.parse(key!.replace(/\\(.)/g, "$1"))).toEqual({ "item-1": "4", "item-2": 7 })

    // And the exported archive can be imported again.
    expect(previewAdtRecoveryImport(exported).compatibility).toEqual({ supported: true, issues: [] })
  })
})
