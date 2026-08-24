import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"
import { strToU8, unzipSync, zipSync } from "fflate"
import { createBookStorage } from "@adt/storage"

import { previewAdtRecoveryImport } from "../preview.js"
import {
  json,
  makeBundle,
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
