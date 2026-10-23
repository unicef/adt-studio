import type { MiddlewareHandler } from "hono"
import { withBookWriter } from "@adt/storage"
import { requireExistingBook } from "../utils/book-exists.js"

const PUBLISH_WITHOUT_WRITES = ["/publication/comments", "/publication/room-ticket", "/publication/run/cancel"]

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
    // Shared-link feedback only reaches the publish Worker, and Stop only flags the run that
    // already holds the book; neither writes to it.
    if (PUBLISH_WITHOUT_WRITES.some((prefix) => suffix.startsWith(prefix))) return next()
    return withBookWriter(bookDir, next)
  }
}
