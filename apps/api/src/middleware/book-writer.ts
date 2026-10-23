import type { MiddlewareHandler } from "hono"
import { withBookWriter } from "@adt/storage"
import { requireExistingBook } from "../utils/book-exists.js"

/** Adapted from published SPEC-0010/#886. Reads remain read-only; queued runs
 * and cancellation are admitted by their service when execution starts. */
export function bookWriterMiddleware(booksDir: string): MiddlewareHandler {
  return async (c, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next()
    const label = c.req.param("label")
    if (!label) return next()
    const suffix = c.req.path.split(`/books/${encodeURIComponent(label)}`)[1] ?? ""
    if (suffix === "" && c.req.method === "POST" && ["import", "preview-import"].includes(label)) return next()
    const bookDir = requireExistingBook(label, booksDir)
    // Match #886: admission must not recreate a book after its deletion.
    if (suffix.startsWith("/stages") || suffix.startsWith("/tasks")) return next()
    return withBookWriter(bookDir, next)
  }
}
