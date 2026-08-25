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
export function createBookEventsRoutes(eventBus: BookEventBus): Hono {
  const app = new Hono()

  app.get("/books/events", (c) => {
    const accept = c.req.header("accept") ?? ""

    if (!accept.includes("text/event-stream")) {
      return c.json({ error: "This endpoint only supports text/event-stream" }, 400)
    }

    return streamSSE(c, async (stream) => {
      const queue: Array<{ label: string; event: BookSSEEvent }> = []
      let done = false

      const unsubscribe = eventBus.addGlobalListener((label, event) => {
        if (done) return
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
          } catch {
            done = true
            break
          }
        }

        if (!done) {
          await new Promise((resolve) => setTimeout(resolve, 50))
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
