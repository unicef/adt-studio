import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createBookStorage } from "@adt/storage"
import { createAdtPreviewRoutes } from "./adt-preview.js"

describe("ADT preview routes", () => {
  let tmpDir: string
  let webAssetsDir: string
  const label = "preview-book"

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-preview-route-"))
    webAssetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-preview-assets-"))
    fs.writeFileSync(path.join(webAssetsDir, "base.bundle.min.js"), "console.log('ok')")

    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putExtractedPage({
        pageId: `${label}_p1`,
        pageNumber: 1,
        text: "Page one",
        pageImage: {
          imageId: `${label}_p1_page`,
          buffer: Buffer.from("fake-png-data"),
          format: "png",
          hash: "hash-1",
          width: 100,
          height: 100,
        },
        images: [],
      })

      storage.putNodeData("metadata", "book", {
        title: "Preview Book",
        language_code: "en",
        reasoning: "test",
      })
      storage.putNodeData("config", "book", { language: "en" })
      storage.putNodeData("page-sectioning", `${label}_p1`, {
        reasoning: "ok",
        sections: [
          {
            sectionId: `${label}_p1_sec001`,
            sectionType: "content",
            parts: [],
            backgroundColor: "#fff",
            textColor: "#000",
            pageNumber: 1,
            isPruned: false,
          },
          {
            sectionId: `${label}_p1_sec002`,
            sectionType: "content",
            parts: [],
            backgroundColor: "#fff",
            textColor: "#000",
            pageNumber: 1,
            isPruned: false,
          },
        ],
      })
      storage.putNodeData("web-rendering", `${label}_p1`, {
        sections: [
          {
            sectionIndex: 0,
            sectionType: "content",
            reasoning: "ok",
            html: `<section data-section-id="${label}_p1_sec001"><p>First section body</p></section>`,
          },
          {
            sectionIndex: 1,
            sectionType: "content",
            reasoning: "ok",
            html: `<section data-section-id="${label}_p1_sec002"><p>Second section body</p></section>`,
          },
        ],
      })
    } finally {
      storage.close()
    }
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.rmSync(webAssetsDir, { recursive: true, force: true })
  })

  it("renders the requested section id instead of falling back to the first section", async () => {
    const app = createAdtPreviewRoutes(tmpDir, webAssetsDir, path.resolve(process.cwd(), "config.yaml"))
    const res = await app.request(`/books/${label}/adt-preview/${label}_p1_sec002.html`)

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("Second section body")
    expect(html).not.toContain("First section body")
  })

  it("returns 404 for unknown section ids on an existing page", async () => {
    const app = createAdtPreviewRoutes(tmpDir, webAssetsDir, path.resolve(process.cwd(), "config.yaml"))
    const res = await app.request(`/books/${label}/adt-preview/${label}_p1_sec999.html`)

    expect(res.status).toBe(404)
  })

  it("includes quiz pages anchored to pages without rendered sections in pages.json", async () => {
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putExtractedPage({
        pageId: `${label}_p2`,
        pageNumber: 2,
        text: "Page two",
        pageImage: {
          imageId: `${label}_p2_page`,
          buffer: Buffer.from("fake-png-data-2"),
          format: "png",
          hash: "hash-2",
          width: 100,
          height: 100,
        },
        images: [],
      })
      storage.putNodeData("quiz-generation", "book", {
        generatedAt: "2026-01-01T00:00:00.000Z",
        language: "en",
        pagesPerQuiz: 3,
        quizzes: [
          {
            quizIndex: 0,
            afterPageId: `${label}_p2`,
            pageIds: [`${label}_p2`],
            question: "What is 2+2?",
            options: [
              { text: "3", explanation: "Nope" },
              { text: "4", explanation: "Yes" },
            ],
            answerIndex: 1,
            reasoning: "test",
          },
        ],
      })
    } finally {
      storage.close()
    }

    const app = createAdtPreviewRoutes(tmpDir, webAssetsDir, path.resolve(process.cwd(), "config.yaml"))
    const res = await app.request(`/books/${label}/adt-preview/content/pages.json`)

    expect(res.status).toBe(200)
    const pages = await res.json() as Array<{ section_id: string; href: string }>
    expect(pages.at(-1)).toEqual({ section_id: "qz001", href: "qz001.html" })
  })

  it("orders pages.json sections by sectionIndex when rendering rows are out of order", async () => {
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putNodeData("web-rendering", `${label}_p1`, {
        sections: [
          {
            sectionIndex: 1,
            sectionType: "content",
            reasoning: "ok",
            html: `<section data-section-id="${label}_p1_sec002"><p>Second section body</p></section>`,
          },
          {
            sectionIndex: 0,
            sectionType: "content",
            reasoning: "ok",
            html: `<section data-section-id="${label}_p1_sec001"><p>First section body</p></section>`,
          },
        ],
      })
    } finally {
      storage.close()
    }

    const app = createAdtPreviewRoutes(tmpDir, webAssetsDir, path.resolve(process.cwd(), "config.yaml"))
    const res = await app.request(`/books/${label}/adt-preview/content/pages.json`)

    expect(res.status).toBe(200)
    const pages = await res.json() as Array<{ section_id: string; href: string }>
    expect(pages[0]).toEqual({ section_id: `${label}_p1_sec001`, href: `${label}_p1_sec001.html`, page_number: 1 })
    expect(pages[1]).toEqual({ section_id: `${label}_p1_sec002`, href: `${label}_p1_sec002.html`, page_number: 1 })
  })
})
