import { Hono, type Context } from "hono"
import { HTTPException } from "hono/http-exception"
import type { z } from "zod"
import { ReaderSourceConflictError, ReaderSourceStateError } from "@adt/pipeline"
import {
  parseBookLabel,
  ReaderSourceCompileRequest,
  ReaderSourcePath,
  ReaderSourceRestoreRequest,
  ReaderSourceRevertRequest,
  ReaderSourceSaveRequest,
} from "@adt/types"
import { createReaderSourceService } from "../services/reader-source-service.js"

async function parseBody<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await c.req.json().catch(() => undefined))
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message })
  return parsed.data
}

function queryPath(c: Context): string {
  const parsed = ReaderSourcePath.safeParse(c.req.query("path"))
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message })
  return parsed.data
}

function label(c: Context): string {
  return parseBookLabel(c.req.param("label") ?? "")
}

function guarded<T>(operation: () => T): T {
  try {
    return operation()
  } catch (error) {
    if (error instanceof ReaderSourceConflictError || error instanceof ReaderSourceStateError) {
      throw new HTTPException(409, { message: error.message })
    }
    throw error
  }
}

export function createReaderSourceRoutes(booksDir: string, webAssetsDir: string): Hono {
  const app = new Hono()
  const service = createReaderSourceService(booksDir, webAssetsDir)

  app.get("/books/:label/reader-source/tree", (c) => c.json(service.tree(label(c))))
  app.get("/books/:label/reader-source/file", (c) => c.json(service.file(label(c), queryPath(c))))
  app.get("/books/:label/reader-source/base", (c) => c.json(service.base(queryPath(c))))
  app.get("/books/:label/reader-source/history", (c) => c.json({ versions: service.history(label(c), queryPath(c)) }))

  app.put("/books/:label/reader-source/file", async (c) => {
    const body = await parseBody(c, ReaderSourceSaveRequest)
    return c.json({ version: guarded(() => service.save(label(c), body.path, body.content, body.baseVersion)) })
  })

  app.post("/books/:label/reader-source/revert", async (c) => {
    const body = await parseBody(c, ReaderSourceRevertRequest)
    return c.json({ version: guarded(() => service.revert(label(c), body.path, body.baseVersion)) })
  })

  app.post("/books/:label/reader-source/restore", async (c) => {
    const body = await parseBody(c, ReaderSourceRestoreRequest)
    return c.json({ version: guarded(() => service.restore(label(c), body.path, body.version, body.baseVersion)) })
  })

  app.post("/books/:label/reader-source/follow-global", (c) => c.json({ version: service.followGlobal(label(c)) }))

  app.post("/books/:label/reader-source/compile", async (c) => {
    const body = await parseBody(c, ReaderSourceCompileRequest)
    return c.json(await service.compile(label(c), body.drafts))
  })

  app.get("/reader-source/global/tree", (c) => c.json(service.globalTree()))
  app.get("/reader-source/global/file", (c) => c.json(service.globalFile(queryPath(c))))
  app.get("/reader-source/global/history", (c) => c.json({ versions: service.globalHistory(queryPath(c)) }))

  app.put("/reader-source/global/file", async (c) => {
    const body = await parseBody(c, ReaderSourceSaveRequest)
    return c.json({ version: guarded(() => service.globalSave(body.path, body.content, body.baseVersion)) })
  })

  app.post("/reader-source/global/revert", async (c) => {
    const body = await parseBody(c, ReaderSourceRevertRequest)
    return c.json({ version: guarded(() => service.globalRevert(body.path, body.baseVersion)) })
  })

  app.post("/reader-source/global/restore", async (c) => {
    const body = await parseBody(c, ReaderSourceRestoreRequest)
    return c.json({ version: guarded(() => service.globalRestore(body.path, body.version, body.baseVersion)) })
  })

  return app
}
