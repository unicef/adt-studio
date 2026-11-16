import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"
import { strToU8, unzipSync, zipSync } from "fflate"
import {
  buildCoreTtsPreparationConfig,
  getCoreTtsCatalog,
  getReadyCoreTtsEntries,
  loadBookConfig,
  loadCoreTtsProfiles,
  prepareCoreTtsCatalog,
  readOutputCatalog,
  resolveCoreTtsProfile,
} from "@adt/pipeline"
import { createBookStorage } from "@adt/storage"

import { getBook } from "../../book-service.js"
import {
  getImportedAdtFeaturesNeedingRegeneration,
  readSeededImportedAdtFeatures,
} from "../presentation.js"
import { readAdtBundle } from "../bundle-reader.js"
import { previewAdtRecoveryImport } from "../preview.js"
import { stampImportedSpeechEvidence } from "../speech-evidence.js"
import {
  ADT_IMPORT_PROJECTION_VERSION,
  ensureImportedAdtProjectProjection,
} from "../projection.js"
import {
  exportedThenEdited,
  json,
  makeBundle,
  makeBundleWithBaselinedNarrationAfterEdit,
  makeBundleWithEasyReadAndSignLanguage,
  makeBundleWithFillInTheBlankAnswers,
  makeBundleWithPartiallyStableNarration,
  makeBundleWithSpeechAfterGuideEdit,
  makeBundleWithSpeechTexts,
  makeBundleWithUnchangedHtmlCatalog,
  makeFixedLayoutBundle,
  renameInArchive,
  seedFromArchive,
  temporaryRoots,
} from "./fixtures.js"

// F10: translations and Easy Read of text edited after export are made again.
describe("derived text of a source edited after export", () => {
  const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
  function editedArchive() {
    return exportedThenEdited(makeBundleWithEasyReadAndSignLanguage(), (edited) => {
      edited["index.html"] = strToU8(decode(edited["index.html"]).replace("Edited outside Studio", "Rewritten after export"))
      const texts = JSON.parse(decode(edited["content/i18n/en/texts.json"]))
      texts.pg001_n001 = "Rewritten after export"
      edited["content/i18n/en/texts.json"] = json(texts)
    }, { textFingerprints: true })
  }

  it("drops the stale translation and Easy Read of that text and keeps the rest", () => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-f10-"))
    temporaryRoots.push(booksDir)
    const session = seedFromArchive(editedArchive(), booksDir)
    const storage = createBookStorage(session.label, booksDir)
    try {
      const source = storage.getLatestNodeData("text-catalog", "book")?.data as { entries: Array<{ id: string; text: string }> }
      expect(source.entries.find((e) => e.id === "pg001_n001")?.text).toBe("Rewritten after export")
      const es = storage.getLatestNodeData("text-catalog-translation", "es")?.data as { entries: Array<{ id: string }> }
      expect(es.entries.map((e) => e.id)).not.toContain("pg001_n001")
      expect(es.entries.length).toBeGreaterThan(0)
      const easyRead = storage.getLatestNodeData("easy-read", "book")?.data as
        { blocks: Array<{ entries: Array<{ sourceId: string }> }> } | undefined
      expect((easyRead?.blocks ?? []).flatMap((b) => b.entries).map((e) => e.sourceId)).not.toContain("pg001_n001")
    } finally {
      storage.close()
    }
  })

  it("reports the translation as partly recovered in the preview", () => {
    const preview = previewAdtRecoveryImport(editedArchive())
    expect(preview.featureRecovery.translate).toBe("partial")
    expect(preview.featureRecovery["easy-read"]).not.toBe("recovered")
  })

  it("keeps everything from an untouched export", () => {
    const preview = previewAdtRecoveryImport(exportedThenEdited(makeBundleWithEasyReadAndSignLanguage(), () => {}, { textFingerprints: true }))
    expect(preview.featureRecovery.translate).toBe("recovered")
    expect(preview.featureRecovery["easy-read"]).toBe("recovered")
  })
})

// F12: an image alt edited after export is the image's new description.
describe("image alt edited after export", () => {
  const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
  const caption = (archive: Buffer) => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-f12-"))
    temporaryRoots.push(booksDir)
    const session = seedFromArchive(archive, booksDir)
    const storage = createBookStorage(session.label, booksDir)
    try {
      const catalog = storage.getLatestNodeData("text-catalog", "book")?.data as { entries: Array<{ id: string; text: string }> }
      const captions = storage.getLatestNodeData("image-captioning", "pg001")?.data as { captions: Array<{ imageId: string; caption: string }> }
      return {
        catalog: catalog.entries.find((e) => e.id === "pg001_im001")?.text,
        caption: captions.captions.find((c) => c.imageId === "pg001_im001")?.caption,
      }
    } finally {
      storage.close()
    }
  }
  const editAlt = (files: Record<string, Uint8Array>) => {
    files["index.html"] = strToU8(decode(files["index.html"]).replace('alt="A raven"', 'alt="A black raven on a branch"'))
  }

  it("uses the edited HTML alt for the catalog and the caption", () => {
    const archive = exportedThenEdited(makeBundleWithUnchangedHtmlCatalog(), editAlt, { textFingerprints: true, imageAltFingerprints: true })
    expect(caption(archive)).toEqual({ catalog: "A black raven on a branch", caption: "A black raven on a branch" })
    expect(previewAdtRecoveryImport(archive).contentChanged).toBe(true)
  })

  it("keeps the catalog description when the alt is untouched", () => {
    const archive = exportedThenEdited(makeBundleWithUnchangedHtmlCatalog(), () => {}, { textFingerprints: true, imageAltFingerprints: true })
    expect(caption(archive)).toEqual({ catalog: "A raven", caption: "A raven" })
  })

  it("keeps the catalog description for older exports without alt fingerprints", () => {
    const archive = exportedThenEdited(makeBundleWithUnchangedHtmlCatalog(), editAlt, { textFingerprints: true })
    expect(caption(archive).catalog).toBe("A raven")
  })
})

// F13: a glossary term's picture survives import (and so re-export).
describe("glossary term pictures", () => {
  it("links the term to its picture and registers the image", () => {
    const files = unzipSync(makeBundleWithUnchangedHtmlCatalog())
    const glossary = JSON.parse(new TextDecoder().decode(files["content/i18n/en/glossary.json"]))
    for (const entry of Object.values(glossary) as Array<{ id: string; image?: string }>) {
      if (entry.id === "gl001") entry.image = "images/gl_hyena.png"
    }
    files["content/i18n/en/glossary.json"] = json(glossary)
    files["images/gl_hyena.png"] = new Uint8Array(Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ))
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-f13-"))
    temporaryRoots.push(booksDir)
    const session = seedFromArchive(Buffer.from(zipSync(files)), booksDir)
    const storage = createBookStorage(session.label, booksDir)
    try {
      const items = (storage.getLatestNodeData("glossary", "book")?.data as { items: Array<{ id: string; imageId?: string }> }).items
      expect(items.find((item) => item.id === "gl001")?.imageId).toBe("gl_hyena")
      expect(storage.getImageMeta("gl_hyena")).toMatchObject({ relativePath: "images/gl_hyena.png" })
      expect(fs.existsSync(path.join(booksDir, session.label, "images", "gl_hyena.png"))).toBe(true)
    } finally {
      storage.close()
    }
  })
})

// F18: an image embedded as a data: URI becomes a real book image.
describe("inline data: images", () => {
  it("stores the embedded image instead of losing it", () => {
    const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    const files = unzipSync(makeBundleWithUnchangedHtmlCatalog())
    files["index.html"] = strToU8(new TextDecoder().decode(files["index.html"])
      .replace('src="images/pg001_im001.png"', `src="data:image/png;base64,${pixel}"`))
    delete files["images/pg001_im001.png"]
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-f18-"))
    temporaryRoots.push(booksDir)
    const session = seedFromArchive(Buffer.from(zipSync(files)), booksDir)
    const storage = createBookStorage(session.label, booksDir)
    try {
      expect(storage.getImageMeta("pg001_im001")).toMatchObject({ relativePath: "images/pg001_im001.png" })
      expect(fs.readFileSync(path.join(booksDir, session.label, "images", "pg001_im001.png")))
        .toEqual(Buffer.from(pixel, "base64"))
    } finally {
      storage.close()
    }
  })
})

describe("imported feature recovery", () => {
  it("does not promise features whose editable data the archive cannot carry", () => {
    const files = unzipSync(makeFixedLayoutBundle())
    files["assets/config.json"] = json({
      title: "Volcanoes",
      bundleVersion: "1",
      languages: { available: ["en"], default: "en" },
      // The published runtime used all four; the archive carries data for none of them.
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

  it("keeps the exported quiz id instead of renumbering by position", () => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-quiz-id-"))
    temporaryRoots.push(booksDir)
    const session = seedFromArchive(renameInArchive(makeFixedLayoutBundle(), "qz001", "qz002"), booksDir)
    const storage = createBookStorage(session.label, booksDir)
    try {
      const quizzes = (storage.getLatestNodeData("quiz-generation", "book")!
        .data as { quizzes: Array<Record<string, unknown>> }).quizzes
      expect(quizzes).toHaveLength(1)
      expect(quizzes[0]).toMatchObject({ quizId: "qz002", question: "Which rock is molten?" })
    } finally {
      storage.close()
    }
  })

  it("recovers a standard activity's grading key as activity answers", () => {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-activity-answers-"))
    temporaryRoots.push(booksDir)
    const session = seedFromArchive(makeBundleWithFillInTheBlankAnswers(), booksDir)
    const storage = createBookStorage(session.label, booksDir)
    try {
      const rendering = storage.getLatestNodeData("web-rendering", "pg002")!
        .data as { sections: Array<Record<string, unknown>> }
      expect(rendering.sections[0]).toMatchObject({
        sectionType: "activity_fill_in_the_blank",
        activityAnswers: { "item-1": "4", "item-2": 7 },
      })
      expect(String(rendering.sections[0].html)).not.toContain("correctAnswers")
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

describe("imported Easy Read and sign language recovery", () => {
  function importedProject(archive: Buffer) {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-easy-read-sl-"))
    temporaryRoots.push(booksDir)
    const session = seedFromArchive(archive, booksDir)
    const bookDir = path.join(booksDir, session.label)
    const revisionDir = path.join(bookDir, ".adt-imports", "feature-revision")
    fs.mkdirSync(revisionDir, { recursive: true })
    fs.writeFileSync(path.join(revisionDir, "source.zip"), archive)
    const writeCurrent = (projectionVersion: number) => fs.writeFileSync(
      path.join(bookDir, ".adt-import-current.json"),
      JSON.stringify({ version: 1, revisionId: "feature-revision", projectionVersion }),
    )
    writeCurrent(ADT_IMPORT_PROJECTION_VERSION)
    return { booksDir, session, bookDir, writeCurrent }
  }

  // F7: removing an imported feature is the user's choice, not a lost import.
  describe("after the user removes an imported feature", () => {
    function importWithRecord(recordSeeded: boolean) {
      const archive = makeBundleWithEasyReadAndSignLanguage()
      const project = importedProject(archive)
      const seededFeatures = readSeededImportedAdtFeatures(
        project.session.label,
        project.booksDir,
        readAdtBundle(archive),
      )
      fs.writeFileSync(
        path.join(project.bookDir, ".adt-import-current.json"),
        JSON.stringify({
          version: 1,
          revisionId: "feature-revision",
          projectionVersion: ADT_IMPORT_PROJECTION_VERSION,
          ...(recordSeeded ? { seededFeatures } : {}),
        }),
      )
      return { ...project, seededFeatures }
    }

    function deleteAllSignLanguageVideos(label: string, booksDir: string) {
      const storage = createBookStorage(label, booksDir)
      try {
        for (const video of storage.getSignLanguageVideos()) storage.deleteSignLanguageVideo(video.videoId)
        expect(storage.getSignLanguageVideos()).toEqual([])
      } finally {
        storage.close()
      }
    }

    it("records the features the import brought in", () => {
      const { seededFeatures } = importWithRecord(true)
      expect(seededFeatures).toEqual(expect.arrayContaining(["Easy Read", "Sign Language"]))
    })

    it("does not block packaging once the imported sign-language videos are deleted", () => {
      const { session, booksDir } = importWithRecord(true)
      deleteAllSignLanguageVideos(session.label, booksDir)
      expect(getImportedAdtFeaturesNeedingRegeneration(session.label, booksDir)).toEqual([])
    })

    it("still blocks a feature the import could not bring in", () => {
      const { session, booksDir, bookDir } = importWithRecord(true)
      deleteAllSignLanguageVideos(session.label, booksDir)
      const current = JSON.parse(fs.readFileSync(path.join(bookDir, ".adt-import-current.json"), "utf8"))
      current.seededFeatures = current.seededFeatures.filter((f: string) => f !== "Sign Language")
      fs.writeFileSync(path.join(bookDir, ".adt-import-current.json"), JSON.stringify(current))
      expect(getImportedAdtFeaturesNeedingRegeneration(session.label, booksDir)).toEqual(["Sign Language"])
      // ...unless the export leaves that feature out.
      expect(getImportedAdtFeaturesNeedingRegeneration(session.label, booksDir, new Set(["Sign Language"])))
        .toEqual([])
    })

    it("treats an emptied quiz or Easy Read entity as removed, for imports recorded before seededFeatures", () => {
      const { session, booksDir } = importWithRecord(false)
      const storage = createBookStorage(session.label, booksDir)
      try {
        storage.putNodeData("easy-read", "book", { blocks: [], generatedAt: new Date().toISOString() })
      } finally {
        storage.close()
      }
      expect(getImportedAdtFeaturesNeedingRegeneration(session.label, booksDir)).not.toContain("Easy Read")
    })
  })

  it("reports both features as recovered when the archive carries their data", () => {
    const preview = previewAdtRecoveryImport(makeBundleWithEasyReadAndSignLanguage())

    expect(preview.contentChanged).toBe(false)
    expect(preview.featureRecovery["easy-read"]).toBe("recovered")
    expect(preview.featureRecovery["sign-language"]).toBe("recovered")
  })

  it("falls back to regeneration when the flagged data is not in the archive", () => {
    const files = unzipSync(makeBundleWithEasyReadAndSignLanguage())
    delete files["content/i18n/en/video/sl_pg001_sec001.mp4"]
    delete files["content/i18n/en/video/sl_gl001.mp4"]
    files["content/i18n/en/texts.json"] = json({
      pg001_n001: "Edited outside Studio",
      "new-unstable-id": "New text without a catalog id",
      pg001_im001: "A raven",
      gl001: "Hyena",
      gl001_def: "An animal",
      pg001_n999_easy_read: "Easy Read for a paragraph this archive no longer has",
    })
    const preview = previewAdtRecoveryImport(Buffer.from(zipSync(files)))

    expect(preview.featureRecovery["easy-read"]).toBe("needs-regeneration")
    expect(preview.featureRecovery["sign-language"]).toBe("needs-regeneration")
  })

  it("rebuilds the Easy Read entity anchored to the recovered storyboard", () => {
    const { booksDir, session } = importedProject(makeBundleWithEasyReadAndSignLanguage())
    const storage = createBookStorage(session.label, booksDir)
    try {
      expect(storage.getLatestNodeData("easy-read", "book")?.data).toMatchObject({
        blocks: [{
          pageId: "pg001",
          sectionId: "pg001_sec001",
          entries: [{
            sourceId: "pg001_n001",
            easyReadId: "pg001_n001_easy_read",
            originalText: "Edited outside Studio",
            text: "Simple text",
            pageId: "pg001",
            sectionId: "pg001_sec001",
          }],
        }],
      })
      expect(storage.getStepRuns()).toContainEqual(
        expect.objectContaining({ step: "easy-read", status: "done" }),
      )
      expect(storage.getLatestNodeData("text-catalog-translation", "es")?.data).toMatchObject({
        entries: expect.arrayContaining([{ id: "pg001_n001_easy_read", text: "Texto simple" }]),
      })
    } finally {
      storage.close()
    }
    expect(getImportedAdtFeaturesNeedingRegeneration(session.label, booksDir)).toEqual([])
    expect(fs.readFileSync(path.join(booksDir, session.label, "config.yaml"), "utf8"))
      .toMatch(/easy_read:\n\s+enabled: true/)
  })

  it("adopts page and glossary videos pinned to sections the project has", () => {
    const { booksDir, session, bookDir } = importedProject(makeBundleWithEasyReadAndSignLanguage())
    const storage = createBookStorage(session.label, booksDir)
    try {
      const videos = storage.getSignLanguageVideos()
        .sort((left, right) => left.videoId.localeCompare(right.videoId))
      expect(videos).toEqual([
        expect.objectContaining({
          videoId: "sl_imported_gl001",
          sectionId: "gl001",
          originalName: "sl_gl001.mp4",
          mimeType: "video/mp4",
        }),
        expect.objectContaining({
          videoId: "sl_imported_pg001_sec001",
          sectionId: "pg001_sec001",
          originalName: "sl_pg001_sec001.mp4",
          mimeType: "video/mp4",
        }),
      ])
      for (const video of videos) {
        expect(fs.existsSync(storage.getSignLanguageVideoPath(video.videoId)!)).toBe(true)
      }
      expect(fs.readFileSync(path.join(bookDir, "videos", "sl_imported_pg001_sec001.mp4"), "utf8"))
        .toBe("page video")
    } finally {
      storage.close()
    }
  })

  it("keeps Studio edits and adopted videos across a re-projection", () => {
    const { booksDir, session, writeCurrent } = importedProject(makeBundleWithEasyReadAndSignLanguage())
    const storage = createBookStorage(session.label, booksDir)
    try {
      const imported = storage.getLatestNodeData("easy-read", "book")!.data as {
        blocks: Array<{ entries: Array<{ text: string }> }>
        generatedAt: string
      }
      imported.blocks[0].entries[0].text = "Edited in Studio"
      storage.putNodeData("easy-read", "book", imported)
    } finally {
      storage.close()
    }
    writeCurrent(ADT_IMPORT_PROJECTION_VERSION - 1)

    expect(ensureImportedAdtProjectProjection(session.label, booksDir)).toBe(true)

    const upgraded = createBookStorage(session.label, booksDir)
    try {
      expect(upgraded.getLatestNodeData("easy-read", "book")?.data).toMatchObject({
        blocks: [{ entries: [{ text: "Edited in Studio" }] }],
      })
      expect(upgraded.getSignLanguageVideos()).toHaveLength(2)
    } finally {
      upgraded.close()
    }
  })
})

describe("imported translation and speech stage completion", () => {
  function importedProject(archive: Buffer) {
    const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-translate-speech-"))
    temporaryRoots.push(booksDir)
    const session = seedFromArchive(archive, booksDir)
    const bookDir = path.join(booksDir, session.label)
    const revisionDir = path.join(bookDir, ".adt-imports", "speech-revision")
    fs.mkdirSync(revisionDir, { recursive: true })
    fs.writeFileSync(path.join(revisionDir, "source.zip"), archive)
    const writeCurrent = (projectionVersion: number) => fs.writeFileSync(
      path.join(bookDir, ".adt-import-current.json"),
      JSON.stringify({ version: 1, revisionId: "speech-revision", projectionVersion }),
    )
    writeCurrent(ADT_IMPORT_PROJECTION_VERSION)
    return { booksDir, session, writeCurrent }
  }

  it("completes the translate and speech stages from the archive's data", () => {
    const { booksDir, session } = importedProject(makeBundleWithUnchangedHtmlCatalog())

    expect(getBook(session.label, booksDir).completedStages)
      .toEqual(expect.arrayContaining(["translate", "speech"]))
    const storage = createBookStorage(session.label, booksDir)
    try {
      expect(storage.getStepRuns()).toEqual(expect.arrayContaining([
        expect.objectContaining({ step: "core-tts-catalog", status: "done" }),
        expect.objectContaining({ step: "tts", status: "done" }),
        expect.objectContaining({ step: "word-timestamps", status: "done" }),
      ]))
      expect(getReadyCoreTtsEntries(storage, "en")).toContainEqual({
        id: "pg001_n001",
        text: "Edited outside Studio",
      })
      expect(getReadyCoreTtsEntries(storage, "es")).toContainEqual({
        id: "pg001_n001",
        text: "Texto anterior",
      })
    } finally {
      storage.close()
    }
  })

  it("skips word timestamps when the archive has narration but no timecodes", () => {
    const files = unzipSync(makeBundleWithUnchangedHtmlCatalog())
    files["content/i18n/en/timecode/timecode_output.json"] = json({})
    const { booksDir, session } = importedProject(Buffer.from(zipSync(files)))

    expect(getBook(session.label, booksDir).completedStages).toContain("speech")
    const storage = createBookStorage(session.label, booksDir)
    try {
      expect(storage.getStepRuns()).toEqual(expect.arrayContaining([
        expect.objectContaining({ step: "tts", status: "done" }),
        expect.objectContaining({ step: "word-timestamps", status: "skipped" }),
      ]))
      expect(storage.getLatestNodeData("tts-timestamps", "en")).toBeNull()
    } finally {
      storage.close()
    }
  })

  // F11: a text the archive has no prepared speech for (no speech text, no
  // audio) was never prepared; Speech must prepare it, not reuse the display text.
  it("recovers the exporter's speech text and leaves never-prepared texts to Speech", () => {
    const { booksDir, session } = importedProject(makeBundleWithSpeechTexts())
    const storage = createBookStorage(session.label, booksDir)
    try {
      const entries = getReadyCoreTtsEntries(storage, "en")
      expect(entries).toContainEqual({
        id: "pg001_n001",
        text: "Edited outside Studio, spoken plainly",
      })
      expect(entries.map((entry) => entry.id)).not.toContain("gl001")
      const modes = new Map(getCoreTtsCatalog(storage, "en")!.entries
        .map((entry) => [entry.id, entry.generation.mode]))
      expect(modes.get("pg001_n001")).toBe("generated")
      expect(modes.has("gl001")).toBe(false)
      expect([...modes.values()]).not.toContain("manual")
    } finally {
      storage.close()
    }
  })

  it("withholds narration for text edited after export even when the HTML and texts.json agree", () => {
    const archive = makeBundleWithSpeechAfterGuideEdit()
    // Some narration is kept and the edited entry's is made again: the review
    // must say "partial", not "recovered" (review finding #1).
    expect(previewAdtRecoveryImport(archive).featureRecovery.speech).toBe("partial")

    const { booksDir, session } = importedProject(archive)
    const storage = createBookStorage(session.label, booksDir)
    try {
      const edited = getCoreTtsCatalog(storage, "en")!.entries.find((entry) => entry.id === "pg001_n001")
      expect(edited).toMatchObject({
        displayText: "Rewritten after export",
        speechText: null,
        status: "failed",
        generation: { mode: "unchanged" },
      })
      expect(getReadyCoreTtsEntries(storage, "en")).toContainEqual({ id: "gl001", text: "Hyena" })
      expect(storage.getLatestNodeData("tts", "en")?.data).toMatchObject({
        entries: [expect.objectContaining({ textId: "gl001", fileName: "hyena.mp3" })],
      })
      expect(fs.existsSync(path.join(booksDir, session.label, "audio", "en", "original.mp3"))).toBe(false)
    } finally {
      storage.close()
    }
  })

  it("keeps untouched narration whose prepared speech differs from its display text", () => {
    const { booksDir, session } = importedProject(makeBundleWithBaselinedNarrationAfterEdit())
    const storage = createBookStorage(session.label, booksDir)
    try {
      const catalog = new Map(getCoreTtsCatalog(storage, "en")!.entries.map((entry) => [entry.id, entry]))
      // The edited paragraph is compared with its export baseline, not with
      // the equally edited texts.json, so its old narration is withheld...
      expect(catalog.get("pg001_n001")).toMatchObject({ speechText: null, status: "failed" })
      // ...while one edit no longer invalidates narration elsewhere, even
      // where the spoken words legitimately differ from the displayed ones.
      expect(catalog.get("gl001")).toMatchObject({
        displayText: "Hyena",
        speechText: "the spotted hyena",
        status: "ready",
      })
      expect(storage.getLatestNodeData("tts", "en")?.data).toMatchObject({
        entries: [expect.objectContaining({ textId: "gl001", fileName: "hyena.mp3", source: "ai" })],
      })
      expect(fs.existsSync(path.join(booksDir, session.label, "audio", "en", "original.mp3"))).toBe(false)
      // Timings survive only with their audio, and are tied to its bytes so
      // regenerated audio can never inherit them.
      const audio = (storage.getLatestNodeData("tts", "en")?.data as { entries: Array<{ audioHash?: string }> }).entries[0]
      const timings = (storage.getLatestNodeData("tts-timestamps", "en")?.data as { entries: Record<string, { audioHash?: string }> }).entries
      expect(Object.keys(timings)).toEqual(["gl001"])
      expect(timings.gl001.audioHash).toBe(audio.audioHash)
      expect(audio.audioHash).toMatch(/^[a-f0-9]{64}$/)
    } finally {
      storage.close()
    }
  })

  // F11: recovered prepared speech carries input evidence, so editing its
  // source makes it an ordinary update instead of protected legacy content.
  it("lets a source edit re-prepare recovered speech", async () => {
    const { booksDir, session } = importedProject(makeBundleWithSpeechTexts())
    const promptsDir = path.resolve("prompts")
    stampImportedSpeechEvidence(session.label, booksDir, { promptsDir })
    const preparation = () => {
      const storage = createBookStorage(session.label, booksDir)
      try {
        return readOutputCatalog({
          storage,
          config: loadBookConfig(session.label, booksDir),
          bookDir: path.join(booksDir, session.label),
          promptsDir,
          configDir: path.resolve("config"),
          kinds: ["preparation"],
        }).find((status) => status.identity.kind === "preparation" && status.identity.id === "pg001_n001" && status.identity.language === "en")!
      } finally {
        storage.close()
      }
    }
    const storage = createBookStorage(session.label, booksDir)
    try {
      expect(getCoreTtsCatalog(storage, "en")!.entries.find((entry) => entry.id === "pg001_n001"))
        .toMatchObject({ input: expect.objectContaining({ signature: expect.any(String) }) })
    } finally {
      storage.close()
    }
    expect(preparation()).toMatchObject({ protected: false, updateNeeded: false, current: true })

    // Speech re-prepares the edited text and keeps the untouched one.
    const read = createBookStorage(session.label, booksDir)
    const imported = (() => {
      try {
        return getCoreTtsCatalog(read, "en")!
      } finally {
        read.close()
      }
    })()
    const sent: string[] = []
    const llmModel = {
      generateObject: async ({ context }: { context: { entries: Array<{ id: string; display_text: string }> } }) => {
        sent.push(...context.entries.map((e) => e.id))
        return { object: { entries: context.entries.map((e) => ({ id: e.id, speech_text: e.display_text, transformation_kinds: [] })) }, cached: false }
      },
    }
    const entries = imported.entries.map((e) => ({ id: e.id, text: e.id === "pg001_n001" ? "Edited again in Studio" : e.displayText }))
    const out = await prepareCoreTtsCatalog({
      entries,
      language: "en",
      config: buildCoreTtsPreparationConfig(loadBookConfig(session.label, booksDir)),
      profile: resolveCoreTtsProfile("en", loadCoreTtsProfiles(path.resolve("config"))),
      llmModel: llmModel as never,
      previous: imported,
    })
    expect(sent).toContain("pg001_n001")
    expect(out.entries.find((e) => e.id === "pg001_n001")?.displayText).toBe("Edited again in Studio")
  })

  it("lets a voice change regenerate recovered narration", () => {
    const { booksDir, session } = importedProject(makeBundleWithBaselinedNarrationAfterEdit())
    const promptsDir = path.resolve("prompts")
    stampImportedSpeechEvidence(session.label, booksDir, { promptsDir })
    const audioStatus = () => {
      const storage = createBookStorage(session.label, booksDir)
      try {
        return readOutputCatalog({
          storage,
          config: loadBookConfig(session.label, booksDir),
          bookDir: path.join(booksDir, session.label),
          promptsDir,
          configDir: path.resolve("config"),
          kinds: ["audio"],
        }).find((status) => status.identity.kind === "audio" && status.identity.id === "gl001")!
      } finally {
        storage.close()
      }
    }

    const storage = createBookStorage(session.label, booksDir)
    try {
      expect(storage.getLatestNodeData("tts", "en")?.data).toMatchObject({
        entries: [expect.objectContaining({
          textId: "gl001",
          source: "ai",
          speechInputSignature: expect.any(String),
          input: expect.objectContaining({ signature: expect.any(String) }),
        })],
      })
    } finally {
      storage.close()
    }
    // Current, and not protected like unknown or manual content.
    expect(audioStatus()).toMatchObject({ usable: true, protected: false, manual: false, updateNeeded: false })

    fs.writeFileSync(
      path.join(booksDir, session.label, "config.yaml"),
      "speech:\n  primary_voices:\n    openai:\n      en:\n        voice: echo\n",
    )
    expect(audioStatus()).toMatchObject({ usable: true, protected: false, updateNeeded: true })
  })

  it("seeds each Easy Read speech text once", () => {
    const { booksDir, session } = importedProject(makeBundleWithEasyReadAndSignLanguage())
    const storage = createBookStorage(session.label, booksDir)
    try {
      for (const language of ["en", "es"]) {
        const ids = getCoreTtsCatalog(storage, language)!.entries.map((entry) => entry.id)
        expect(ids.filter((id) => id === "pg001_n001_easy_read")).toHaveLength(1)
        expect(new Set(ids).size).toBe(ids.length)
      }
    } finally {
      storage.close()
    }
  })

  it("adopts narration only for texts the archive left unchanged", () => {
    const archive = makeBundleWithPartiallyStableNarration()
    expect(previewAdtRecoveryImport(archive).featureRecovery.speech).toBe("partial")

    const { booksDir, session } = importedProject(archive)
    expect(session.contentChanged).toBe(true)
    expect(getImportedAdtFeaturesNeedingRegeneration(session.label, booksDir)).toEqual([])
    const storage = createBookStorage(session.label, booksDir)
    try {
      expect(storage.getLatestNodeData("tts", "en")?.data).toMatchObject({
        entries: [expect.objectContaining({ textId: "gl001", fileName: "hyena.mp3" })],
      })
      expect(fs.existsSync(path.join(booksDir, session.label, "audio", "en", "original.mp3"))).toBe(false)
    } finally {
      storage.close()
    }
  })

  it("adds no speech or Core TTS versions on a re-projection", () => {
    const { booksDir, session, writeCurrent } = importedProject(makeBundleWithUnchangedHtmlCatalog())
    const before = createBookStorage(session.label, booksDir)
    const ttsVersion = before.getLatestNodeData("tts", "en")!.version
    const coreTtsVersion = before.getLatestNodeData("core-tts-catalog", "en")!.version
    before.close()
    writeCurrent(ADT_IMPORT_PROJECTION_VERSION - 1)

    expect(ensureImportedAdtProjectProjection(session.label, booksDir)).toBe(true)

    const after = createBookStorage(session.label, booksDir)
    try {
      expect(after.getLatestNodeData("tts", "en")!.version).toBe(ttsVersion)
      expect(after.getLatestNodeData("core-tts-catalog", "en")!.version).toBe(coreTtsVersion)
    } finally {
      after.close()
    }
    expect(getBook(session.label, booksDir).completedStages)
      .toEqual(expect.arrayContaining(["translate", "speech"]))
  })
})
