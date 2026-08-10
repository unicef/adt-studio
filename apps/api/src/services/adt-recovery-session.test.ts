import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"

import { afterEach, describe, expect, it } from "vitest"
import { strToU8, unzipSync, zipSync } from "fflate"
import { createBookStorage } from "@adt/storage"
import { canonicalJson } from "@adt/types/fingerprint"

import { listBooks } from "./book-service.js"
import {
  ADT_IMPORT_PROJECTION_VERSION,
  ADT_RECOVERY_MARKER,
  assessAdtImportCompatibility,
  createAdtRecoverySession,
  deleteAdtRecoverySession,
  ensureImportedAdtProjectProjection,
  exportAdtRecoverySession,
  getAdtRecoverySession,
  getImportedAdtFeaturesNeedingRegeneration,
  listAdtRecoverySessions,
  previewAdtRecoveryImport,
  restoreImportedAdtPresentation,
  syncAdtRecoveryPreview,
} from "./adt-recovery-session.js"

const temporaryRoots: string[] = []
const json = (value: unknown) => strToU8(JSON.stringify(value))
const sha256 = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex")
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
)

function makeBundle(): Buffer {
  const sourceTexts = {
    pg001_n001: "Old text",
    pg001_n002: "Deleted outside Studio",
    gl001: "Hyena",
    gl001_def: "An animal",
  }
  const files = {
    "manifest.json": json({
      formatVersion: 1,
      book: { label: "hyena-and-raven", title: "Hyena and Raven" },
      languages: { source: "en", output: ["en", "es"] },
      baselines: {
        glossary: 1,
        tocGeneration: 1,
        textCatalogTranslations: { es: 1 },
      },
      textCatalog: { version: 1, idFingerprint: sha256(Object.keys(sourceTexts)) },
      translatableText: { idFingerprint: sha256(Object.keys(sourceTexts)) },
    }),
    "assets/config.json": json({
      title: "Hyena and Raven",
      features: { readAloud: true, highlight: true },
    }),
    "assets/offline-preloader.js": strToU8(`(function () {
  var INLINE = {};
  var BASE_DIR = "";
})();
`),
    "assets/scorm.js": strToU8("void window.parent.API"),
    "assets/book-showcase.css": strToU8(".storybook-page { color: rebeccapurple; }"),
    "assets/book-showcase.js": strToU8("window.__bookShowcase = true"),
    "showcase-assets/paper.png": onePixelPng,
    "content/pages.json": json([{ section_id: "pg001_sec001", href: "index.html", page_number: 1 }]),
    "content/toc.json": json([{ section_id: "pg001_sec001", href: "index.html", title: "Story", chapter_id: "c1" }]),
    "content/i18n/en/texts.json": json(sourceTexts),
    "content/i18n/en/audios.json": json({ pg001_n001: "original.mp3" }),
    "content/i18n/en/audio/original.mp3": strToU8("original audio"),
    "content/i18n/en/timecode/timecode_output.json": json({
      pg001_n001: {
        timecodes: [null, { word_timestamps: [{ text: "Edited", start: 0, end: 0.4 }] }],
      },
    }),
    "content/i18n/es/texts.json": json({
      pg001_n001: "Texto anterior",
      pg001_n002: "Eliminado fuera de Studio",
      gl001: "Hiena",
      gl001_def: "Un animal",
    }),
    "content/i18n/en/glossary.json": json({
      Hyena: { word: "Hyena", definition: "An animal", variations: [], emoji: "", id: "gl001" },
    }),
    "content/i18n/es/glossary.json": json({
      Hiena: { word: "Hiena", definition: "Un animal", variations: [], emoji: "", id: "gl001" },
    }),
    "images/pg001_im001.png": onePixelPng,
    "index.html": strToU8(`<!doctype html><html><head>
      <link href="./assets/book-showcase.css" rel="stylesheet">
    </head><body>
      <main id="content">
        <section data-section-id="pg001_sec001" data-section-type="text_and_single_image">
          <p data-id="pg001_n001">Edited outside Studio</p>
          <p data-id="new-unstable-id">New text without a catalog id</p>
          <img data-id="pg001_im001" src="images/pg001_im001.png" alt="A raven">
        </section>
      </main>
      <script src="./assets/book-showcase.js"></script>
    </body></html>`),
  }
  return Buffer.from(zipSync(files))
}

function makeBundleWithUnchangedHtmlCatalog(): Buffer {
  const files = unzipSync(makeBundle())
  files["content/i18n/en/texts.json"] = json({
    pg001_n001: "Edited outside Studio",
    "new-unstable-id": "New text without a catalog id",
    pg001_im001: "A raven",
    gl001: "Hyena",
    gl001_def: "An animal",
  })
  return Buffer.from(zipSync(files))
}

function makeBundleWithTwoSectionsOnOnePage(): Buffer {
  const files = unzipSync(makeBundle())
  files["content/pages.json"] = json([
    { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
    { section_id: "pg001_sec002", href: "pg001_sec002.html", page_number: 1 },
  ])
  files["pg001_sec002.html"] = strToU8(`<!doctype html><html><body>
    <main id="content">
      <section data-section-id="pg001_sec002" data-section-type="content">
        <p data-id="pg001_n003">Second section on the same page</p>
      </section>
    </main>
  </body></html>`)
  return Buffer.from(zipSync(files))
}

function makeCurrentBundleWithCanonicalImageDescription(): Buffer {
  const files = unzipSync(makeBundleWithUnchangedHtmlCatalog())
  const sourceTexts = JSON.parse(new TextDecoder().decode(
    files["content/i18n/en/texts.json"],
  )) as Record<string, string>
  sourceTexts.pg001_im001 = "A detailed description stored in the text catalog"
  files["content/i18n/en/texts.json"] = json(sourceTexts)
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]))
  manifest.editingContract = {
    version: 1,
    pageOrder: [{ sectionId: "pg001_sec001", href: "index.html" }],
    pageDataIds: {
      "index.html": ["pg001_n001", "new-unstable-id", "pg001_im001"],
    },
  }
  manifest.frozen = {
    sourceTextsFingerprint: sha256(sourceTexts),
    pageHtmlFingerprints: {
      "index.html": createHash("sha256").update(files["index.html"]).digest("hex"),
    },
  }
  files["manifest.json"] = json(manifest)
  return Buffer.from(zipSync(files))
}

function makeCurrentBundleWithLegacyQuizMarkup(): Buffer {
  const fingerprint = "0".repeat(64)
  return Buffer.from(zipSync({
    "manifest.json": json({
      formatVersion: 1,
      editingContract: {
        version: 1,
        pageOrder: [{ sectionId: "qz001", href: "index.html" }],
        pageDataIds: { "index.html": [] },
      },
      book: { label: "quiz-book", title: "Quiz Book" },
      languages: { source: "en", output: ["en"] },
      baselines: { glossary: null, tocGeneration: null, textCatalogTranslations: {} },
      textCatalog: { version: 1, idFingerprint: fingerprint },
      translatableText: { idFingerprint: fingerprint },
    }),
    "assets/config.json": json({ title: "Quiz Book", features: { activities: true } }),
    "content/pages.json": json([{ section_id: "qz001", href: "index.html" }]),
    "content/toc.json": json([]),
    "content/i18n/en/texts.json": json({ qz001_que: "Question" }),
    "index.html": strToU8(`<!doctype html><div id="content">
      <section data-id="qz001" data-section-type="activity_quiz">
        <p data-id="qz001_que">Question</p>
      </section>
    </div>`),
  }))
}

function makeCurrentBundleWithExternallyAddedPage(): Buffer {
  const sourceTexts = {
    pg001_t001: "Original page",
    pg002_t001: "Page added outside Studio",
  }
  const pageOneHtml = `<!doctype html><html><body><main id="content">
    <section data-section-id="pg001_sec001" data-section-type="content">
      <p data-id="pg001_t001">Original page</p>
    </section>
  </main></body></html>`
  const pageTwoHtml = `<!doctype html><html><body><main id="content">
    <section data-section-id="pg002_sec001" data-section-type="content">
      <p data-id="pg002_t001">Page added outside Studio</p>
    </section>
  </main></body></html>`
  return Buffer.from(zipSync({
    "manifest.json": json({
      formatVersion: 1,
      editingContract: {
        version: 2,
        pageOrder: [
          { sectionId: "pg001_sec001", href: "index.html" },
          { sectionId: "pg002_sec001", href: "pg002_sec001.html" },
        ],
        pageDataIds: {
          "index.html": ["pg001_t001"],
          "pg002_sec001.html": ["pg002_t001"],
        },
        activities: [],
        nonActivities: [],
      },
      book: { label: "expanded-book", title: "Expanded Book" },
      languages: { source: "en", output: ["en"] },
      baselines: { glossary: null, tocGeneration: null, textCatalogTranslations: {} },
      textCatalog: { version: 1, idFingerprint: sha256(Object.keys(sourceTexts)) },
      translatableText: { idFingerprint: sha256(Object.keys(sourceTexts)) },
      frozen: {
        sourceTextsFingerprint: sha256(sourceTexts),
        // A new page deliberately has no frozen fingerprint: it did not exist
        // in the Studio export that the external editor started from.
        pageHtmlFingerprints: {
          "index.html": createHash("sha256").update(pageOneHtml).digest("hex"),
        },
      },
    }),
    "assets/config.json": json({
      title: "Expanded Book",
      languages: { available: ["en"], default: "en" },
      features: {},
    }),
    "content/pages.json": json([
      { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
      { section_id: "pg002_sec001", href: "pg002_sec001.html", page_number: 2 },
    ]),
    "content/toc.json": json([]),
    "content/i18n/en/texts.json": json(sourceTexts),
    "index.html": strToU8(pageOneHtml),
    "pg002_sec001.html": strToU8(pageTwoHtml),
  }))
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe("ADT recovery workspace", () => {
  it("reports recovered storyboard pages rather than section entries", () => {
    const bundle = makeBundleWithTwoSectionsOnOnePage()

    expect(previewAdtRecoveryImport(bundle).pageCount).toBe(1)

    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-recovery-page-count-"))
    temporaryRoots.push(booksDir)
    const session = createAdtRecoverySession(bundle, booksDir, "multi-section.zip")
    expect(session.pageCount).toBe(1)
    const storage = createBookStorage(session.label, booksDir)
    try {
      expect(storage.getPages()).toHaveLength(1)
    } finally {
      storage.close()
    }
  })

  it("accepts quiz pages emitted before Studio added data-section-id", () => {
    expect(assessAdtImportCompatibility(makeCurrentBundleWithLegacyQuizMarkup()))
      .toEqual({ supported: true, issues: [] })
  })

  it("imports pages added outside Studio when every page index is updated", () => {
    const bundle = makeCurrentBundleWithExternallyAddedPage()
    expect(assessAdtImportCompatibility(bundle)).toEqual({ supported: true, issues: [] })

    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-recovery-added-page-"))
    temporaryRoots.push(booksDir)
    const session = createAdtRecoverySession(bundle, booksDir, "expanded-book.zip")

    expect(session).toMatchObject({
      title: "Expanded Book",
      pageCount: 2,
      recoveredHtmlEntryCount: 2,
    })
    expect(createBookStorage(session.label, booksDir).getPages()).toMatchObject([
      { pageId: "pg001", pageNumber: 1 },
      { pageId: "pg002", pageNumber: 2 },
    ])
  })

  it("rejects folders outside the canonical ADT bundle root", () => {
    expect(assessAdtImportCompatibility(makeBundle())).toMatchObject({
      supported: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "unexpected-bundle-entry",
          pageHref: "showcase-assets/paper.png",
        }),
      ]),
    })
  })

  it("creates a hidden book using edited HTML as the source speech catalog", { timeout: 15_000 }, () => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-recovery-"))
    temporaryRoots.push(booksDir)

    const session = createAdtRecoverySession(makeBundle(), booksDir, "hyena.zip")
    const bookDir = path.join(booksDir, session.label)
    expect(session).toMatchObject({
      title: "Hyena and Raven",
      sourceLanguage: "en",
      outputLanguages: ["es"],
      pageCount: 1,
      recoveredHtmlEntryCount: 3,
      ignoredHtmlEntryCount: 0,
      contentChanged: true,
    })
    expect(fs.existsSync(path.join(bookDir, ADT_RECOVERY_MARKER))).toBe(true)
    expect(getAdtRecoverySession(session.label, booksDir)).toMatchObject({
      label: session.label,
      sourceFileName: "hyena.zip",
      title: "Hyena and Raven",
      pageCount: 1,
      tocEntryCount: 1,
      glossaryEntryCount: 1,
      translationLanguageCount: 1,
      runtimeFeatures: { readAloud: true, highlight: true },
      contentChanged: true,
    })
    expect(listAdtRecoverySessions(booksDir).map(({ label }) => label))
      .toEqual([session.label])
    expect(fs.existsSync(path.join(bookDir, "adt", "index.html"))).toBe(true)
    expect(fs.readFileSync(path.join(bookDir, "adt", "index.html"), "utf8"))
      .not.toContain("data-adt-recovery-storage-shim")
    expect(fs.readFileSync(path.join(bookDir, "adt", "assets", "scorm.js"), "utf8"))
      .toBe("void window.parent.API")
    expect(listBooks(booksDir)).toEqual([])
    expect(fs.readFileSync(path.join(bookDir, "config.yaml"), "utf8"))
      .toContain("- en")

    expect(syncAdtRecoveryPreview(session.label, booksDir)).toMatchObject({
      audioCount: 1,
      languages: ["en"],
    })
    expect(fs.readFileSync(
      path.join(bookDir, "adt", "content", "i18n", "en", "audio", "original.mp3"),
      "utf8",
    )).toBe("original audio")
    const untouchedExport = unzipSync(exportAdtRecoverySession(session.label, booksDir))
    expect(new TextDecoder().decode(untouchedExport["content/i18n/en/audio/original.mp3"]))
      .toBe("original audio")
    expect(JSON.parse(new TextDecoder().decode(untouchedExport["content/i18n/en/audios.json"])))
      .toEqual({ pg001_n001: "original.mp3" })

    const storage = createBookStorage(session.label, booksDir)
    try {
      const catalog = storage.getLatestNodeData("text-catalog", "book")?.data as {
        entries: Array<{ id: string; text: string }>
      }
      expect(catalog.entries).toContainEqual({ id: "pg001_n001", text: "Edited outside Studio" })
      expect(catalog.entries.find((entry) => entry.id === "pg001_n002")).toBeUndefined()
      expect(catalog.entries).toContainEqual({ id: "new-unstable-id", text: "New text without a catalog id" })
      expect(catalog.entries).toContainEqual({ id: "pg001_im001", text: "A raven" })
      expect(catalog.entries).toContainEqual({ id: "gl001", text: "Hyena" })
      expect(storage.getLatestNodeData("text-catalog-translation", "es")).not.toBeNull()
      expect(storage.getLatestNodeData("web-rendering", "pg001")?.data).toMatchObject({
        sections: [expect.objectContaining({
          sectionType: "text_and_single_image",
          html: expect.stringMatching(/^<section/),
        })],
      })
      expect(storage.getLatestNodeData("page-sectioning", "pg001")?.data).toMatchObject({
        sections: [expect.objectContaining({
          sectionId: "pg001_sec001",
          nodes: expect.arrayContaining([
            expect.objectContaining({ nodeId: "c1", role: "heading", text: "Story" }),
            expect.objectContaining({ nodeId: "pg001_n001", role: "text", text: "Edited outside Studio" }),
            expect.objectContaining({ nodeId: "pg001_im001", role: "image" }),
          ]),
        })],
      })
      expect(storage.getLatestNodeData("image-captioning", "pg001")?.data).toMatchObject({
        captions: [expect.objectContaining({ imageId: "pg001_im001", caption: "A raven", source: "manual" })],
      })
      expect(storage.getImageMeta("pg001_im001")).toMatchObject({ pageId: "pg001" })
      expect(storage.getImageMeta("pg001_page")).toMatchObject({ pageId: "pg001" })
      expect(path.basename(storage.getImageMeta("pg001_im001")!.relativePath)).toBe("pg001_im001.png")
      expect(fs.existsSync(path.join(bookDir, storage.getImageMeta("pg001_im001")!.relativePath))).toBe(true)
      expect(storage.getLatestNodeData("toc-generation", "book")?.data).toMatchObject({
        entries: [expect.objectContaining({ sectionId: "pg001_sec001", title: "Story" })],
      })
      expect(storage.getLatestNodeData("glossary", "book")?.data).toMatchObject({
        items: [expect.objectContaining({ id: "gl001", word: "Hyena", source: "manual" })],
      })
      expect(storage.getStepRuns()).toEqual(expect.arrayContaining([
        expect.objectContaining({ step: "catalog-translation", status: "done" }),
        expect.objectContaining({ step: "image-translation", status: "skipped" }),
        expect.objectContaining({ step: "glossary", status: "done" }),
        expect.objectContaining({ step: "image-captioning", status: "done" }),
        expect.objectContaining({ step: "toc-generation", status: "done" }),
      ]))
      expect(storage.getPages()).toEqual([
        expect.objectContaining({ pageId: "pg001", pageNumber: 1 }),
      ])
    } finally {
      storage.close()
    }

    const audioDir = path.join(bookDir, "audio", "en")
    fs.mkdirSync(audioDir, { recursive: true })
    fs.writeFileSync(path.join(audioDir, "pg001_n001.mp3"), "audio")
    const speechStorage = createBookStorage(session.label, booksDir)
    try {
      speechStorage.putNodeData("tts", "en", {
        entries: [{
          textId: "pg001_n001",
          language: "en",
          fileName: "pg001_n001.mp3",
          voice: "alloy",
          model: "gpt-4o-mini-tts",
          cached: false,
          provider: "openai",
        }],
        generatedAt: new Date().toISOString(),
      })
      speechStorage.putNodeData("tts-timestamps", "en", {
        entries: {
          pg001_n001: {
            textId: "pg001_n001",
            language: "en",
            words: [{ word: "Edited", start: 0, end: 0.4 }],
            duration: 0.4,
          },
        },
        generatedAt: new Date().toISOString(),
      })
    } finally {
      speechStorage.close()
    }
    expect(syncAdtRecoveryPreview(session.label, booksDir)).toMatchObject({
      audioCount: 1,
      languages: ["en"],
    })
    expect(JSON.parse(fs.readFileSync(path.join(bookDir, "adt", "assets", "config.json"), "utf8")))
      .toMatchObject({ features: { readAloud: true, highlight: true } })
    expect(JSON.parse(fs.readFileSync(path.join(bookDir, "adt", "content", "i18n", "en", "audios.json"), "utf8")))
      .toEqual({ pg001_n001: "pg001_n001.mp3" })
    expect(fs.existsSync(path.join(bookDir, "adt", "content", "i18n", "en", "audio", "pg001_n001.mp3")))
      .toBe(true)
    expect(fs.readFileSync(path.join(bookDir, "adt", "assets", "offline-preloader.js"), "utf8"))
      .toContain('"pg001_n001":"pg001_n001.mp3"')

    const exported = unzipSync(exportAdtRecoverySession(session.label, booksDir))
    expect(JSON.parse(new TextDecoder().decode(exported["content/i18n/en/audios.json"])))
      .toEqual({ pg001_n001: "pg001_n001.mp3" })
    expect(JSON.parse(new TextDecoder().decode(exported["assets/config.json"])))
      .toMatchObject({ features: { readAloud: true, highlight: true } })
    expect(new TextDecoder().decode(exported["index.html"]))
      .not.toContain("data-adt-recovery-storage-shim")
    expect(new TextDecoder().decode(exported["assets/scorm.js"]))
      .toBe("void window.parent.API")

    fs.writeFileSync(path.join(bookDir, "config.yaml"), `editing_language: en
output_languages:
  - es
speech:
  excluded_text_ids:
    - pg001_n001
`)
    expect(syncAdtRecoveryPreview(session.label, booksDir)).toMatchObject({
      audioCount: 0,
      languages: [],
    })
    expect(JSON.parse(fs.readFileSync(
      path.join(bookDir, "adt", "content", "i18n", "en", "audios.json"),
      "utf8",
    ))).toEqual({})
    expect(JSON.parse(fs.readFileSync(
      path.join(bookDir, "adt", "content", "i18n", "en", "timecode", "timecode_output.json"),
      "utf8",
    ))).toEqual({})
    fs.writeFileSync(path.join(bookDir, "config.yaml"), `editing_language: en
output_languages:
  - es
`)
    expect(syncAdtRecoveryPreview(session.label, booksDir).audioCount).toBe(1)

    const clearStorage = createBookStorage(session.label, booksDir)
    try {
      clearStorage.putNodeData("tts", "en", { entries: [], generatedAt: new Date().toISOString() })
      clearStorage.putNodeData("tts-timestamps", "en", { entries: {}, generatedAt: new Date().toISOString() })
    } finally {
      clearStorage.close()
    }
    syncAdtRecoveryPreview(session.label, booksDir)
    expect(JSON.parse(fs.readFileSync(path.join(bookDir, "adt", "content", "i18n", "en", "audios.json"), "utf8")))
      .toEqual({})
    expect(fs.existsSync(path.join(bookDir, "adt", "content", "i18n", "en", "audio", "pg001_n001.mp3")))
      .toBe(false)

    const invalidatedStorage = createBookStorage(session.label, booksDir)
    try {
      invalidatedStorage.putNodeData("tts", "en", {
        entries: [],
        generatedAt: new Date().toISOString(),
        invalidatedBySourceRevision: "revision-2",
      })
    } finally {
      invalidatedStorage.close()
    }
    syncAdtRecoveryPreview(session.label, booksDir)
    expect(JSON.parse(fs.readFileSync(path.join(bookDir, "adt", "content", "i18n", "en", "audios.json"), "utf8")))
      .toEqual({ pg001_n001: "original.mp3" })
    expect(fs.existsSync(path.join(bookDir, "adt", "content", "i18n", "en", "audio", "original.mp3")))
      .toBe(true)

    deleteAdtRecoverySession(session.label, booksDir)
    expect(fs.existsSync(bookDir)).toBe(false)

  })

  it("upgrades an older imported project projection once without replacing its source", () => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-recovery-upgrade-"))
    temporaryRoots.push(booksDir)

    const source = makeBundle()
    const session = createAdtRecoverySession(source, booksDir, "hyena.zip")
    const bookDir = path.join(booksDir, session.label)
    const revisionId = "legacy-revision"
    const revisionDir = path.join(bookDir, ".adt-imports", revisionId)
    fs.mkdirSync(revisionDir, { recursive: true })
    fs.writeFileSync(path.join(revisionDir, "source.zip"), source)
    fs.writeFileSync(path.join(bookDir, ".adt-import-current.json"), JSON.stringify({
      version: 1,
      revisionId,
      projectionVersion: 1,
    }))

    expect(getImportedAdtFeaturesNeedingRegeneration(session.label, booksDir))
      .toEqual(["Speech"])

    const storage = createBookStorage(session.label, booksDir)
    let beforeVersion: number
    try {
      beforeVersion = storage.getLatestNodeData("web-rendering", "pg001")!.version
    } finally {
      storage.close()
    }

    expect(ensureImportedAdtProjectProjection(session.label, booksDir)).toBe(true)
    expect(ensureImportedAdtProjectProjection(session.label, booksDir)).toBe(false)
    expect(fs.readFileSync(path.join(revisionDir, "source.zip"))).toEqual(source)
    expect(JSON.parse(fs.readFileSync(path.join(bookDir, ".adt-import-current.json"), "utf8")))
      .toMatchObject({ projectionVersion: ADT_IMPORT_PROJECTION_VERSION })

    fs.writeFileSync(path.join(bookDir, "adt", "index.html"), "<html><head></head><body></body></html>")
    fs.mkdirSync(path.join(bookDir, "adt", "content"), { recursive: true })
    fs.writeFileSync(path.join(bookDir, "adt", "content", "pages.json"), JSON.stringify([
      { section_id: "pg001_sec001", href: "index.html" },
    ]))
    expect(restoreImportedAdtPresentation(session.label, booksDir)).toBe(true)
    expect(fs.readFileSync(path.join(bookDir, "adt", "index.html"), "utf8"))
      .toContain('href="./assets/book-showcase.css"')
    expect(fs.readFileSync(path.join(bookDir, "adt", "index.html"), "utf8"))
      .not.toContain('src="./assets/book-showcase.js"')
    expect(fs.readFileSync(path.join(bookDir, "adt", "assets", "book-showcase.css"), "utf8"))
      .toContain("rebeccapurple")
    expect(fs.existsSync(path.join(bookDir, "adt", "showcase-assets", "paper.png"))).toBe(true)

    const upgradedStorage = createBookStorage(session.label, booksDir)
    try {
      expect(upgradedStorage.getLatestNodeData("web-rendering", "pg001")).toMatchObject({
        version: beforeVersion + 1,
        data: {
          sections: [expect.objectContaining({
            html: expect.stringMatching(/^<section/),
          })],
        },
      })
    } finally {
      upgradedStorage.close()
    }
  })

  it("recovers existing narration only when the imported HTML still matches its catalog", () => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-recovery-speech-"))
    temporaryRoots.push(booksDir)

    const session = createAdtRecoverySession(makeBundleWithUnchangedHtmlCatalog(), booksDir)
    expect(session.contentChanged).toBe(false)
    const revisionDir = path.join(booksDir, session.label, ".adt-imports", "speech-revision")
    fs.mkdirSync(revisionDir, { recursive: true })
    fs.writeFileSync(path.join(revisionDir, "source.zip"), makeBundleWithUnchangedHtmlCatalog())
    fs.writeFileSync(path.join(booksDir, session.label, ".adt-import-current.json"), JSON.stringify({
      version: 1,
      revisionId: "speech-revision",
      projectionVersion: ADT_IMPORT_PROJECTION_VERSION,
    }))
    expect(getImportedAdtFeaturesNeedingRegeneration(session.label, booksDir)).toEqual([])
    const storage = createBookStorage(session.label, booksDir)
    try {
      expect(storage.getLatestNodeData("tts", "en")?.data).toMatchObject({
        entries: [expect.objectContaining({
          textId: "pg001_n001",
          fileName: "original.mp3",
          provider: "imported",
        })],
      })
      expect(storage.getLatestNodeData("tts-timestamps", "en")?.data).toMatchObject({
        entries: {
          pg001_n001: expect.objectContaining({ duration: 0.4 }),
        },
      })
      expect(storage.getStepRuns()).toEqual(expect.arrayContaining([
        expect.objectContaining({ step: "tts", status: "done" }),
        expect.objectContaining({ step: "word-timestamps", status: "done" }),
      ]))
      expect(fs.readFileSync(path.join(booksDir, session.label, "audio", "en", "original.mp3"), "utf8"))
        .toBe("original audio")
    } finally {
      storage.close()
    }
  })

  it("keeps the canonical image description when an unchanged export has a shorter HTML alt", () => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-recovery-image-alt-"))
    temporaryRoots.push(booksDir)

    const session = createAdtRecoverySession(
      makeCurrentBundleWithCanonicalImageDescription(),
      booksDir,
    )
    expect(session.contentChanged).toBe(false)

    const storage = createBookStorage(session.label, booksDir)
    try {
      const catalog = storage.getLatestNodeData("text-catalog", "book")?.data as {
        entries: Array<{ id: string; text: string }>
      }
      expect(catalog.entries).toContainEqual({
        id: "pg001_im001",
        text: "A detailed description stored in the text catalog",
      })
      expect(storage.getLatestNodeData("image-captioning", "pg001")?.data)
        .toMatchObject({
          captions: [expect.objectContaining({
            imageId: "pg001_im001",
            caption: "A detailed description stored in the text catalog",
          })],
        })
    } finally {
      storage.close()
    }
  })

  it("restores generated Speech status from versioned local data", () => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-recovery-status-"))
    temporaryRoots.push(booksDir)
    const files = unzipSync(makeBundle())
    files["assets/config.json"] = json({
      title: "Hyena and Raven",
      features: { readAloud: false, highlight: false },
    })
    delete files["content/i18n/en/audio/original.mp3"]
    files["content/i18n/en/audios.json"] = json({})
    const session = createAdtRecoverySession(Buffer.from(zipSync(files)), booksDir)
    expect(getAdtRecoverySession(session.label, booksDir).runtimeFeatures.readAloud).toBe(false)

    const storage = createBookStorage(session.label, booksDir)
    try {
      storage.putNodeData("tts", "en", {
        entries: [{
          textId: "pg001_n001",
          language: "en",
          fileName: "pg001_n001.mp3",
          voice: "alloy",
          model: "gpt-4o-mini-tts",
          cached: false,
          provider: "openai",
        }],
        generatedAt: new Date().toISOString(),
      })
    } finally {
      storage.close()
    }

    expect(getAdtRecoverySession(session.label, booksDir).runtimeFeatures.readAloud).toBe(true)
  })

  it("surfaces externally changed HTML as feature attention evidence", () => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-recovery-edited-"))
    temporaryRoots.push(booksDir)
    const files = unzipSync(makeBundle())
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]))
    manifest.frozen = {
      pageHtmlFingerprints: { "index.html": "0".repeat(64) },
    }
    files["manifest.json"] = json(manifest)

    const session = createAdtRecoverySession(Buffer.from(zipSync(files)), booksDir)

    expect(session.contentChanged).toBe(true)
    expect(getAdtRecoverySession(session.label, booksDir).contentChanged).toBe(true)
  })
})
