import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel, TextClassificationOutput, ImageClassificationOutput, PageSectioningOutput, WebRenderingOutput, ImageCaptioningOutput, ImageSegmentRegion, DEFAULT_LLM_MAX_RETRIES } from "@adt/types"
import { openBookDb } from "@adt/storage"
import { createBookStorage } from "@adt/storage"
import { reRenderPage, aiEditSection } from "../services/page-edit-service.js"
import { segmentPageImages, getSegmentedImageId, loadBookConfig, applyCrop, generateStyleguide, buildStyleguideGenerationConfig } from "@adt/pipeline"
import { createLLMModel, createPromptEngine } from "@adt/llm"

interface PageSummary {
  pageId: string
  pageNumber: number
  hasRendering: boolean
  hasCaptioning: boolean
  textPreview: string
  imageCount: number
  wordCount: number
  sectionCount: number
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

      // Get image counts per page from image-filtering node data
      const imageCounts = new Map<string, number>()
      const imageRows = db.all(
        "SELECT item_id, data FROM node_data WHERE node = ? ORDER BY version DESC",
        ["image-filtering"]
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

      // Get section counts per page from page-sectioning node data
      const sectionCounts = new Map<string, number>()
      const sectionRows = db.all(
        "SELECT item_id, data FROM node_data WHERE node = ? ORDER BY version DESC",
        ["page-sectioning"]
      ) as Array<{ item_id: string; data: string }>
      for (const row of sectionRows) {
        if (!sectionCounts.has(row.item_id)) {
          try {
            const parsed = JSON.parse(row.data)
            const sections = parsed.sections as unknown[]
            sectionCounts.set(row.item_id, sections?.length ?? 0)
          } catch {
            sectionCounts.set(row.item_id, 0)
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
        sectionCount: sectionCounts.get(p.page_id) ?? 0,
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
      const imageClassNode = getNodeData("image-filtering")
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

  // PUT /books/:label/pages/:pageId/image-filtering — Update image classification
  app.put("/books/:label/pages/:pageId/image-filtering", async (c) => {
    const { label, pageId } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const body = await c.req.json()
    const parsed = ImageClassificationOutput.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid image-filtering data: ${parsed.error.message}`,
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      const page = pages.find((p) => p.pageId === pageId)
      if (!page) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      const version = storage.putNodeData("image-filtering", pageId, parsed.data)
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
    const ReRenderQuery = z.object({
      sectionIndex: z.coerce.number().int().min(0).optional(),
    })
    const queryParsed = ReRenderQuery.safeParse({
      sectionIndex: c.req.query("sectionIndex"),
    })
    if (!queryParsed.success) {
      throw new HTTPException(400, {
        message: `Invalid query params: ${queryParsed.error.issues.map((i) => i.message).join(", ")}`,
      })
    }
    const { sectionIndex } = queryParsed.data

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

      if (sectionIndex !== undefined) {
        const sectioningRow = storage.getLatestNodeData("page-sectioning", pageId)
        if (!sectioningRow) {
          throw new HTTPException(400, {
            message: "Page must have page-sectioning data before re-rendering",
          })
        }
        const sectioningParsed = PageSectioningOutput.safeParse(sectioningRow.data)
        if (!sectioningParsed.success) {
          throw new HTTPException(400, { message: "Invalid page-sectioning data" })
        }
        if (sectionIndex >= sectioningParsed.data.sections.length) {
          throw new HTTPException(400, {
            message: `Section index ${sectionIndex} out of range (page has ${sectioningParsed.data.sections.length} sections)`,
          })
        }
      }
    } finally {
      storage.close()
    }

    const result = await reRenderPage({
      label: safeLabel,
      pageId,
      sectionIndex,
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

  // POST /books/:label/pages/:pageId/sections/:sectionIndex/clone — Duplicate a section
  app.post("/books/:label/pages/:pageId/sections/:sectionIndex/clone", async (c) => {
    const CloneSectionParams = z.object({
      label: z.string().min(1),
      pageId: z.string().min(1),
      sectionIndex: z.coerce.number().int().min(0),
    })
    const parsedParams = CloneSectionParams.safeParse(c.req.param())
    if (!parsedParams.success) {
      throw new HTTPException(400, {
        message: `Invalid route params: ${parsedParams.error.issues.map((i) => i.message).join(", ")}`,
      })
    }
    const { label, pageId, sectionIndex: idx } = parsedParams.data
    const safeLabel = parseBookLabel(label)

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const pages = storage.getPages()
      if (!pages.find((p) => p.pageId === pageId)) {
        throw new HTTPException(404, { message: `Page not found: ${pageId}` })
      }

      // Read latest sectioning
      const sectioningRow = storage.getLatestNodeData("page-sectioning", pageId)
      if (!sectioningRow) {
        throw new HTTPException(400, { message: "Page has no sectioning data" })
      }
      const sectioningParsed = PageSectioningOutput.safeParse(sectioningRow.data)
      if (!sectioningParsed.success) {
        throw new HTTPException(400, { message: "Invalid page-sectioning data" })
      }
      const sectioning = sectioningParsed.data

      if (idx >= sectioning.sections.length) {
        throw new HTTPException(400, { message: `Section index ${idx} out of range (page has ${sectioning.sections.length} sections)` })
      }

      // Clone the section and insert after the original
      const clonedSection = structuredClone(sectioning.sections[idx])
      const newSections = [...sectioning.sections]
      newSections.splice(idx + 1, 0, clonedSection)

      // Renumber all sectionIds to maintain {pageId}_sec{NNN} convention
      for (let i = 0; i < newSections.length; i++) {
        newSections[i].sectionId = `${pageId}_sec${String(i + 1).padStart(3, "0")}`
      }

      const updatedSectioning = { ...sectioning, sections: newSections }

      // Clone rendering if present
      let updatedRendering: z.infer<typeof WebRenderingOutput> | null = null
      let renderingVersion: number | null = null
      const renderingRow = storage.getLatestNodeData("web-rendering", pageId)
      if (renderingRow) {
        const renderingParsed = WebRenderingOutput.safeParse(renderingRow.data)
        if (!renderingParsed.success) {
          throw new HTTPException(400, { message: "Invalid web-rendering data" })
        }
        const rendering = renderingParsed.data

        // Shift sectionIndex for entries after the cloned position
        const shifted = rendering.sections.map((s) =>
          s.sectionIndex > idx ? { ...s, sectionIndex: s.sectionIndex + 1 } : { ...s }
        )

        // Clone the rendering entry for the source section
        const sourceRendering = shifted.find((s) => s.sectionIndex === idx)
        if (sourceRendering) {
          const clonedRendering = structuredClone(sourceRendering)
          clonedRendering.sectionIndex = idx + 1

          // Insert clone after the source in the array
          const insertPos = shifted.indexOf(sourceRendering) + 1
          shifted.splice(insertPos, 0, clonedRendering)
        }

        // Update data-section-id in each rendering's HTML to match new sectionIds
        for (const rs of shifted) {
          if (rs.sectionIndex < 0 || rs.sectionIndex >= newSections.length) {
            throw new HTTPException(400, { message: "Rendering contains invalid section indexes" })
          }
          const expectedId = newSections[rs.sectionIndex]?.sectionId
          if (!expectedId) {
            throw new HTTPException(400, { message: "Unable to map rendering section to sectionId" })
          }
          rs.html = rs.html.replace(
            /data-section-id="[^"]*"/,
            `data-section-id="${expectedId}"`
          )
        }
        updatedRendering = { sections: shifted }
      }
      const sectioningVersion = storage.putNodeData("page-sectioning", pageId, updatedSectioning)
      if (updatedRendering) {
        renderingVersion = storage.putNodeData("web-rendering", pageId, updatedRendering)
      }

      return c.json({
        clonedSectionIndex: idx + 1,
        sectioningVersion,
        renderingVersion,
      })
    } finally {
      storage.close()
    }
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

      // Render the global image generation prompt template (book-level override takes priority).
      // The template may contain {{ user_prompt }} where the per-image request is injected.
      const bookPromptPath = path.join(bookDir, "prompts", "ai_image_generation.liquid")
      const globalPromptPath = path.join(path.resolve(promptsDir), "ai_image_generation.liquid")
      let templateContent: string | null = null
      if (fs.existsSync(bookPromptPath)) {
        templateContent = fs.readFileSync(bookPromptPath, "utf-8")
      } else if (fs.existsSync(globalPromptPath)) {
        templateContent = fs.readFileSync(globalPromptPath, "utf-8")
      }
      // Use a replacer function to avoid JS special replacement patterns ($&, $1, etc.)
      // being interpreted if the user's prompt happens to contain them.
      const finalPrompt = templateContent
        ? templateContent.trim().replace(/\{\{\s*user_prompt\s*\}\}/g, () => prompt)
        : prompt

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
        formData.append("prompt", finalPrompt)
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
            prompt: finalPrompt,
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
              { role: "user", content: [{ type: "text", text: finalPrompt }] },
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

  // POST /books/:label/images/:imageId/segment — Analyze: run LLM segmentation, return bounding boxes only
  app.post("/books/:label/images/:imageId/segment", async (c) => {
    const { label, imageId } = c.req.param()
    const safeLabel = parseBookLabel(label)
    validateImageId(imageId)

    const pageId = c.req.query("pageId")
    if (!pageId) {
      return c.json({ error: "Missing pageId query parameter" }, 400)
    }
    validateImageId(pageId)

    const apiKey = c.req.header("X-OpenAI-Key")
    if (!apiKey) {
      return c.json({ error: "Missing X-OpenAI-Key header" }, 400)
    }

    const previousKey = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = apiKey

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const images = storage.getPageImages(pageId)
      const imageMeta = images.find((img) => img.imageId === imageId)
      if (!imageMeta) {
        return c.json({ error: `Image not found: ${imageId}` }, 404)
      }

      // Build segmentation config — always use default model for manual segmentation
      const config = loadBookConfig(safeLabel, booksDir, configPath)
      const modelId = config.image_segmentation?.model || "openai:gpt-5.2"
      const promptName = config.image_segmentation?.prompt ?? "image_segmentation"
      const maxRetries =
        config.image_segmentation?.max_retries ?? DEFAULT_LLM_MAX_RETRIES

      const bookPromptsDir = path.join(path.resolve(booksDir), safeLabel, "prompts")
      const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
      const cacheDir = path.join(path.resolve(booksDir), safeLabel, ".cache")
      const llmModel = createLLMModel({
        modelId,
        cacheDir,
        promptEngine,
        onLog: (entry) => storage.appendLlmLog(entry),
      })

      const imageBase64 = storage.getImageBase64(imageId)
      const pageImageBase64 = storage.getPageImageBase64(pageId)

      const segResult = await segmentPageImages(
        {
          pageId,
          pageImageBase64,
          images: [{
            imageId,
            imageBase64,
            width: imageMeta.width,
            height: imageMeta.height,
          }],
        },
        { promptName, modelId, maxRetries },
        llmModel
      )

      const imgResult = segResult.results[0]
      if (!imgResult || !imgResult.needsSegmentation || !imgResult.segments || imgResult.segments.length === 0) {
        return c.json({ segmented: false })
      }

      return c.json({
        segmented: true,
        imageWidth: imageMeta.width,
        imageHeight: imageMeta.height,
        regions: imgResult.segments.map((seg) => ({
          label: seg.label,
          cropLeft: seg.cropLeft,
          cropTop: seg.cropTop,
          cropRight: seg.cropRight,
          cropBottom: seg.cropBottom,
        })),
      })
    } catch (err) {
      console.error(`[segment] Error analyzing ${imageId}:`, err)
      return c.json({ error: err instanceof Error ? err.message : "Segmentation failed" }, 500)
    } finally {
      storage.close()
      if (previousKey !== undefined) {
        process.env.OPENAI_API_KEY = previousKey
      } else {
        delete process.env.OPENAI_API_KEY
      }
    }
  })

  // POST /books/:label/images/:imageId/segment/apply — Apply confirmed bounding boxes, crop and save segments
  app.post("/books/:label/images/:imageId/segment/apply", async (c) => {
    const { label, imageId } = c.req.param()
    const safeLabel = parseBookLabel(label)
    validateImageId(imageId)

    const pageId = c.req.query("pageId")
    if (!pageId) {
      return c.json({ error: "Missing pageId query parameter" }, 400)
    }
    validateImageId(pageId)

    const body = await c.req.json()
    const regionsSchema = z.object({ regions: z.array(ImageSegmentRegion).min(1) })
    const parsed = regionsSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid regions", details: parsed.error.flatten() }, 400)
    }
    const { regions } = parsed.data

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const imageBase64 = storage.getImageBase64(imageId)
      const buffer = Buffer.from(imageBase64, "base64")

      const version = storage.putNodeData("image-segmentation", pageId, {
        results: [{
          imageId,
          reasoning: "User-confirmed segmentation",
          needsSegmentation: true,
          segments: regions,
        }],
      })

      const segments: Array<{ imageId: string; label: string; width: number; height: number }> = []

      for (let i = 0; i < regions.length; i++) {
        const region = regions[i]
        const width = region.cropRight - region.cropLeft
        const height = region.cropBottom - region.cropTop
        if (width <= 0 || height <= 0) continue

        const cropped = applyCrop(buffer, {
          cropLeft: region.cropLeft,
          cropTop: region.cropTop,
          cropRight: region.cropRight,
          cropBottom: region.cropBottom,
        })

        const segIndex = i + 1
        storage.putSegmentedImage({
          sourceImageId: imageId,
          segmentIndex: segIndex,
          pageId,
          version,
          buffer: cropped,
          width,
          height,
        })
        segments.push({
          imageId: getSegmentedImageId(imageId, segIndex, version),
          label: region.label,
          width,
          height,
        })
      }

      return c.json({ segments })
    } catch (err) {
      console.error(`[segment/apply] Error applying segmentation for ${imageId}:`, err)
      return c.json({ error: err instanceof Error ? err.message : "Segmentation apply failed" }, 500)
    } finally {
      storage.close()
    }
  })

  // POST /books/:label/generate-styleguide — Generate styleguide from page images
  app.post("/books/:label/generate-styleguide", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const apiKey = c.req.header("X-OpenAI-Key")
    if (!apiKey) {
      throw new HTTPException(400, { message: "Missing X-OpenAI-Key header" })
    }

    const body = await c.req.json()
    const PageIdsSchema = z.object({
      pageIds: z.array(z.string().min(1)).min(1).max(5),
    })
    const parsed = PageIdsSchema.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid request: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      })
    }

    const { pageIds } = parsed.data
    const resolvedBooksDir = path.resolve(booksDir)
    const bookDir = path.join(resolvedBooksDir, safeLabel)
    const dbPath = path.join(bookDir, `${safeLabel}.db`)

    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
    }

    // Load page images
    const storage = createBookStorage(safeLabel, booksDir)
    const pageImages: Array<{ pageId: string; pageNumber: number; imageBase64: string }> = []
    try {
      const pages = storage.getPages()
      for (const pageId of pageIds) {
        const page = pages.find((p) => p.pageId === pageId)
        if (!page) {
          throw new HTTPException(404, { message: `Page not found: ${pageId}` })
        }
        const imageBase64 = storage.getPageImageBase64(pageId)
        pageImages.push({
          pageId,
          pageNumber: page.pageNumber,
          imageBase64,
        })
      }
    } finally {
      storage.close()
    }

    // Set API key for LLM
    const previousKey = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = apiKey

    try {
      const bookPromptsDir = path.join(bookDir, "prompts")
      const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
      const cacheDir = path.join(bookDir, ".cache")
      const config = buildStyleguideGenerationConfig()
      const llmModel = createLLMModel({
        modelId: config.modelId,
        cacheDir,
        promptEngine,
      })

      const result = await generateStyleguide(
        { pageImages },
        config,
        llmModel
      )

      // Save to assets/styleguides/{label}-generated.md
      const projectRoot = configPath ? path.dirname(configPath) : path.resolve(booksDir, "..")
      const styleguidesDir = path.join(projectRoot, "assets", "styleguides")
      fs.mkdirSync(styleguidesDir, { recursive: true })
      const sgName = `${safeLabel}-generated`
      fs.writeFileSync(path.join(styleguidesDir, `${sgName}.md`), result.content, "utf-8")
      fs.writeFileSync(path.join(styleguidesDir, `${sgName}-preview.html`), result.preview_html, "utf-8")

      return c.json({
        name: sgName,
        content: result.content,
        reasoning: result.reasoning,
      })
    } finally {
      if (previousKey !== undefined) {
        process.env.OPENAI_API_KEY = previousKey
      } else {
        delete process.env.OPENAI_API_KEY
      }
    }
  })

  return app
}
