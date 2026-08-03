import { createMiddleware } from "hono/factory"
import { PublicationToken, publicationStateAt, type Publication } from "@adt/types"
import type { Env } from "../env.js"
import { errorResponse } from "../errors.js"
import type { PublicationStore } from "../store.js"

export interface PublicationVariables {
  publication: Publication
}

export type StoreResolver = (env: Env) => PublicationStore

export function publicationLookup(resolveStore: StoreResolver) {
  return createMiddleware<{ Bindings: Env; Variables: PublicationVariables }>(async (c, next) => {
    const token = PublicationToken.safeParse(c.req.param("token"))
    if (!token.success) {
      return errorResponse(c, "not_found", 404)
    }

    const publication = await resolveStore(c.env).findByToken(token.data)
    if (!publication) {
      return errorResponse(c, "not_found", 404)
    }

    const state = publicationStateAt(publication)
    if (state === "revoked") {
      return errorResponse(c, "revoked", 410)
    }
    if (state === "expired") {
      return errorResponse(c, "expired", 410)
    }

    c.set("publication", publication)
    return next()
  })
}
