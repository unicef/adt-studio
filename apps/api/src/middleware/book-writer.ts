import type { MiddlewareHandler } from "hono"
import { assertExtractionReadable, resolveBookPaths, withBookWriter } from "@adt/storage"

/** Interactive writes and background workers use the same book-local lease. */
export function bookWriterMiddleware(booksDir: string): MiddlewareHandler {
  return async (c, next) => {
    const label = c.req.param("label")
    if (!label) return next()
    const { bookDir } = resolveBookPaths(label, booksDir)
    const suffix = c.req.path.split(`/books/${encodeURIComponent(label)}`)[1] ?? ""
    // These collection endpoints have no book label despite matching :label.
    if (suffix === "" && c.req.method === "POST" && ["import", "preview-import"].includes(label)) return next()
    // Run submission is queued by StageService. Cancellation/decisions must
    // remain available while a writer holds the lease, including a slow LLM.
    if (suffix.startsWith("/stages") || suffix.startsWith("/tasks")) return next()
    if (c.req.method === "GET" || c.req.method === "HEAD") {
      // Keep diagnostics and source/config inspection available on failed imports.
      if (suffix && !/^\/(debug|step-status|config|source-pdf)(\/|$)/.test(suffix)) assertExtractionReadable(bookDir)
      return next()
    }
    if (c.req.method === "OPTIONS") return next()
    return withBookWriter(bookDir, async () => {
      // Explicit whole-book deletion is still allowed for a failed import.
      if (!(suffix === "" && c.req.method === "DELETE")) assertExtractionReadable(bookDir)
      await next()
    })
  }
}
