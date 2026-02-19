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
      storage.putNodeData("text-classification", `${label}_p1`, {
        reasoning: "test reasoning",
        groups: [
          {
            groupId: "g1",
            groupType: "body",
            texts: [
              { textType: "paragraph", text: "Hello world", isPruned: false },
            ],
          },
        ],
      })
      storage.putNodeData("image-filtering", `${label}_p1`, {
        images: [],
      })
      storage.putNodeData("page-sectioning", `${label}_p1`, {
        reasoning: "sectioned",
        sections: [
          {
            sectionId: `${label}_p1_sec001`,
            sectionType: "content",
            parts: [{ type: "text_group", groupId: "g1", groupType: "paragraph", texts: [{ textType: "section_text", text: "Hello world", isPruned: false }], isPruned: false }],
            backgroundColor: "#ffffff",
            textColor: "#000000",
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
      expect(body.textClassification).toBeTruthy()
      expect(body.textClassification.groups).toHaveLength(1)
      expect(body.imagClassification).toBeFalsy // typo check
      expect(body.imageClassification).toBeTruthy()
      expect(body.sectioning).toBeTruthy()
      expect(body.sectioning.sections).toHaveLength(1)
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
      expect(body.textClassification).toBeNull()
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

  describe("PUT /api/books/:label/pages/:pageId/text-classification", () => {
    it("saves text classification and returns version", async () => {
      const data = {
        reasoning: "updated reasoning",
        groups: [
          {
            groupId: "g1",
            groupType: "body",
            texts: [
              { textType: "paragraph", text: "Updated text", isPruned: false },
            ],
          },
        ],
      }

      const res = await app.request(
        `/api/books/${label}/pages/${label}_p1/text-classification`,
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
        `/api/books/${label}/pages/${label}_p1/text-classification`,
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
        groups: [],
      }

      const res = await app.request(
        `/api/books/${label}/pages/fake-page/text-classification`,
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
})
