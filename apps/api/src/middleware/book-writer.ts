import fs from "node:fs"
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
    const { bookDir } = resolveBookPaths(label, booksDir)
    if (!fs.existsSync(bookDir)) return next()
    return withBookWriter(bookDir, async () => {
      recoverSectioningTransition(bookDir)
      await next()
    })
  })
}
