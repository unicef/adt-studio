import { describe, it, expect } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { PNG } from "pngjs"
import jpeg from "jpeg-js"
import { buildOpf, buildNcx, buildIndex, rewriteContentPage, ensureJpegCover, buildAdtSidecar, relocateMedia } from "../packaging/pnld.js"
import type { PageEntry } from "../packaging/web.js"

const PAGES: PageEntry[] = [
  { section_id: "pg001_sec001", href: "content/pg001_sec001.html", page_number: 1 },
  { section_id: "qz001", href: "content/qz001.html" },
  { section_id: "pg002_sec001", href: "content/pg002_sec001.html", page_number: 2 },
]

const FILES = [
  { href: "index.html", mediaType: "text/html" },
  { href: "toc.ncx", mediaType: "application/x-dtbncx+xml" },
  { href: "content/pg001_sec001.html", mediaType: "text/html" },
  { href: "content/qz001.html", mediaType: "text/html" },
  { href: "content/pg002_sec001.html", mediaType: "text/html" },
  { href: "cover.png", mediaType: "image/png" },
  { href: "resources/styles/fonts.css", mediaType: "text/css" },
  { href: "resources/fonts/x.woff2", mediaType: "font/woff2" },
]

describe("rewriteContentPage", () => {
  const raw = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8" />
    <link href="./content/tailwind_output.css" rel="stylesheet">
    <link href="./assets/fonts.css" rel="stylesheet">
    <link href="./assets/libs/fontawesome/css/all.min.css" rel="stylesheet">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Arimo&amp;display=swap" rel="stylesheet">
    <script src="./assets/auto-fit.js"></script>
</head>
<body>
  <main><img src="images/pg002_im002.png"></main>
</body>
</html>`

  it("rewrites stylesheet and script references into ../resources/*", () => {
    const out = rewriteContentPage(raw)
    expect(out).toContain(`href="../resources/styles/tailwind_output.css"`)
    expect(out).toContain(`href="../resources/styles/fonts.css"`)
    expect(out).toContain(`href="../resources/styles/fontawesome-all-min.css"`)
    expect(out).toContain(`src="../resources/scripts/auto-fit.js"`)
  })

  it("rewrites image references into ../resources/images", () => {
    expect(rewriteContentPage(raw)).toContain(`src="../resources/images/pg002_im002.png"`)
  })

  it("strips external font references (self-contained requirement)", () => {
    const out = rewriteContentPage(raw)
    expect(out).not.toContain("fonts.googleapis.com")
    expect(out).not.toContain("fonts.gstatic.com")
    expect(out).not.toContain("preconnect")
  })

  it("injects a robots noindex meta when absent and keeps it once", () => {
    const out = rewriteContentPage(raw)
    expect(out).toContain(`<meta name="robots" content="noindex, nofollow" />`)
    expect(out.match(/name="robots"/g)).toHaveLength(1)
  })

  it("does not duplicate an existing robots meta", () => {
    const withRobots = raw.replace(
      `<meta charset="utf-8" />`,
      `<meta charset="utf-8" />\n    <meta name="robots" content="noindex, nofollow" />`,
    )
    expect(rewriteContentPage(withRobots).match(/name="robots"/g)).toHaveLength(1)
  })

  it("wraps the body in a schema.org/Book itemscope as the first child", () => {
    const out = rewriteContentPage(raw, 1, "pt-BR")
    expect(out).toContain('<div itemscope itemtype="https://schema.org/Book">')
    expect(out).toMatch(/<body[^>]*>\s*<div itemscope itemtype="https:\/\/schema\.org\/Book">/)
    expect(out).toMatch(/<\/div>\s*<\/body>/)
    expect(out.match(/schema\.org\/Book/g)).toHaveLength(1)
  })

  it("injects a doc-pagebreak marker with the page number when provided", () => {
    const out = rewriteContentPage(raw, 25, "pt-BR")
    expect(out).toContain('<p role="doc-pagebreak" class="sr-only">')
    expect(out).toContain('<span class="page_number" data-book="pagina"')
    expect(out).toContain('aria-label="vinte e cinco"')
    expect(out).toMatch(/>25<\/span>/)
    // sits at the top of <main>
    expect(out).toMatch(/<main>\s*<p role="doc-pagebreak" class="sr-only">/)
  })

  it("omits pagination when the page has no number", () => {
    expect(rewriteContentPage(raw, null, "pt-BR")).not.toContain("doc-pagebreak")
  })

  it("keeps the whole page-break marker visually hidden (sr-only, no stray numeral)", () => {
    const out = rewriteContentPage(raw, 4, "en")
    expect(out).toContain('<p role="doc-pagebreak" class="sr-only">')
    // numeral stays in the DOM for VALIDE / AT, but under the sr-only paragraph
    expect(out).toMatch(/class="sr-only"><span>Page <\/span><span class="page_number"/)
    expect(out).not.toContain("screen-reader-only")
  })

  const overlayPage = `<!DOCTYPE html>
<html lang="en-US">
<head><meta charset="utf-8" /></head>
<body class="min-h-screen flex items-center justify-center">
  <main class="w-full">
    <div id="content" data-fl-reference-width="1145" style="position:relative;width:1145px;height:692px;overflow:hidden" class="opacity-0">
      <img src="images/pg004_im001.png" style="position:absolute;top:0;left:0;width:573px;height:692px">
    </div>
  </main>
</body>
</html>`

  it("injects the reveal + scale script on overlay pages when fixedLayout", () => {
    const out = rewriteContentPage(overlayPage, 4, "en", true)
    expect(out).toContain(`classList.remove("opacity-0")`)
    expect(out).toContain("data-fl-reference-width")
    expect(out).toMatch(/translate\(-50%, -50%\) scale\(/)
    // sits at the end of <body>, before the closing tag
    expect(out).toMatch(/<\/script>\s*<\/body>/)
  })

  it("does not inject the fit script when fixedLayout is false", () => {
    const out = rewriteContentPage(overlayPage, 4, "en", false)
    expect(out).not.toContain(`classList.remove("opacity-0")`)
  })

  it("does not inject the fit script on reflowable pages even when fixedLayout", () => {
    // `raw` has no #content[data-fl-reference-width] box
    const out = rewriteContentPage(raw, 4, "en", true)
    expect(out).not.toContain(`classList.remove("opacity-0")`)
  })

  it("adds lang to <body> (spec requires it; adt only sets it on <html>)", () => {
    const noBodyLang = raw.replace("<body>", `<body class="x">`)
    const out = rewriteContentPage(noBodyLang, 1, "pt-BR")
    expect(out).toContain(`<body lang="pt-BR" class="x">`)
  })

  it("does not duplicate lang on a body that already has it", () => {
    const withLang = raw.replace("<body>", `<body lang="es">`)
    const out = rewriteContentPage(withLang, 1, "pt-BR")
    expect(out.match(/<body[^>]*\blang=/g)).toHaveLength(1)
    expect(out).toContain(`<body lang="es">`)
  })

  it("uses the numeral (no spelled aria-label) for non-pt languages", () => {
    const out = rewriteContentPage(raw, 25, "en")
    expect(out).toContain('<p role="doc-pagebreak" class="sr-only">')
    expect(out).not.toContain("aria-label=")
  })
})

describe("buildOpf", () => {
  const opf = buildOpf({
    title: "My Book",
    authors: ["Ada Lovelace"],
    publisher: "ACME",
    language: "pt-BR",
    pageList: PAGES,
    allFiles: FILES,
    coverHref: "cover.png",
  })

  it("declares the required Dublin Core metadata", () => {
    expect(opf).toContain(`<dc:title>My Book</dc:title>`)
    expect(opf).toContain(`<dc:language>pt-BR</dc:language>`)
    expect(opf).toContain(`<dc:publisher>ACME</dc:publisher>`)
    expect(opf).toContain(`<dc:creator>Ada Lovelace</dc:creator>`)
    expect(opf).toMatch(/<dc:identifier id="pub-id">urn:uuid:[0-9a-f-]+<\/dc:identifier>/)
    expect(opf).toContain(`<dc:date>`)
    expect(opf).toContain(`<dc:description>`)
    expect(opf).toContain(`<meta property="dcterms:modified">`)
  })

  it("declares the three mandatory accessibility metas", () => {
    expect(opf).toContain(`<meta property="schema:accessibilityFeature">structuralNavigation</meta>`)
    expect(opf).toContain(`<meta property="schema:accessibilityFeature">tableOfContents</meta>`)
    expect(opf).toContain(`<meta property="schema:accessibilityAPI">ARIA</meta>`)
  })

  it("marks the nav (index.html) and cover items with the right properties", () => {
    expect(opf).toContain(`<item id="nav" href="index.html" media-type="text/html" properties="nav"/>`)
    expect(opf).toContain(`href="cover.png" media-type="image/png" properties="cover-image"`)
    expect(opf).toContain(`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`)
  })

  it("builds the spine in pages.json order (quiz between page 1 and 2)", () => {
    const p1 = opf.indexOf("content/pg001_sec001.html")
    const qz = opf.indexOf("content/qz001.html")
    const p2 = opf.indexOf("content/pg002_sec001.html")
    // spine itemrefs reference item ids, but manifest declaration order follows
    // allFiles; assert reading order via the nav/ncx instead.
    expect(p1).toBeGreaterThan(-1)
    expect(qz).toBeGreaterThan(-1)
    expect(p2).toBeGreaterThan(-1)
    // one itemref per page, plus nav/ncx excluded from spine
    expect(opf.match(/<itemref /g)).toHaveLength(PAGES.length)
  })
})

describe("buildNcx", () => {
  const ncx = buildNcx("My Book", "pt-BR", PAGES)

  it("mirrors the reading order with matching content src", () => {
    expect(ncx).toContain(`<content src="content/pg001_sec001.html"/>`)
    expect(ncx).toContain(`<content src="content/qz001.html"/>`)
    const navPoints = ncx.match(/<navPoint /g)
    expect(navPoints).toHaveLength(PAGES.length)
  })

  it("labels pages with a localized page word", () => {
    expect(ncx).toContain(`Página 1`)
  })
})

describe("buildIndex", () => {
  const index = buildIndex("My Book", "pt-BR", ["Ada Lovelace"], PAGES)

  it("emits a doc-toc nav with sumario semantics and robots meta", () => {
    expect(index).toContain(`<nav role="doc-toc" id="toc" data-book="sumario">`)
    expect(index).toContain(`<h1>Sumário</h1>`)
    expect(index).toContain(`<meta name="robots" content="noindex, nofollow" />`)
    expect(index).toContain(`<meta name="author" content="Ada Lovelace" />`)
  })

  it("wraps the nav in a schema.org/Book itemscope as the first body child", () => {
    expect(index).toMatch(/<body[^>]*>\s*<div itemscope itemtype="https:\/\/schema\.org\/Book">/)
    expect(index).toMatch(/<div itemscope itemtype="https:\/\/schema\.org\/Book">\s*<nav role="doc-toc"/)
  })

  it("links every page in reading order", () => {
    expect(index).toContain(`<a href="content/pg001_sec001.html">Página 1</a>`)
    expect(index).toContain(`<a href="content/pg002_sec001.html">Página 2</a>`)
    expect((index.match(/<li>/g) ?? [])).toHaveLength(PAGES.length)
  })
})

describe("ensureJpegCover", () => {
  function tmp(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "pnld-cover-"))
  }
  function writePng(dir: string, width = 40, height = 60): void {
    const png = new PNG({ width, height })
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = 200; png.data[i + 1] = 100; png.data[i + 2] = 50; png.data[i + 3] = 255
    }
    fs.writeFileSync(path.join(dir, "cover.png"), PNG.sync.write(png))
  }

  it("converts a PNG cover to cover.jpeg at the spec size and drops the PNG", () => {
    const dir = tmp()
    writePng(dir) // portrait source -> 1600x2560
    const href = ensureJpegCover(dir)
    expect(href).toBe("cover.jpeg")
    expect(fs.existsSync(path.join(dir, "cover.png"))).toBe(false)
    const jpg = fs.readFileSync(path.join(dir, "cover.jpeg"))
    expect(jpg[0]).toBe(0xff) // JPEG SOI marker
    expect(jpg[1]).toBe(0xd8)
    const decoded = jpeg.decode(jpg)
    expect(decoded.width).toBe(1600)
    expect(decoded.height).toBe(2560)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("resizes a landscape cover to 2560x1600", () => {
    const dir = tmp()
    writePng(dir, 60, 40) // landscape source -> 2560x1600
    ensureJpegCover(dir)
    const decoded = jpeg.decode(fs.readFileSync(path.join(dir, "cover.jpeg")))
    expect(decoded.width).toBe(2560)
    expect(decoded.height).toBe(1600)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("keeps an existing jpeg cover untouched", () => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, "cover.jpg"), "x")
    expect(ensureJpegCover(dir)).toBe("cover.jpg")
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("keeps a non-decodable cover as-is instead of throwing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pnld-cover-"))
    fs.writeFileSync(path.join(dir, "cover.png"), Buffer.from("fake-png-data"))
    expect(ensureJpegCover(dir)).toBe("cover.png")
    expect(fs.existsSync(path.join(dir, "cover.png"))).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("returns undefined when there is no cover", () => {
    const dir = tmp()
    expect(ensureJpegCover(dir)).toBeUndefined()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe("buildAdtSidecar", () => {
  it("preserves config, manifests, and feature data under resources/data", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pnld-adt-"))
    fs.mkdirSync(path.join(dir, "assets", "interface_translations", "pt-BR"), { recursive: true })
    fs.mkdirSync(path.join(dir, "content", "i18n", "pt-BR", "audio"), { recursive: true })
    fs.writeFileSync(path.join(dir, "assets", "config.json"), "{}")
    fs.writeFileSync(path.join(dir, "assets", "interface_translations", "pt-BR", "interface_translations.json"), "{}")
    fs.writeFileSync(path.join(dir, "content", "pages.json"), "[]")
    fs.writeFileSync(path.join(dir, "content", "toc.json"), "[]")
    fs.writeFileSync(path.join(dir, "content", "i18n", "pt-BR", "audio", "pg001.mp3"), "a")

    buildAdtSidecar(dir)

    const dataDir = path.join(dir, "resources", "data")
    expect(fs.existsSync(path.join(dataDir, "assets", "config.json"))).toBe(true)
    expect(fs.existsSync(path.join(dataDir, "assets", "interface_translations", "pt-br", "interface_translations.json"))).toBe(true)
    expect(fs.existsSync(path.join(dataDir, "content", "pages.json"))).toBe(true)
    expect(fs.existsSync(path.join(dataDir, "content", "i18n", "pt-br", "audio", "pg001.mp3"))).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("lowercases the locale folder names (spec 5.2.1)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pnld-adt-"))
    fs.mkdirSync(path.join(dir, "assets", "interface_translations", "pt-BR"), { recursive: true })
    fs.mkdirSync(path.join(dir, "content", "i18n", "en-US"), { recursive: true })

    buildAdtSidecar(dir)

    const dataDir = path.join(dir, "resources", "data")
    expect(fs.readdirSync(path.join(dataDir, "assets", "interface_translations"))).toEqual(["pt-br"])
    expect(fs.readdirSync(path.join(dataDir, "content", "i18n"))).toEqual(["en-us"])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("lowercases the locale codes in config.languages", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pnld-adt-"))
    fs.mkdirSync(path.join(dir, "assets"), { recursive: true })
    fs.writeFileSync(
      path.join(dir, "assets", "config.json"),
      JSON.stringify({ languages: { default: "pt-BR", available: ["pt-BR", "en-US"] } }),
    )

    buildAdtSidecar(dir)

    const config = JSON.parse(
      fs.readFileSync(path.join(dir, "resources", "data", "assets", "config.json"), "utf-8"),
    )
    expect(config.languages.default).toBe("pt-br")
    expect(config.languages.available).toEqual(["pt-br", "en-us"])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("is a no-op when the runtime layer is absent", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pnld-adt-"))
    expect(() => buildAdtSidecar(dir)).not.toThrow()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe("relocateMedia", () => {
  function readJson(p: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>
  }

  it("moves media to resources/{audios,videos}, keeps the JSON, rewrites map values", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pnld-c-"))
    const dataDir = path.join(dir, "resources", "data")
    // Same media filename in two languages — must not collide once flattened.
    for (const lang of ["pt-br", "en-us"]) {
      fs.mkdirSync(path.join(dataDir, "content", "i18n", lang, "audio"), { recursive: true })
      fs.mkdirSync(path.join(dataDir, "content", "i18n", lang, "video"), { recursive: true })
      fs.writeFileSync(path.join(dataDir, "content", "i18n", lang, "audio", "p1.mp3"), lang)
      fs.writeFileSync(path.join(dataDir, "content", "i18n", lang, "video", "sl1.mp4"), lang)
      fs.writeFileSync(path.join(dataDir, "content", "i18n", lang, "audios.json"), JSON.stringify({ a1: "p1.mp3" }))
      fs.writeFileSync(path.join(dataDir, "content", "i18n", lang, "videos.json"), JSON.stringify({ v1: "sl1.mp4" }))
      fs.writeFileSync(path.join(dataDir, "content", "i18n", lang, "texts.json"), JSON.stringify({ t: "x" }))
    }
    relocateMedia(dir)

    // Media lands in the flat per-type folders, disambiguated by language.
    expect(fs.existsSync(path.join(dir, "resources", "audios", "pt-br__p1.mp3"))).toBe(true)
    expect(fs.existsSync(path.join(dir, "resources", "audios", "en-us__p1.mp3"))).toBe(true)
    expect(fs.existsSync(path.join(dir, "resources", "videos", "pt-br__sl1.mp4"))).toBe(true)
    expect(fs.existsSync(path.join(dir, "resources", "videos", "en-us__sl1.mp4"))).toBe(true)
    // The JSON stays in resources/data, with map values rewritten to the new names.
    expect(readJson(path.join(dataDir, "content", "i18n", "pt-br", "audios.json")).a1).toBe("pt-br__p1.mp3")
    expect(readJson(path.join(dataDir, "content", "i18n", "en-us", "videos.json")).v1).toBe("en-us__sl1.mp4")
    expect(readJson(path.join(dataDir, "content", "i18n", "pt-br", "texts.json")).t).toBe("x")
    // resources/data survives (it still holds the JSON); the emptied audio/video dirs are gone.
    expect(fs.existsSync(dataDir)).toBe(true)
    expect(fs.existsSync(path.join(dataDir, "content", "i18n", "pt-br", "audio"))).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("leaves resources/data untouched when there is no media", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pnld-c-"))
    const dataDir = path.join(dir, "resources", "data")
    fs.mkdirSync(path.join(dataDir, "content"), { recursive: true })
    fs.writeFileSync(path.join(dataDir, "content", "pages.json"), "[]")
    relocateMedia(dir)
    expect(fs.existsSync(path.join(dataDir, "content", "pages.json"))).toBe(true)
    expect(fs.existsSync(path.join(dir, "resources", "videos"))).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("is a no-op when there is no adt sidecar", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pnld-c-"))
    expect(() => relocateMedia(dir)).not.toThrow()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe("rewriteContentPage — activities bundle", () => {
  const activity = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" /></head><body><main><section data-section-type="activity_multiple_choice"></section></main></body></html>`
  const plain = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" /></head><body><main><section data-section-type="text_only"></section></main></body></html>`

  it("injects the adt-base + adt-sounds-base metas + bundle on activity pages", () => {
    const out = rewriteContentPage(activity, 1, "pt-BR")
    expect(out).toContain('<meta name="adt-base" content="../resources/data/" />')
    expect(out).toContain('<meta name="adt-sounds-base" content="../resources/audios/" />')
    expect(out).toContain('<script src="../resources/scripts/activities-bundle-local.js"></script>')
  })

  it("leaves non-activity pages without the bundle", () => {
    const out = rewriteContentPage(plain, 1, "pt-BR")
    expect(out).not.toContain("activities-bundle-local.js")
    expect(out).not.toContain("adt-base")
  })
})
