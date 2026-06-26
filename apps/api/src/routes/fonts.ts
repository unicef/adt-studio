import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import {
  parseBookLabel,
  BookFontRole,
  type BookFontRegistry,
  type BookFont,
  type BookFontFace,
  type BookMetadata,
  FONT_REGISTRY_NODE,
  FONT_REGISTRY_ITEM_ID,
  FONT_ASSIGNMENT_NODE,
  FONT_ASSIGNMENT_ITEM_ID,
  bookFontIdFromName,
  bookBodyFont,
  classifyFontCategoryByName,
  classifyFontLicenseOpenSource,
  normalizeFontKey,
} from "@adt/types"
import { createBookStorage, type Storage } from "@adt/storage"
import {
  parseFontMetadata,
  validateGoogleFamily,
  fetchGoogleFontsCatalog,
  readCachedGoogleFont,
  readBookFontRegistry,
  resolveFontsCacheDir,
  buildFontAssignmentConfig,
  generateFontAssignment,
  isFixedLayoutBook,
  loadBookConfig,
  applyFontToHtml,
  type FontScope,
} from "@adt/pipeline"
import {
  resolveReflowableFont,
  type DetectedFontCategory,
  REFLOWABLE_FONTS,
  reflowableFontFamilyChain,
  bookFontFamilyChain,
  WebRenderingOutput,
} from "@adt/types"
import { getBookConfig, updateBookConfig } from "../services/book-service.js"
import { createLLMModel, createPromptEngine, createRateLimiter } from "@adt/llm"
import type { TaskService } from "../services/task-service.js"

const MAX_FONT_FILE_BYTES = 15 * 1024 * 1024

const FORMAT_EXT: Record<BookFontFace["format"], string> = {
  truetype: ".ttf",
  opentype: ".otf",
  woff: ".woff",
  woff2: ".woff2",
}

const SAFE_FILE_RE = /^[a-zA-Z0-9._-]+$/

const FONT_FILE_MIME: Record<string, string> = {
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

function bookFontsDir(booksDir: string, label: string): string {
  return path.join(path.resolve(booksDir), label, "fonts")
}

function saveRegistry(storage: Storage, registry: BookFontRegistry): number {
  return storage.putNodeData(FONT_REGISTRY_NODE, FONT_REGISTRY_ITEM_ID, registry)
}

export function createFontRoutes(
  booksDir: string,
  promptsDir: string,
  configPath?: string,
  taskService?: TaskService,
): Hono {
  const app = new Hono()
  const cacheDir = resolveFontsCacheDir(booksDir)

  function currentBookFont(storage: Storage, label: string) {
    let config: ReturnType<typeof loadBookConfig> | null = null
    try {
      config = loadBookConfig(label, booksDir, configPath)
    } catch {
      config = null
    }
    const profile = storage.getLatestNodeData("font-profile", "book")?.data as {
      category?: DetectedFontCategory | null
    } | null
    const detectedCategory = profile?.category ?? null
    const setting = config?.reflowable_font ?? "auto"
    const fixedLayout = config ? isFixedLayoutBook(config) : false

    const bodyFont = fixedLayout ? null : bookBodyFont(readBookFontRegistry(storage))
    if (bodyFont) {
      return {
        detectedCategory,
        setting,
        fixedLayout,
        bodyRole: true,
        font: {
          id: bodyFont.id,
          family: bodyFont.family,
          category: bodyFont.category ?? "sans",
          google: bodyFont.source === "google",
        },
      }
    }

    const font = resolveReflowableFont(setting, detectedCategory)
    return {
      detectedCategory,
      setting,
      fixedLayout,
      bodyRole: false,
      font: {
        id: font.id,
        family: font.family,
        category: font.category,
        google: font.google,
      },
    }
  }

  function registryResponse(storage: Storage, label: string) {
    const row = storage.getLatestNodeData(FONT_REGISTRY_NODE, FONT_REGISTRY_ITEM_ID)
    const registry = readBookFontRegistry(storage)
    const assignmentRow = storage.getLatestNodeData(FONT_ASSIGNMENT_NODE, FONT_ASSIGNMENT_ITEM_ID)
    return {
      version: row?.version ?? 0,
      fonts: registry.fonts.map((font) => ({
        ...font,
        cached:
          font.source === "upload" || readCachedGoogleFont(cacheDir, font.family) !== null,
      })),
      assignment: assignmentRow?.data ?? null,
      current: currentBookFont(storage, label),
    }
  }

  app.get("/google-fonts/catalog", async (c) => {
    const families = await fetchGoogleFontsCatalog(cacheDir)
    return c.json({ families })
  })

  app.get("/books/:label/fonts", (c) => {
    const safeLabel = parseBookLabel(c.req.param("label"))
    const storage = createBookStorage(safeLabel, booksDir)
    try {
      return c.json(registryResponse(storage, safeLabel))
    } finally {
      storage.close()
    }
  })

  app.post("/books/:label/fonts", async (c) => {
    const safeLabel = parseBookLabel(c.req.param("label"))
    const formData = await c.req.formData()
    const files = formData.getAll("fonts").filter((f) => typeof f !== "string")
    if (files.length === 0) {
      throw new HTTPException(400, { message: "No font files provided (field 'fonts')." })
    }

    const fontsDir = bookFontsDir(booksDir, safeLabel)
    fs.mkdirSync(fontsDir, { recursive: true })

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const registry = readBookFontRegistry(storage)

      for (const file of files) {
        if (file.size > MAX_FONT_FILE_BYTES) {
          throw new HTTPException(400, {
            message: `"${file.name}" exceeds the ${MAX_FONT_FILE_BYTES / 1024 / 1024} MB limit.`,
          })
        }
        const buffer = Buffer.from(await file.arrayBuffer())
        const parsed = parseFontMetadata(buffer)
        if (!parsed) {
          throw new HTTPException(400, {
            message: `"${file.name}" is not a valid font file (expected ttf/otf/woff/woff2).`,
          })
        }

        const family = parsed.family ?? path.basename(file.name, path.extname(file.name))
        const fontId = bookFontIdFromName(family)
        const license = {
          description: parsed.licenseDescription ?? undefined,
          url: parsed.licenseUrl ?? undefined,
          embeddingRestricted: parsed.embeddingRestricted,
          openSource: parsed.embeddingRestricted
            ? false
            : classifyFontLicenseOpenSource(parsed.licenseDescription, parsed.licenseUrl),
        }
        const face: BookFontFace = {
          file: "",
          weight: parsed.weight,
          style: parsed.italic ? "italic" : "normal",
          format: parsed.format,
        }
        const fileName = `${fontId}-${face.weight}${face.style === "italic" ? "i" : ""}${FORMAT_EXT[parsed.format]}`
        if (!SAFE_FILE_RE.test(fileName)) {
          throw new HTTPException(400, { message: `Invalid font file name: ${fileName}` })
        }
        face.file = fileName

        const target = path.join(fontsDir, fileName)
        if (!path.resolve(target).startsWith(path.resolve(fontsDir) + path.sep)) {
          throw new HTTPException(400, { message: "Invalid font path." })
        }
        fs.writeFileSync(target, buffer)

        const existing = registry.fonts.find((f) => f.id === fontId && f.source === "upload")
        if (existing) {
          existing.faces = [
            ...existing.faces.filter(
              (f) => !(f.weight === face.weight && f.style === face.style),
            ),
            face,
          ]
          if (license.description || license.url || license.embeddingRestricted) {
            existing.license = license
          }
        } else {
          const category = classifyFontCategoryByName(family)
          registry.fonts.push({
            id: registry.fonts.some((f) => f.id === fontId) ? `${fontId}-upload` : fontId,
            family,
            source: "upload",
            category: category ?? undefined,
            faces: [face],
            role: "unassigned",
            roleLockedByUser: false,
            license,
          })
        }
      }

      saveRegistry(storage, registry)
      return c.json(registryResponse(storage, safeLabel))
    } finally {
      storage.close()
    }
  })

  app.post("/books/:label/fonts/google", async (c) => {
    const safeLabel = parseBookLabel(c.req.param("label"))
    const body = (await c.req.json().catch(() => null)) as { family?: string } | null
    const family = body?.family?.trim()
    if (!family) {
      throw new HTTPException(400, { message: "Body must include a 'family' string." })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const registry = readBookFontRegistry(storage)
      if (registry.fonts.some((f) => f.source === "google" && f.family === family)) {
        return c.json(registryResponse(storage, safeLabel))
      }

      const cached = readCachedGoogleFont(cacheDir, family)
      if (!cached && !(await validateGoogleFamily(family))) {
        throw new HTTPException(400, {
          message: `"${family}" was not found on Google Fonts.`,
        })
      }

      const baseId = bookFontIdFromName(family)
      const id = registry.fonts.some((f) => f.id === baseId) ? `${baseId}-google` : baseId
      registry.fonts.push({
        id,
        family,
        source: "google",
        googleKey: normalizeFontKey(family),
        category: classifyFontCategoryByName(family) ?? undefined,
        faces: cached?.faces ?? [],
        role: "unassigned",
        roleLockedByUser: false,
        license: { embeddingRestricted: false, openSource: true },
      })
      saveRegistry(storage, registry)
      return c.json(registryResponse(storage, safeLabel))
    } finally {
      storage.close()
    }
  })

  app.patch("/books/:label/fonts/:id", async (c) => {
    const safeLabel = parseBookLabel(c.req.param("label"))
    const fontId = c.req.param("id")
    const body = (await c.req.json().catch(() => null)) as {
      family?: string
      role?: BookFont["role"]
      roleLockedByUser?: boolean
    } | null
    if (!body) throw new HTTPException(400, { message: "Invalid JSON body." })

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const registry = readBookFontRegistry(storage)
      const font = registry.fonts.find((f) => f.id === fontId)
      if (!font) throw new HTTPException(404, { message: "Font not found." })

      if (typeof body.family === "string" && body.family.trim() && font.source === "upload") {
        font.family = body.family.trim()
      }
      if (body.role) {
        const parsed = BookFontRole.safeParse(body.role)
        if (!parsed.success) throw new HTTPException(400, { message: "Invalid role." })
        font.role = parsed.data
        font.roleLockedByUser = body.roleLockedByUser ?? true
      } else if (body.roleLockedByUser !== undefined) {
        font.roleLockedByUser = body.roleLockedByUser
      }

      saveRegistry(storage, registry)
      return c.json(registryResponse(storage, safeLabel))
    } finally {
      storage.close()
    }
  })

  app.delete("/books/:label/fonts/:id", (c) => {
    const safeLabel = parseBookLabel(c.req.param("label"))
    const fontId = c.req.param("id")

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const registry = readBookFontRegistry(storage)
      const font = registry.fonts.find((f) => f.id === fontId)
      if (!font) throw new HTTPException(404, { message: "Font not found." })

      registry.fonts = registry.fonts.filter((f) => f.id !== fontId)
      saveRegistry(storage, registry)

      if (font.source === "upload") {
        const fontsDir = bookFontsDir(booksDir, safeLabel)
        for (const face of font.faces) {
          const p = path.join(fontsDir, face.file)
          if (
            SAFE_FILE_RE.test(face.file) &&
            path.resolve(p).startsWith(path.resolve(fontsDir) + path.sep)
          ) {
            fs.rmSync(p, { force: true })
          }
        }
      }
      return c.json(registryResponse(storage, safeLabel))
    } finally {
      storage.close()
    }
  })

  app.get("/books/:label/fonts/:id/files/:file", (c) => {
    const safeLabel = parseBookLabel(c.req.param("label"))
    const fontId = c.req.param("id")
    const fileName = c.req.param("file")
    if (!SAFE_FILE_RE.test(fileName)) {
      throw new HTTPException(400, { message: "Invalid file name." })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    let font: BookFont | undefined
    try {
      font = readBookFontRegistry(storage).fonts.find((f) => f.id === fontId)
    } finally {
      storage.close()
    }
    if (!font) throw new HTTPException(404, { message: "Font not found." })

    const baseDir =
      font.source === "upload"
        ? bookFontsDir(booksDir, safeLabel)
        : path.join(cacheDir, "google", normalizeFontKey(font.family))
    const filePath = path.join(baseDir, fileName)
    if (!path.resolve(filePath).startsWith(path.resolve(baseDir) + path.sep)) {
      throw new HTTPException(400, { message: "Invalid font path." })
    }
    if (!fs.existsSync(filePath)) {
      throw new HTTPException(404, { message: "Font file not available yet." })
    }
    const ext = path.extname(fileName).toLowerCase()
    c.header("Content-Type", FONT_FILE_MIME[ext] ?? "application/octet-stream")
    c.header("Cache-Control", "public, max-age=86400")
    return c.body(fs.readFileSync(filePath))
  })

  async function analyze(safeLabel: string, apiKey: string): Promise<{ version: number }> {
    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const registry = readBookFontRegistry(storage)
      if (registry.fonts.length === 0) {
        throw new HTTPException(400, { message: "No fonts attached to this book." })
      }
      const pages = storage.getPages()
      if (pages.length === 0) {
        throw new HTTPException(400, { message: "Run extraction before analyzing fonts." })
      }

      const sampleCount = Math.min(6, pages.length)
      const stride = pages.length / sampleCount
      const samples = Array.from({ length: sampleCount }, (_, i) => pages[Math.floor(i * stride)])

      const config = loadBookConfig(safeLabel, booksDir, configPath)
      const assignmentConfig = buildFontAssignmentConfig(config.font_assignment)
      const llmCacheDir = path.join(path.resolve(booksDir), safeLabel, ".cache")
      const bookPromptsDir = path.join(path.resolve(booksDir), safeLabel, "prompts")
      const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
      const rateLimiter = config.rate_limit
        ? createRateLimiter(config.rate_limit.requests_per_minute)
        : undefined

      const metadata = storage.getLatestNodeData("metadata", "book")?.data as BookMetadata | null
      const summaryData = storage.getLatestNodeData("book-summary", "book")?.data as
        | { summary?: string }
        | null

      const previousKey = process.env.OPENAI_API_KEY
      process.env.OPENAI_API_KEY = apiKey
      try {
        const model = createLLMModel({
          modelId: assignmentConfig.modelId,
          cacheDir: llmCacheDir,
          promptEngine,
          rateLimiter,
          onLog: (entry) => storage.appendLlmLog(entry),
        })
        const result = await generateFontAssignment(
          {
            fonts: registry.fonts,
            pageImages: samples.map((p) => ({
              pageId: p.pageId,
              pageNumber: p.pageNumber,
              imageBase64: storage.getPageImageBase64(p.pageId),
            })),
            bookTitle: metadata?.title ?? undefined,
            bookSummary: summaryData?.summary,
          },
          assignmentConfig,
          model,
        )

        storage.putNodeData(FONT_ASSIGNMENT_NODE, FONT_ASSIGNMENT_ITEM_ID, result)

        let changed = false
        for (const assignment of result.assignments) {
          const font = registry.fonts.find((f) => f.id === assignment.font_id)
          if (font && !font.roleLockedByUser && font.role !== assignment.role) {
            font.role = assignment.role
            changed = true
          }
        }
        const version = changed
          ? saveRegistry(storage, registry)
          : (storage.getLatestNodeData(FONT_REGISTRY_NODE, FONT_REGISTRY_ITEM_ID)?.version ?? 0)
        return { version }
      } finally {
        if (previousKey !== undefined) {
          process.env.OPENAI_API_KEY = previousKey
        } else {
          delete process.env.OPENAI_API_KEY
        }
      }
    } finally {
      storage.close()
    }
  }

  const FONT_SCOPES: ReadonlySet<FontScope> = new Set<FontScope>([
    "whole",
    "heading",
    "paragraph",
    "body",
    "caption",
  ])
  const SCOPE_ROLE: Record<Exclude<FontScope, "whole">, BookFont["role"]> = {
    heading: "heading",
    paragraph: "paragraph",
    body: "body",
    caption: "caption",
  }

  // Apply a font across the whole book (or a single role) in one shot: rewrite
  // every page's stored web-rendering HTML and persist the base/role so future
  // re-renders stay consistent. Pure HTML rewrite — no LLM.
  app.post("/books/:label/fonts/apply", async (c) => {
    const safeLabel = parseBookLabel(c.req.param("label"))
    const body = (await c.req.json().catch(() => null)) as {
      scope?: string
      font?: { kind?: string; id?: string }
      reset?: boolean
    } | null
    const scope = body?.scope as FontScope | undefined
    if (!scope || !FONT_SCOPES.has(scope)) {
      throw new HTTPException(400, { message: "Body must include a valid 'scope'." })
    }
    const reset = body?.reset === true
    if (!reset && !body?.font?.id) {
      throw new HTTPException(400, { message: "Body must include 'font' or 'reset: true'." })
    }

    let config: ReturnType<typeof loadBookConfig> | null = null
    try {
      config = loadBookConfig(safeLabel, booksDir, configPath)
    } catch {
      config = null
    }
    if (config && isFixedLayoutBook(config)) {
      throw new HTTPException(400, {
        message: "Fixed-layout books keep their original fonts — book-wide font changes are not available.",
      })
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const registry = readBookFontRegistry(storage)

      // Resolve the inline font-family chain for role scopes.
      let inlineFamily: string | null = null
      if (!reset && scope !== "whole") {
        if (body!.font!.kind === "registry") {
          const f = registry.fonts.find((x) => x.id === body!.font!.id)
          if (!f) throw new HTTPException(404, { message: "Font not found." })
          inlineFamily = bookFontFamilyChain(f)
        } else {
          const rf = REFLOWABLE_FONTS.find((x) => x.id === body!.font!.id)
          if (!rf) throw new HTTPException(404, { message: "Font not found." })
          inlineFamily = reflowableFontFamilyChain(rf)
        }
      }

      // 1. Rewrite every page's web-rendering HTML.
      let pagesUpdated = 0
      for (const page of storage.getPages()) {
        const row = storage.getLatestNodeData("web-rendering", page.pageId)
        if (!row) continue
        const parsed = WebRenderingOutput.safeParse(row.data)
        if (!parsed.success) continue
        let changed = false
        const sections = parsed.data.sections.map((s) => {
          const html = applyFontToHtml(s.html, { family: scope === "whole" ? null : inlineFamily, scope })
          if (html !== s.html) changed = true
          return { ...s, html }
        })
        if (changed) {
          storage.putNodeData("web-rendering", page.pageId, { sections })
          pagesUpdated++
        }
      }

      // 2. Persist base/role so future re-renders match.
      if (scope === "whole") {
        for (const f of registry.fonts) {
          if (f.role === "body") {
            f.role = "unassigned"
            f.roleLockedByUser = false
          }
        }
        if (!reset && body!.font!.kind === "registry") {
          const f = registry.fonts.find((x) => x.id === body!.font!.id)
          if (f) {
            f.role = "body"
            f.roleLockedByUser = true
          }
        }
        saveRegistry(storage, registry)

        const overrides = getBookConfig(safeLabel, booksDir) ?? {}
        if (!reset && body!.font!.kind === "reflowable") {
          overrides.reflowable_font = body!.font!.id
        } else {
          delete overrides.reflowable_font
        }
        updateBookConfig(safeLabel, booksDir, overrides)
      } else if (!reset && body!.font!.kind === "registry") {
        const f = registry.fonts.find((x) => x.id === body!.font!.id)
        if (f) {
          f.role = SCOPE_ROLE[scope]
          f.roleLockedByUser = true
          saveRegistry(storage, registry)
        }
      }

      // 3. Drop derived artifacts so Export rebuilds with the new fonts.
      storage.clearNodesByType(["accessibility-assessment"])
      storage.clearStepRuns(["package-web", "accessibility-assessment"])

      return c.json({ pagesUpdated, ...registryResponse(storage, safeLabel) })
    } finally {
      storage.close()
    }
  })

  app.post("/books/:label/fonts/analyze", async (c) => {
    const safeLabel = parseBookLabel(c.req.param("label"))
    const apiKey = c.req.header("X-OpenAI-Key")
    if (!apiKey) {
      throw new HTTPException(400, { message: "API key required. Set X-OpenAI-Key header." })
    }

    if (taskService) {
      const { taskId } = taskService.submitTask(
        safeLabel,
        "font-assignment",
        "Analyzing book fonts",
        async () => analyze(safeLabel, apiKey),
      )
      return c.json({ taskId, status: "submitted" })
    }
    return c.json(await analyze(safeLabel, apiKey))
  })

  return app
}
