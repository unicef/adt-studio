import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { packageFilesAvailable } from "../packaging/bundle-files.js"
const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
it("validates shared runtime files once per read and notices their deletion on the next read", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "package-required-files-")); roots.push(root)
  for (const folder of ["content/navigation", "assets", "content/i18n/en"]) fs.mkdirSync(path.join(root, folder), { recursive: true })
  const pages = ["p1", "p2", "p3"].map(section_id => ({ section_id, href: `${section_id}.html` }))
  fs.writeFileSync(path.join(root, "index.html"), "<a href='p1.html'>Open</a>")
  fs.writeFileSync(path.join(root, "content/pages.json"), JSON.stringify(pages))
  fs.writeFileSync(path.join(root, "content/toc.json"), "[]")
  fs.writeFileSync(path.join(root, "content/navigation/nav.html"), "<nav></nav>")
  fs.writeFileSync(path.join(root, "assets/config.json"), JSON.stringify({ languages: { available: ["en"], default: "en" } }))
  for (const dict of ["texts", "speech_texts", "videos", "images", "audios"]) fs.writeFileSync(path.join(root, "content/i18n/en", dict + ".json"), "{}")
  const runtime = path.join(root, "assets/base.js")
  fs.writeFileSync(runtime, "window.readerLoaded = true")
  for (const page of pages) fs.writeFileSync(path.join(root, page.href), '<main>Saved page</main><script src="./assets/base.js?v=1"></script>')
  const reads = vi.spyOn(fs, "readFileSync")
  expect(packageFilesAvailable(root)).toBe(true)
  const firstReads = reads.mock.calls.length
  expect(firstReads).toBeGreaterThan(0)
  expect(packageFilesAvailable(root)).toBe(true)
  expect(reads).toHaveBeenCalledTimes(firstReads)
  fs.unlinkSync(runtime)
  expect(packageFilesAvailable(root)).toBe(false)
  fs.writeFileSync(runtime, "window.readerLoaded = true")
  const page = path.join(root, "p1.html")
  fs.writeFileSync(page, '<main><img src="assets/picture.png"></main>')
  expect(packageFilesAvailable(root)).toBe(false)
  const picture = path.join(root, "assets/picture.png")
  fs.writeFileSync(picture, "original image bytes")
  expect(packageFilesAvailable(root)).toBe(true)
  const afterRepair = reads.mock.calls.length
  for (let i = 0; i < 3; i++) expect(packageFilesAvailable(root)).toBe(true)
  expect(reads).toHaveBeenCalledTimes(afterRepair)
  fs.unlinkSync(picture)
  expect(packageFilesAvailable(root)).toBe(false)
  fs.writeFileSync(picture, "original image bytes")
  expect(packageFilesAvailable(root)).toBe(true)
  for (const srcset of [
    "assets/picture.png 1x,assets/second.png 2x",
    "assets/picture.png 1x, assets/second.png 2x",
    "data:image/svg+xml,%3Csvg%3E,%3C/svg%3E 1x,assets/second.png 2x",
  ]) {
    fs.writeFileSync(page, `<img srcset="${srcset}">`)
    expect(packageFilesAvailable(root), srcset).toBe(false)
    fs.writeFileSync(path.join(root, "assets/second.png"), "second image")
    expect(packageFilesAvailable(root), srcset).toBe(true)
    fs.unlinkSync(path.join(root, "assets/second.png"))
    expect(packageFilesAvailable(root), srcset).toBe(false)
  }
  fs.writeFileSync(page, '<img src="/assets/picture.png">')
  expect(packageFilesAvailable(root)).toBe(false)
  fs.writeFileSync(page, '<img src="assets/picture.png">')
  expect(packageFilesAvailable(root)).toBe(true)
  fs.appendFileSync(page, '<link rel="stylesheet" href="assets/styles.css">')
  fs.writeFileSync(path.join(root, "assets/styles.css"), '@import url(nested.css);')
  fs.writeFileSync(path.join(root, "assets/nested.css"), '@font-face { src: url(font.woff2); }')
  expect(packageFilesAvailable(root)).toBe(false)
  fs.writeFileSync(path.join(root, "assets/font.woff2"), "local font bytes")
  expect(packageFilesAvailable(root)).toBe(true)
  fs.unlinkSync(path.join(root, "assets/font.woff2"))
  expect(packageFilesAvailable(root)).toBe(false)
  fs.writeFileSync(path.join(root, "assets/font.woff2"), "local font bytes")
  fs.writeFileSync(path.join(root, "content/i18n/en/audios.json"), '{"text":"missing.mp3"}')
  expect(packageFilesAvailable(root)).toBe(false)
  fs.mkdirSync(path.join(root, "content/i18n/en/audio"))
  fs.writeFileSync(path.join(root, "content/i18n/en/audio/missing.mp3"), "retained audio bytes")
  expect(packageFilesAvailable(root)).toBe(true)
})
