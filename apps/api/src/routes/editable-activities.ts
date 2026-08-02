import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  ContentNodeData,
  EditableActivity,
  EditableActivitiesEntity,
  EDITABLE_ACTIVITY_NODE,
  PageSectioningOutput,
  WebRenderingOutput,
  parseBookLabel,
  DEFAULT_LLM_MAX_RETRIES,
} from "@adt/types"
import { createBookStorage } from "@adt/storage"
import {
  extractEditableActivity,
  supportsEditableActivity,
  buildActivityOutline,
  applyActivityHeader,
  generateActivityFeedback,
  loadBookConfig,
  normalizeLocale,
  resolveQuizPalette,
  DEFAULT_QUIZ_PALETTE,
} from "@adt/pipeline"
import { createLLMModel, createPromptEngine } from "@adt/llm"

/** Section-tree nodes for a section — the outline's semantic-role source.
 *  Best-effort: an unparseable/missing sectioning row just means no roles. */
function loadSectionNodes(
  storage: ReturnType<typeof createBookStorage>,
  pageId: string,
  sectionIndex: number,
): ContentNodeData[] | undefined {
  const row = storage.getLatestNodeData("page-sectioning", pageId)
  if (!row) return undefined
  const parsed = PageSectioningOutput.safeParse(row.data)
  return parsed.success ? parsed.data.sections[sectionIndex]?.nodes : undefined
}

/** resolveQuizPalette scans every page's sectioning + rendering rows — far
 *  too heavy to run on each per-page GET for a value that is book-level and
 *  changes only when pages are re-rendered. Short TTL keeps it fresh enough
 *  for the editor while amortizing the scan. */
const paletteAccentCache = new Map<string, { at: number; accent: string }>()
const PALETTE_ACCENT_TTL_MS = 60_000

function bookPaletteAccent(
  label: string,
  storage: ReturnType<typeof createBookStorage>,
): string {
  const hit = paletteAccentCache.get(label)
  if (hit && Date.now() - hit.at < PALETTE_ACCENT_TTL_MS) return hit.accent
  const accent = (resolveQuizPalette(storage) ?? DEFAULT_QUIZ_PALETTE).accent
  paletteAccentCache.set(label, { at: Date.now(), accent })
  return accent
}

function safeParseLabel(label: string): string {
  try {
    return parseBookLabel(label)
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

function requireBook(booksDir: string, safeLabel: string): void {
  const dbPath = path.join(path.resolve(booksDir), safeLabel, `${safeLabel}.db`)
  if (!fs.existsSync(dbPath)) {
    throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
  }
}

function parseSectionIndex(raw: string): number {
  const idx = Number.parseInt(raw, 10)
  if (!Number.isInteger(idx) || idx < 0) {
    throw new HTTPException(400, { message: `Invalid section index: ${raw}` })
  }
  return idx
}

/**
 * Editable (step-by-step) activities — stored in their own `editable-activity`
 * node (item = pageId) so the feature stays fully separate from the
 * `web-rendering` storyboard data. Every write appends a version.
 */
export function createEditableActivitiesRoutes(
  booksDir: string,
  promptsDir?: string,
  configPath?: string,
): Hono {
  const app = new Hono()

  // GET — the page's editable activities (empty when none exist yet).
  app.get("/books/:label/pages/:pageId/editable-activities", (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    requireBook(booksDir, safeLabel)
    const pageId = c.req.param("pageId")
    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const row = storage.getLatestNodeData(EDITABLE_ACTIVITY_NODE, pageId)
      const parsed = row ? EditableActivitiesEntity.safeParse(row.data) : null
      return c.json({
        activities: parsed?.success ? parsed.data.activities : {},
        version: row?.version ?? 0,
        // The accent activities render with when no per-activity override is
        // set — lets the editor show the effective color, not a placeholder.
        paletteAccent: bookPaletteAccent(safeLabel, storage),
      })
    } finally {
      storage.close()
    }
  })

  // PUT — save edited activities (the CMS editor's save path).
  app.put("/books/:label/pages/:pageId/editable-activities", async (c) => {
    const safeLabel = safeParseLabel(c.req.param("label"))
    requireBook(booksDir, safeLabel)
    const pageId = c.req.param("pageId")

    const body = await c.req.json().catch(() => null)
    if (body === null) {
      throw new HTTPException(400, { message: "Invalid JSON body." })
    }
    const parsed = EditableActivitiesEntity.safeParse(body)
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((i) => i.message)
        .slice(0, 5)
        .join("; ")
      throw new HTTPException(400, { message: `Invalid editable activities: ${details}` })
    }
    // Only section types with a stepper-aware runtime may be stored — a shell
    // for any other type would be claimed by both the stepper and the
    // section type's classic initializer.
    for (const activity of Object.values(parsed.data.activities)) {
      if (!supportsEditableActivity(activity.sectionType)) {
        throw new HTTPException(400, {
          message: `Section type "${activity.sectionType}" doesn't support step-by-step activities.`,
        })
      }
    }

    const storage = createBookStorage(safeLabel, booksDir)
    try {
      const version = storage.putNodeData(EDITABLE_ACTIVITY_NODE, pageId, parsed.data)
      return c.json({ version })
    } finally {
      storage.close()
    }
  })

  // GET activity-structure — run the extractor WITHOUT saving anything.
  // The studio's classic-activity editor uses the result purely as a grouping
  // index (which data-ids / item-ids / image belong to the same item); edits
  // still flow through the normal rendering/answer channels.
  app.get(
    "/books/:label/pages/:pageId/sections/:sectionIndex/activity-structure",
    (c) => {
      const safeLabel = safeParseLabel(c.req.param("label"))
      requireBook(booksDir, safeLabel)
      const pageId = c.req.param("pageId")
      const sectionIndex = parseSectionIndex(c.req.param("sectionIndex"))

      const storage = createBookStorage(safeLabel, booksDir)
      try {
        const renderRow = storage.getLatestNodeData("web-rendering", pageId)
        const rendering = renderRow ? WebRenderingOutput.safeParse(renderRow.data) : null
        const section = rendering?.success
          ? rendering.data.sections.find((s) => s.sectionIndex === sectionIndex)
          : undefined
        if (!renderRow || !section) {
          return c.json({
            activity: null,
            outline: null,
            errors: ["No rendering data for this section."],
          })
        }
        // The outline works for every activity type — open-ended, tables,
        // true/false, multi-select — organizing header texts and item groups
        // from the section tree's roles + the rendered answer fields.
        const sectionNodes = loadSectionNodes(storage, pageId, sectionIndex)
        const outline = buildActivityOutline({ html: section.html, sectionNodes })
        if (!supportsEditableActivity(section.sectionType)) {
          return c.json({
            activity: null,
            outline,
            errors: [`Section type "${section.sectionType}" has no structured view.`],
            renderingVersion: renderRow.version,
          })
        }
        const result = extractEditableActivity({
          html: section.html,
          sectionType: section.sectionType,
          activityAnswers: section.activityAnswers,
          sourceRenderingVersion: renderRow.version,
        })
        return c.json({
          activity: result.activity
            ? applyActivityHeader(result.activity, { html: section.html, sectionNodes, outline })
            : null,
          outline,
          errors: result.errors,
          renderingVersion: renderRow.version,
        })
      } finally {
        storage.close()
      }
    },
  )

  // POST convert — extract the section's rendered HTML + answer key into a
  // structured activity and enable the step-by-step presentation.
  app.post(
    "/books/:label/pages/:pageId/sections/:sectionIndex/editable-activity/convert",
    (c) => {
      const safeLabel = safeParseLabel(c.req.param("label"))
      requireBook(booksDir, safeLabel)
      const pageId = c.req.param("pageId")
      const sectionIndex = parseSectionIndex(c.req.param("sectionIndex"))

      const storage = createBookStorage(safeLabel, booksDir)
      try {
        const renderRow = storage.getLatestNodeData("web-rendering", pageId)
        if (!renderRow) {
          throw new HTTPException(404, { message: `No rendering data for page: ${pageId}` })
        }
        const rendering = WebRenderingOutput.safeParse(renderRow.data)
        if (!rendering.success) {
          throw new HTTPException(500, { message: "Invalid rendering data" })
        }
        const section = rendering.data.sections.find((s) => s.sectionIndex === sectionIndex)
        if (!section) {
          throw new HTTPException(404, { message: `Section not found: ${sectionIndex}` })
        }
        if (!supportsEditableActivity(section.sectionType)) {
          throw new HTTPException(400, {
            message: `Section type "${section.sectionType}" doesn't support step-by-step conversion.`,
          })
        }

        const result = extractEditableActivity({
          html: section.html,
          sectionType: section.sectionType,
          activityAnswers: section.activityAnswers,
          sourceRenderingVersion: renderRow.version,
        })
        if (!result.activity) {
          // `error` is what the studio's request helper surfaces to the user.
          return c.json(
            { error: result.errors.join(" "), errors: result.errors, warnings: result.warnings },
            422,
          )
        }
        // The tree-resolved header beats the HTML heuristics (styled-span
        // titles, grade badges mistaken for instructions).
        const activity = applyActivityHeader(result.activity, {
          html: section.html,
          sectionNodes: loadSectionNodes(storage, pageId, sectionIndex),
        })

        const existingRow = storage.getLatestNodeData(EDITABLE_ACTIVITY_NODE, pageId)
        const existing = existingRow
          ? EditableActivitiesEntity.safeParse(existingRow.data)
          : null
        const activities = {
          ...(existing?.success ? existing.data.activities : {}),
          [String(sectionIndex)]: activity,
        }
        const version = storage.putNodeData(EDITABLE_ACTIVITY_NODE, pageId, { activities })
        return c.json({
          activity,
          warnings: result.warnings,
          version,
        })
      } finally {
        storage.close()
      }
    },
  )

  // POST generate-feedback — LLM writes per-step correct/incorrect feedback
  // in the book's language. Returned to the studio for review/editing; the
  // user saves it via the regular PUT (nothing is written here).
  app.post(
    "/books/:label/pages/:pageId/sections/:sectionIndex/editable-activity/generate-feedback",
    async (c) => {
      if (!promptsDir) {
        throw new HTTPException(500, {
          message: "Server misconfigured: promptsDir not provided to editable-activity routes",
        })
      }
      const safeLabel = safeParseLabel(c.req.param("label"))
      requireBook(booksDir, safeLabel)
      const pageId = c.req.param("pageId")
      const sectionIndex = parseSectionIndex(c.req.param("sectionIndex"))

      const apiKey = c.req.header("X-OpenAI-Key")
      if (!apiKey) {
        throw new HTTPException(400, { message: "Missing X-OpenAI-Key header" })
      }
      const credentials = {
        openaiApiKey: apiKey,
        anthropicApiKey: c.req.header("X-Anthropic-API-Key") || undefined,
        googleApiKey: c.req.header("X-Google-API-Key") || undefined,
        customBaseUrl: c.req.header("X-Custom-Base-URL") || undefined,
        customApiKey: c.req.header("X-Custom-API-Key") || undefined,
      }

      // The studio may send its unsaved draft so feedback matches what the
      // user is editing; otherwise fall back to the last saved entity.
      const body = await c.req.json().catch(() => null)
      const draftParsed = body?.activity ? EditableActivity.safeParse(body.activity) : null
      if (body?.activity && !draftParsed?.success) {
        throw new HTTPException(400, { message: "Invalid activity in request body." })
      }

      const storage = createBookStorage(safeLabel, booksDir)
      try {
        const row = storage.getLatestNodeData(EDITABLE_ACTIVITY_NODE, pageId)
        const parsed = row ? EditableActivitiesEntity.safeParse(row.data) : null
        const activity =
          draftParsed?.data ??
          (parsed?.success ? parsed.data.activities[String(sectionIndex)] : undefined)
        if (!activity) {
          throw new HTTPException(404, {
            message: `No editable activity for section ${sectionIndex} — convert it first.`,
          })
        }

        const appConfig = loadBookConfig(safeLabel, booksDir, configPath)
        const metadataRow = storage.getLatestNodeData("metadata", "book")
        const metadata = metadataRow?.data as { language_code?: string | null } | null
        const language = normalizeLocale(
          appConfig.editing_language ?? metadata?.language_code ?? "en",
        )

        const cacheDir = path.join(path.resolve(booksDir), safeLabel, ".cache")
        const bookPromptsDir = path.join(path.resolve(booksDir), safeLabel, "prompts")
        const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
        const llmModel = createLLMModel({
          modelId:
            appConfig.quiz_generation?.model ??
            appConfig.page_sectioning?.model ??
            "openai:gpt-5.4",
          cacheDir,
          promptEngine,
          onLog: (entry) => storage.appendLlmLog(entry),
          credentials,
        })

        const feedback = await generateActivityFeedback(
          activity,
          {
            language,
            promptName: "activity_feedback",
            maxRetries: DEFAULT_LLM_MAX_RETRIES,
            timeoutMs: 90_000,
          },
          llmModel,
        )
        return c.json({ feedback })
      } finally {
        storage.close()
      }
    },
  )

  // POST presentation — toggle step-by-step on/off without losing the
  // structured data (the classic HTML is never touched either way).
  app.post(
    "/books/:label/pages/:pageId/sections/:sectionIndex/editable-activity/presentation",
    async (c) => {
      const safeLabel = safeParseLabel(c.req.param("label"))
      requireBook(booksDir, safeLabel)
      const pageId = c.req.param("pageId")
      const sectionIndex = parseSectionIndex(c.req.param("sectionIndex"))

      const body = await c.req.json().catch(() => null)
      const parsedBody = z.object({ enabled: z.boolean() }).safeParse(body)
      if (!parsedBody.success) {
        throw new HTTPException(400, { message: "Body must be { enabled: boolean }." })
      }
      const { enabled } = parsedBody.data

      const storage = createBookStorage(safeLabel, booksDir)
      try {
        const row = storage.getLatestNodeData(EDITABLE_ACTIVITY_NODE, pageId)
        const parsed = row ? EditableActivitiesEntity.safeParse(row.data) : null
        const entity = parsed?.success ? parsed.data : null
        const activity = entity?.activities[String(sectionIndex)]
        if (!entity || !activity) {
          throw new HTTPException(404, {
            message: `No editable activity for section ${sectionIndex} — convert it first.`,
          })
        }
        const activities = {
          ...entity.activities,
          [String(sectionIndex)]: { ...activity, enabled },
        }
        const version = storage.putNodeData(EDITABLE_ACTIVITY_NODE, pageId, { activities })
        return c.json({ version, enabled })
      } finally {
        storage.close()
      }
    },
  )

  return app
}
