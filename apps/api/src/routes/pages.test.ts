import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import { errorHandler } from "../middleware/error-handler.js"
import { createPageRoutes } from "./pages.js"

describe("Page routes", () => {
  let tmpDir: string
  let app: Hono
  const label = "test-book"

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pages-routes-"))

    // Create a book with extracted pages and pipeline data
    const storage = createBookStorage(label, tmpDir)
    try {
      // Simulate extracted pages
      const fakeImage = {
        imageId: `${label}_p1_page`,
        buffer: Buffer.from("fake-png-data"),
        format: "png" as const,
        hash: "abc123",
        width: 800,
        height: 600,
      }
      storage.putExtractedPage({
        pageId: `${label}_p1`,
        pageNumber: 1,
        text: "Page one text content",
        pageImage: fakeImage,
        images: [],
      })

      const fakeImage2 = {
        imageId: `${label}_p2_page`,
        buffer: Buffer.from("fake-png-data-2"),
        format: "png" as const,
        hash: "def456",
        width: 800,
        height: 600,
      }
      storage.putExtractedPage({
        pageId: `${label}_p2`,
        pageNumber: 2,
        text: "Page two text content",
        pageImage: fakeImage2,
        images: [],
      })

      // Simulate pipeline output for page 1
      storage.putNodeData("image-filtering", `${label}_p1`, {
        images: [],
      })
      storage.putNodeData("page-sectioning", `${label}_p1`, {
        reasoning: "sectioned",
        sections: [
          {
            sectionId: `${label}_p1_sec001`,
            sectionType: "content",
            backgroundColor: "#ffffff",
            textColor: "#000000",
            pageNumber: 1,
            isPruned: false,
            nodes: [
              {
                nodeId: `${label}_p1_n001`,
                isPruned: false,
                role: "text",
                text: "Hello world",
              },
            ],
          },
        ],
      })
      storage.putNodeData("web-rendering", `${label}_p1`, {
        sections: [
          {
            sectionIndex: 0,
            sectionType: "content",
            reasoning: "rendered",
            html: "<div>Hello world</div>",
          },
        ],
      })
    } finally {
      storage.close()
    }

    const routes = createPageRoutes(tmpDir, tmpDir)
    app = new Hono()
    app.onError(errorHandler)
    app.route("/api", routes)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("GET /api/books/:label/pages", () => {
    it("returns list of pages", async () => {
      const res = await app.request(`/api/books/${label}/pages`)

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(2)
      expect(body[0].pageId).toBe(`${label}_p1`)
      expect(body[0].pageNumber).toBe(1)
      expect(body[0].hasRendering).toBe(true)
      expect(body[0].textPreview).toBe("Hello world")
      expect(body[1].pageId).toBe(`${label}_p2`)
      expect(body[1].pageNumber).toBe(2)
      expect(body[1].hasRendering).toBe(false)
    })

    it("returns 404 for nonexistent book", async () => {
      const res = await app.request("/api/books/no-such-book/pages")
      expect(res.status).toBe(404)
    })
  })

  describe("GET /api/books/:label/pages/:pageId", () => {
    it("returns full page data with pipeline outputs", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1`
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.pageId).toBe(`${label}_p1`)
      expect(body.pageNumber).toBe(1)
      expect(body.text).toBe("Page one text content")
      expect(body.imageClassification).toBeTruthy()
      expect(body.sectioningTree).toBeTruthy()
      expect(body.sectioningTree.sections).toHaveLength(1)
      expect(body.sectioningTree.sections[0].nodes).toHaveLength(1)
      expect(body.sectioningTree.sections[0].nodes[0].role).toBe("text")
      expect(body.sectioningTree.sections[0].nodes[0].text).toBe("Hello world")
      expect(body.rendering).toBeTruthy()
      expect(body.rendering.sections[0].html).toBe(
        "<div>Hello world</div>"
      )
    })

    it("returns page without pipeline data if not processed", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/${label}_p2`
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.pageId).toBe(`${label}_p2`)
      expect(body.sectioningTree).toBeNull()
      expect(body.rendering).toBeNull()
    })

    it("returns 404 for nonexistent page", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/fake-page`
      )
      expect(res.status).toBe(404)
    })
  })

  describe("GET /api/books/:label/pages/:pageId/image", () => {
    it("returns page image as base64 JSON", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/image`
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.imageBase64).toBeTruthy()
      expect(typeof body.imageBase64).toBe("string")
    })

    it("returns 404 for nonexistent page image", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/fake-page/image`
      )
      expect(res.status).toBe(404)
    })
  })

  describe("PUT /api/books/:label/pages/:pageId/sectioning", () => {
    it("saves page sectioning and returns version", async () => {
      const data = {
        reasoning: "updated reasoning",
        sections: [
          {
            sectionId: `${label}_p1_sec001`,
            sectionType: "content",
            backgroundColor: "#ffffff",
            textColor: "#000000",
            pageNumber: 1,
            isPruned: false,
            nodes: [
              {
                nodeId: `${label}_p1_g001`,
                isPruned: false,
                structure: "paragraph",
                children: [
                  {
                    nodeId: `${label}_p1_n001`,
                    isPruned: false,
                    role: "text",
                    text: "Updated text",
                  },
                ],
              },
            ],
          },
        ],
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sectioning`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.version).toBe(2) // version 1 was set in beforeEach
    })

    it("returns 400 for invalid body", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sectioning`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bad: "data" }),
        }
      )

      expect(res.status).toBe(400)
    })

    it("returns 404 for nonexistent page", async () => {
      const data = {
        reasoning: "test",
        sections: [],
      }

      const res = await app.request(
        `/api/books/${label}/pages/fake-page/sectioning`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      )

      expect(res.status).toBe(404)
    })
  })

  describe("PUT /api/books/:label/pages/:pageId/image-filtering", () => {
    it("saves image classification and returns version", async () => {
      const data = {
        images: [
          { imageId: "img1", isPruned: false, reason: "kept" },
        ],
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/image-filtering`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.version).toBe(2) // version 1 was set in beforeEach
    })

    it("returns 400 for invalid body", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/image-filtering`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bad: "data" }),
        }
      )

      expect(res.status).toBe(400)
    })
  })

  describe("POST /api/books/:label/pages/:pageId/sections/:sectionIndex/clone", () => {
    it("assigns fresh ids to cloned containers but preserves leaf ids", async () => {
      const sourceContainerId = `${label}_p1_n0001`
      const sourceLeafId = `${label}_p1_n0002`

      const storage = createBookStorage(label, tmpDir)
      try {
        storage.putNodeData("page-sectioning", `${label}_p1`, {
          reasoning: "nested",
          sections: [
            {
              sectionId: `${label}_p1_sec001`,
              sectionType: "content",
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
              nodes: [
                {
                  nodeId: sourceContainerId,
                  isPruned: false,
                  structure: "group",
                  children: [
                    {
                      nodeId: sourceLeafId,
                      isPruned: false,
                      role: "text",
                      text: "Hello world",
                    },
                  ],
                },
              ],
            },
          ],
        })
        storage.putNodeData("web-rendering", `${label}_p1`, {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "content",
              reasoning: "rendered",
              html:
                `<section data-section-id="${label}_p1_sec001">` +
                `<div data-id="${sourceContainerId}">` +
                `<p data-id="${sourceLeafId}">Hello world</p>` +
                "</div></section>",
            },
          ],
        })
      } finally {
        storage.close()
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sections/0/clone`,
        { method: "POST" }
      )

      expect(res.status).toBe(200)

      const verify = createBookStorage(label, tmpDir)
      try {
        const sectioningRow = verify.getLatestNodeData("page-sectioning", `${label}_p1`)
        const sectioning = sectioningRow?.data as {
          sections: Array<{
            sectionId: string
            nodes: Array<{
              nodeId: string
              children?: Array<{ nodeId: string }>
            }>
          }>
        }
        expect(sectioning.sections).toHaveLength(2)

        const original = sectioning.sections[0]
        const cloned = sectioning.sections[1]
        expect(cloned.sectionId).toBe(`${label}_p1_sec002`)
        expect(cloned.nodes[0]?.nodeId).not.toBe(original.nodes[0]?.nodeId)
        expect(cloned.nodes[0]?.children?.[0]?.nodeId).toBe(sourceLeafId)

        const renderingRow = verify.getLatestNodeData("web-rendering", `${label}_p1`)
        const rendering = renderingRow?.data as {
          sections: Array<{ sectionIndex: number; html: string }>
        }
        const clonedRendering = rendering.sections.find((section) => section.sectionIndex === 1)
        expect(clonedRendering?.html).toContain(`data-section-id="${label}_p1_sec002"`)
        expect(clonedRendering?.html).toContain(`data-id="${cloned.nodes[0]?.nodeId}"`)
        expect(clonedRendering?.html).toContain(`data-id="${sourceLeafId}"`)
        expect(clonedRendering?.html).not.toContain(`data-id="${sourceContainerId}"`)
      } finally {
        verify.close()
      }
    })
  })

  describe("POST /api/books/:label/pages/:pageId/re-render", () => {
    it("returns 400 when X-OpenAI-Key header is missing", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/re-render`,
        { method: "POST" }
      )

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("X-OpenAI-Key")
    })

    it("returns 400 when sectionIndex query is out of range", async () => {
      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/re-render?sectionIndex=99`,
        {
          method: "POST",
          headers: { "X-OpenAI-Key": "sk-test" },
        }
      )

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("out of range")
    })
  })

  describe("POST /api/books/:label/images/ai-generate", () => {
    const pageId = "test-book_p1"
    const endpoint = `/api/books/${label}/images/ai-generate?pageId=${pageId}`

    it("returns 400 when X-OpenAI-Key header is missing", async () => {
      const res = await app.request(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "a cat" }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("X-OpenAI-Key")
    })

    it("returns 400 when pageId query param is missing", async () => {
      const res = await app.request(`/api/books/${label}/images/ai-generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenAI-Key": "sk-test",
        },
        body: JSON.stringify({ prompt: "a cat" }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("pageId")
    })

    it("returns 400 when prompt is missing", async () => {
      const res = await app.request(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenAI-Key": "sk-test",
        },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("prompt")
    })

    it("returns 404 for nonexistent book", async () => {
      const res = await app.request(
        `/api/books/no-such-book/images/ai-generate?pageId=pg001`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-OpenAI-Key": "sk-test",
          },
          body: JSON.stringify({ prompt: "a cat" }),
        }
      )

      expect(res.status).toBe(404)
    })

    it("rejects referenceImageId with path traversal characters", async () => {
      const res = await app.request(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenAI-Key": "sk-test",
        },
        body: JSON.stringify({
          prompt: "a cat",
          referenceImageId: "../../../etc/passwd",
        }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("Invalid image ID")
    })

    it("rejects targetImageId with path traversal characters", async () => {
      const res = await app.request(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenAI-Key": "sk-test",
        },
        body: JSON.stringify({
          prompt: "a cat",
          targetImageId: "../../secret",
        }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("Invalid image ID")
    })

    it("returns 404 when reference image file does not exist", async () => {
      const res = await app.request(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenAI-Key": "sk-test",
        },
        body: JSON.stringify({
          prompt: "make it brighter",
          referenceImageId: "nonexistent-image",
        }),
      })

      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toContain("Reference image not found")
    })
  })

  describe("POST /api/books/:label/images (crop upload)", () => {
    it("uploads a cropped image and returns new imageId", async () => {
      // Create a minimal valid PNG (1x1 pixel)
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, // width: 1
        0x00, 0x00, 0x00, 0x01, // height: 1
        0x08, 0x02, 0x00, 0x00, 0x00, // bit depth, color type, etc.
        0x90, 0x77, 0x53, 0xde, // CRC
      ])

      const formData = new FormData()
      formData.append("image", new Blob([pngHeader], { type: "image/png" }), "crop.png")
      formData.append("pageId", `${label}_p1`)
      formData.append("sourceImageId", `${label}_p1_page`)

      const res = await app.request(`/api/books/${label}/images`, {
        method: "POST",
        body: formData,
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.imageId).toBe(`${label}_p1_page_crop1`)
      expect(body.width).toBe(1)
      expect(body.height).toBe(1)
    })

    it("increments crop suffix for duplicate uploads", async () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x02,
        0x00, 0x00, 0x00, 0x02,
        0x08, 0x02, 0x00, 0x00, 0x00,
        0xfd, 0xd4, 0x9a, 0x73,
      ])

      // First upload
      const form1 = new FormData()
      form1.append("image", new Blob([pngHeader], { type: "image/png" }), "crop.png")
      form1.append("pageId", `${label}_p1`)
      form1.append("sourceImageId", `${label}_p1_page`)
      await app.request(`/api/books/${label}/images`, { method: "POST", body: form1 })

      // Second upload
      const form2 = new FormData()
      form2.append("image", new Blob([pngHeader], { type: "image/png" }), "crop.png")
      form2.append("pageId", `${label}_p1`)
      form2.append("sourceImageId", `${label}_p1_page`)
      const res = await app.request(`/api/books/${label}/images`, { method: "POST", body: form2 })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.imageId).toBe(`${label}_p1_page_crop2`)
    })

    it("returns 400 when image file is missing", async () => {
      const formData = new FormData()
      formData.append("pageId", `${label}_p1`)
      formData.append("sourceImageId", `${label}_p1_page`)

      const res = await app.request(`/api/books/${label}/images`, {
        method: "POST",
        body: formData,
      })

      expect(res.status).toBe(400)
    })

    it("returns 400 when pageId is missing", async () => {
      const formData = new FormData()
      formData.append("image", new Blob([Buffer.alloc(10)], { type: "image/png" }), "crop.png")
      formData.append("sourceImageId", `${label}_p1_page`)

      const res = await app.request(`/api/books/${label}/images`, {
        method: "POST",
        body: formData,
      })

      expect(res.status).toBe(400)
    })

    it("returns 400 when sourceImageId is missing", async () => {
      const formData = new FormData()
      formData.append("image", new Blob([Buffer.alloc(10)], { type: "image/png" }), "crop.png")
      formData.append("pageId", `${label}_p1`)

      const res = await app.request(`/api/books/${label}/images`, {
        method: "POST",
        body: formData,
      })

      expect(res.status).toBe(400)
    })

    it("rejects sourceImageId with path traversal characters", async () => {
      const formData = new FormData()
      formData.append("image", new Blob([Buffer.alloc(10)], { type: "image/png" }), "crop.png")
      formData.append("pageId", `${label}_p1`)
      formData.append("sourceImageId", "../../../etc/passwd")

      const res = await app.request(`/api/books/${label}/images`, {
        method: "POST",
        body: formData,
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("Invalid image ID")
    })

    it("returns 404 for nonexistent book", async () => {
      const formData = new FormData()
      formData.append("image", new Blob([Buffer.alloc(10)], { type: "image/png" }), "crop.png")
      formData.append("pageId", "pg001")
      formData.append("sourceImageId", "img001")

      const res = await app.request(`/api/books/no-such-book/images`, {
        method: "POST",
        body: formData,
      })

      expect(res.status).toBe(404)
    })
  })

  // ---------------------------------------------------------------------------
  // Downstream data clearing tests
  // ---------------------------------------------------------------------------

  /**
   * Seed downstream pipeline data and step_runs so we can verify they get
   * cleared after storyboard/image edits.
   */
  function seedDownstreamData(dir: string, bookLabel: string) {
    const s = createBookStorage(bookLabel, dir)
    try {
      s.putNodeData("image-captioning", `${bookLabel}_p1`, {
        captions: [{ imageId: "img1", reasoning: "test", caption: "A cat" }],
      })
      s.putNodeData("text-catalog", `${bookLabel}_p1`, {
        entries: [{ id: "t1", text: "Hello" }],
      })
      s.putNodeData("text-catalog-translation", `${bookLabel}_p1`, {
        locale: "es", entries: [{ id: "t1", text: "Hola" }],
      })
      s.putNodeData("easy-read", "book", {
        blocks: [{
          pageId: `${bookLabel}_p1`,
          pageNumber: 1,
          sectionId: `${bookLabel}_p1_sec001`,
          sectionIndex: 0,
          sectionType: "content",
          entries: [{
            sourceId: "t1",
            easyReadId: "t1_easy_read",
            originalText: "Hello",
            text: "Easy hello",
            pageId: `${bookLabel}_p1`,
            sectionId: `${bookLabel}_p1_sec001`,
            sectionIndex: 0,
          }],
        }],
        generatedAt: "2026-01-01T00:00:00.000Z",
      })
      s.putNodeData("tts", `${bookLabel}_p1`, {
        entries: [{ id: "t1", url: "audio.mp3" }],
      })
      s.putNodeData("tts-timestamps", "en", {
        entries: { t1: { words: [{ text: "Hello", start: 0, end: 1 }] } },
      })
      s.putNodeData("accessibility-assessment", "book", {
        summary: { violations: 0 },
        pages: [],
      })
      // Mark corresponding steps as completed
      s.markStepCompleted("image-captioning")
      s.markStepCompleted("text-catalog")
      s.markStepCompleted("easy-read")
      s.markStepCompleted("catalog-translation")
      s.markStepCompleted("image-translation")
      s.markStepCompleted("tts")
      s.markStepCompleted("word-timestamps")
      s.markStepCompleted("package-web")
      s.markStepCompleted("accessibility-assessment")
    } finally {
      s.close()
    }
  }

  /** Assert that all storyboard-dependent node data and step_runs were cleared. */
  function expectAllDownstreamCleared(dir: string, bookLabel: string) {
    const s = createBookStorage(bookLabel, dir)
    try {
      // Node data should be gone
      expect(s.getLatestNodeData("image-captioning", `${bookLabel}_p1`)).toBeNull()
      expect(s.getLatestNodeData("text-catalog", `${bookLabel}_p1`)).toBeNull()
      expect(s.getLatestNodeData("text-catalog-translation", `${bookLabel}_p1`)).toBeNull()
      expect(s.getLatestNodeData("easy-read", "book")).toBeNull()
      expect(s.getLatestNodeData("tts", `${bookLabel}_p1`)).toBeNull()
      expect(s.getLatestNodeData("tts-timestamps", "en")).toBeNull()
      expect(s.getLatestNodeData("accessibility-assessment", "book")).toBeNull()
      // Step runs should be gone
      const runs = s.getStepRuns()
      const clearedSteps = [
        "image-captioning",
        "text-catalog",
        "easy-read",
        "catalog-translation",
        "image-translation",
        "tts",
        "word-timestamps",
        "package-web",
        "accessibility-assessment",
      ]
      for (const step of clearedSteps) {
        expect(runs.find((r) => r.step === step)).toBeUndefined()
      }
    } finally {
      s.close()
    }
  }

  /** Assert that translate/speech (but NOT image-captioning) node data and step_runs were cleared. */
  function expectTextAndSpeechCleared(dir: string, bookLabel: string) {
    const s = createBookStorage(bookLabel, dir)
    try {
      // image-captioning should still exist
      expect(s.getLatestNodeData("image-captioning", `${bookLabel}_p1`)).not.toBeNull()
      expect(s.getLatestNodeData("easy-read", "book")).not.toBeNull()
      // text-catalog, translations, tts should be gone
      expect(s.getLatestNodeData("text-catalog", `${bookLabel}_p1`)).toBeNull()
      expect(s.getLatestNodeData("text-catalog-translation", `${bookLabel}_p1`)).toBeNull()
      expect(s.getLatestNodeData("tts", `${bookLabel}_p1`)).toBeNull()
      expect(s.getLatestNodeData("tts-timestamps", "en")).toBeNull()
      expect(s.getLatestNodeData("accessibility-assessment", "book")).toBeNull()
      // Step runs: image-captioning should remain, text steps should be gone
      const runs = s.getStepRuns()
      expect(runs.find((r) => r.step === "image-captioning")).toBeDefined()
      expect(runs.find((r) => r.step === "easy-read")).toBeDefined()
      for (const step of [
        "text-catalog",
        "catalog-translation",
        "image-translation",
        "tts",
        "word-timestamps",
        "package-web",
        "accessibility-assessment",
      ]) {
        expect(runs.find((r) => r.step === step)).toBeUndefined()
      }
    } finally {
      s.close()
    }
  }

  describe("PUT /api/books/:label/pages/:pageId/sectioning clears downstream", () => {
    it("clears caption + translate/speech data on sectioning save", async () => {
      seedDownstreamData(tmpDir, label)

      const data = {
        reasoning: "updated",
        sections: [{
          sectionId: `${label}_p1_sec001`,
          sectionType: "content",
          backgroundColor: "#ffffff",
          textColor: "#000000",
          pageNumber: 1,
          isPruned: false,
          nodes: [
            {
              nodeId: `${label}_p1_g001`,
              isPruned: false,
              structure: "paragraph",
              children: [
                {
                  nodeId: `${label}_p1_n002`,
                  isPruned: false,
                  role: "text",
                  text: "Updated text",
                },
              ],
            },
          ],
        }],
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/sectioning`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      )

      expect(res.status).toBe(200)
      expectAllDownstreamCleared(tmpDir, label)
    })
  })

  describe("PUT /api/books/:label/pages/:pageId/rendering clears downstream", () => {
    it("clears caption + translate/speech data on rendering save", async () => {
      seedDownstreamData(tmpDir, label)

      const data = {
        sections: [{
          sectionIndex: 0,
          sectionType: "content",
          reasoning: "updated render",
          html: "<div>Updated</div>",
        }],
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/rendering`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      )

      expect(res.status).toBe(200)
      expectAllDownstreamCleared(tmpDir, label)
    })
  })

  describe("POST crop (images) clears downstream", () => {
    it("clears caption + translate/speech data on image crop", async () => {
      seedDownstreamData(tmpDir, label)

      // Minimal valid PNG (1x1 pixel)
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01,
        0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00,
        0x90, 0x77, 0x53, 0xde,
      ])

      const formData = new FormData()
      formData.append("image", new Blob([pngHeader], { type: "image/png" }), "crop.png")
      formData.append("pageId", `${label}_p1`)
      formData.append("sourceImageId", `${label}_p1_page`)

      const res = await app.request(`/api/books/${label}/images`, {
        method: "POST",
        body: formData,
      })

      expect(res.status).toBe(200)
      expectAllDownstreamCleared(tmpDir, label)
    })
  })

  describe("PUT image-captioning clears translate/speech downstream", () => {
    it("clears text-catalog/translations/TTS but keeps image-captioning", async () => {
      seedDownstreamData(tmpDir, label)

      const data = {
        captions: [{ imageId: "img1", reasoning: "updated", caption: "A dog" }],
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/image-captioning`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      )

      expect(res.status).toBe(200)
      // image-captioning was just saved (new version), so it should exist
      // but text-catalog, translations, tts should be cleared
      expectTextAndSpeechCleared(tmpDir, label)
    })
  })
})
