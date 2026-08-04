/**
 * Same-origin client for the publish worker's reviewer routes, all relative to
 * the `/p/<token>/` prefix the reviewer opened. Identity is the worker's
 * `adt_pub_session` cookie — nothing is kept in JS, so a lost cookie simply
 * means the next write asks for the name again.
 */
import type { CommentAnchor } from "./anchor"
import type { CommenterSession, PublishComment, PublishErrorCode } from "./contract"

export class CommentsApiError extends Error {
  readonly status: number
  readonly code: PublishErrorCode | "network_error"

  constructor(status: number, code: PublishErrorCode | "network_error", message: string) {
    super(message)
    this.name = "CommentsApiError"
    this.status = status
    this.code = code
  }

  /** The link was revoked or expired while the page was open. */
  get isGone(): boolean {
    return this.status === 410
  }

  /** The session cookie is missing or no longer valid for a write. */
  get needsIdentity(): boolean {
    return this.status === 401 && this.code === "unauthorized"
  }
}

interface ListResponse {
  comments: PublishComment[]
  session: CommenterSession | null
}

interface SessionResponse {
  session: CommenterSession
}

interface CommentResponse {
  comment: PublishComment
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { credentials: "include", ...init })
  } catch (error) {
    throw new CommentsApiError(0, "network_error", describe(error))
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const envelope = (payload ?? {}) as { error?: PublishErrorCode; message?: string }
    throw new CommentsApiError(
      response.status,
      envelope.error ?? "internal_error",
      envelope.message ?? `Request failed with ${response.status}`,
    )
  }

  return payload as T
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }
}

export interface ListOptions {
  includeResolved?: boolean
}

export interface CommentsApi {
  list: (pageSectionId: string, options?: ListOptions) => Promise<ListResponse>
  createSession: (name: string, pin: string) => Promise<CommenterSession>
  claimSession: (name: string, pin: string) => Promise<CommenterSession>
  createComment: (input: {
    pageSectionId: string
    body: string
    anchor?: CommentAnchor | null
    parentId?: string | null
  }) => Promise<PublishComment>
  /** Edit a body, move a pin, or both. An anchor-only patch is how a drag lands. */
  updateComment: (
    id: string,
    input: { body?: string; anchor?: CommentAnchor | null },
  ) => Promise<PublishComment>
  /** Soft delete. The row survives so replies keep their parent. */
  deleteComment: (id: string) => Promise<PublishComment>
}

export function createCommentsApi(apiBase: string): CommentsApi {
  return {
    async list(pageSectionId, options = {}) {
      const query = new URLSearchParams({ page_section_id: pageSectionId })
      if (options.includeResolved) query.set("include_resolved", "true")
      return request<ListResponse>(`${apiBase}comments?${query.toString()}`, { method: "GET" })
    },

    async createSession(name, pin) {
      const { session } = await request<SessionResponse>(
        `${apiBase}session`,
        jsonInit("POST", { name, pin }),
      )
      return session
    },

    async claimSession(name, pin) {
      const { session } = await request<SessionResponse>(
        `${apiBase}session/claim`,
        jsonInit("POST", { name, pin }),
      )
      return session
    },

    async createComment({ pageSectionId, body, anchor, parentId }) {
      const { comment } = await request<CommentResponse>(
        `${apiBase}comments`,
        jsonInit("POST", {
          page_section_id: pageSectionId,
          body,
          ...(anchor === undefined ? {} : { anchor }),
          ...(parentId === undefined || parentId === null ? {} : { parent_id: parentId }),
        }),
      )
      return comment
    },

    async updateComment(id, { body, anchor }) {
      const { comment } = await request<CommentResponse>(
        `${apiBase}comments/${encodeURIComponent(id)}`,
        jsonInit("PATCH", {
          ...(body === undefined ? {} : { body }),
          ...(anchor === undefined ? {} : { anchor }),
        }),
      )
      return comment
    },

    async deleteComment(id) {
      const { comment } = await request<CommentResponse>(
        `${apiBase}comments/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      )
      return comment
    },
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
