import type { Context, Hono } from "hono"
import {
  CommenterSessionClaimRequest,
  CommenterSessionCreateRequest,
  PUBLISH_AUTHOR_NAME_HEADER,
  PUBLISH_COMMENT_BODY_MAX_LENGTH,
  PUBLISH_COMMENT_LIST_PAGE_SIZE,
  PublishCommentCreateRequest,
  PublishCommentListQuery,
  PublishCommentResolveRequest,
  PublishCommentUpdateRequest,
  type CommenterSession,
  type CommenterSessionResponse,
  type Publication,
  type PublishComment,
  type PublishCommentListResponse,
  type PublishCommentResponse,
} from "@adt/types"
import type { Env } from "./env.js"
import { attemptGate, callerIp, throttleSecretFor } from "./access-throttle.js"
import { errorResponse } from "./errors.js"
import { exceedsLength, readJsonBody } from "./http.js"
import { authorSessionMarker, normalizeDisplayName, verifyPin } from "./identity.js"
import type { PublicationVariables } from "./middleware/publication-lookup.js"
import { notifyRoom } from "./room-notify.js"
import {
  commenterFromCookie,
  issueSessionCookie,
  pinnedHolderOf,
  storedCommenterFromCookie,
  upsertCommenterSession,
  type SessionDeps,
} from "./sessions.js"
import type { PublicationStore, WriteKind } from "./store.js"
import { BOOK_READER_COMMENT_LIMIT, BOOK_READER_SESSION_LIMIT, writeAllowance } from "./write-throttle.js"

export type CommentAppEnv = { Bindings: Env; Variables: PublicationVariables }

export type CommentRoutesDeps = SessionDeps

type CommentContext = Context<CommentAppEnv>

/** Deliberately vague about which limit was hit and how many tries remain: an attacker being
 *  told "3 left" learns the shape of the limit, while a reviewer only needs to know to wait. */
const TOO_MANY_ATTEMPTS_MESSAGE =
  "Too many attempts. Wait a moment and try again."

const MISSING_SECRET_MESSAGE =
  "This worker has no MGMT_SECRET bound, so it cannot issue commenter sessions"

const TOO_MANY_WRITES_MESSAGE = "You're writing faster than this book allows. Wait a minute and try again."

const BOOK_FULL_MESSAGE = "This book can't take any more comments from readers."

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

  /** The author writes from the Studio with the book's secret and is never counted. */
  const refuseReaderWrite = async (
    c: CommentContext,
    store: PublicationStore,
    publication: Publication,
    kinds: { client: WriteKind; session?: WriteKind },
    sessionId?: string,
  ): Promise<Response | null> => {
    if (c.get("isAuthor")) return null
    const secret = (await throttleSecretFor(c.env ?? {}, publication.token)) ?? c.env?.MGMT_SECRET
    if (!secret) return null
    const retryAfter = await writeAllowance(
      {
        store,
        secret,
        ip: callerIp(c.req.raw.headers),
        token: publication.token,
        now: new Date(deps.timestamp()),
        ...(sessionId === undefined ? {} : { sessionId }),
      },
      kinds,
    )
    if (retryAfter === null) return null
    c.header("Retry-After", String(retryAfter))
    return errorResponse(c, "rate_limited", 429, TOO_MANY_WRITES_MESSAGE)
  }

  const commentWrite = { client: "comment-client", session: "comment-session" } as const

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
    const existing = await storedCommenterFromCookie(c, store, publication.token)
    if (
      existing === null &&
      !c.get("isAuthor") &&
      (await store.countCommenterSessions(publication.token)) >= BOOK_READER_SESSION_LIMIT
    ) {
      return errorResponse(c, "rate_limited", 429, BOOK_FULL_MESSAGE)
    }
    const refused = await refuseReaderWrite(c, store, publication, { client: "session-client" })
    if (refused) return refused
    const { name, pin } = body.data

    const outcome = await upsertCommenterSession({
      store,
      deps,
      token: publication.token,
      name,
      existing,
      ...(pin === undefined ? {} : { pin }),
    })

    /** The message names the *stored* spelling rather than echoing the request, so the reviewer
     *  sees the name as it appears on the pins they are being asked to claim. */
    if (!outcome.ok) {
      return errorResponse(c, "name_taken", 409, nameTakenMessage(outcome.takenBy))
    }

    await issueSessionCookie(c, publication.token, outcome.session.id, secret)

    const response: CommenterSessionResponse = { session: outcome.session }
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

    /** The weaker of the two doors: a four-digit PIN is 10^4, so without a limit it falls in
     *  minutes to anyone willing to keep asking. Checked *before* the comparison, so a refused
     *  attempt costs no work and its timing says nothing about how close the guess was. */
    const gate = await attemptGate({
      store,
      secret: (await throttleSecretFor(c.env ?? {}, publication.token)) ?? secret,
      ip: callerIp(c.req.raw.headers),
      token: publication.token,
      kind: "pin",
      now: new Date(deps.timestamp()),
    })
    if (gate.refusedFor !== null) {
      c.header("Retry-After", String(gate.refusedFor))
      return errorResponse(c, "rate_limited", 429, TOO_MANY_ATTEMPTS_MESSAGE)
    }

    /** Pinned rows only — a pinless namesake must not shadow the identity being claimed, which
     *  is exactly what became possible when pinless names stopped reserving (M3.5). */
    const match = await pinnedHolderOf(store, publication.token, body.data.name, null)

    /** One envelope for "no such name", "that name has no PIN" and "wrong PIN": the create
     *  route already reveals which names exist, this route must not also confirm PINs. */
    const verified = await verifyPin(body.data.pin, match?.pin ?? null)
    if (!verified || !match) {
      /** No explicit "record this failure" call: `attemptGate` above already wrote this
       *  attempt's own row before it told us whether we were refused — see access-throttle.ts. */
      return errorResponse(c, "invalid_claim", 401, INVALID_CLAIM_MESSAGE)
    }
    await gate.recordSuccess()

    const session: CommenterSession = {
      id: match.id,
      name: match.name,
      color: match.color,
      is_author: false,
    }
    await issueSessionCookie(c, publication.token, session.id, secret)

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

    const after = query.data.cursor === undefined ? undefined : parseCursor(query.data.cursor)
    if (after === null) {
      return errorResponse(c, "invalid_request", 400, "Unknown cursor")
    }

    const store = deps.resolveStore(c.env)
    const isAuthor = c.get("isAuthor")
    const rows = await store.listComments({
      token: publication.token,
      ...(query.data.page_section_id === undefined
        ? {}
        : { pageSectionId: query.data.page_section_id }),
      ...(query.data.version === undefined ? {} : { version: query.data.version }),
      includeResolved: query.data.include_resolved ?? false,
      includeDeleted: isAuthor,
      ...(after === undefined ? {} : { after }),
      limit: PUBLISH_COMMENT_LIST_PAGE_SIZE + 1,
    })
    const comments = rows.slice(0, PUBLISH_COMMENT_LIST_PAGE_SIZE)
    const last = comments.at(-1)

    const session = isAuthor
      ? ((await store.findAuthorSession(publication.token)) ??
        authorSessionMarker(publication.token, authorName.name))
      : await commenterFromCookie(c, store, publication.token)

    const response: PublishCommentListResponse = {
      comments,
      session,
      next_cursor: rows.length > comments.length && last ? cursorOf(last) : null,
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

    if (!c.get("isAuthor") && (await store.countReaderComments(publication.token)) >= BOOK_READER_COMMENT_LIMIT) {
      return errorResponse(c, "rate_limited", 429, BOOK_FULL_MESSAGE)
    }
    const refused = await refuseReaderWrite(c, store, publication, commentWrite, session.id)
    if (refused) return refused

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

    notifyRoom(c, publication, "comment-created", comment)

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

    const refused = await refuseReaderWrite(c, store, publication, commentWrite, session.id)
    if (refused) return refused

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

    notifyRoom(c, publication, "comment-updated", updated)

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

    const refused = await refuseReaderWrite(c, store, publication, commentWrite, session.id)
    if (refused) return refused

    const deleted = await store.softDeleteComment(
      publication.token,
      existing.id,
      deps.timestamp(),
    )
    if (!deleted) {
      return errorResponse(c, "not_found", 404)
    }

    notifyRoom(c, publication, "comment-deleted", deleted)

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

    notifyRoom(c, publication, "comment-resolved", resolved)

    const response: PublishCommentResponse = { comment: resolved }
    return c.json(response)
  })
}

/** `<created_at>|<id>` of the last row a page returned; neither part can contain a `|`. */
function cursorOf(comment: PublishComment): string {
  return `${comment.created_at}|${comment.id}`
}

function parseCursor(cursor: string): { createdAt: string; id: string } | null {
  const [createdAt, id, ...rest] = cursor.split("|")
  if (!createdAt || !id || rest.length > 0 || Number.isNaN(Date.parse(createdAt))) return null
  return { createdAt, id }
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
