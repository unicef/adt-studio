import { Hono } from "hono"
import { PUBLISH_WORKER_VERSION, type PublishWorkerHealth } from "@adt/types"
import type { AppEnv } from "./app.js"
import { createD1PublicationStore } from "./d1-store.js"
import type { Env } from "./env.js"
import { errorResponse } from "./errors.js"
import { randomId } from "./identity.js"
import { registerReaderRoutes } from "./reader-routes.js"
import type { PublicationStore } from "./store.js"

export interface BookHostOptions {
  store?: PublicationStore
  createStore?: (env: Env) => PublicationStore
  now?: () => Date
  newId?: () => string
}

/**
 * The Worker that hosts one book.
 *
 * It carries that book's Static Assets and the reader routes that guard them, and nothing
 * else. There is no `/api/*` surface and no `MGMT_SECRET` binding, so a book host cannot serve
 * a management request even if one reaches it — the routes are absent rather than guarded,
 * which is the only form of "not exposed" that survives a routing mistake.
 *
 * The control plane keeps the management API, owns the D1 database this reads from, and owns
 * the `PublicationRoom` class. Book hosts bind that namespace across scripts rather than
 * declaring their own, because the Workers Free plan allows 100 Durable Object classes per
 * account and 100 Workers — one class per book host would exhaust both caps at the same book.
 */
export function createBookHostApp(options: BookHostOptions = {}): Hono<AppEnv> {
  const injected = options.store
  const resolveStore = (env: Env): PublicationStore =>
    injected ?? (options.createStore ?? ((e: Env) => createD1PublicationStore(e.DB)))(env)
  const now = options.now ?? (() => new Date())

  const app = new Hono<AppEnv>()

  app.get("/health", (c) => {
    const health: PublishWorkerHealth = { ok: true, version: PUBLISH_WORKER_VERSION }
    return c.json(health)
  })

  registerReaderRoutes(app, {
    resolveStore,
    timestamp: () => now().toISOString(),
    newId: options.newId ?? (() => randomId()),
  })

  app.notFound((c) => errorResponse(c, "not_found", 404))

  app.onError((err, c) => {
    console.error(err)
    return errorResponse(c, "internal_error", 500)
  })

  return app
}
