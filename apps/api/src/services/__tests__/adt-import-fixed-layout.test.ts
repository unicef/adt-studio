import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"
import yaml from "js-yaml"
import { isFixedLayoutBook } from "@adt/pipeline"
import { createBookStorage } from "@adt/storage"
import type { AppConfig } from "@adt/types"

import {
  ADT_IMPORT_PROJECTION_VERSION,
  ensureImportedAdtProjectProjection,
} from "../adt-import-projection.js"
import {
  json,
  makeBundle,
  makeFixedLayoutBundle,
  seedFromArchive,
  temporaryRoots,
} from "./adt-import-fixtures.js"

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

