import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"
import { unzipSync, zipSync } from "fflate"
import yaml from "js-yaml"
import { createBookStorage } from "@adt/storage"

import { listBooks } from "../../book-service.js"
import { ADT_IMPORT_IN_PROGRESS_MARKER } from "../marker.js"
import { previewAdtRecoveryImport } from "../preview.js"
import {
  ADT_IMPORT_PROJECTION_VERSION,
  ensureImportedAdtProjectProjection,
} from "../projection.js"
import {
  getImportedAdtFeaturesNeedingRegeneration,
  restoreImportedAdtPresentation,
} from "../presentation.js"
import {
  assessArchive,
  json,
  makeBundle,
  makeBundleWithTwoSectionsOnOnePage,
  makeBundleWithUnchangedHtmlCatalog,
  makeCurrentBundleWithCanonicalImageDescription,
  makeCurrentBundleWithExternallyAddedPage,
  makeCurrentBundleWithLegacyQuizMarkup,
  seedFromArchive,
  temporaryRoots,
} from "./fixtures.js"

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
