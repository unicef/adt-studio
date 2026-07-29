import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Storage } from "@adt/storage"
import { packageEpub, type PackageEpubOptions } from "../packaging/epub.js"

/**
 * End-to-end packageEpub run against a synthetic adt/ bundle, exercising the
 * `epub_glossary` modes: in-flow glossary pages (page), the spec surface
 * (word, default), and both.
 */

let bookDir: string

function pageHtml(
  dataId: string,
  text: string,
  viewport?: { width: number; height: number },
): string {
  const viewportMeta = viewport
    ? `\n  <meta name="viewport" content="width=${viewport.width}, height=${viewport.height}" />`
    : ""
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />${viewportMeta}
  <title>t</title>
</head>
<body>
  <main><div id="content"><p data-id="${dataId}">${text}</p></div></main>
</body>
</html>
`
}

function writeFixture(): void {
  const adt = path.join(bookDir, "adt")
  fs.mkdirSync(path.join(adt, "content", "i18n", "en", "video"), { recursive: true })
  fs.mkdirSync(path.join(adt, "assets", "interface_translations", "en"), { recursive: true })
  fs.mkdirSync(path.join(adt, "images"), { recursive: true })

  // Three content pages; "volcano"/"lava" on pages 1-2 (window 0 for a
  // placement after page 2), "magma" on page 3 (folds into the end window).
  fs.writeFileSync(path.join(adt, "index.html"), pageHtml("pg001_p0", "A volcano erupts."))
  fs.writeFileSync(path.join(adt, "pg002_sec001.html"), pageHtml("pg002_p0", "Hot lava flows."))
  fs.writeFileSync(path.join(adt, "pg003_sec001.html"), pageHtml("pg003_p0", "Deep magma rises."))
  fs.writeFileSync(
    path.join(adt, "content", "pages.json"),
    JSON.stringify([
      { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
      { section_id: "pg002_sec001", href: "pg002_sec001.html", page_number: 2 },
      { section_id: "pg003_sec001", href: "pg003_sec001.html", page_number: 3 },
    ]),
  )
  fs.writeFileSync(
    path.join(adt, "content", "i18n", "en", "glossary.json"),
    JSON.stringify({
      volcano: {
        word: "volcano",
        definition: "A mountain that erupts.",
        variations: [],
        emoji: "🌋",
        id: "gl001",
        image: "images/img_volcano.png",
        // Emitted by buildGlossaryJson when a sign-language video is
        // attached to the term; the file ships inside the adt bundle.
        video: "content/i18n/en/video/sl_gl001.mp4",
      },
      lava: { word: "lava", definition: "Molten rock.", variations: [], emoji: "", id: "gl002" },
      magma: { word: "magma", definition: "Rock below ground.", variations: [], emoji: "", id: "gl003" },
    }),
  )
  fs.writeFileSync(
    path.join(adt, "assets", "interface_translations", "en", "interface_translations.json"),
    JSON.stringify({ "glossary-label": "Word list" }),
  )
  fs.writeFileSync(path.join(adt, "images", "img_volcano.png"), "png-bytes")
  fs.writeFileSync(path.join(adt, "content", "i18n", "en", "video", "sl_gl001.mp4"), "mp4-bytes")
}

/** Storage stub: no metadata/toc/timestamps. */
function storageStub(): Storage {
  return {
    getLatestNodeData: () => null,
  } as unknown as Storage
}

function options(overrides?: Partial<PackageEpubOptions>): PackageEpubOptions {
  return {
    bookDir,
    label: "test-book",
    language: "en",
    outputLanguages: ["en"],
    title: "Test Book",
    webAssetsDir: "",
    ...overrides,
  }
}

function read(rel: string): string {
  return fs.readFileSync(path.join(bookDir, "epub", "OEBPS", rel), "utf-8")
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(bookDir, "epub", "OEBPS", rel))
}

beforeEach(() => {
  bookDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-epub-glossary-"))
  writeFixture()
})

afterEach(() => {
  fs.rmSync(bookDir, { recursive: true, force: true })
})

describe("packageEpub glossary modes", () => {
  it("word mode (default) keeps the spec surface and adds no glossary pages", () => {
    packageEpub(storageStub(), options())

    expect(exists("glossary.xhtml")).toBe(true)
    expect(exists("glp001.xhtml")).toBe(false)
    expect(read("index.xhtml")).toContain(`href="glossary.xhtml#gl_001"`)
    const opf = read("content.opf")
    expect(opf).toContain(`linear="no"`)
    expect(opf).not.toContain("glp001")

    // Popover content (the reader extracts the dt/dd fragment): 24px inline
    // text, the term picture, an autoplaying sign-language video, and no
    // "p. N" backlinks.
    const doc = read("glossary.xhtml")
    expect(doc).toContain(`font-size:24px`)
    expect(doc).toContain(`<img src="images/img_volcano.png"`)
    expect(doc).toContain(`<video src="content/i18n/en/video/sl_gl001.mp4"`)
    expect(doc).toContain(`autoplay="autoplay"`)
    expect(doc).not.toContain(`epub:type="backlink"`)
    expect(doc).not.toContain(">p. 1<")
    // The video ships inside the bundle (packageAdtWeb copied it).
    expect(exists("content/i18n/en/video/sl_gl001.mp4")).toBe(true)
  })

  it("page mode inserts glossary pages at the placements and links terms to them", () => {
    packageEpub(storageStub(), options({
      epubGlossary: { mode: "page", page_placements: [2, "end"] },
    }))

    // No spec document; two in-flow pages instead.
    expect(exists("glossary.xhtml")).toBe(false)
    expect(exists("glp001.xhtml")).toBe(true)
    expect(exists("glp002.xhtml")).toBe(true)

    // Reading order: window 0 page after page 2, window 1 page at the end.
    const pages = JSON.parse(read("content/pages.json")) as Array<{ section_id: string }>
    expect(pages.map((p) => p.section_id)).toEqual([
      "pg001_sec001",
      "pg002_sec001",
      "glp001",
      "pg003_sec001",
      "glp002",
    ])

    // In-text glossrefs resolve to the owning glossary page (no leftover
    // placeholders anywhere).
    expect(read("index.xhtml")).toContain(`href="glp001.xhtml#gl_001"`)
    expect(read("pg002_sec001.xhtml")).toContain(`href="glp001.xhtml#gl_002"`)
    expect(read("pg003_sec001.xhtml")).toContain(`href="glp002.xhtml#gl_003"`)
    expect(read("index.xhtml")).not.toContain("__glp:")

    // Glossary page content: word, picture, sign-language toggle, backlink.
    const glp1 = read("glp001.xhtml")
    expect(glp1).toContain("<dfn>volcano</dfn>")
    expect(glp1).toContain(`src="images/img_volcano.png"`)
    // The video hides behind the hands-button <details> toggle; the page
    // script strips the fallback controls and plays on open.
    expect(glp1).toContain(`<details class="glp-sl">`)
    expect(glp1).toContain(`Sign language</summary>`)
    expect(glp1).toContain(`src="content/i18n/en/video/sl_gl001.mp4"`)
    expect(glp1).toContain(`removeAttribute("controls")`)
    expect(glp1).toContain(`epub:type="backlink"`)
    expect(glp1).toContain(`href="index.xhtml#`)
    expect(glp1).toContain("p. 1")
    expect(exists("content/i18n/en/video/sl_gl001.mp4")).toBe(true)

    // Spine includes the glossary pages as linear items.
    const opf = read("content.opf")
    const spine = opf.slice(opf.indexOf("<spine"))
    expect(spine).not.toContain(`linear="no"`)
    const glp1Id = opf.match(/<item id="([^"]+)" href="glp001\.xhtml"/)?.[1]
    expect(glp1Id).toBeTruthy()
    expect(spine).toContain(`idref="${glp1Id}"`)

    // Nav: TOC entries labelled from interface translations; landmark points
    // at the first glossary page.
    const nav = read("toc.xhtml")
    expect(nav).toContain(`<a href="glp001.xhtml">Word list</a>`)
    expect(nav).toContain(`<a epub:type="glossary" href="glp001.xhtml">Word list</a>`)
    const ncx = read("toc.ncx")
    expect(ncx).toContain("Word list")
  })

  it("both mode keeps popover links and adds the browsable pages", () => {
    packageEpub(storageStub(), options({
      epubGlossary: { mode: "both", page_placements: ["end"] },
    }))

    expect(exists("glossary.xhtml")).toBe(true)
    expect(exists("glp001.xhtml")).toBe(true)
    // Terms keep the spec target so capable readers still get popovers.
    expect(read("index.xhtml")).toContain(`href="glossary.xhtml#gl_001"`)
    // Landmark prefers the spec document.
    expect(read("toc.xhtml")).toContain(`<a epub:type="glossary" href="glossary.xhtml">`)
    // One end-of-book page collects all three terms.
    const pages = JSON.parse(read("content/pages.json")) as Array<{ section_id: string }>
    expect(pages[pages.length - 1].section_id).toBe("glp001")
    const glp1 = read("glp001.xhtml")
    for (const word of ["volcano", "lava", "magma"]) {
      expect(glp1).toContain(`<dfn>${word}</dfn>`)
    }
  })

  it("fixed layout declares the scripted property on glossary pages with the toggle", () => {
    packageEpub(storageStub(), options({
      fixedLayout: true,
      epubGlossary: { mode: "page" },
    }))
    const opf = read("content.opf")
    expect(opf).toMatch(
      /href="glp001\.xhtml" media-type="application\/xhtml\+xml" properties="scripted"/,
    )
  })

  it("sizes fixed-layout glossary pages from the book's reference viewport, not the cover", () => {
    // A cover authored at different dimensions than the body pages must not
    // decide the glossary page size — the majority viewport wins, matching the
    // one quiz pages are given.
    const adt = path.join(bookDir, "adt")
    fs.writeFileSync(
      path.join(adt, "index.html"),
      pageHtml("pg001_p0", "A volcano erupts.", { width: 1000, height: 1400 }),
    )
    fs.writeFileSync(
      path.join(adt, "pg002_sec001.html"),
      pageHtml("pg002_p0", "Hot lava flows.", { width: 800, height: 600 }),
    )
    fs.writeFileSync(
      path.join(adt, "pg003_sec001.html"),
      pageHtml("pg003_p0", "Deep magma rises.", { width: 800, height: 600 }),
    )

    packageEpub(storageStub(), options({
      fixedLayout: true,
      epubGlossary: { mode: "page" },
    }))

    const glp1 = read("glp001.xhtml")
    expect(glp1).toContain(`content="width=800, height=600"`)
    expect(glp1).not.toContain(`width=1000`)
  })

  it("page mode without occurrences emits no glossary pages", () => {
    const adt = path.join(bookDir, "adt")
    fs.writeFileSync(path.join(adt, "index.html"), pageHtml("pg001_p0", "Nothing matches here."))
    fs.writeFileSync(path.join(adt, "pg002_sec001.html"), pageHtml("pg002_p0", "Still nothing."))
    fs.writeFileSync(path.join(adt, "pg003_sec001.html"), pageHtml("pg003_p0", "Quiet."))

    packageEpub(storageStub(), options({ epubGlossary: { mode: "page" } }))

    expect(exists("glp001.xhtml")).toBe(false)
    expect(exists("glossary.xhtml")).toBe(false)
    const pages = JSON.parse(read("content/pages.json")) as Array<{ section_id: string }>
    expect(pages).toHaveLength(3)
  })
})
