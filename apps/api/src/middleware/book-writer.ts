import fs from "node:fs"
import { HTTPException } from "hono/http-exception"
import { createMiddleware } from "hono/factory"
import { resolveBookPaths, withBookWriter, recoverSectioningTransition } from "@adt/storage"

/** All HTTP book mutations share the same lease as background work and CLI.
 * Queue admission/control endpoints remain available during an active run;
 * execution itself acquires the lease when the queued job starts. */
export function bookWriterMiddleware(booksDir: string) {
  return createMiddleware(async (c, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next()
    if (/\/stages\/(run|cancel|decision)$/.test(c.req.path)) return next()
    const label = c.req.param("label")
    if (!label) return next()
    let bookDir: string
    try { ({ bookDir } = resolveBookPaths(label, booksDir)) } catch (error) {
      throw new HTTPException(400, { message: error instanceof Error ? error.message : String(error) })
    }
    if (!fs.existsSync(bookDir)) return next()
    return withBookWriter(bookDir, async () => {
      recoverSectioningTransition(bookDir)
      await next()
    })
  })
}
