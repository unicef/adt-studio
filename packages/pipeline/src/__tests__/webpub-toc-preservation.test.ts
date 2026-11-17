import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { packageWebpub } from "../packaging/webpub.js"

it("does not overwrite a reader-owned contents filename when adding the unlinked-heading projection", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-webpub-collision-"))
  const storage = createBookStorage("collision", root)
  try {
    const bookDir = path.join(root, "collision")
    const adt = path.join(bookDir, "adt")
    fs.mkdirSync(path.join(adt, "content"), { recursive: true })
    fs.writeFileSync(path.join(adt, "content", "pages.json"), JSON.stringify([
      { section_id: "contents", href: "contents.html", page_number: 1 },
      { section_id: "contents-2", href: "contents-2.html", page_number: 2 },
    ]))
    fs.writeFileSync(path.join(adt, "content", "toc.json"), JSON.stringify([
      { section_id: "", href: "", title: "Authored group", chapter_id: "", level: 1 },
      { section_id: "contents", href: "contents.html", title: "First content", chapter_id: "", level: 2 },
      { section_id: "contents-2", href: "contents-2.html", title: "Second content", chapter_id: "", level: 2 },
    ]))
    fs.writeFileSync(path.join(adt, "contents.html"), "<!doctype html><html><head></head><body>PROTECTED ORIGINAL ONE</body></html>")
    fs.writeFileSync(path.join(adt, "contents-2.html"), "<!doctype html><html><head></head><body>PROTECTED ORIGINAL TWO</body></html>")
    packageWebpub(storage, { bookDir, label: "collision", title: "Collision", language: "en", outputLanguages: ["en"], webAssetsDir: adt })
    expect(fs.readFileSync(path.join(bookDir, "webpub", "contents.html"), "utf8")).toContain("PROTECTED ORIGINAL ONE")
    expect(fs.readFileSync(path.join(bookDir, "webpub", "contents-2.html"), "utf8")).toContain("PROTECTED ORIGINAL TWO")
    const manifest = JSON.parse(fs.readFileSync(path.join(bookDir, "webpub", "manifest.json"), "utf8"))
    expect(manifest.resources).toContainEqual({ href: "contents-3.html", type: "text/html", rel: "contents" })
    expect(fs.readFileSync(path.join(bookDir, "webpub", "contents-3.html"), "utf8")).toContain("Authored group")
    expect(fs.readFileSync(path.join(adt, "contents.html"), "utf8")).toContain("PROTECTED ORIGINAL ONE")
    packageWebpub(storage, { bookDir, label: "collision", title: "Collision", language: "en", outputLanguages: ["en"], webAssetsDir: adt })
    const repeated = JSON.parse(fs.readFileSync(path.join(bookDir, "webpub", "manifest.json"), "utf8"))
    expect(repeated.resources).toContainEqual({ href: "contents-3.html", type: "text/html", rel: "contents" })
    expect(fs.readFileSync(path.join(bookDir, "webpub", "contents.html"), "utf8")).toContain("PROTECTED ORIGINAL ONE")
    expect(manifest.readingOrder.map((entry: { href: string }) => entry.href)).toEqual(["contents.html", "contents-2.html"])
  } finally {
    storage.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
