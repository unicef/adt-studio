import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"
import { packageFilesAvailable, type MissingPackageAsset } from "../packaging/bundle-files.js"
import { htmlToXhtml } from "../html-semantics.js"
import { stripXmlInvalid } from "../html-escape.js"
import { inspectReaderXml } from "../packaging/reader-xml.js"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

/** A minimal bundle: one page whose shell (head) and content (body) are distinct. */
function bundle(body: string, head = '<link rel="stylesheet" href="assets/shell.css">'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "package-missing-assets-")); roots.push(root)
  for (const folder of ["content/navigation", "assets", "images", "content/i18n/en/audio"]) fs.mkdirSync(path.join(root, folder), { recursive: true })
  fs.writeFileSync(path.join(root, "index.html"), "<a href='p1.html'>Open</a>")
  fs.writeFileSync(path.join(root, "content/pages.json"), JSON.stringify([{ section_id: "p1", href: "p1.html" }]))
  fs.writeFileSync(path.join(root, "content/toc.json"), "[]")
  fs.writeFileSync(path.join(root, "content/navigation/nav.html"), "<nav></nav>")
  fs.writeFileSync(path.join(root, "assets/config.json"), JSON.stringify({ languages: { available: ["en"], default: "en" } }))
  for (const dict of ["texts", "speech_texts", "videos", "images", "audios"]) fs.writeFileSync(path.join(root, "content/i18n/en", dict + ".json"), "{}")
  fs.writeFileSync(path.join(root, "assets/base.js"), "window.readerLoaded = true")
  fs.writeFileSync(path.join(root, "assets/shell.css"), "body { margin: 0 }")
  fs.writeFileSync(path.join(root, "images/present.png"), "png")
  fs.writeFileSync(path.join(root, "p1.html"), `<html><head>${head}</head><body>${body}<script src="./assets/base.js"></script></body></html>`)
  return root
}
const check = (root: string) => {
  const missing: MissingPackageAsset[] = []
  return { opens: packageFilesAvailable(root, { onMissingAsset: asset => { missing.push(asset) } }), missing }
}

it("reports resources that book content refers to but the bundle lacks, without failing the bundle", () => {
  const root = bundle([
    '<img src="images/present.png">',
    '<img src="images/gone.png">',
    '<img src="/api/books/book/images/pg001_im009">',
    '<img srcset="images/present.png 1x, images/gone-2x.png 2x">',
    '<video poster="images/gone-poster.png"><source src="media/gone.mp4"></video>',
    '<link rel="stylesheet" href="assets/gone.css">',
    '<p style="background-image: url(images/gone-bg.png)">Text</p>',
    '<style>.hero { background: url("images/gone-hero.png") }</style><p class="hero">Text</p>',
  ].join(""))
  // The default check is unchanged: every referenced file is required.
  expect(packageFilesAvailable(root)).toBe(false)
  const { opens, missing } = check(root)
  expect(opens).toBe(true)
  expect(missing.every(asset => asset.document === "p1.html")).toBe(true)
  expect(missing.map(asset => asset.reference).sort()).toEqual([
    "/api/books/book/images/pg001_im009", "assets/gone.css", "images/gone-2x.png", "images/gone-bg.png",
    "images/gone-hero.png", "images/gone-poster.png", "images/gone.png", "media/gone.mp4",
  ])
  // Allowing gaps without collecting them gives the same answer, and both
  // answers stay independent of the strict one for the same directory.
  expect(packageFilesAvailable(root, { allowMissingAssets: true })).toBe(true)
  expect(packageFilesAvailable(root)).toBe(false)
  // Every call that collects hears the whole list again.
  expect(check(root).missing).toHaveLength(8)
})

it("reports a narration file a dictionary names but the bundle lacks", () => {
  const root = bundle("<p>Text</p>")
  fs.writeFileSync(path.join(root, "content/i18n/en/audios.json"), JSON.stringify({ t1: "t1.mp3" }))
  const { opens, missing } = check(root)
  expect(opens).toBe(true)
  expect(missing).toEqual([{ document: "content/i18n/en/audios.json", reference: "t1.mp3" }])
})

it("ignores styles in book content that cannot be read, as a browser does", () => {
  const root = bundle('<p style="font-family:\'abc\n; quotes:\'">Text</p><style>.a { content: "abc\n} .c { content: "x }</style>')
  expect(check(root)).toEqual({ opens: true, missing: [] })
})

it.each(["body { color: red } }", "body { color: red /* note"])("RAC-19: keeps a present imported stylesheet despite syntax errors: %s", css => {
  const root = bundle("<p>Text</p>")
  const file = path.join(root, "assets/shell.css")
  fs.writeFileSync(file, css)
  expect(check(root)).toEqual({ opens: true, missing: [] })
  expect(fs.readFileSync(file, "utf8")).toBe(css)
  fs.unlinkSync(file)
  expect(check(root).opens).toBe(false)
})

it.each([
  ["the page document", (root: string) => fs.unlinkSync(path.join(root, "p1.html"))],
  ["the reader script", (root: string) => fs.unlinkSync(path.join(root, "assets/base.js"))],
  ["the page shell stylesheet", (root: string) => fs.unlinkSync(path.join(root, "assets/shell.css"))],
  ["the page list", (root: string) => fs.unlinkSync(path.join(root, "content/pages.json"))],
  ["a language dictionary", (root: string) => fs.unlinkSync(path.join(root, "content/i18n/en/texts.json"))],
])("still fails a bundle that cannot open: missing %s", (_name, damage) => {
  const root = bundle('<img src="images/present.png">')
  expect(check(root)).toEqual({ opens: true, missing: [] })
  damage(root)
  expect(check(root).opens).toBe(false)
  expect(packageFilesAvailable(root, { allowMissingAssets: true })).toBe(false)
})

it("never lets a reference leave the bundle, in either mode", () => {
  const root = bundle('<img src="../outside.png">')
  fs.writeFileSync(path.join(path.dirname(root), "outside.png"), "png"); roots.push(path.join(path.dirname(root), "outside.png"))
  expect(packageFilesAvailable(root)).toBe(false)
  // Outside the bundle is not a member: reported as missing, never read.
  expect(check(root)).toEqual({ opens: true, missing: [{ document: "p1.html", reference: "../outside.png" }] })
})

it("removes the characters XML forbids and nothing else", () => {
  expect(stripXmlInvalid("A\u0000B\u0008C\u000BD\u000CE\u001FF￾G￿H")).toBe("ABCDEFGH")
  expect(stripXmlInvalid("tab\there\nnewline\ré \u{1F600} ok")).toBe("tab\there\nnewline\ré \u{1F600} ok")
  expect(stripXmlInvalid("lone \uD83D high and \uDE00 low")).toBe("lone  high and  low")
})

it.each([
  ["a control character in text", "<p>Form\u000Cfeed and \u0001 control</p>", "Formfeed and  control"],
  ["a control character in an attribute", '<p title="a\u0002b">Text</p>', 'title="ab"'],
  ["an SVG link without a namespace", '<svg><use xlink:href="#icon"></use></svg>', 'xmlns:xlink="http://www.w3.org/1999/xlink"'],
  ["a comment containing two hyphens", "<p>Before<!-- a -- b ---></p>", "Before"],
  ["an unpaired surrogate", "<p>Bad \uD83D pair</p>", "Bad  pair"],
])("writes well-formed XHTML from HTML with %s", (_name, html, expected) => {
  const xhtml = htmlToXhtml(html)
  expect(xhtml).toContain(expected)
  const document = `<html xmlns="http://www.w3.org/1999/xhtml"><body>${xhtml}</body></html>`
  expect(inspectReaderXml(document, root => root.localName)).toBe("html")
})
