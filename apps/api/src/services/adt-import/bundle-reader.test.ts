import { createHash } from "node:crypto"

import { describe, expect, it } from "vitest"
import { strToU8, zipSync } from "fflate"
import { canonicalJson } from "@adt/types/fingerprint"
import {
  ADT_BUNDLE_READER_LIMITS,
  AdtBundleReadError,
  readAdtBundle,
} from "./bundle-reader.js"

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex")
}

function json(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value))
}

function baseFiles(root = ""): Record<string, Uint8Array> {
  const sourceTexts = { p1: "Hello", p1_easy_read: "Hi" }
  const pageHtml = strToU8("<!doctype html><p>Hello</p>")
  const manifest = {
    formatVersion: 1,
    book: { label: "sample-book" },
    languages: { source: "en", output: ["en", "es"] },
    baselines: {
      glossary: 2,
      tocGeneration: 3,
      textCatalogTranslations: { es: 4 },
    },
    textCatalog: { version: 5, idFingerprint: sha256(canonicalJson(["p1"])) },
    translatableText: {
      idFingerprint: sha256(canonicalJson(["p1", "p1_easy_read"])),
    },
    frozen: {
      sourceTextsFingerprint: sha256(canonicalJson(sourceTexts)),
      pageHtmlFingerprints: { "index.html": sha256(pageHtml) },
    },
  }
  return {
    [`${root}manifest.json`]: json(manifest),
    [`${root}content/toc.json`]: json([
      {
        section_id: "s1",
        href: "index.html",
        title: "One",
        chapter_id: "c1",
        level: 1,
      },
    ]),
    [`${root}content/i18n/en/texts.json`]: json(sourceTexts),
    [`${root}content/i18n/es/texts.json`]: json({ p1: "Hola", p1_easy_read: "Buenas" }),
    [`${root}content/i18n/en/glossary.json`]: json({
      Soil: { word: "Soil", definition: "Earth", variations: [], emoji: "", id: "gl001" },
    }),
    [`${root}index.html`]: pageHtml,
    [`${root}assets/config.json`]: json({
      title: "Sample Book",
      features: { glossary: true, readAloud: false },
    }),
    [`${root}content/pages.json`]: json([
      { section_id: "s1", href: "index.html" },
    ]),
    [`${root}cover.png`]: new Uint8Array([137, 80, 78, 71]),
    [`${root}assets/ignored.bin`]: new Uint8Array([1, 2, 3]),
  }
}

function legacyFiles(root = "legacy-book/"): Record<string, Uint8Array> {
  return {
    [`${root}assets/config.json`]: json({
      title: "Legacy Book",
      bundleVersion: "1",
      languages: { available: ["en"], default: "en" },
      features: { readAloud: false },
    }),
    [`${root}content/pages.json`]: json([
      { section_id: "pg001_sec001", href: "index.html" },
    ]),
    [`${root}content/toc.json`]: json([
      {
        section_id: "pg001_sec001",
        href: "index.html",
        title: "Start",
        chapter_id: "pg001_n001",
      },
    ]),
    [`${root}content/i18n/en/texts.json`]: json({ pg001_n001: "Hello" }),
    [`${root}content/i18n/en/glossary.json`]: json({}),
    [`${root}index.html`]: strToU8(
      '<div id="content"><section data-section-id="pg001_sec001" data-section-type="content"><p data-id="pg001_n001">Hello</p></section></div>',
    ),
  }
}

describe("readAdtBundle", () => {
  it("surfaces a declared fixed-layout presentation", () => {
    const files = baseFiles()
    files["assets/config.json"] = json({
      title: "Sample Book",
      bundleVersion: "1",
      languages: { available: ["en", "es"], default: "en" },
      features: { glossary: true },
      fixedLayout: true,
    })
    expect(readAdtBundle(Buffer.from(zipSync(files))).presentation)
      .toEqual({ fixedLayout: true })
  })

  it("reads supported projections from a root archive", () => {
    const bundle = readAdtBundle(Buffer.from(zipSync(baseFiles())))
    expect(bundle.root).toBe("")
    expect(bundle.manifest.book.label).toBe("sample-book")
    expect(bundle.title).toBe("Sample Book")
    expect(bundle.pageCount).toBe(1)
    expect(bundle.pages).toEqual([{ section_id: "s1", href: "index.html" }])
    expect(bundle.pageHtml["index.html"]).toContain("Hello")
    expect(bundle.runtimeFeatures.glossary).toBe(true)
    expect(bundle.presentation).toEqual({ fixedLayout: false })
    expect(bundle.cover?.mimeType).toBe("image/png")
    expect(bundle.toc[0].section_id).toBe("s1")
    expect(bundle.glossaries.en.Soil.id).toBe("gl001")
    expect(bundle.texts.es.p1).toBe("Hola")
    expect(bundle.ignoredEdits).toEqual({
      sourceTextsChanged: false,
      pageHtmlChanged: [],
      pageHtmlMissing: [],
    })
  })

  it("accepts one wrapper directory", () => {
    const bundle = readAdtBundle(Buffer.from(zipSync(baseFiles("sample/"))))
    expect(bundle.root).toBe("sample/")
  })

  it("normalizes a recognized legacy Studio export without a manifest", () => {
    const bundle = readAdtBundle(Buffer.from(zipSync(legacyFiles())))

    expect(bundle.sourceFormat).toBe("legacy-studio-export")
    expect(bundle.root).toBe("legacy-book/")
    expect(bundle.manifest.book).toEqual({ label: "legacy-book", title: "Legacy Book" })
    expect(bundle.manifest.languages).toEqual({ source: "en", output: ["en"] })
    expect(bundle.pages).toHaveLength(1)
    expect(bundle.texts.en.pg001_n001).toBe("Hello")
  })

  it("reports a specific error for an incomplete legacy Studio export", () => {
    const files = legacyFiles()
    delete files["legacy-book/assets/config.json"]

    expect(() => readAdtBundle(Buffer.from(zipSync(files))))
      .toThrow(/Legacy ADT export is missing assets\/config\.json/)
  })

  it("uses semantic JSON hashing for frozen source text", () => {
    const files = baseFiles()
    files["content/i18n/en/texts.json"] = strToU8('{"p1_easy_read":"Hi", "p1":"Hello"}')
    expect(readAdtBundle(Buffer.from(zipSync(files))).ignoredEdits.sourceTextsChanged).toBe(false)

    files["content/i18n/en/texts.json"] = json({ p1: "Edited", p1_easy_read: "Hi" })
    expect(readAdtBundle(Buffer.from(zipSync(files))).ignoredEdits.sourceTextsChanged).toBe(true)
  })

  it("detects changed frozen HTML and rejects missing page HTML", () => {
    const changed = baseFiles()
    changed["index.html"] = strToU8("changed")
    expect(readAdtBundle(Buffer.from(zipSync(changed))).ignoredEdits.pageHtmlChanged)
      .toEqual(["index.html"])

    const missing = baseFiles()
    delete missing["index.html"]
    expect(() => readAdtBundle(Buffer.from(zipSync(missing))))
      .toThrow(/missing page HTML: index.html/)
  })

  it("rejects missing projections and ambiguous manifests", () => {
    const missing = baseFiles()
    delete missing["content/i18n/es/texts.json"]
    expect(() => readAdtBundle(Buffer.from(zipSync(missing))))
      .toThrow(/missing required file.*es\/texts\.json/)

    const ambiguous = baseFiles()
    ambiguous["nested/manifest.json"] = ambiguous["manifest.json"]
    expect(() => readAdtBundle(Buffer.from(zipSync(ambiguous))))
      .toThrow(/multiple manifest/)
  })

  it("rejects unsafe paths before reading selected content", () => {
    const files = baseFiles()
    files["../outside.txt"] = strToU8("no")
    expect(() => readAdtBundle(Buffer.from(zipSync(files))))
      .toThrow(/unsafe path/)
  })

  it("rejects section ids that could escape the packaged book directory", () => {
    const files = baseFiles()
    files["content/pages.json"] = json([
      { section_id: "../../other-book/adt/index", href: "index.html" },
    ])

    expect(() => readAdtBundle(Buffer.from(zipSync(files))))
      .toThrow(/section_id must be a filesystem-safe identifier/)
  })

  it("rejects oversized selected files", () => {
    const files = baseFiles()
    files["content/toc.json"] = new Uint8Array(ADT_BUNDLE_READER_LIMITS.jsonBytes + 1)
    expect(() => readAdtBundle(Buffer.from(zipSync(files))))
      .toThrow(/exceeds its size limit/)
  })

  it("reports invalid ZIPs with a stable error type", () => {
    expect(() => readAdtBundle(Buffer.from("not a zip"))).toThrow(AdtBundleReadError)
  })

  it("rejects unsafe locale keys before building locale-indexed maps", () => {
    const files = baseFiles()
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]))
    manifest.languages = { source: "__proto__", output: ["__proto__"] }
    files["manifest.json"] = json(manifest)
    expect(() => readAdtBundle(Buffer.from(zipSync(files)))).toThrow(/locale code/)
  })
})
