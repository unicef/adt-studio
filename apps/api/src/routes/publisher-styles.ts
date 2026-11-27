import fs from "node:fs"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { createBookStorage, resolveBookPaths, type Storage } from "@adt/storage"
import {
  PublisherAnalyzeRequest, PublisherDocument,
  PublisherPreviewRequest, PublisherRestoreRequest, PublisherSaveRequest, PublisherStoryboard, PublisherLayoutRequest, PublisherThemeRequest,
  type PublisherState,
} from "@adt/types"
import { analyzePublisherStyles, renderPublisherStoryboard, renderPublisherPage, inferPublisherRegions, readPublisherSources, applyPublisherLearningDesign } from "@adt/pipeline"

const DESIGN = "publisher-styles-prototype"
const STORYBOARD = "publisher-storyboard-prototype"
const ITEM = "book"

function state(storage: Storage): PublisherState {
  const saved = storage.getLatestNodeData(DESIGN, ITEM)
  const generated = storage.getLatestNodeData(STORYBOARD, ITEM)
  const document = saved ? PublisherDocument.parse(saved.data) : null
  const storyboard = generated ? PublisherStoryboard.parse(generated.data) : null
  const { sources, fingerprint } = readPublisherSources(storage)
  return {
    document, version: saved?.version ?? 0,
    versions: storage.getAllNodeVersions(DESIGN, ITEM).map((v) => v.version),
    sourceChanged: !!document && document.sourceFingerprint !== fingerprint,
    sourcePageCount: sources.length,
    generated: storyboard && generated ? { version: generated.version, designVersion: storyboard.designVersion, pageCount: storyboard.pages.length } : null,
  }
}

function requireCurrent(storage: Storage, version: number) {
  if ((storage.getLatestNodeData(DESIGN, ITEM)?.version ?? 0) !== version) {
    throw new HTTPException(409, { message: "The design changed in another window. Reload before saving." })
  }
}

function requireFresh(storage: Storage, document: PublisherDocument) {
  if (readPublisherSources(storage).fingerprint !== document.sourceFingerprint) {
    throw new HTTPException(409, { message: "Source content changed. Analyze the book again before saving or generating." })
  }
}

export function createPublisherStylesRoutes(booksDir: string): Hono {
  const app = new Hono()
  const withBook = <T>(label: string, operation: (storage: Storage) => T): T => {
    let paths: ReturnType<typeof resolveBookPaths>
    try { paths = resolveBookPaths(label, booksDir) }
    catch { throw new HTTPException(400, { message: "Invalid book label" }) }
    if (!fs.existsSync(paths.dbPath)) throw new HTTPException(404, { message: "Book not found" })
    const storage = createBookStorage(label, booksDir)
    try { return operation(storage) } finally { storage.close() }
  }
  const prefix = "/books/:label/publisher-styles"
  app.get(prefix, (c) => c.json(withBook(c.req.param("label"), state)))

  app.post(`${prefix}/analyze`, async (c) => {
    const parsed = PublisherAnalyzeRequest.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid analysis request" })
    return c.json(withBook(c.req.param("label"), (storage) => {
      const { sources, fingerprint } = readPublisherSources(storage)
      try { return analyzePublisherStyles(sources, parsed.data.preset, fingerprint) }
      catch (error) { throw new HTTPException(422, { message: error instanceof Error ? error.message : "Analysis failed" }) }
    }))
  })

  app.post(`${prefix}/preview`, async (c) => {
    const parsed = PublisherPreviewRequest.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid design" })
    const label = c.req.param("label")
    return c.json(withBook(label, () => {
      try { return renderPublisherPage(parsed.data.document, parsed.data.pageId, `/api/books/${encodeURIComponent(label)}/images`) }
      catch { throw new HTTPException(400, { message: "The page contains an invalid style assignment" }) }
    }))
  })

  // Draft-only upgrade: infer layout without resetting the publisher's library
  // or writing a version. Save/generate retain the normal concurrency checks.
  app.post(`${prefix}/layouts`, async (c) => {
    const parsed = PublisherLayoutRequest.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid design" })
    return c.json(withBook(c.req.param("label"), (storage) => {
      requireFresh(storage, parsed.data.document)
      const { sources } = readPublisherSources(storage)
      const document = parsed.data.document
      return PublisherDocument.parse({ ...document, pages: document.pages.map((page) => {
        const source = sources.find((s) => s.pageId === page.pageId)
        if (!source) throw new HTTPException(409, { message: "Source page is no longer available" })
        return { ...page, regions: inferPublisherRegions(page.nodes, source) }
      }) })
    }))
  })

  app.post(`${prefix}/learning-design`, async (c) => {
    const parsed = PublisherThemeRequest.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid learning design" })
    return c.json(withBook(c.req.param("label"), (storage) => {
      requireFresh(storage, parsed.data.document)
      return applyPublisherLearningDesign(parsed.data.document, parsed.data.accent)
    }))
  })

  for (const action of ["save", "generate"] as const) {
    app.post(`${prefix}/${action}`, async (c) => {
      const parsed = PublisherSaveRequest.safeParse(await c.req.json().catch(() => null))
      if (!parsed.success) throw new HTTPException(400, { message: "Invalid design" })
      const label = c.req.param("label")
      return c.json(withBook(label, (storage) => storage.transaction(() => {
        const { document, baseVersion } = parsed.data
        requireCurrent(storage, baseVersion)
        requireFresh(storage, document)
        const version = storage.putNodeData(DESIGN, ITEM, document)
        if (action === "generate") {
          const storyboard = renderPublisherStoryboard(document, version, `/api/books/${encodeURIComponent(label)}/images`)
          storage.putNodeData(STORYBOARD, ITEM, storyboard)
        }
        return state(storage)
      })))
    })
  }

  app.post(`${prefix}/restore`, async (c) => {
    const parsed = PublisherRestoreRequest.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid version" })
    return c.json(withBook(c.req.param("label"), (storage) => storage.transaction(() => {
      requireCurrent(storage, parsed.data.baseVersion)
      const version = storage.getAllNodeVersions(DESIGN, ITEM).find((v) => v.version === parsed.data.version)
      if (!version) throw new HTTPException(404, { message: "Version not found" })
      storage.putNodeData(DESIGN, ITEM, PublisherDocument.parse(version.data))
      return state(storage)
    })))
  })

  app.get(`${prefix}/storyboard`, (c) => c.json(withBook(c.req.param("label"), (storage) => {
    const row = storage.getLatestNodeData(STORYBOARD, ITEM)
    return row ? PublisherStoryboard.parse(row.data) : null
  })))
  return app
}
