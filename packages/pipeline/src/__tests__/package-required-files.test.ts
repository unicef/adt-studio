import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { packageFilesAvailable } from "../packaging/bundle-files.js"
const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
it("validates shared runtime files once per read and notices their deletion on the next read", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "package-required-files-")); roots.push(root)
  for (const folder of ["content/navigation", "assets"]) fs.mkdirSync(path.join(root, folder), { recursive: true })
  const pages = ["p1", "p2", "p3"].map(section_id => ({ section_id, href: `${section_id}.html` }))
  fs.writeFileSync(path.join(root, "index.html"), "<a href='p1.html'>Open</a>")
  fs.writeFileSync(path.join(root, "content/pages.json"), JSON.stringify(pages))
  fs.writeFileSync(path.join(root, "content/toc.json"), "[]")
  fs.writeFileSync(path.join(root, "content/navigation/nav.html"), "<nav></nav>")
  fs.writeFileSync(path.join(root, "assets/config.json"), "{}")
  const runtime = path.join(root, "assets/base.js")
  fs.writeFileSync(runtime, "window.readerLoaded = true")
  for (const page of pages) fs.writeFileSync(path.join(root, page.href), '<main>Saved page</main><script src="./assets/base.js?v=1"></script>')
  const reads = vi.spyOn(fs, "readFileSync")
  expect(packageFilesAvailable(root)).toBe(true)
  expect(reads.mock.calls.filter(([file]) => file === runtime)).toHaveLength(1)
  fs.unlinkSync(runtime)
  expect(packageFilesAvailable(root)).toBe(false)
})
