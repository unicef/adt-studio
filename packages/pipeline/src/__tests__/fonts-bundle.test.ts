import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { BookFontRegistry } from "@adt/types"
import {
  parseCss2FontFaces,
  fetchGoogleFontFaces,
  validateGoogleFamily,
  ensureGoogleFontsCached,
  readCachedGoogleFont,
  bundleBookFontsIntoCss,
  resolveFontsCacheDir,
} from "../fonts-bundle.js"

const CSS2 = `
/* latin */
@font-face {
  font-family: 'Lexend';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/lexend/v1/abc-latin.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
/* latin-ext */
@font-face {
  font-family: 'Lexend';
  font-style: italic;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/s/lexend/v1/def-ext.woff2) format('woff2');
}
`

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-fonts-test-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("parseCss2FontFaces", () => {
  it("extracts style, weight, url and unicode-range per block", () => {
    const faces = parseCss2FontFaces(CSS2)
    expect(faces).toEqual([
      {
        style: "normal",
        weight: 400,
        url: "https://fonts.gstatic.com/s/lexend/v1/abc-latin.woff2",
        unicodeRange: "U+0000-00FF",
      },
      {
        style: "italic",
        weight: 700,
        url: "https://fonts.gstatic.com/s/lexend/v1/def-ext.woff2",
        unicodeRange: undefined,
      },
    ])
  })

  it("returns empty for non-css", () => {
    expect(parseCss2FontFaces("nope")).toEqual([])
  })
})

describe("fetchGoogleFontFaces", () => {
  it("falls back across family spec candidates", async () => {
    const fetchText = vi
      .fn()
      .mockRejectedValueOnce(new Error("400"))
      .mockRejectedValueOnce(new Error("400"))
      .mockResolvedValueOnce(CSS2)
    const faces = await fetchGoogleFontFaces("Lexend", { fetchText })
    expect(faces).toHaveLength(2)
    expect(fetchText).toHaveBeenCalledTimes(3)
  })

  it("throws when every candidate fails", async () => {
    const fetchText = vi.fn().mockRejectedValue(new Error("offline"))
    await expect(fetchGoogleFontFaces("Nope", { fetchText })).rejects.toThrow("offline")
  })
})

describe("validateGoogleFamily", () => {
  it("true for resolvable families, false otherwise", async () => {
    expect(await validateGoogleFamily("Lexend", { fetchText: async () => CSS2 })).toBe(true)
    expect(
      await validateGoogleFamily("Nope", {
        fetchText: async () => {
          throw new Error("400")
        },
      }),
    ).toBe(false)
  })
})

describe("ensureGoogleFontsCached", () => {
  const fetchers = () => ({
    fetchText: vi.fn().mockResolvedValue(CSS2),
    fetchBytes: vi.fn().mockResolvedValue(Buffer.from("woff2-bytes")),
  })

  it("downloads missing families and writes a manifest", async () => {
    const f = fetchers()
    const result = await ensureGoogleFontsCached(["Lexend"], tmpDir, f)
    expect(result.failed).toEqual([])
    expect(result.cached).toHaveLength(1)
    expect(result.cached[0].faces).toHaveLength(2)
    const entry = readCachedGoogleFont(tmpDir, "Lexend")
    expect(entry).not.toBeNull()
    expect(fs.existsSync(path.join(entry!.dir, entry!.faces[0].file))).toBe(true)
  })

  it("is a no-op on cache hit (zero network)", async () => {
    await ensureGoogleFontsCached(["Lexend"], tmpDir, fetchers())
    const f2 = fetchers()
    const result = await ensureGoogleFontsCached(["Lexend"], tmpDir, f2)
    expect(result.cached).toHaveLength(1)
    expect(f2.fetchText).not.toHaveBeenCalled()
    expect(f2.fetchBytes).not.toHaveBeenCalled()
  })

  it("reports failures without throwing", async () => {
    const result = await ensureGoogleFontsCached(["Broken"], tmpDir, {
      fetchText: async () => {
        throw new Error("offline")
      },
    })
    expect(result.cached).toEqual([])
    expect(result.failed).toEqual([{ family: "Broken", error: "offline" }])
  })
})

describe("resolveFontsCacheDir", () => {
  it("defaults to a hidden dir inside the books dir", () => {
    const dir = resolveFontsCacheDir(tmpDir)
    expect(dir).toBe(path.join(path.resolve(tmpDir), ".fonts-cache"))
  })
})

describe("bundleBookFontsIntoCss", () => {
  function setupAdtDir(): string {
    const adtDir = path.join(tmpDir, "adt")
    fs.mkdirSync(path.join(adtDir, "assets"), { recursive: true })
    fs.writeFileSync(path.join(adtDir, "assets", "fonts.css"), "/* base */")
    fs.writeFileSync(
      path.join(adtDir, "pg001.html"),
      `<p style="font-family:'Minha Fonte',serif">x</p>`,
    )
    return adtDir
  }

  function uploadRegistry(role: "body" | "unassigned" = "unassigned"): BookFontRegistry {
    return {
      fonts: [
        {
          id: "minha-fonte",
          family: "Minha Fonte",
          source: "upload",
          faces: [{ file: "minha-fonte-400.woff2", weight: 400, style: "normal", format: "woff2" }],
          role,
          roleLockedByUser: false,
        },
      ],
    }
  }

  it("copies referenced upload fonts and appends @font-face", async () => {
    const adtDir = setupAdtDir()
    const bookFontsDir = path.join(tmpDir, "fonts")
    fs.mkdirSync(bookFontsDir, { recursive: true })
    fs.writeFileSync(path.join(bookFontsDir, "minha-fonte-400.woff2"), "bytes")

    const bundled = await bundleBookFontsIntoCss(adtDir, uploadRegistry(), {
      bookFontsDir,
      googleCacheDir: path.join(tmpDir, ".fonts-cache"),
    })

    expect(bundled).toEqual(["Minha Fonte"])
    expect(fs.existsSync(path.join(adtDir, "assets", "fonts", "minha-fonte-400.woff2"))).toBe(true)
    const css = fs.readFileSync(path.join(adtDir, "assets", "fonts.css"), "utf-8")
    expect(css).toContain("font-family: 'Minha Fonte';")
    expect(css).toContain("url('./fonts/minha-fonte-400.woff2') format('woff2')")
  })

  it("skips fonts that are neither referenced nor role-assigned", async () => {
    const adtDir = setupAdtDir()
    fs.writeFileSync(path.join(adtDir, "pg001.html"), "<p>no fonts here</p>")
    const bundled = await bundleBookFontsIntoCss(adtDir, uploadRegistry("unassigned"), {
      bookFontsDir: path.join(tmpDir, "fonts"),
      googleCacheDir: path.join(tmpDir, ".fonts-cache"),
    })
    expect(bundled).toEqual([])
  })

  it("bundles google fonts from the cache and fails loudly when unreachable", async () => {
    const adtDir = setupAdtDir()
    const cacheDir = path.join(tmpDir, ".fonts-cache")
    const registry: BookFontRegistry = {
      fonts: [
        {
          id: "lexend",
          family: "Lexend",
          source: "google",
          googleKey: "lexend",
          faces: [],
          role: "body",
          roleLockedByUser: false,
        },
      ],
    }

    await expect(
      bundleBookFontsIntoCss(adtDir, registry, {
        bookFontsDir: path.join(tmpDir, "fonts"),
        googleCacheDir: cacheDir,
        fetchers: {
          fetchText: async () => {
            throw new Error("offline")
          },
        },
      }),
    ).rejects.toThrow(/could not be downloaded/)

    await ensureGoogleFontsCached(["Lexend"], cacheDir, {
      fetchText: async () => CSS2,
      fetchBytes: async () => Buffer.from("bytes"),
    })
    const bundled = await bundleBookFontsIntoCss(adtDir, registry, {
      bookFontsDir: path.join(tmpDir, "fonts"),
      googleCacheDir: cacheDir,
      fetchers: {
        fetchText: async () => {
          throw new Error("must not fetch")
        },
      },
    })
    expect(bundled).toEqual(["Lexend"])
    const css = fs.readFileSync(path.join(adtDir, "assets", "fonts.css"), "utf-8")
    expect(css).toContain("font-family: 'Lexend';")
    expect(css).toContain("unicode-range: U+0000-00FF;")
  })
})
