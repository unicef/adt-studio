import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  extractWoff2Urls,
  linkWoff2Urls,
  buildLinkedGoogleFontFaceCss,
  bundleGoogleFontsIntoCss,
} from "../google-fonts-bundle.js"

// A trimmed css2 response shape (two unicode subsets, like Google returns).
const SAMPLE_CSS = `/* latin-ext */
@font-face {
  font-family: 'Mouse Memoirs';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/mousememoirs/v19/AAA.woff2) format('woff2');
  unicode-range: U+0100-02BA;
}
/* latin */
@font-face {
  font-family: 'Mouse Memoirs';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/mousememoirs/v19/BBB.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}`

const tmpDirs: string[] = []
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-gfont-test-"))
  tmpDirs.push(dir)
  return dir
}
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true })
})

describe("extractWoff2Urls", () => {
  it("returns each distinct woff2 url", () => {
    expect(extractWoff2Urls(SAMPLE_CSS)).toEqual([
      "https://fonts.gstatic.com/s/mousememoirs/v19/AAA.woff2",
      "https://fonts.gstatic.com/s/mousememoirs/v19/BBB.woff2",
    ])
  })
})

describe("linkWoff2Urls", () => {
  it("rewrites mapped urls to local ./fonts/ paths and leaves unmapped ones", () => {
    const map = new Map([["https://fonts.gstatic.com/s/mousememoirs/v19/AAA.woff2", "gf-aaa.woff2"]])
    const out = linkWoff2Urls(SAMPLE_CSS, map)
    expect(out).toContain("url('./fonts/gf-aaa.woff2')")
    // BBB wasn't in the map → left as the original remote url.
    expect(out).toContain("/BBB.woff2)")
  })
})

describe("buildLinkedGoogleFontFaceCss", () => {
  it("downloads every woff2 to outFontsDir and links them with no remaining remote urls", async () => {
    const outFontsDir = path.join(makeTmpDir(), "fonts")
    const css = await buildLinkedGoogleFontFaceCss(["Mouse Memoirs"], outFontsDir, {
      cacheDir: makeTmpDir(),
      fetchText: async () => SAMPLE_CSS,
      fetchBytes: async (u) => Buffer.from(`bytes:${u}`),
    })
    expect(css).toContain("@font-face")
    expect(css).toContain("url('./fonts/gf-")
    expect(css).not.toContain("https://fonts.gstatic.com")
    // unicode-range preserved so subset selection still works.
    expect(css).toContain("unicode-range")
    // Two woff2 subsets written as files.
    expect(fs.readdirSync(outFontsDir).filter((f) => f.endsWith(".woff2"))).toHaveLength(2)
  })

  it("links the woff2 that succeed even if one fails (partial success)", async () => {
    const outFontsDir = path.join(makeTmpDir(), "fonts")
    const css = await buildLinkedGoogleFontFaceCss(["Mouse Memoirs"], outFontsDir, {
      cacheDir: makeTmpDir(),
      fetchText: async () => SAMPLE_CSS,
      // AAA succeeds, BBB fails.
      fetchBytes: async (u) => {
        if (u.includes("BBB")) throw new Error("boom")
        return Buffer.from(`bytes:${u}`)
      },
    })
    // The successful subset is linked…
    expect(css).toContain("url('./fonts/gf-")
    // …and the failed one is left as its remote url (works online).
    expect(css).toContain("/BBB.woff2)")
    expect(fs.readdirSync(outFontsDir).filter((f) => f.endsWith(".woff2"))).toHaveLength(1)
  })

  it("returns '' (graceful) when the fetch fails", async () => {
    const css = await buildLinkedGoogleFontFaceCss(["Mouse Memoirs"], path.join(makeTmpDir(), "fonts"), {
      cacheDir: makeTmpDir(),
      fetchText: async () => {
        throw new Error("offline")
      },
      fetchBytes: async () => Buffer.from(""),
    })
    expect(css).toBe("")
  })

  it("returns '' for an empty family list", async () => {
    expect(await buildLinkedGoogleFontFaceCss([], path.join(makeTmpDir(), "fonts"))).toBe("")
  })
})

describe("bundleGoogleFontsIntoCss", () => {
  function setupBook(pageHtml: string): string {
    const adtDir = makeTmpDir()
    fs.mkdirSync(path.join(adtDir, "assets"), { recursive: true })
    fs.writeFileSync(
      path.join(adtDir, "assets", "fonts.css"),
      "@font-face{font-family:'Merriweather';src:url('./fonts/M.woff2') format('woff2');}",
    )
    fs.writeFileSync(path.join(adtDir, "pg001_sec001.html"), pageHtml)
    return adtDir
  }
  const deps = {
    fetchText: async () => SAMPLE_CSS,
    fetchBytes: async (u: string) => Buffer.from(`bytes:${u}`),
  }

  it("appends linked @font-face for fonts the pages use and writes the woff2 files", async () => {
    const adtDir = setupBook(
      `<p><span style="font-family:'Mouse Memoirs',Merriweather,serif">Hi</span></p>`,
    )
    const bundled = await bundleGoogleFontsIntoCss(adtDir, { ...deps, cacheDir: makeTmpDir() })
    expect(bundled).toEqual(["Mouse Memoirs"])
    const css = fs.readFileSync(path.join(adtDir, "assets", "fonts.css"), "utf-8")
    expect(css).toContain("url('./fonts/gf-")
    expect(css).not.toContain("base64")
    // Original Merriweather rule is preserved (untouched by this step).
    expect(css).toContain("Merriweather")
    // The referenced woff2 subsets were written into assets/fonts/.
    expect(
      fs.readdirSync(path.join(adtDir, "assets", "fonts")).filter((f) => f.endsWith(".woff2")),
    ).toHaveLength(2)
  })

  it("does nothing when no page references a registered Google font", async () => {
    const adtDir = setupBook(`<p><span style="font-family:Palatino,serif">Hi</span></p>`)
    const before = fs.readFileSync(path.join(adtDir, "assets", "fonts.css"), "utf-8")
    const bundled = await bundleGoogleFontsIntoCss(adtDir, { ...deps, cacheDir: makeTmpDir() })
    expect(bundled).toEqual([])
    expect(fs.readFileSync(path.join(adtDir, "assets", "fonts.css"), "utf-8")).toBe(before)
  })
})
