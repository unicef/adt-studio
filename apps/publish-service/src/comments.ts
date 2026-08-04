import type { Context, Hono } from "hono"
import { getCookie, setCookie } from "hono/cookie"
import {
  COMMENTER_SESSION_COOKIE,
  COMMENTER_SESSION_MAX_AGE_SECONDS,
  CommenterSessionClaimRequest,
  CommenterSessionCreateRequest,
  PUBLISH_AUTHOR_NAME_HEADER,
  PUBLISH_COMMENT_BODY_MAX_LENGTH,
  PublishCommentCreateRequest,
  PublishCommentListQuery,
  PublishCommentResolveRequest,
  PublishCommentUpdateRequest,
  type CommenterSession,
  type CommenterSessionResponse,
  type Publication,
  type PublishCommentListResponse,
  type PublishCommentResponse,
} from "@adt/types"
import { filterCommentThreads } from "./comment-threads.js"
import type { Env } from "./env.js"
import { errorResponse } from "./errors.js"
import { exceedsLength, readJsonBody } from "./http.js"
import {
  authorSessionMarker,
  commenterColor,
  hashPin,
  nameKey,
  normalizeDisplayName,
  randomId,
  sessionCookieValue,
  sessionIdFromCookie,
  verifyPin,
} from "./identity.js"
import type { PublicationVariables } from "./middleware/publication-lookup.js"
import type { PublicationStore, StoredCommenterSession } from "./store.js"

export type CommentAppEnv = { Bindings: Env; Variables: PublicationVariables }

export interface CommentRoutesDeps {
  resolveStore: (env: Env) => PublicationStore
  timestamp: () => string
  newId: () => string
}

type CommentContext = Context<CommentAppEnv>

const MISSING_SECRET_MESSAGE =
  "This worker has no MGMT_SECRET bound, so it cannot issue commenter sessions"

const NO_IDENTITY_MESSAGE =
  "Claim a display name with POST /p/:token/session before writing comments"

export function registerCommentRoutes(app: Hono<CommentAppEnv>, deps: CommentRoutesDeps): void {
  const requestedAuthorName = (
    c: CommentContext,
  ): { ok: true; name: string | null } | { ok: false } => {
    const header = c.req.header(PUBLISH_AUTHOR_NAME_HEADER)
    if (header === undefined) return { ok: true, name: null }
    const name = normalizeDisplayName(header)
    return name === null ? { ok: false } : { ok: true, name }
  }

  /** A cookie can only ever carry a commenter: `is_author` rows are reachable through
   *  `MGMT_SECRET` alone, because `session_id` is public in every comment payload. */
  const commenterFromCookie = async (
    c: CommentContext,
    store: PublicationStore,
    token: string,
  ): Promise<CommenterSession | null> => {
    const secret = c.env?.MGMT_SECRET
    const cookie = getCookie(c, COMMENTER_SESSION_COOKIE)
    if (!secret || cookie === undefined) return null

    const sessionId = await sessionIdFromCookie(cookie, secret)
    if (sessionId === null) return null

    const session = await store.findSession(sessionId)
    if (!session || session.token !== token || session.is_author) return null

    return { id: session.id, name: session.name, color: session.color, is_author: false }
  }

  const materializeAuthor = async (
    store: PublicationStore,
    token: string,
    name: string | null,
  ): Promise<CommenterSession> => {
    const marker = authorSessionMarker(token, name)
    const session = await store.ensureAuthorSession({
      id: marker.id,
      token,
      name: marker.name,
      color: marker.color,
      isAuthor: true,
      createdAt: deps.timestamp(),
    })
    if (name === null || session.name === name) return session
    return (await store.renameSession(session.id, name)) ?? session
  }

  const writer = async (
    c: CommentContext,
    store: PublicationStore,
    token: string,
    authorName: string | null,
  ): Promise<CommenterSession | null> => {
    if (c.get("isAuthor")) return materializeAuthor(store, token, authorName)
    return commenterFromCookie(c, store, token)
  }

  const publicationOf = (c: CommentContext): Publication => c.get("publication")

  const issueCookie = async (
    c: CommentContext,
    token: string,
    sessionId: string,
    secret: string,
  ): Promise<void> => {
    setCookie(c, COMMENTER_SESSION_COOKIE, await sessionCookieValue(sessionId, secret), {
      path: `/p/${token}`,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: COMMENTER_SESSION_MAX_AGE_SECONDS,
    })
  }

  /** Name reservation is per publication and over commenters only: the author's display name
   *  is a Studio-side label, never a claimable identity, so it must not lock a reviewer who
   *  happens to be called the same out of commenting. */
  const takenBy = async (
    store: PublicationStore,
    token: string,
    name: string,
    exceptSessionId: string | null,
  ): Promise<StoredCommenterSession | null> => {
    const key = nameKey(name)
    const sessions = await store.listCommenterSessions(token)
    return sessions.find((session) => session.id !== exceptSessionId && nameKey(session.name) === key) ?? null
  }

  app.post("/p/:token/session", async (c) => {
    const publication = publicationOf(c)
    const secret = c.env?.MGMT_SECRET
    if (!secret) {
      return errorResponse(c, "internal_error", 500, MISSING_SECRET_MESSAGE)
    }

    const body = await readJsonBody(c, CommenterSessionCreateRequest)
    if (!body.ok) {
      return errorResponse(c, "invalid_request", 400, body.message)
    }

    const store = deps.resolveStore(c.env)
    const existing = await commenterFromCookie(c, store, publication.token)
    const { name, pin } = body.data

    /** The message names the *stored* spelling rather than echoing the request, so the reviewer
     *  sees the name as it appears on the pins they are being asked to claim. */
    const taken = await takenBy(store, publication.token, name, existing?.id ?? null)
    if (taken) {
      return errorResponse(c, "name_taken", 409, nameTakenMessage(taken.name))
    }

    let session: CommenterSession
    if (existing) {
      session = (await store.renameSession(existing.id, name)) ?? existing
      if (pin !== undefined) {
        session = (await store.setSessionPin(existing.id, await hashPin(pin))) ?? session
      }
    } else {
      session = await store.createSession({
        id: deps.newId(),
        token: publication.token,
        name,
        color: commenterColor(await store.countCommenterSessions(publication.token)),
        isAuthor: false,
        createdAt: deps.timestamp(),
        ...(pin === undefined ? {} : { pin: await hashPin(pin) }),
      })
    }

    await issueCookie(c, publication.token, session.id, secret)

    const response: CommenterSessionResponse = { session }
    return c.json(response, 201)
  })

  app.post("/p/:token/session/claim", async (c) => {
    const publication = publicationOf(c)
    const secret = c.env?.MGMT_SECRET
    if (!secret) {
      return errorResponse(c, "internal_error", 500, MISSING_SECRET_MESSAGE)
    }

    const body = await readJsonBody(c, CommenterSessionClaimRequest)
    if (!body.ok) {
      return errorResponse(c, "invalid_request", 400, body.message)
    }

    const store = deps.resolveStore(c.env)
    const match = await takenBy(store, publication.token, body.data.name, null)

    /** One envelope for "no such name", "that name has no PIN" and "wrong PIN": the create
     *  route already reveals which names exist, this route must not also confirm PINs. */
    const verified = await verifyPin(body.data.pin, match?.pin ?? null)
    if (!verified || !match) {
      return errorResponse(c, "invalid_claim", 401, INVALID_CLAIM_MESSAGE)
    }

    const session: CommenterSession = {
      id: match.id,
      name: match.name,
      color: match.color,
      is_author: false,
    }
    await issueCookie(c, publication.token, session.id, secret)

    const response: CommenterSessionResponse = { session }
    return c.json(response)
  })

  app.get("/p/:token/comments", async (c) => {
    const publication = publicationOf(c)
    const query = PublishCommentListQuery.safeParse(c.req.query())
    if (!query.success) {
      return errorResponse(c, "invalid_request", 400, query.error.message)
    }

    const authorName = requestedAuthorName(c)
    if (!authorName.ok) {
      return errorResponse(c, "invalid_request", 400, authorNameMessage())
    }

    const store = deps.resolveStore(c.env)
    const isAuthor = c.get("isAuthor")
    const comments = await store.listComments({
      token: publication.token,
      ...(query.data.page_section_id === undefined
        ? {}
        : { pageSectionId: query.data.page_section_id }),
    })

    const session = isAuthor
      ? ((await store.findAuthorSession(publication.token)) ??
        authorSessionMarker(publication.token, authorName.name))
      : await commenterFromCookie(c, store, publication.token)

    const response: PublishCommentListResponse = {
      comments: filterCommentThreads(comments, {
        ...(query.data.version === undefined ? {} : { version: query.data.version }),
        includeResolved: query.data.include_resolved ?? false,
        includeDeleted: isAuthor,
      }),
      session,
    }
    return c.json(response)
  })

  app.post("/p/:token/comments", async (c) => {
    const publication = publicationOf(c)
    const authorName = requestedAuthorName(c)
    if (!authorName.ok) {
      return errorResponse(c, "invalid_request", 400, authorNameMessage())
    }

    const store = deps.resolveStore(c.env)
    const session = await writer(c, store, publication.token, authorName.name)
    if (!session) {
      return errorResponse(c, "unauthorized", 401, NO_IDENTITY_MESSAGE)
    }

    const body = await readJsonBody(c, PublishCommentCreateRequest)
    if (!body.ok) {
      if (exceedsLength(body.raw, "body", PUBLISH_COMMENT_BODY_MAX_LENGTH)) {
        return errorResponse(c, "payload_too_large", 413, bodyCapMessage())
      }
      return errorResponse(c, "invalid_request", 400, body.message)
    }

    const { page_section_id, body: text, parent_id } = body.data
    const anchor = body.data.anchor ?? null
    const parentId = parent_id ?? null

    if (parentId === null) {
      const version = await store.findVersion(publication.token, publication.current_version)
      const known = (version?.page_manifest ?? []).some(
        (entry) => entry.section_id === page_section_id,
      )
      if (!known) {
        return errorResponse(
          c,
          "invalid_request",
          400,
          `Unknown page_section_id "${page_section_id}" for version ${publication.current_version}`,
        )
      }
    } else {
      if (anchor !== null) {
        return errorResponse(
          c,
          "invalid_request",
          400,
          "A reply cannot carry an anchor — the pin belongs to the thread's root comment",
        )
      }
      const parent = await store.findComment(publication.token, parentId)
      if (!parent || parent.deleted_at !== null) {
        return errorResponse(c, "invalid_request", 400, PARENT_MISSING_MESSAGE)
      }
      if (parent.parent_id !== null) {
        return errorResponse(
          c,
          "invalid_request",
          400,
          "Threads are one level deep — reply to the thread's root comment instead",
        )
      }
      if (parent.page_section_id !== page_section_id) {
        return errorResponse(
          c,
          "invalid_request",
          400,
          "A reply must carry the same page_section_id as the comment it answers",
        )
      }
    }

    const comment = await store.createComment({
      id: deps.newId(),
      token: publication.token,
      version: publication.current_version,
      pageSectionId: page_section_id,
      parentId,
      sessionId: session.id,
      body: text,
      anchor,
      createdAt: deps.timestamp(),
    })

    const response: PublishCommentResponse = { comment }
    return c.json(response, 201)
  })

  app.patch("/p/:token/comments/:id", async (c) => {
    const publication = publicationOf(c)
    const authorName = requestedAuthorName(c)
    if (!authorName.ok) {
      return errorResponse(c, "invalid_request", 400, authorNameMessage())
    }

    const store = deps.resolveStore(c.env)
    const isAuthor = c.get("isAuthor")
    const session = await writer(c, store, publication.token, authorName.name)
    if (!session) {
      return errorResponse(c, "unauthorized", 401, NO_IDENTITY_MESSAGE)
    }

    const existing = await store.findComment(publication.token, c.req.param("id"))
    if (!existing || (existing.deleted_at !== null && !isAuthor)) {
      return errorResponse(c, "not_found", 404)
    }
    if (!isAuthor && existing.session_id !== session.id) {
      return errorResponse(c, "unauthorized", 401, "You can only edit your own comments")
    }

    const body = await readJsonBody(c, PublishCommentUpdateRequest)
    if (!body.ok) {
      if (exceedsLength(body.raw, "body", PUBLISH_COMMENT_BODY_MAX_LENGTH)) {
        return errorResponse(c, "payload_too_large", 413, bodyCapMessage())
      }
      return errorResponse(c, "invalid_request", 400, body.message)
    }
    if (body.data.body === undefined && body.data.anchor === undefined) {
      return errorResponse(c, "invalid_request", 400, "Provide a body, an anchor, or both")
    }
    if (existing.parent_id !== null && (body.data.anchor ?? null) !== null) {
      return errorResponse(
        c,
        "invalid_request",
        400,
        "A reply cannot carry an anchor — the pin belongs to the thread's root comment",
      )
    }

    const updated = await store.updateComment({
      token: publication.token,
      id: existing.id,
      ...(body.data.body === undefined ? {} : { body: body.data.body }),
      ...(body.data.anchor === undefined ? {} : { anchor: body.data.anchor }),
      ...(body.data.body === undefined ? {} : { editedAt: deps.timestamp() }),
    })
    if (!updated) {
      return errorResponse(c, "not_found", 404)
    }

    const response: PublishCommentResponse = { comment: updated }
    return c.json(response)
  })

  app.delete("/p/:token/comments/:id", async (c) => {
    const publication = publicationOf(c)
    const authorName = requestedAuthorName(c)
    if (!authorName.ok) {
      return errorResponse(c, "invalid_request", 400, authorNameMessage())
    }

    const store = deps.resolveStore(c.env)
    const isAuthor = c.get("isAuthor")
    const session = await writer(c, store, publication.token, authorName.name)
    if (!session) {
      return errorResponse(c, "unauthorized", 401, NO_IDENTITY_MESSAGE)
    }

    /** Deletes read through the soft-delete filter on purpose: re-deleting has to answer the
     *  same 200 as the first call instead of 404-ing on the row it just hid. */
    const existing = await store.findComment(publication.token, c.req.param("id"))
    if (!existing) {
      return errorResponse(c, "not_found", 404)
    }
    if (!isAuthor && existing.session_id !== session.id) {
      return errorResponse(c, "unauthorized", 401, "You can only delete your own comments")
    }

    const deleted = await store.softDeleteComment(
      publication.token,
      existing.id,
      deps.timestamp(),
    )
    if (!deleted) {
      return errorResponse(c, "not_found", 404)
    }

    const response: PublishCommentResponse = { comment: deleted }
    return c.json(response)
  })

  app.post("/p/:token/comments/:id/resolve", async (c) => {
    const publication = publicationOf(c)
    if (!c.get("isAuthor")) {
      return errorResponse(
        c,
        "unauthorized",
        401,
        "Only the author can resolve or unresolve a thread",
      )
    }

    const body = await readJsonBody(c, PublishCommentResolveRequest)
    if (!body.ok) {
      return errorResponse(c, "invalid_request", 400, body.message)
    }

    const store = deps.resolveStore(c.env)
    const existing = await store.findComment(publication.token, c.req.param("id"))
    if (!existing) {
      return errorResponse(c, "not_found", 404)
    }
    if (existing.parent_id !== null) {
      return errorResponse(
        c,
        "invalid_request",
        400,
        "Only a thread's root comment carries resolution — replies inherit it",
      )
    }

    const resolved = await store.setCommentResolved(
      publication.token,
      existing.id,
      body.data.resolved ? deps.timestamp() : null,
    )
    if (!resolved) {
      return errorResponse(c, "not_found", 404)
    }

    const response: PublishCommentResponse = { comment: resolved }
    return c.json(response)
  })
}

const PARENT_MISSING_MESSAGE = "The parent comment does not exist in this publication"

const INVALID_CLAIM_MESSAGE =
  "That name and PIN do not match. Check the PIN, or pick a different name to start fresh"

function nameTakenMessage(name: string): string {
  return `Someone is already commenting as "${name}" here. Enter that person's PIN to continue as them, or pick another name`
}

function authorNameMessage(): string {
  return `${PUBLISH_AUTHOR_NAME_HEADER} must be 1–60 characters after trimming`
}

function bodyCapMessage(): string {
  return `A comment body cannot exceed ${PUBLISH_COMMENT_BODY_MAX_LENGTH} characters`
}
