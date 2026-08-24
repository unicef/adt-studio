import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"

import { afterEach, describe, expect, it } from "vitest"
import { strToU8, unzipSync, zipSync } from "fflate"
import yaml from "js-yaml"
import { isFixedLayoutBook } from "@adt/pipeline"
import { createBookStorage } from "@adt/storage"
import type { AppConfig } from "@adt/types"
import { canonicalJson } from "@adt/types/fingerprint"

import { listBooks } from "./book-service.js"
import {
  extractAdtBundleArchiveFiles,
  readAdtBundle,
} from "./adt-bundle-reader.js"
import { assessAdtImportCompatibility } from "./adt-import-compatibility.js"
import { ADT_IMPORT_IN_PROGRESS_MARKER } from "./adt-import-marker.js"
import { previewAdtRecoveryImport } from "./adt-import-preview.js"
import {
  ADT_IMPORT_PROJECTION_VERSION,
  ensureImportedAdtProjectProjection,
} from "./adt-import-projection.js"
import {
  seedImportedAdtProject,
  type ImportedAdtSeedResult,
} from "./adt-import-seed/index.js"
import {
  getImportedAdtFeaturesNeedingRegeneration,
  restoreImportedAdtPresentation,
} from "./adt-imported-presentation.js"

/** Mirrors what `importAdtProject` does around the seeder: read the archive
 * once, then project it into the label the manifest asks for. */
function seedFromArchive(
  zipBuffer: Buffer,
  booksDir: string,
  sourceFileName?: string,
  activityDecisions?: ReadonlyArray<{ sectionId: string; type: string | null }>,
): ImportedAdtSeedResult {
  const bundle = readAdtBundle(zipBuffer)
  const files = extractAdtBundleArchiveFiles(zipBuffer)
  return seedImportedAdtProject(bundle.manifest.book.label, booksDir, bundle, files, {
    sourceFileName,
    activityDecisions,
  })
}

function assessArchive(zipBuffer: Buffer) {
  return assessAdtImportCompatibility(
    readAdtBundle(zipBuffer),
    extractAdtBundleArchiveFiles(zipBuffer),
  )
}

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
    ".build-hash": strToU8("package-input-hash"),
    ".build-version": strToU8("package-version"),
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

/** A fixed-layout export, mixing a positioned story page with the reflowable
 * pages Studio emits even in a fixed-layout book (a generated quiz, and an
 * activity page that keeps flowing markup). */
function makeFixedLayoutBundle(): Buffer {
  const sourceTexts = {
    pg001_p000: "Ready for eruptions",
    pg002_p000: "Flowing activity copy",
    qz001_que: "Which rock is molten?",
    qz001_o0: "1) Granite",
    qz001_o0_exp: "Not quite.",
    qz001_o1: "2) Lava",
    qz001_o1_exp: "Correct!",
    qz001_o2: "3) Slate",
    qz001_o2_exp: "Try again.",
  }
  const segments = JSON.stringify([
    { text: "Ready for eruptions", style: { "font-family": "Chokle,serif", "font-size": "20px" } },
  ]).replaceAll("&", "&amp;").replaceAll('"', "&quot;")
  const storyPage = `<!doctype html><html><head>
    <meta name="viewport" content="width=1145, height=692" />
    <link href="./content/tailwind_output.css" rel="stylesheet">
  </head><body><main>
    <div id="content" data-fl-reference-width="1145" style="position:relative;width:1145px;height:692px;margin:0 auto;overflow:hidden">
  <img src="images/pg001_im001.png" alt="A volcano" data-id="pg001_im001" style="position:absolute;top:0px;left:0px;width:575px;height:692px">
  <p data-id="pg001_p000" data-segments="${segments}" data-adt-fit="1" style="position:absolute;top:597px;left:121px;line-height:20px;width:290px;height:20px;text-align:center">Ready for eruptions</p>
  <script src="./assets/auto-fit.js"></script>
</div>
  </main><script src="./assets/base.bundle.local.js"></script></body></html>`
  const reflowablePage = (
    sectionId: string,
    nodeId: string,
    text: string,
    sectionType = "activity_multiple_choice",
  ) => `<!doctype html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head><body><main>
    <div id="content" class="container content mx-auto w-full min-h-screen px-8 py-8 opacity-0">
      <section data-section-id="${sectionId}" data-section-type="${sectionType}">
        <p data-id="${nodeId}">${text}</p>
      </section>
    </div>
  </main></body></html>`
  return Buffer.from(zipSync({
    "assets/config.json": json({
      title: "Volcanoes",
      bundleVersion: "1",
      languages: { available: ["en"], default: "en" },
      features: { activities: true },
      fixedLayout: true,
    }),
    "content/pages.json": json([
      { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
      { section_id: "pg002_sec001", href: "pg002_sec001.html", page_number: 2 },
      { section_id: "qz001", href: "qz001.html" },
    ]),
    "content/toc.json": json([]),
    "content/i18n/en/texts.json": json(sourceTexts),
    "images/pg001_im001.png": onePixelPng,
    "index.html": strToU8(storyPage),
    "pg002_sec001.html": strToU8(
      reflowablePage("pg002_sec001", "pg002_p000", "Flowing activity copy"),
    ),
    "qz001.html": strToU8(
      `${reflowablePage("qz001", "qz001_que", "Which rock is molten?", "activity_quiz")}
       <script>window.correctAnswers = JSON.parse('{"qz001_o0":false,"qz001_o1":true,"qz001_o2":false}')</script>`,
    ),
  }))
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe("ADT recovery workspace", () => {
  it("keeps safety invalidation separate from unverified edit attribution", () => {
    expect(previewAdtRecoveryImport(makeBundle())).toMatchObject({
      legacyRecovery: true,
      contentChanged: true,
      exportComparisonStatus: "unavailable",
    })
  })

  it("reports recovered storyboard pages rather than section entries", () => {
    const bundle = makeBundleWithTwoSectionsOnOnePage()

    expect(previewAdtRecoveryImport(bundle)).toMatchObject({
      pageCount: 1,
      imageCount: 1,
      captionedImageCount: 1,
    })

    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-recovery-page-count-"))
    temporaryRoots.push(booksDir)
    const session = seedFromArchive(bundle, booksDir, "multi-section.zip")
    expect(session.pageCount).toBe(1)
    const storage = createBookStorage(session.label, booksDir)
    try {
      expect(storage.getPages()).toHaveLength(1)
    } finally {
      storage.close()
    }
  })

  it("accepts quiz pages emitted before Studio added data-section-id", () => {
    expect(assessArchive(makeCurrentBundleWithLegacyQuizMarkup()))
      .toEqual({ supported: true, issues: [] })
  })

  it("imports pages added outside Studio when every page index is updated", () => {
    const bundle = makeCurrentBundleWithExternallyAddedPage()
    expect(assessArchive(bundle)).toEqual({ supported: true, issues: [] })

    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-recovery-added-page-"))
    temporaryRoots.push(booksDir)
    const session = seedFromArchive(bundle, booksDir, "expanded-book.zip")

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
    expect(assessArchive(makeBundle())).toMatchObject({
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

    const session = seedFromArchive(makeBundle(), booksDir, "hyena.zip")
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
    expect(fs.existsSync(path.join(bookDir, ADT_IMPORT_IN_PROGRESS_MARKER))).toBe(true)
    expect(listBooks(booksDir)).toEqual([])
    expect(fs.readFileSync(path.join(bookDir, "config.yaml"), "utf8"))
      .toContain("- en")

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
  })

  it("upgrades an older imported project projection once without replacing its source", () => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-recovery-upgrade-"))
    temporaryRoots.push(booksDir)

    const source = makeBundle()
    const session = seedFromArchive(source, booksDir, "hyena.zip")
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

    // `packageAdtWeb` rebuilds `adt/` before presentation restore runs.
    fs.mkdirSync(path.join(bookDir, "adt"), { recursive: true })
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

    const session = seedFromArchive(makeBundleWithUnchangedHtmlCatalog(), booksDir)
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

    const session = seedFromArchive(
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


  it("surfaces externally changed HTML as feature attention evidence", () => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-recovery-edited-"))
    temporaryRoots.push(booksDir)
    const files = unzipSync(makeBundle())
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]))
    manifest.frozen = {
      pageHtmlFingerprints: { "index.html": "0".repeat(64) },
    }
    files["manifest.json"] = json(manifest)

    const session = seedFromArchive(Buffer.from(zipSync(files)), booksDir)

    expect(session.contentChanged).toBe(true)
  })
})

describe("imported feature recovery", () => {
  it("does not promise features whose editable data the archive cannot carry", () => {
    const files = unzipSync(makeFixedLayoutBundle())
    files["assets/config.json"] = json({
      title: "Volcanoes",
      bundleVersion: "1",
      languages: { available: ["en"], default: "en" },
      // The published runtime used all four; none has recoverable pipeline data.
      features: { easyRead: true, activities: true, signLanguage: true, readAloud: true },
      fixedLayout: true,
    })
    const preview = previewAdtRecoveryImport(Buffer.from(zipSync(files)))

    expect(preview.featureRecovery["easy-read"]).toBe("needs-regeneration")
    expect(preview.featureRecovery["sign-language"]).toBe("needs-regeneration")
    expect(preview.featureRecovery.quizzes).toBe("recovered")
    // No audios.json in the archive, so narration has to be generated again.
    expect(preview.featureRecovery.speech).toBe("needs-regeneration")
    expect(preview.featureRecovery.storyboard).toBe("recovered")
  })

  it("reports what the archive genuinely carries as recovered", () => {
    const preview = previewAdtRecoveryImport(makeBundleWithUnchangedHtmlCatalog())

    expect(preview.featureRecovery.storyboard).toBe("recovered")
    expect(preview.featureRecovery.glossary).toBe("recovered")
    expect(preview.featureRecovery.toc).toBe("recovered")
    expect(preview.featureRecovery.captions).toBe("recovered")
    expect(preview.featureRecovery.speech).toBe("recovered")
    // Absent from the archive entirely, so it is neither included nor pending.
    expect(preview.featureRecovery["sign-language"]).toBeUndefined()
  })

  it("rebuilds a generated quiz into a real entity", () => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-quiz-"))
    temporaryRoots.push(booksDir)
    const session = seedFromArchive(makeFixedLayoutBundle(), booksDir)
    const storage = createBookStorage(session.label, booksDir)
    try {
      const quiz = (storage.getLatestNodeData("quiz-generation", "book")!
        .data as { quizzes: Array<Record<string, unknown>> }).quizzes[0]
      expect(quiz).toMatchObject({
        quizIndex: 0,
        question: "Which rock is molten?",
        // Read from the page's answer key, not guessed from the explanations.
        answerIndex: 1,
        options: [
          { text: "1) Granite", explanation: "Not quite." },
          { text: "2) Lava", explanation: "Correct!" },
          { text: "3) Slate", explanation: "Try again." },
        ],
      })
      // The quiz is anchored to the last content page that precedes it.
      expect(quiz.afterPageId).toBe("pg002")
      expect(quiz.pageIds).toEqual(["pg001", "pg002"])
    } finally {
      storage.close()
    }
  })

  it("leaves a quiz for regeneration when its answer key is missing", () => {
    const files = unzipSync(makeFixedLayoutBundle())
    // Same catalog text, but the page no longer says which option is right.
    files["qz001.html"] = strToU8(
      new TextDecoder().decode(files["qz001.html"]).replace(/<script>[\s\S]*?<\/script>/, ""),
    )
    const archive = Buffer.from(zipSync(files))

    // Seeding is covered by the recoverImportedQuiz unit tests; what matters
    // here is that the review screen does not claim a quiz it cannot rebuild.
    expect(previewAdtRecoveryImport(archive).featureRecovery.quizzes)
      .toBe("needs-regeneration")
  })

  it("keeps a feature pending when the archive's own content changed", () => {
    const files = unzipSync(makeBundle())
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]))
    manifest.frozen = { pageHtmlFingerprints: { "index.html": "0".repeat(64) } }
    files["manifest.json"] = json(manifest)
    const preview = previewAdtRecoveryImport(Buffer.from(zipSync(files)))

    expect(preview.contentChanged).toBe(true)
    // Narration recorded against text that has since been edited cannot be
    // adopted, so it must not be advertised as included.
    expect(preview.featureRecovery.speech).toBe("needs-regeneration")
  })
})

describe("imported fixed-layout books", () => {
  function importFixedLayout() {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-fixed-layout-"))
    temporaryRoots.push(booksDir)
    const session = seedFromArchive(makeFixedLayoutBundle(), booksDir)
    return { booksDir, session }
  }

  it("keeps each positioned page renderable from its own viewport", () => {
    const { booksDir, session } = importFixedLayout()
    const storage = createBookStorage(session.label, booksDir)
    try {
      const positioned = storage.getLatestNodeData("fixed-layout-sectioning", "pg001")!
        .data as { sections: Array<{ sectionType: string; viewport?: { width: number; height: number }; placement?: Record<string, { position?: unknown; blockBounds?: unknown; textAlign?: string; bounds?: unknown }> }> }
      const section = positioned.sections[0]
      expect(section.sectionType).toBe("fixed-layout-page")
      expect(section.viewport).toEqual({ width: 1145, height: 692 })
      expect(section.placement?.pg001_im001.bounds)
        .toEqual({ x: 0, y: 0, width: 575, height: 692 })
      expect(section.placement?.pg001_p000.position)
        .toEqual({ top: 597, left: 121, lineHeight: 20 })
      expect(section.placement?.pg001_p000.blockBounds)
        .toEqual({ x: 121, y: 597, width: 290, height: 20 })
      expect(section.placement?.pg001_p000.textAlign).toBe("center")

      const rendering = storage.getLatestNodeData("web-rendering", "pg001")!
        .data as { sections: Array<{ sectionType: string; html: string }> }
      expect(rendering.sections[0].sectionType).toBe("fixed-layout-page")
      expect(rendering.sections[0].html).toMatch(/^<div id="content"/)
      expect(rendering.sections[0].html).toContain('data-fl-reference-width="1145"')
      expect(rendering.sections[0].html).toContain("width:1145px;height:692px")
      expect(rendering.sections[0].html).toContain("top:597px;left:121px")
      expect(rendering.sections[0].html).not.toContain("base.bundle")
    } finally {
      storage.close()
    }
  })

  it("keeps the semantic tree beside the positioned one", () => {
    const { booksDir, session } = importFixedLayout()
    const storage = createBookStorage(session.label, booksDir)
    try {
      const semantic = storage.getLatestNodeData("page-sectioning", "pg001")!
        .data as { sections: Array<{ sectionType: string; placement?: unknown; nodes: Array<{ nodeId: string }> }> }
      expect(semantic.sections[0].sectionType).toBe("content")
      expect(semantic.sections[0].placement).toBeUndefined()
      expect(semantic.sections[0].nodes.map((node) => node.nodeId))
        .toEqual(["pg001_im001", "pg001_p000"])
    } finally {
      storage.close()
    }
  })

  it("leaves a reflowable page in a fixed-layout book on the reflowable path", () => {
    const { booksDir, session } = importFixedLayout()
    const storage = createBookStorage(session.label, booksDir)
    try {
      expect(storage.getLatestNodeData("fixed-layout-sectioning", "pg002")).toBeNull()
      const rendering = storage.getLatestNodeData("web-rendering", "pg002")!
        .data as { sections: Array<{ sectionType: string; html: string }> }
      expect(rendering.sections[0].sectionType).toBe("activity_multiple_choice")
      expect(rendering.sections[0].html).toMatch(/^<section/)
      // The positioned page next to it is unaffected by the mix.
      expect(storage.getLatestNodeData("fixed-layout-sectioning", "pg001")).not.toBeNull()
    } finally {
      storage.close()
    }
  })

  it("writes a config that isFixedLayoutBook recognizes", () => {
    const { booksDir, session } = importFixedLayout()
    const config = yaml.load(fs.readFileSync(
      path.join(booksDir, session.label, "config.yaml"),
      "utf8",
    )) as AppConfig
    expect(isFixedLayoutBook(config)).toBe(true)
    expect(config.editing_language).toBe("en")
    // Extract and Sectioning stay unavailable: nothing here re-enables them.
    expect(config).not.toHaveProperty("page_sectioning")
    expect(config).not.toHaveProperty("start_page")
  })

  it("leaves a reflowable import's config free of render strategies", () => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-reflowable-config-"))
    temporaryRoots.push(booksDir)
    const session = seedFromArchive(makeBundle(), booksDir)
    const config = yaml.load(fs.readFileSync(
      path.join(booksDir, session.label, "config.yaml"),
      "utf8",
    )) as AppConfig
    expect(isFixedLayoutBook(config)).toBe(false)
    expect(config).not.toHaveProperty("render_strategies")
    expect(config).not.toHaveProperty("default_render_strategy")
  })

  it("classifies every recovered image so the Captions gallery can find them", () => {
    const { booksDir, session } = importFixedLayout()
    const storage = createBookStorage(session.label, booksDir)
    try {
      const classification = storage.getLatestNodeData("image-filtering", "pg001")!
        .data as { images: Array<{ imageId: string; isPruned: boolean }> }
      // The page summary's imageCount — and so the Captions gallery — counts
      // classified images other than the whole-page render.
      expect(classification.images.filter((image) => image.imageId !== "pg001_page"))
        .toEqual([{
          imageId: "pg001_im001",
          isPruned: false,
          reason: "Recovered from the exported ADT HTML, which already draws this image.",
        }])
      // The synthetic page render is pruned, as in a natively extracted book.
      expect(classification.images.find((image) => image.imageId === "pg001_page"))
        .toMatchObject({ isPruned: true })
    } finally {
      storage.close()
    }
  })

  it("does not undo user edits when an existing project is re-projected", () => {
    const { booksDir, session } = importFixedLayout()
    const bookDir = path.join(booksDir, session.label)
    fs.mkdirSync(path.join(bookDir, ".adt-imports", "rev1"), { recursive: true })
    fs.writeFileSync(
      path.join(bookDir, ".adt-imports", "rev1", "source.zip"),
      makeFixedLayoutBundle(),
    )
    fs.writeFileSync(path.join(bookDir, ".adt-import-current.json"), JSON.stringify({
      version: 1,
      revisionId: "rev1",
      importedAt: new Date().toISOString(),
      projectionVersion: ADT_IMPORT_PROJECTION_VERSION - 1,
    }))

    const before = createBookStorage(session.label, booksDir)
    try {
      // The user prunes an image and rewrites the recovered quiz.
      before.putNodeData("image-filtering", "pg001", {
        images: [{ imageId: "pg001_im001", isPruned: true, reason: "User pruned this." }],
      })
      before.putNodeData("quiz-generation", "book", {
        generatedAt: new Date().toISOString(),
        language: "en",
        pagesPerQuiz: 2,
        quizzes: [{
          quizIndex: 0,
          afterPageId: "pg002",
          pageIds: ["pg001", "pg002"],
          question: "A question the user rewrote",
          options: [
            { text: "a", explanation: "" },
            { text: "b", explanation: "" },
            { text: "c", explanation: "" },
          ],
          answerIndex: 2,
          reasoning: "Edited in Studio.",
        }],
      })
    } finally {
      before.close()
    }

    expect(ensureImportedAdtProjectProjection(session.label, booksDir)).toBe(true)

    const after = createBookStorage(session.label, booksDir)
    try {
      const filtering = after.getLatestNodeData("image-filtering", "pg001")!
        .data as { images: Array<{ imageId: string; isPruned: boolean }> }
      expect(filtering.images.find((image) => image.imageId === "pg001_im001")?.isPruned).toBe(true)
      const quiz = (after.getLatestNodeData("quiz-generation", "book")!
        .data as { quizzes: Array<{ question: string; answerIndex: number }> }).quizzes[0]
      expect(quiz.question).toBe("A question the user rewrote")
      expect(quiz.answerIndex).toBe(2)
    } finally {
      after.close()
    }
  })

  it("upgrades a project whose activity decisions were never recorded", () => {
    const { booksDir, session } = importFixedLayout()
    const bookDir = path.join(booksDir, session.label)
    fs.mkdirSync(path.join(bookDir, ".adt-imports", "rev1"), { recursive: true })
    fs.writeFileSync(
      path.join(bookDir, ".adt-imports", "rev1", "source.zip"),
      makeFixedLayoutBundle(),
    )
    fs.writeFileSync(path.join(bookDir, ".adt-import-current.json"), JSON.stringify({
      version: 1,
      revisionId: "rev1",
      importedAt: new Date().toISOString(),
      projectionVersion: 1,
    }))
    // A project imported before classifications were persisted has no review
    // node at all; the upgrade must still repair its layout.
    const storage = createBookStorage(session.label, booksDir)
    try {
      storage.putNodeData("imported-activity-review", "book", {
        version: 1,
        reviewedAt: new Date().toISOString(),
        items: [],
        decisions: [],
      })
    } finally {
      storage.close()
    }

    expect(ensureImportedAdtProjectProjection(session.label, booksDir)).toBe(true)

    const upgraded = createBookStorage(session.label, booksDir)
    try {
      expect(upgraded.getLatestNodeData("fixed-layout-sectioning", "pg001")).not.toBeNull()
    } finally {
      upgraded.close()
    }
  })

  it("repairs a project imported before fixed layout was projected", () => {
    const { booksDir, session } = importFixedLayout()
    const bookDir = path.join(booksDir, session.label)
    const currentPath = path.join(bookDir, ".adt-import-current.json")

    // Reproduce the pre-fix state: a reflowable projection, a languages-only
    // config, and the immutable source archive the upgrade re-reads.
    fs.mkdirSync(path.join(bookDir, ".adt-imports", "rev1"), { recursive: true })
    fs.writeFileSync(
      path.join(bookDir, ".adt-imports", "rev1", "source.zip"),
      makeFixedLayoutBundle(),
    )
    fs.writeFileSync(currentPath, JSON.stringify({
      version: 1,
      revisionId: "rev1",
      importedAt: new Date().toISOString(),
      projectionVersion: ADT_IMPORT_PROJECTION_VERSION - 1,
    }))
    fs.writeFileSync(path.join(bookDir, "config.yaml"), yaml.dump({
      editing_language: "en",
      output_languages: ["en"],
    }))
    const storage = createBookStorage(session.label, booksDir)
    try {
      storage.putNodeData("web-rendering", "pg001", {
        sections: [{
          sectionIndex: 0,
          sectionType: "content",
          reasoning: "Pre-fix reflowable projection.",
          html: '<section data-section-id="pg001_sec001" data-section-type="content"></section>',
        }],
      })
    } finally {
      storage.close()
    }

    expect(ensureImportedAdtProjectProjection(session.label, booksDir)).toBe(true)
    expect(ensureImportedAdtProjectProjection(session.label, booksDir)).toBe(false)

    const config = yaml.load(fs.readFileSync(path.join(bookDir, "config.yaml"), "utf8")) as AppConfig
    expect(isFixedLayoutBook(config)).toBe(true)
    expect(config.editing_language).toBe("en")
    expect(config.output_languages).toEqual(["en"])

    const upgraded = createBookStorage(session.label, booksDir)
    try {
      const rendering = upgraded.getLatestNodeData("web-rendering", "pg001")!
        .data as { sections: Array<{ sectionType: string; html: string }> }
      expect(rendering.sections[0].sectionType).toBe("fixed-layout-page")
      expect(rendering.sections[0].html).toContain("width:1145px;height:692px")
      expect(upgraded.getLatestNodeData("fixed-layout-sectioning", "pg001")).not.toBeNull()
    } finally {
      upgraded.close()
    }
  })
})
