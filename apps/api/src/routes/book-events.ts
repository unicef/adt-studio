import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import type { BookEventBus, BookSSEEvent } from "../services/book-event-bus.js"

/**
 * Global SSE stream for run events across every book.
 *
 * The existing `/books/:label/stages/status` stream only emits events for one
 * book, and the Studio only subscribes while that book's route is mounted.
 * This endpoint lets the Studio keep a single always-on subscription for
 * notification purposes (OS notification when unfocused, toast when the user
 * is elsewhere in the app) regardless of the current route.
 */
/** The notification client only reacts to terminal run events, so the rest of
 *  the progress firehose — per-page step-progress, whole llm-log payloads — is
 *  dropped here instead of being serialised to every connected Studio. */
function isNotifiable(event: BookSSEEvent): boolean {
  if (event.type === "progress") {
    return event.data.type === "stage-complete" || event.data.type === "stage-error"
  }
  return (
    event.type === "stage-run-complete" ||
    event.type === "stage-run-error" ||
    event.type === "stage-run-cancelled"
  )
}

/** A client that stops reading must not grow this queue without bound. */
const MAX_QUEUED_EVENTS = 500

/** Idle by design, so it needs a heartbeat: nginx closes a silent upstream
 *  after proxy_read_timeout and a run finishing inside the reconnect gap would
 *  notify nobody. */
const KEEPALIVE_EVERY_MS = 25_000

export function createBookEventsRoutes(eventBus: BookEventBus): Hono {
  const app = new Hono()

  app.get("/books/events", async (c, next) => {
    const accept = c.req.header("accept") ?? ""

    // This route is mounted ahead of /books/:label, so a plain request has to
    // fall through or it would shadow a book actually labelled "events".
    if (!accept.includes("text/event-stream")) {
      return next()
    }

    return streamSSE(c, async (stream) => {
      const queue: Array<{ label: string; event: BookSSEEvent }> = []
      let done = false
      let lastWrite = Date.now()

      const unsubscribe = eventBus.addGlobalListener((label, event) => {
        if (done) return
        if (!isNotifiable(event)) return
        if (queue.length >= MAX_QUEUED_EVENTS) queue.shift()
        queue.push({ label, event })
      })

      stream.onAbort(() => {
        done = true
        unsubscribe()
      })

      while (!done) {
        while (queue.length > 0) {
          const { label, event } = queue.shift()!
          try {
            const sse = toSseEvent(label, event)
            await stream.writeSSE({
              event: sse.name,
              data: JSON.stringify(sse.data),
            })
            lastWrite = Date.now()
          } catch {
            done = true
            break
          }
        }

        if (!done) {
          await new Promise((resolve) => setTimeout(resolve, 50))

          if (Date.now() - lastWrite >= KEEPALIVE_EVERY_MS) {
            lastWrite = Date.now()
            try {
              await stream.writeSSE({ event: "keepalive", data: "" })
            } catch {
              done = true
            }
          }
        }
      }

      unsubscribe()
    })
  })

  return app
}

function toSseEvent(
  label: string,
  event: BookSSEEvent,
): { name: string; data: Record<string, unknown> } {
  switch (event.type) {
    case "progress":
      return {
        name: "progress",
        data: { label, ...(event.data as Record<string, unknown>) },
      }
    case "stage-run-complete":
      return { name: "complete", data: { label } }
    case "stage-run-error":
      return { name: "error", data: { label, error: event.error } }
    case "stage-run-cancelled":
      return { name: "cancelled", data: { label } }
    case "queue-next":
      return {
        name: "queue-next",
        data: {
          label,
          fromStage: event.fromStage,
          toStage: event.toStage,
        },
      }
    case "decision-required":
      return {
        name: "decision-required",
        data: {
          label,
          decisionId: event.decisionId,
          step: event.step,
          pageId: event.pageId,
          error: event.error,
        },
      }
    case "task":
      return {
        name: "task",
        data: { label, ...(event.data as Record<string, unknown>) },
      }
  }
}
