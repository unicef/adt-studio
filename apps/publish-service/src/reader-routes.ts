import type { Context, Hono } from "hono"
import { COVER_FILES, createAccessGate, registerAccessRoute } from "./access.js"
import { registerCommentRoutes } from "./comments.js"
import type { AppEnv } from "./app.js"
import type { Env } from "./env.js"
import { errorResponse } from "./errors.js"
import { publicationLookup } from "./middleware/publication-lookup.js"
import { registerRoomRoutes } from "./room-routes.js"
import {
  cacheControlFor,
  conditionalEtag,
  contentTypeFor,
  snapshotPathFromUrl,
} from "./serve.js"
import { normalizeSnapshotPath } from "./snapshot.js"
import type { PublicationStore } from "./store.js"

export interface ReaderRouteDeps {
  resolveStore: (env: Env) => PublicationStore
  timestamp: () => string
  newId: () => string
}

/**
 * Everything a reader can reach: the lookup ladder, the access gate, the door, rooms,
 * comments, and the snapshot bytes. Deliberately separable from the management API so a
 * per-book host can mount these and nothing else — a book Worker that never registers an
 * `/api/*` route cannot leak one through a routing mistake.
 */
export function registerReaderRoutes(app: Hono<AppEnv>, deps: ReaderRouteDeps): void {
  const { resolveStore } = deps
  const requirePublication = publicationLookup(resolveStore)
  const sessionDeps = deps

  const serveSnapshot = async (c: Context<AppEnv>): Promise<Response> => {
    const publication = c.get("publication")
    const requested = snapshotPathFromUrl(c.req.url, publication.token)
    const relative = normalizeSnapshotPath(requested)
    if (relative === null) {
      return errorResponse(c, "not_found", 404)
    }

    const prefix = await resolveStore(c.env).findSnapshotPrefix(
      publication.token,
      publication.current_version,
      relative,
    )
    if (prefix === null) return errorResponse(c, "not_found", 404)
    const key = `${prefix}/${relative}`

    if (c.env.ASSETS) {
      const assetUrl = new URL(`/${key}`, c.req.url)
      const asset = await c.env.ASSETS.fetch(new Request(assetUrl, c.req.raw))
      if (asset.status !== 404) {
        const headers = new Headers(asset.headers)
        headers.set("content-type", contentTypeFor(relative))
        headers.set("cache-control", cacheControlFor(relative, c.get("accessCodeHash") !== null))
        return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers })
      }
      if (!c.env.SNAPSHOTS) return errorResponse(c, "not_found", 404)
    }

    const ifNoneMatch = conditionalEtag(c.req.header("If-None-Match"))
    const object = await c.env.SNAPSHOTS.get(
      key,
      ifNoneMatch === undefined ? undefined : { onlyIf: { etagDoesNotMatch: ifNoneMatch } },
    )

    if (!object) {
      return errorResponse(c, "not_found", 404)
    }

    const headers = new Headers({
      "content-type": contentTypeFor(relative),
      "cache-control": cacheControlFor(relative, c.get("accessCodeHash") !== null),
      etag: object.httpEtag,
    })

    if (!("body" in object)) {
      return new Response(null, { status: 304, headers })
    }

    headers.set("content-length", String(object.size))
    return new Response(object.body, { headers })
  }

  app.use("/p/:token", requirePublication)
  app.use("/p/:token/*", requirePublication)

  /** Order is load-bearing three times over. The lookup ladder runs first, so an unknown token
   *  is still `404` and a revoked one still `410` — the gate only ever guards requests that
   *  would otherwise be served. `POST /access` is registered *before* the gate, because a
   *  handler that answers without calling `next()` ends the chain: the code prompt's own form
   *  target cannot sit behind the prompt. Everything after the gate — comments included — is
   *  reachable only with a valid grant or `MGMT_SECRET`.
   *
   *  The door shares the comment routes' deps because it now mints commenter sessions too: the
   *  gate collects the visitor's name, so both cookies are set on the one response. */
  registerAccessRoute(app, sessionDeps)

  /** Ahead of the gate because a room ticket is an alternative credential to the reader grant. */
  registerRoomRoutes(app, sessionDeps)

  /** The cover alone, ahead of the gate: the code prompt shows it, so the reader can see they
   *  opened the right book, and a prompt cannot draw an image behind its own door. Exactly the
   *  root cover files, and after the lookup ladder, so a revoked link still answers 410. */
  for (const file of COVER_FILES) app.get(`/p/:token/${file}`, serveSnapshot)

  const accessGate = createAccessGate(resolveStore)
  app.use("/p/:token", accessGate)
  app.use("/p/:token/*", accessGate)

  registerCommentRoutes(app, sessionDeps)

  app.get("/p/:token", serveSnapshot)
  app.get("/p/:token/*", serveSnapshot)
}
