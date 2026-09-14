import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"
import { strToU8, unzipSync, zipSync } from "fflate"
import { createBookStorage } from "@adt/storage"

import { getImportedAdtFeaturesNeedingRegeneration } from "../presentation.js"
import { previewAdtRecoveryImport } from "../preview.js"
import {
  ADT_IMPORT_PROJECTION_VERSION,
  ensureImportedAdtProjectProjection,
} from "../projection.js"
import {
  json,
  makeBundle,
  makeBundleWithEasyReadAndSignLanguage,
  makeBundleWithUnchangedHtmlCatalog,
  makeFixedLayoutBundle,
  seedFromArchive,
  temporaryRoots,
} from "./fixtures.js"

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
