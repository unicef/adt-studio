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
    // Part exports write a ledger; all archives need a consistent file set.
    const archiveRead = /^(GET|HEAD)$/.test(c.req.method) && /^\/export-[^/]+$/.test(suffix)
    if ((c.req.method === "GET" || c.req.method === "HEAD") && !archiveRead) {
      // Keep diagnostics and source/config inspection available on failed imports.
      if (suffix && !/^\/(debug|step-status|config|source-pdf)(\/|$)/.test(suffix)) assertExtractionReadable(bookDir)
      return next()
    }
    if (c.req.method === "OPTIONS") return next()
    return withBookWriter(bookDir, async () => {
      // Explicit whole-book deletion is still allowed for a failed import.
      if (!(suffix === "" && c.req.method === "DELETE")) assertExtractionReadable(bookDir)
      await next()
      if (archiveRead && c.res.body) {
        c.res = new Response(retainArchiveWriter(bookDir, c.res.body), c.res)
      }
    })
  }
}

/** Adapted from SPEC-0003's project archive admission. ZIP production yields
 * while reading files, beyond the HTTP handler's lifetime. Drain even after a
 * disconnected client cancels: its eager producer may still be reading disk. */
function retainArchiveWriter(bookDir: string, source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  let cancelled = false
  return new ReadableStream({
    start(controller) {
      return withBookWriter(bookDir, async () => {
        const reader = source.getReader()
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) {
              if (!cancelled) controller.close()
              break
            }
            if (!cancelled) controller.enqueue(value)
          }
        } finally { reader.releaseLock() }
      })
    },
    cancel() { cancelled = true },
  })
}
