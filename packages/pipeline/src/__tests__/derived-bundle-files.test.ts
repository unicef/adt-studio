import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"
import { assertDerivedPackageFilesAvailable } from "../packaging/derived-bundle-files.js"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
function fixture(format: "epub" | "pnld" = "epub") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "declared-reader-xml-")); roots.push(root)
  const prefix = format === "epub" ? "OEBPS/" : ""
  const page = format === "epub" ? "page.xhtml" : "content/page.html"
  const files: Record<string, string> = {
    [prefix + page]: format === "epub"
      ? '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Page</title></head><body><p id="word">Saved text</p></body></html>'
      : '<!DOCTYPE html><html><head><meta charset=utf-8><title>Page</title></head><body><p id="word">Saved text</p></body></html>',
    [prefix + "toc.ncx"]: `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint id="page"><content src="${page}#word"/></navPoint></navMap></ncx>`,
    [prefix + "audio.wav"]: "original audio",
    [prefix + "overlay.smil"]: `<smil xmlns="http://www.w3.org/ns/SMIL"><body><seq><par><text src="${page}#word"/><audio src="audio.wav"/></par></seq></body></smil>`,
    [prefix + "content.opf"]: `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest>
      <item id="page" href="${page}" media-type="${format === "epub" ? "application/xhtml+xml" : "text/html"}"${format === "epub" ? ' media-overlay="overlay"' : ""}/>
      <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
      <item id="overlay" href="overlay.smil" media-type="application/smil+xml"/>
      <item id="audio" href="audio.wav" media-type="audio/wav"/>
    </manifest><spine toc="ncx"><itemref idref="page"/></spine></package>`,
  }
  if (format === "epub") Object.assign(files, {
    mimetype: "application/epub+zip",
    "META-INF/container.xml": '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  })
  for (const [name, contents] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), contents) }
  return { root, files, check: () => assertDerivedPackageFilesAvailable(root, format, ["page"]) }
}

it.each([
  ["page.xhtml", (s: string) => s.replace("</html>", "")],
  ["page.xhtml", (s: string) => s.replace("Saved text", "&unbound;")],
  ["page.xhtml", (s: string) => s.replace("http://www.w3.org/1999/xhtml", "urn:wrong")],
  ["toc.ncx", (s: string) => s.replace("</ncx>", "")],
  ["overlay.smil", (s: string) => s.replace("</smil>", "")],
  ["overlay.smil", (s: string) => s.replace("http://www.w3.org/ns/SMIL", "urn:wrong")],
  ["content.opf", (s: string) => s.replace('media-overlay="overlay"', 'media-overlay="missing"')],
  ["content.opf", (s: string) => s.replace('media-overlay="overlay"', 'media-overlay="audio"')],
  ["overlay.smil", (s: string) => s.replace('src="audio.wav"', 'src="missing.wav"')],
  ["overlay.smil", (s: string) => s.replace('src="page.xhtml#word"', 'src="missing.xhtml#word"')],
  ["overlay.smil", (s: string) => s.replace("#word", "#missing")],
  ["overlay.smil", (s: string) => s.replace('src="audio.wav"', 'src="/private/audio.wav"')],
] as const)("refuses invalid declared XML or overlay relationships in %s (%#), preserving all bytes", (name, damage) => {
  const { root, files, check } = fixture()
  expect(check).not.toThrow()
  const file = "OEBPS/" + name, damaged = damage(files[file])
  fs.writeFileSync(path.join(root, file), damaged)
  expect(check).toThrow("PACKAGE_FILES_INCOMPLETE")
  expect(fs.readFileSync(path.join(root, file), "utf8")).toBe(damaged)
  fs.writeFileSync(path.join(root, file), files[file])
  expect(check).not.toThrow()
})

it("accepts PNLD HTML5 while rejecting its malformed declared NCX", () => {
  const { root, files, check } = fixture("pnld")
  expect(check).not.toThrow()
  fs.writeFileSync(path.join(root, "toc.ncx"), files["toc.ncx"].replace("</ncx>", ""))
  expect(check).toThrow("PACKAGE_FILES_INCOMPLETE")
  fs.writeFileSync(path.join(root, "toc.ncx"), files["toc.ncx"])
  expect(check).not.toThrow()
})

it("accepts BOMs, XML declarations and equivalent prefixed document roots", () => {
  const { root, files, check } = fixture()
  for (const [file, contents] of Object.entries(files)) {
    if (!/\.(xhtml|ncx|smil|opf|xml)$/.test(file)) continue
    const renamed = contents.replace(/<(\/?)([\w-]+)(?=[\s/>])/g, '<$1r:$2').replace('xmlns="', 'xmlns:r="')
    fs.writeFileSync(path.join(root, file), '\ufeff<?xml version="1.0" encoding="utf-8"?>' + renamed)
  }
  expect(check).not.toThrow()
})
