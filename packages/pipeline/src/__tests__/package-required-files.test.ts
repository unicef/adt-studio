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
  const failure = vi.fn()
  expect(packageFilesAvailable(root, { onFailure: failure })).toBe(false)
  expect(failure).toHaveBeenCalledWith({ document: "p1.html", member: "assets/base.js" })
  fs.writeFileSync(runtime, "window.readerLoaded = true")
  const page = path.join(root, "p1.html")
  for (const unsafe of ["/private/secret", "../../secret", "a".repeat(241)]) {
    failure.mockClear()
    fs.writeFileSync(page, `<img src="${unsafe}">`)
    expect(packageFilesAvailable(root, { onFailure: failure })).toBe(false)
    expect(failure).toHaveBeenCalledWith({ document: "p1.html" })
  }
  const resource = path.join(root, "assets/style-resource.png")
  for (const style of ["color red", "font-family: 'Open Sans", "color:red; }"]) {
    fs.writeFileSync(page, `<main style="${style}">Readable saved page</main>`)
    const saved = fs.readFileSync(page)
    expect(packageFilesAvailable(root), style).toBe(true)
    expect(fs.readFileSync(page)).toEqual(saved)
    fs.appendFileSync(page, '<div style="background:url(assets/style-resource.png)"></div>')
    failure.mockClear()
    expect(packageFilesAvailable(root, { onFailure: failure }), style).toBe(false)
    expect(failure).toHaveBeenCalledWith({ document: "p1.html", member: "assets/style-resource.png" })
    fs.writeFileSync(resource, "required image bytes")
    expect(packageFilesAvailable(root), style).toBe(true)
    fs.unlinkSync(resource)
  }
  for (const style of [
    "color red; background:url(assets/style-resource.png)",
    "background:url(assets/style-resource.png); color red",
    String.raw`color red; background:u\72l(assets/style-resource.png)`,
    "--hero:'assets/style-resource.png'; color red; background-image:image-set(var(--hero) 1x)",
  ]) {
    fs.writeFileSync(page, `<main style="${style}">Readable saved page</main>`)
    expect(packageFilesAvailable(root), style).toBe(false)
    fs.writeFileSync(resource, "required image bytes")
    expect(packageFilesAvailable(root), style).toBe(true)
    fs.unlinkSync(resource)
  }
  for (const css of [
    ".zz { color red }",
    ".zz { color red; background:url(assets/style-resource.png) }",
    ".zz { background:url(assets/style-resource.png); color red }",
    String.raw`.zz { color red; background:u\72l(assets/style-resource.png) }`,
    "@media print { .zz { color red; background:url(assets/style-resource.png) } }",
    '@import "assets/recovered.css"; .zz { color red }',
  ]) {
    const stylesheet = path.join(root, "assets/recovered.css")
    fs.writeFileSync(stylesheet, ".zz { background:url(style-resource.png) }")
    fs.writeFileSync(page, `<style>${css}</style><main class="zz">Readable saved page</main>`)
    const saved = fs.readFileSync(page)
    const usesResource = css !== ".zz { color red }"
    expect(packageFilesAvailable(root), css).toBe(!usesResource)
    fs.writeFileSync(resource, "required image bytes")
    expect(packageFilesAvailable(root), css).toBe(true)
    expect(fs.readFileSync(page)).toEqual(saved)
    fs.unlinkSync(resource)
    expect(packageFilesAvailable(root), css).toBe(!usesResource)
    fs.unlinkSync(stylesheet)
  }
  for (const css of [
    ".zz { color red; background:url(assets/style-resource.png }",
    '.zz { color red; background:url("assets/style-resource.png) }',
    ".zz { color red; background:url(/private/secret) }",
    ".zz { color red; background:url(../../secret) }",
    '@import "assets/missing.css"; .zz { color red }',
    ":root { --hero:'assets/style-resource.png' } .zz { color red; background-image:image-set(var(--hero) 1x) }",
    String.raw`.zz { color red; \2d \2d hero:'assets/style-resource.png'; background-image:image-set(var(--hero) 1x) }`,
  ]) {
    fs.writeFileSync(resource, "required image bytes")
    fs.writeFileSync(page, `<style>${css}</style><main class="zz">Ambiguous resource</main>`)
    const saved = fs.readFileSync(page)
    expect(packageFilesAvailable(root), css).toBe(false)
    expect(fs.readFileSync(page)).toEqual(saved)
    fs.unlinkSync(resource)
  }
  for (const selector of [".--reader", "#--reader", ".--reader:hover", ".label:not(.--reader)", String.raw`.\2d \2d reader`]) {
    fs.writeFileSync(page, `<style>${selector} { color red }</style><main class="--reader" id="--reader">Harmless selector</main>`)
    expect(packageFilesAvailable(root), selector).toBe(true)
  }
  for (const nested of [".child { color: blue }", "@media screen { color: blue }"]) {
    const css = `.hero { ${nested} --hero:"assets/style-resource.png" }`
    const consumer = '<main class="hero" style="background-image:image-set(var(--hero) 1x)">Nested variable</main>'
    fs.writeFileSync(page, `<style>${css}</style>${consumer}`)
    const saved = fs.readFileSync(page)
    expect(packageFilesAvailable(root), css).toBe(false)
    fs.writeFileSync(resource, "required image bytes")
    expect(packageFilesAvailable(root), css).toBe(true)
    expect(fs.readFileSync(page)).toEqual(saved)
    // Recovery must refuse unknown variable scope even with the asset present.
    fs.writeFileSync(page, `<style>.typo { color red } ${css}</style>${consumer}`)
    expect(packageFilesAvailable(root), css).toBe(false)
    fs.unlinkSync(resource)
  }
  for (const definition of ["--hero", String.raw`/*before*/\2d \2d hero/*after*/`]) {
    fs.writeFileSync(resource, "required image bytes")
    fs.writeFileSync(page, `<style>.zz { color red; ${definition}:"assets/style-resource.png" }</style><style>.zz { background-image:image-set(var(--hero) 1x) }</style><main class="zz">Ambiguous scope</main>`)
    expect(packageFilesAvailable(root), definition).toBe(false)
    fs.unlinkSync(resource)
  }
  for (const html of [
    '<style>.a { content: "abc\n} .yy { background:url(assets/style-resource.png) } .c { content: "x }</style><p class="yy">Text</p>',
    '<style>.typo { color red } .a { content: "abc\n} .yy { background:url(assets/style-resource.png) } .c { content: "x }</style><p class="yy">Text</p>',
    "<p style=\"font-family:'abc\n; background:url(assets/style-resource.png); quotes:'\">Text</p>",
  ]) {
    fs.writeFileSync(page, html)
    const saved = fs.readFileSync(page)
    expect(packageFilesAvailable(root), html).toBe(false)
    fs.writeFileSync(resource, "required image bytes")
    expect(packageFilesAvailable(root), html).toBe(false)
    expect(fs.readFileSync(page)).toEqual(saved)
    fs.unlinkSync(resource)
  }
  fs.writeFileSync(page, '<main style="background:url(assets/style-resource.png">Ambiguous resource</main>')
  fs.writeFileSync(resource, "required image bytes")
  failure.mockClear()
  expect(packageFilesAvailable(root, { onFailure: failure })).toBe(false)
  expect(failure).toHaveBeenCalledWith({ document: "p1.html" })
  fs.unlinkSync(resource)
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
  for (const reference of [
    '<input type="image" src="assets/intrinsic.png">',
    '<input type="IMAGE" src="assets/intrinsic.png">',
    '<svg><use href="assets/intrinsic.png#icon"/></svg>',
    '<svg><use xlink:href="assets/intrinsic.png#icon"/></svg>',
  ]) {
    const asset = path.join(root, "assets/intrinsic.png")
    fs.writeFileSync(page, reference)
    expect(packageFilesAvailable(root), reference).toBe(false)
    fs.writeFileSync(asset, "required intrinsic resource")
    expect(packageFilesAvailable(root), reference).toBe(true)
    expect(packageFilesAvailable(root), reference).toBe(true)
    fs.unlinkSync(asset)
    expect(packageFilesAvailable(root), reference).toBe(false)
  }
  fs.writeFileSync(page, '<svg><symbol id="icon"/><use href="#icon"/></svg><input type="text" src="unused.png">')
  expect(packageFilesAvailable(root)).toBe(true)
  for (const rel of ["StyleSheet", "STYLESHEET", "alternate STYLESHEET"]) {
    const css = path.join(root, "assets/essential.css")
    fs.writeFileSync(page, `<link rel="${rel}" href="assets/essential.css">`)
    expect(packageFilesAvailable(root), rel).toBe(false)
    fs.writeFileSync(css, ".page { color: red }")
    expect(packageFilesAvailable(root), rel).toBe(true)
    expect(packageFilesAvailable(root), rel).toBe(true)
    fs.unlinkSync(css)
    expect(packageFilesAvailable(root), rel).toBe(false)
  }
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
  for (const css of [
    'background-image: image-set("assets/second.png" 1x)',
    'background-image: -webkit-image-set(url("assets/second.png") 2x)',
    String.raw`background-image: image-set("assets/second\2e png" 1x type("image/png"))`,
    String.raw`background-image: image-\73 et("assets/second.png" 1x)`,
    String.raw`background-image: u\72 l(assets/second\2e png)`,
    '--hero: "assets/second.png"; background-image: image-set(var(--hero) 1x)',
    'background-image: image-set(var(--missing, "assets/second.png") 1x)',
    String.raw`--hero: "assets/second\2e png"; background-image: image-set(var(--hero) 1x)`,
    '--first: var(--second); --second: "assets/second.png"; background-image: image-set(var(--first) 1x)',
  ]) {
    fs.writeFileSync(page, `<style>.hero { ${css} }</style>`)
    expect(packageFilesAvailable(root), css).toBe(false)
    fs.writeFileSync(path.join(root, "assets/second.png"), "second image")
    expect(packageFilesAvailable(root), css).toBe(true)
    expect(packageFilesAvailable(root), css).toBe(true)
    fs.unlinkSync(path.join(root, "assets/second.png"))
    expect(packageFilesAvailable(root), css).toBe(false)
  }
  fs.writeFileSync(page, `<style>/* url(missing.png) */ .text { content: 'url(missing.png)'; background: image-set("data:image/png;base64,AA" 1x type("image/png")); }</style>`)
  expect(packageFilesAvailable(root)).toBe(true)
  fs.writeFileSync(path.join(root, "assets/defs.css"), ':root { --hero: "assets/second.png"; --label: "prose, not a file"; }')
  fs.writeFileSync(page, '<link rel="stylesheet" href="assets/defs.css"><style>.hero{background-image:image-set(var(--hero) 1x)} .label{content:var(--label)}</style>')
  expect(packageFilesAvailable(root)).toBe(false)
  fs.writeFileSync(path.join(root, "assets/second.png"), "second image")
  expect(packageFilesAvailable(root)).toBe(true)
  fs.writeFileSync(path.join(root, "assets/use.css"), '@import "defs.css"; .hero{background-image:image-set(var(--hero) 1x)}')
  fs.writeFileSync(path.join(root, "assets/defs.css"), ':root { --hero: "second.png"; }')
  fs.writeFileSync(page, '<link rel="stylesheet" href="assets/use.css">')
  // The definition is relative to the consumer stylesheet, never the HTML.
  expect(packageFilesAvailable(root)).toBe(true)
  fs.unlinkSync(path.join(root, "assets/second.png"))
  expect(packageFilesAvailable(root)).toBe(false)
  fs.writeFileSync(path.join(root, "assets/second.png"), "second image")
  expect(packageFilesAvailable(root)).toBe(true)
  fs.writeFileSync(path.join(root, "p2.html"), '<style>:root{--hero:"unused prose"}.text{content:var(--hero)}</style>')
  expect(packageFilesAvailable(root)).toBe(true) // no variable leakage between documents
  for (const scoped of [
    '<style>.label{--hero:"Not a file";content:var(--hero)}.hero{--hero:"assets/second.png";background-image:image-set(var(--hero) 1x)}</style><p class="label"></p><div class="hero"></div>',
    '<style>:root{--hero:"Not a file"}.hero{--hero:"assets/second.png";background-image:image-set(var(--hero) 1x)}</style><div class="hero"></div>',
    '<style>.hero{--hero:"Not a file";background-image:image-set(var(--hero) 1x)}</style><div class="hero" style="--hero:&quot;assets/second.png&quot;"></div>',
    '<style>:root{--source:"assets/second.png";--hero:var(--source)}.hero{--source:"Not a file";background-image:image-set(var(--hero) 1x)}</style><div class="hero"></div>',
    '<div style="--hero:&quot;assets/second.png&quot;"><div style="background-image:image-set(var(--hero) 1x)"></div></div><div style="--hero:&quot;Not a file&quot;;content:var(--hero)"></div>',
  ]) {
    fs.writeFileSync(page, scoped)
    expect(packageFilesAvailable(root), scoped).toBe(true)
    expect(packageFilesAvailable(root), scoped).toBe(true)
    fs.unlinkSync(path.join(root, "assets/second.png"))
    expect(packageFilesAvailable(root), scoped).toBe(false)
    fs.writeFileSync(path.join(root, "assets/second.png"), "second image")
    expect(packageFilesAvailable(root), scoped).toBe(true)
  }
  for (const condition of ["@media (min-width:1px)", "@supports (display:grid)", "@container (min-width:1px)"]) {
    fs.writeFileSync(page, `<style>.hero{--hero:"assets/picture.png";background-image:image-set(var(--hero) 1x)} .label{--hero:"Not a file";content:var(--hero)} ${condition}{.hero{--hero:"assets/conditional.png"}}</style><div class="hero"></div><p class="label"></p>`)
    expect(packageFilesAvailable(root), condition).toBe(false)
    fs.writeFileSync(path.join(root, "assets/conditional.png"), "conditional image")
    expect(packageFilesAvailable(root), condition).toBe(true)
    expect(packageFilesAvailable(root), condition).toBe(true)
    fs.unlinkSync(path.join(root, "assets/conditional.png"))
    expect(packageFilesAvailable(root), condition).toBe(false)
  }
  fs.writeFileSync(page, '<style>.hero{--hero:"assets/picture.png";background-image:image-set(var(--hero) 1x)} .hero:hover{--hero:"assets/hover.png"}.label:hover{--hero:"Not a file";content:var(--hero)}</style><div class="hero"></div><p class="label"></p>')
  expect(packageFilesAvailable(root)).toBe(false)
  fs.writeFileSync(path.join(root, "assets/hover.png"), "hover image")
  expect(packageFilesAvailable(root)).toBe(true)
  fs.unlinkSync(path.join(root, "assets/hover.png"))
  expect(packageFilesAvailable(root)).toBe(false)
  fs.writeFileSync(page, '<img src="/assets/picture.png">')
  expect(packageFilesAvailable(root)).toBe(false)
  fs.writeFileSync(page, '<img src="assets/picture.png">')
  expect(packageFilesAvailable(root)).toBe(true)
  fs.appendFileSync(page, '<link rel="stylesheet" href="assets/styles.css">')
  fs.writeFileSync(path.join(root, "assets/styles.css"), String.raw`@\69 mport "nested.css";`)
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
