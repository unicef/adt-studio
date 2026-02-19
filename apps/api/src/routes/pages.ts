import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel, TextClassificationOutput, ImageClassificationOutput, PageSectioningOutput, WebRenderingOutput, ImageCaptioningOutput } from "@adt/types"
import { openBookDb } from "@adt/storage"
import { createBookStorage } from "@adt/storage"
import { reRenderPage, aiEditSection } from "../services/page-edit-service.js"

interface PageSummary {
  pageId: string
  pageNumber: number
  hasRendering: boolean
  hasCaptioning: boolean
  textPreview: string
  imageCount: number
  wordCount: number
}

interface PageDetail {
  pageId: string
  pageNumber: number
  text: string
  textClassification: unknown | null
  imageClassification: unknown | null
  sectioning: unknown | null
  rendering: unknown | null
  imageCaptioning: unknown | null
  versions: {
    textClassification: number | null
    imageClassification: number | null
    sectioning: number | null
    rendering: number | null
    imageCaptioning: number | null
  }
}

function getDbPath(label: string, booksDir: string): string {
  const safeLabel = parseBookLabel(label)
  return path.join(path.resolve(booksDir), safeLabel, `${safeLabel}.db`)
}

/** Validate that an image/page ID is filesystem-safe (no path traversal). */
function validateImageId(id: string): string {
  if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) {
    throw new HTTPException(400, { message: `Invalid image ID: ${id}` })
  }
  return id
}

export function createPageRoutes(
  booksDir: string,
  promptsDir: string,
  configPath?: string
): Hono {
  const app = new Hono()

  // GET /books/:label/pages — List pages with pipeline status
  app.get("/books/:label/pages", (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const dbPath = getDbPath(safeLabel, booksDir)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, {
        message: `Book not found or not yet extracted: ${safeLabel}`,
      })
    }

    const db = openBookDb(dbPath)
    try {
      const pages = db.all(
        "SELECT page_id, page_number, text FROM pages ORDER BY page_number"
      ) as Array<{ page_id: string; page_number: number; text: string }>

      // Check which pages have web-rendering output
      const rendered = new Set<string>()
      const renderRows = db.all(
        "SELECT DISTINCT item_id FROM node_data WHERE node = ?",
        ["web-rendering"]
      ) as Array<{ item_id: string }>
      for (const row of renderRows) {
        rendered.add(row.item_id)
      }

      // Check which pages have image-captioning output
      const captioned = new Set<string>()
      const captionRows = db.all(
        "SELECT DISTINCT item_id FROM node_data WHERE node = ?",
        ["image-captioning"]
      ) as Array<{ item_id: string }>
      for (const row of captionRows) {
        captioned.add(row.item_id)
      }

      // Get image counts per page from image-classification node data
      const imageCounts = new Map<string, number>()
      const imageRows = db.all(
        "SELECT item_id, data FROM node_data WHERE node = ? ORDER BY version DESC",
        ["image-classification"]
      ) as Array<{ item_id: string; data: string }>
      for (const row of imageRows) {
        if (!imageCounts.has(row.item_id)) {
          try {
            const parsed = JSON.parse(row.data)
            const images = parsed.images as Array<{ imageId: string }>
            // Exclude page image from count
            const count = images.filter((img) => img.imageId !== `${row.item_id}_page`).length
            imageCounts.set(row.item_id, count)
          } catch {
            imageCounts.set(row.item_id, 0)
          }
        }
      }

      // Get classified text per page from text-classification node data
      const classifiedText = new Map<string, string>()
      const textClassRows = db.all(
        "SELECT item_id, data FROM node_data WHERE node = ? ORDER BY version DESC",
        ["text-classification"]
      ) as Array<{ item_id: string; data: string }>
      for (const row of textClassRows) {
        if (!classifiedText.has(row.item_id)) {
          try {
            const parsed = JSON.parse(row.data) as {
              groups: Array<{ texts: Array<{ text: string; isPruned: boolean }> }>
            }
            const texts = parsed.groups
              .flatMap((g) => g.texts)
              .filter((t) => !t.isPruned)
              .map((t) => t.text)
            classifiedText.set(row.item_id, texts.join("\n"))
          } catch {
            // ignore parse errors
          }
        }
      }

      const result: PageSummary[] = pages.map((p) => ({
        pageId: p.page_id,
        pageNumber: p.page_number,
        hasRendering: rendered.has(p.page_id),
        hasCaptioning: captioned.has(p.page_id),
        textPreview: classifiedText.get(p.page_id) ?? p.text.slice(0, 150),
        imageCount: imageCounts.get(p.page_id) ?? 0,
        wordCount: p.text.trim() ? p.text.trim().split(/\s+/).length : 0,
      }))

      return c.json(result)
    } finally {
      db.close()
    }
  })

  // GET /books/:label/pages/:pageId — Full page data with pipeline outputs
  app.get("/books/:label/pages/:pageId", (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const dbPath = getDbPath(safeLabel, booksDir)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, {
        message: `Book not found: ${safeLabel}`,
      })
    }

    const db = openBookDb(dbPath)
    try {
      // Get page data
      const pageRows = db.all(
        "SELECT page_id, page_number, text FROM pages WHERE page_id = ?",
        [pageId]
      ) as Array<{ page_id: string; page_number: number; text: string }>

      if (pageRows.length === 0) {
        throw new HTTPException(404, {
          message: `Page not found: ${pageId}`,
        })
      }

      const page = pageRows[0]

      // Get pipeline outputs (data + version)
      const getNodeData = (node: string): { data: unknown; version: number } | null => {
        const rows = db.all(
          "SELECT data, version FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
          [node, pageId]
        ) as Array<{ data: string; version: number }>
        if (rows.length === 0) return null
        return { data: JSON.parse(rows[0].data), version: rows[0].version }
      }

      const textClassNode = getNodeData("text-classification")
      const imageClassNode = getNodeData("image-classification")
      const sectioningNode = getNodeData("page-sectioning")
      const renderingNode = getNodeData("web-rendering")
      const imageCaptioningNode = getNodeData("image-captioning")

      const result: PageDetail = {
        pageId: page.page_id,
        pageNumber: page.page_number,
        text: page.text,
        textClassification: textClassNode?.data ?? null,
        imageClassification: imageClassNode?.data ?? null,
        sectioning: sectioningNode?.data ?? null,
        rendering: renderingNode?.data ?? null,
        imageCaptioning: imageCaptioningNode?.data ?? null,
        versions: {
          textClassification: textClassNode?.version ?? null,
          imageClassification: imageClassNode?.version ?? null,
          sectioning: sectioningNode?.version ?? null,
          rendering: renderingNode?.version ?? null,
          imageCaptioning: imageCaptioningNode?.version ?? null,
        },
      }

      return c.json(result)
    } finally {
      db.close()
    }
  })

  // GET /books/:label/pages/:pageId/image — Page image as base64
  app.get("/books/:label/pages/:pageId/image", (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const resolvedDir = path.resolve(booksDir)
    const bookDir = path.join(resolvedDir, safeLabel)
    const dbPath = path.join(bookDir, `${safeLabel}.db`)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, {
        message: `Book not found: ${safeLabel}`,
      })
    }

    const db = openBookDb(dbPath)
    try {
      // Look up the page image path
      const imageId = `${pageId}_page`
      const rows = db.all(
        "SELECT path FROM images WHERE image_id = ?",
        [imageId]
      ) as Array<{ path: string }>

      if (rows.length === 0) {
        throw new HTTPException(404, {
          message: `Page image not found: ${pageId}`,
        })
      }

      const imagePath = path.resolve(bookDir, rows[0].path)
      // Verify path doesn't escape book directory
      if (!imagePath.startsWith(bookDir + path.sep) && imagePath !== bookDir) {
        throw new HTTPException(400, { message: "Invalid image path" })
      }

      const imageBase64 = fs.readFileSync(imagePath).toString("base64")
      return c.json({ imageBase64 })
    } finally {
      db.close()
    }
  })

  // PUT /books/:label/pages/:pageId/text-classification — Update text classification
  app.put("/books/:label/pages/:pageId/text-classification", async (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const body = await c.req.json()
    const parsed = TextClassificationOutput.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid text-classification data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const page = pages.find((p) => p.pageId === pageId)
      if (!page) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      const version = storage.putNodeData("text-classification", pageId, parsed.data)
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  // PUT /books/:label/pages/:pageId/image-classification — Update image classification
  app.put("/books/:label/pages/:pageId/image-classification", async (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const body = await c.req.json()
    const parsed = ImageClassificationOutput.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid image-classification data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const page = pages.find((p) => p.pageId === pageId)
      if (!page) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      const version = storage.putNodeData("image-classification", pageId, parsed.data)
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  // PUT /books/:label/pages/:pageId/sectioning — Update page sectioning
  app.put("/books/:label/pages/:pageId/sectioning", async (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const body = await c.req.json()
    const parsed = PageSectioningOutput.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid page-sectioning data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const page = pages.find((p) => p.pageId === pageId)
      if (!page) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      const version = storage.putNodeData("page-sectioning", pageId, parsed.data)
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  // PUT /books/:label/pages/:pageId/rendering — Update web rendering
  app.put("/books/:label/pages/:pageId/rendering", async (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const body = await c.req.json()
    const parsed = WebRenderingOutput.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid web-rendering data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const page = pages.find((p) => p.pageId === pageId)
      if (!page) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      const version = storage.putNodeData("web-rendering", pageId, parsed.data)
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  // PUT /books/:label/pages/:pageId/image-captioning — Update image captioning
  app.put("/books/:label/pages/:pageId/image-captioning", async (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const body = await c.req.json()
    const parsed = ImageCaptioningOutput.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid image-captioning data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const page = pages.find((p) => p.pageId === pageId)
      if (!page) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      const version = storage.putNodeData("image-captioning", pageId, parsed.data)
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/pages/:pageId/re-render — Re-render page with current pipeline data
  app.post("/books/:label/pages/:pageId/re-render", async (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const apiKey = c.req.header("X-OpenAI-Key")
    if (!apiKey) {
      throw new HTTPException(400, {
        message: "Missing X-OpenAI-Key header",
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const page = pages.find((p) => p.pageId === pageId)
      if (!page) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }
    } finally {
      storage.close()
    }

    const result = await reRenderPage({
      label: safeLabel,
      pageId,
      booksDir,
      promptsDir,
      configPath,
      apiKey,
    })

    return c.json(result)
  })

  // POST /books/:label/pages/:pageId/sections/:sectionIndex/ai-edit — AI-edit a section's HTML
  app.post("/books/:label/pages/:pageId/sections/:sectionIndex/ai-edit", async (c) => {
    const { label, pageId, sectionIndex } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const idx = parseInt(sectionIndex, 10)

    if (isNaN(idx) || idx < 0) {
      throw new HTTPException(400, { message: "Invalid section index" })
    }

    const apiKey = c.req.header("X-OpenAI-Key")
    if (!apiKey) {
      throw new HTTPException(400, { message: "Missing X-OpenAI-Key header" })
    }

    const body = await c.req.json()
    const instruction = body?.instruction
    if (!instruction || typeof instruction !== "string") {
      throw new HTTPException(400, { message: "Missing instruction in request body" })
    }

    const result = await aiEditSection({
      label: safeLabel,
      pageId,
      sectionIndex: idx,
      instruction,
      currentHtml: typeof body.currentHtml === "string" ? body.currentHtml : undefined,
      booksDir,
      promptsDir,
      configPath,
      apiKey,
    })

    return c.json(result)
  })

  // POST /books/:label/images/ai-generate — Generate image via gpt-image-1.5
  app.post("/books/:label/images/ai-generate", async (c) => {
    try {
      const { label } = c.req.param()
      const safeLabel = parseBookLabel(label)
      const resolvedDir = path.resolve(booksDir)
      const bookDir = path.join(resolvedDir, safeLabel)
      const dbPath = path.join(bookDir, `${safeLabel}.db`)

      if (!fs.existsSync(dbPath)) {
        return c.json({ error: `Book not found: ${safeLabel}` }, 404)
      }

      const apiKey = c.req.header("X-OpenAI-Key")
      if (!apiKey) {
        return c.json({ error: "Missing X-OpenAI-Key header" }, 400)
      }

      const pageId = c.req.query("pageId")
      if (!pageId) {
        return c.json({ error: "Missing pageId query parameter" }, 400)
      }
      validateImageId(pageId)

      const body = await c.req.json()
      const prompt = body?.prompt
      if (!prompt || typeof prompt !== "string") {
        return c.json({ error: "Missing prompt in request body" }, 400)
      }

      const referenceImageId =
        typeof body.referenceImageId === "string" ? validateImageId(body.referenceImageId) : undefined
      const targetImageId =
        typeof body.targetImageId === "string" ? validateImageId(body.targetImageId) : referenceImageId

      // Look up target image dimensions once — used for both aspect ratio size selection
      // and returning originalWidth/originalHeight to the frontend
      let originalWidth = 0
      let originalHeight = 0
      let referenceImagePath: string | undefined
      if (targetImageId || referenceImageId) {
        const db0 = openBookDb(dbPath)
        try {
          if (targetImageId) {
            const row = db0.get(
              "SELECT width, height FROM images WHERE image_id = ?",
              [targetImageId]
            ) as { width: number; height: number } | undefined
            if (row) {
              originalWidth = row.width
              originalHeight = row.height
            }
          }
          if (referenceImageId) {
            const row = db0.get(
              "SELECT path FROM images WHERE image_id = ?",
              [referenceImageId]
            ) as { path: string } | undefined
            if (row) referenceImagePath = path.join(bookDir, row.path)
          }
        } finally {
          db0.close()
        }
      }

      // Pick size that best matches the original aspect ratio
      let size = "1024x1024"
      if (originalWidth > 0 && originalHeight > 0) {
        const ratio = originalWidth / originalHeight
        if (ratio > 1.2) size = "1536x1024"       // landscape
        else if (ratio < 0.8) size = "1024x1536"   // portrait
      }

      const startTime = Date.now()
      let openaiRes: Response

      if (referenceImageId) {
        // Edit mode: send the source image to /v1/images/edits
        if (!referenceImagePath || !fs.existsSync(referenceImagePath)) {
          return c.json({ error: `Reference image not found: ${referenceImageId}` }, 404)
        }
        const imageBuffer = fs.readFileSync(referenceImagePath)

        const formData = new FormData()
        formData.append("model", "gpt-image-1.5")
        formData.append("prompt", prompt)
        formData.append("size", size)
        formData.append("image[]", new Blob([imageBuffer], { type: "image/png" }), `${referenceImageId}.png`)

        openaiRes = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
          signal: AbortSignal.timeout(180_000),
        })
      } else {
        // Generate mode: text-to-image via /v1/images/generations
        openaiRes = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-image-1.5",
            prompt,
            size,
          }),
          signal: AbortSignal.timeout(180_000),
        })
      }

      const responseText = await openaiRes.text()

      if (!openaiRes.ok) {
        let errMsg = `OpenAI API error: ${openaiRes.status}`
        try {
          const errBody = JSON.parse(responseText)
          errMsg = errBody?.error?.message ?? errMsg
        } catch {}
        return c.json({ error: errMsg }, 502)
      }

      const openaiData = JSON.parse(responseText) as {
        data: Array<{ b64_json?: string; url?: string }>
      }
      const b64 = openaiData.data?.[0]?.b64_json
      if (!b64) {
        return c.json({ error: "No image data returned from OpenAI" }, 502)
      }

      const buffer = Buffer.from(b64, "base64")
      const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16)

      // Parse width/height from the size string (e.g. "1024x1024")
      const [widthStr, heightStr] = size.split("x")
      const width = parseInt(widthStr, 10) || 1024
      const height = parseInt(heightStr, 10) || 1024

      // If we didn't find original dimensions, fall back to generated size
      if (originalWidth === 0) originalWidth = width
      if (originalHeight === 0) originalHeight = height

      // Generate imageId and save
      const db = openBookDb(dbPath)
      try {
        const prefix = referenceImageId ?? pageId
        const existing = db.all(
          "SELECT image_id FROM images WHERE image_id LIKE ?",
          [`${prefix}_ai%`]
        ) as Array<{ image_id: string }>
        let maxN = 0
        for (const row of existing) {
          const m = row.image_id.match(/_ai(\d+)$/)
          if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
        }
        const newImageId = `${prefix}_ai${maxN + 1}`

        const filename = `${newImageId}.png`
        const imagesDir = path.join(bookDir, "images")
        fs.mkdirSync(imagesDir, { recursive: true })
        fs.writeFileSync(path.join(imagesDir, filename), buffer)

        db.run(
          `INSERT INTO images (image_id, page_id, path, hash, width, height, source)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (image_id) DO UPDATE SET
             page_id = excluded.page_id,
             path = excluded.path,
             hash = excluded.hash,
             width = excluded.width,
             height = excluded.height,
             source = excluded.source`,
          [newImageId, pageId, `images/${filename}`, hash, width, height, "crop"]
        )

        // Log to debug panel (reuse existing db connection)
        try {
          const logEntry = {
            requestId: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            taskType: "image-generation",
            pageId,
            promptName: referenceImageId ? "ai-image-edit" : "ai-image-generate",
            modelId: "openai:gpt-image-1.5",
            cacheHit: false,
            success: true,
            errorCount: 0,
            attempt: 1,
            durationMs: Date.now() - startTime,
            messages: [
              { role: "user", content: [{ type: "text", text: prompt }] },
              { role: "assistant", content: [{ type: "text", text: `Generated image: ${newImageId} (${width}x${height})` }] },
            ],
          }
          db.run(
            "INSERT INTO llm_log (request_id, timestamp, step, item_id, success, error_count, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [logEntry.requestId, logEntry.timestamp, logEntry.taskType, logEntry.pageId, 1, 0, JSON.stringify(logEntry)]
          )
        } catch {
          // Non-critical — don't fail the request if logging fails
        }

        return c.json({ imageId: newImageId, width, height, originalWidth, originalHeight })
      } finally {
        db.close()
      }
    } catch (err) {
      if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status)
      }
      console.error("[ai-generate] UNHANDLED ERROR:", err)
      return c.json({ error: err instanceof Error ? err.message : "Internal server error" }, 500)
    }
  })

  // POST /books/:label/images — Upload a cropped image
  app.post("/books/:label/images", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)
    const resolvedDir = path.resolve(booksDir)
    const bookDir = path.join(resolvedDir, safeLabel)
    const dbPath = path.join(bookDir, `${safeLabel}.db`)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    const formData = await c.req.formData()
    const imageFile = formData.get("image")
    const pageId = formData.get("pageId")
    const sourceImageId = formData.get("sourceImageId")

    if (!imageFile || !(imageFile instanceof File)) {
      throw new HTTPException(400, { message: "Missing image file" })
    }
    if (!pageId || typeof pageId !== "string") {
      throw new HTTPException(400, { message: "Missing pageId" })
    }
    if (!sourceImageId || typeof sourceImageId !== "string") {
      throw new HTTPException(400, { message: "Missing sourceImageId" })
    }
    validateImageId(pageId)
    validateImageId(sourceImageId)

    const buffer = Buffer.from(await imageFile.arrayBuffer())
    const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16)

    // Generate new imageId: {sourceImageId}_crop{N}
    const db = openBookDb(dbPath)
    try {
      // Find the highest existing _crop{N} suffix to avoid collisions
      const existing = db.all(
        "SELECT image_id FROM images WHERE image_id LIKE ? AND source = 'crop'",
        [`${sourceImageId}_crop%`]
      ) as Array<{ image_id: string }>
      let maxN = 0
      for (const row of existing) {
        const m = row.image_id.match(/_crop(\d+)$/)
        if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
      }
      const newImageId = `${sourceImageId}_crop${maxN + 1}`

      // Detect format from file type
      const isPng = imageFile.type === "image/png"
      const ext = isPng ? "png" : "jpg"
      const filename = `${newImageId}.${ext}`

      // Ensure images directory exists
      const imagesDir = path.join(bookDir, "images")
      fs.mkdirSync(imagesDir, { recursive: true })
      fs.writeFileSync(path.join(imagesDir, filename), buffer)

      // Get dimensions from the image (basic approach: read from the buffer)
      // For PNG: width at bytes 16-19, height at 20-23
      // For JPEG: more complex, use a simpler approach
      let width = 0
      let height = 0
      if (isPng && buffer.length > 24) {
        width = buffer.readUInt32BE(16)
        height = buffer.readUInt32BE(20)
      }

      db.run(
        `INSERT INTO images (image_id, page_id, path, hash, width, height, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (image_id) DO UPDATE SET
           page_id = excluded.page_id,
           path = excluded.path,
           hash = excluded.hash,
           width = excluded.width,
           height = excluded.height,
           source = excluded.source`,
        [newImageId, pageId, `images/${filename}`, hash, width, height, "crop"]
      )

      return c.json({ imageId: newImageId, width, height })
    } finally {
      db.close()
    }
  })

  return app
}
