import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { parseBookLabel } from "@adt/types"
import { createBookStorage } from "@adt/storage"

const SAFE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
const AssignBody = z.object({ sectionId: z.string().regex(SAFE_ID_RE).nullable() })
const ALLOWED_MIME_TYPES = new Set(["video/mp4", "video/webm"])

export function createSignLanguageVideoRoutes(booksDir: string): Hono {
  const app = new Hono()

  // GET /books/:label/sign-language-videos — List all sign language videos
  app.get("/books/:label/sign-language-videos", (c) => {
    const { label } = c.req.param()
    const storage = createBookStorage(label, booksDir)
    try {
      const videos = storage.getSignLanguageVideos()
      return c.json({ videos })
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/sign-language-videos — Upload a sign language video
  app.post("/books/:label/sign-language-videos", async (c) => {
    const { label } = c.req.param()
    const formData = await c.req.formData()
    const videoFile = formData.get("video")

    if (!(videoFile instanceof File)) {
      throw new HTTPException(400, { message: "video file is required" })
    }

    const mimeType = videoFile.type || "video/mp4"
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new HTTPException(400, { message: `Unsupported video type: ${mimeType}. Allowed: mp4, webm` })
    }

    parseBookLabel(label) // validate
    const videoId = `sl_${Date.now()}`
    const buffer = Buffer.from(await videoFile.arrayBuffer())

    const storage = createBookStorage(label, booksDir)
    try {
      storage.putSignLanguageVideo(videoId, buffer, videoFile.name, mimeType)
      return c.json({ videoId, originalName: videoFile.name, mimeType, sizeBytes: buffer.length }, 201)
    } finally {
      storage.close()
    }
  })

  // PUT /books/:label/sign-language-videos/:videoId/assign — Assign video to a section
  app.put("/books/:label/sign-language-videos/:videoId/assign", async (c) => {
    const { label, videoId } = c.req.param()
    if (!SAFE_ID_RE.test(videoId)) {
      throw new HTTPException(400, { message: "Invalid video ID" })
    }

    const parsed = AssignBody.safeParse(await c.req.json())
    if (!parsed.success) {
      throw new HTTPException(400, { message: "Invalid request body" })
    }
    const { sectionId } = parsed.data
    const storage = createBookStorage(label, booksDir)
    try {
      storage.assignSignLanguageVideo(videoId, sectionId)
      return c.json({ ok: true })
    } finally {
      storage.close()
    }
  })

  // DELETE /books/:label/sign-language-videos/:videoId — Delete a video
  app.delete("/books/:label/sign-language-videos/:videoId", (c) => {
    const { label, videoId } = c.req.param()
    if (!SAFE_ID_RE.test(videoId)) {
      throw new HTTPException(400, { message: "Invalid video ID" })
    }

    const storage = createBookStorage(label, booksDir)
    try {
      storage.deleteSignLanguageVideo(videoId)
      return c.json({ ok: true })
    } finally {
      storage.close()
    }
  })

  // GET /books/:label/sign-language-videos/:videoId — Serve video binary
  app.get("/books/:label/sign-language-videos/:videoId", (c) => {
    const { label, videoId } = c.req.param()
    if (!SAFE_ID_RE.test(videoId)) {
      throw new HTTPException(400, { message: "Invalid video ID" })
    }

    const storage = createBookStorage(label, booksDir)
    try {
      const filePath = storage.getSignLanguageVideoPath(videoId)
      if (!filePath || !fs.existsSync(filePath)) {
        throw new HTTPException(404, { message: `Video not found: ${videoId}` })
      }

      const ext = path.extname(filePath).toLowerCase()
      const contentType = ext === ".webm" ? "video/webm" : "video/mp4"
      const videoBuffer = fs.readFileSync(filePath)
      c.header("Content-Type", contentType)
      c.header("Cache-Control", "public, max-age=86400")
      return c.body(videoBuffer)
    } finally {
      storage.close()
    }
  })

  return app
}
