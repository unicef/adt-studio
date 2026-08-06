import {
  PUBLISH_AUTHOR_NAME_HEADER,
  PublicationCreateResponse,
  PublicationDetail,
  PublicationList,
  PublicationReaderList,
  PublicationResponse,
  PublicationRoomTicketResponse,
  PublicationVersionCreateResponse,
  PublishCommentListResponse,
  PublishCommentResponse,
  PublishErrorResponse,
  type PublicationCreateRequest,
  type PublicationPageEntry,
  type PublicationUpdateRequest,
  type PublishCommentCreateRequest,
  type PublishCommentListQuery,
  type PublishCommentResolveRequest,
  type PublishCommentUpdateRequest,
  type PublishErrorCode,
} from "@adt/types"
import type { FetchLike } from "./cloudflare/client.js"

export class PublishWorkerError extends Error {
  readonly status: number | null
  readonly code: PublishErrorCode | null
  readonly unreachable: boolean

  constructor(options: {
    message: string
    status?: number | null
    code?: PublishErrorCode | null
    unreachable?: boolean
  }) {
    super(options.message)
    this.name = "PublishWorkerError"
    this.status = options.status ?? null
    this.code = options.code ?? null
    this.unreachable = options.unreachable ?? false
  }
}

export function isPublishWorkerError(error: unknown): error is PublishWorkerError {
  return error instanceof PublishWorkerError
}

export interface PublishWorkerClient {
  createPublication(
    request: PublicationCreateRequest,
    snapshot: Uint8Array,
  ): Promise<PublicationCreateResponse>
  createVersion(
    token: string,
    pageManifest: PublicationPageEntry[],
    snapshot: Uint8Array,
  ): Promise<PublicationVersionCreateResponse>
  revoke(token: string): Promise<PublicationResponse>
  reinstate(token: string): Promise<PublicationResponse>
  /** A 60-second signed credential for the publication's realtime room (§4.17). The Studio
   *  spends it on a cross-origin WebSocket, which is the one thing a cookie cannot do. */
  roomTicket(token: string): Promise<PublicationRoomTicketResponse>
  setExpiry(token: string, expiresAt: string | null): Promise<PublicationResponse>
  /** One PATCH for both knobs. An absent key is left alone by the worker, so this is also how
   *  the code is rotated (`access_code: "NEW"`) and removed (`access_code: null`). */
  updatePublication(
    token: string,
    update: PublicationUpdateRequest,
  ): Promise<PublicationResponse>
  getPublication(token: string): Promise<PublicationDetail>
  /** Every publication in the connected account (§4.18) — what the Publications dashboard lists.
   *  One request for the whole screen; the worker does the aggregating. */
  listPublications(): Promise<PublicationList>
  /** The people the worker has a session for on this publication — those who typed a name at
   *  the access gate or before their first comment. Not a visit log; see `PublicationReader`. */
  listReaders(token: string): Promise<PublicationReaderList>
  listComments(
    token: string,
    query: PublishCommentListQuery,
    authorName?: string,
  ): Promise<PublishCommentListResponse>
  createComment(
    token: string,
    request: PublishCommentCreateRequest,
    authorName?: string,
  ): Promise<PublishCommentResponse>
  resolveComment(
    token: string,
    id: string,
    request: PublishCommentResolveRequest,
    authorName?: string,
  ): Promise<PublishCommentResponse>
  updateComment(
    token: string,
    id: string,
    request: PublishCommentUpdateRequest,
    authorName?: string,
  ): Promise<PublishCommentResponse>
  deleteComment(token: string, id: string, authorName?: string): Promise<PublishCommentResponse>
  /** The published snapshot's own bytes, author-authenticated. The `Response` is handed back
   *  unread so the caller can stream it: a book's audio and video are the whole point of the
   *  snapshot and buffering them through the Studio would defeat range-free playback. */
  fetchSnapshotFile(token: string, filePath: string, headers?: Record<string, string>): Promise<Response>
}

function commentQueryString(query: PublishCommentListQuery): string {
  const params = new URLSearchParams()
  if (query.page_section_id !== undefined) params.set("page_section_id", query.page_section_id)
  if (query.version !== undefined) params.set("version", String(query.version))
  if (query.include_resolved !== undefined) {
    params.set("include_resolved", query.include_resolved ? "true" : "false")
  }
  const search = params.toString()
  return search.length === 0 ? "" : `?${search}`
}

function authorHeaders(authorName: string | undefined): Record<string, string> {
  return authorName === undefined ? {} : { [PUBLISH_AUTHOR_NAME_HEADER]: authorName }
}

export interface PublishWorkerClientOptions {
  workerUrl: string
  mgmtSecret: string
  fetchFn?: FetchLike
}

const SNAPSHOT_FILE_NAME = "snapshot.zip"

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createPublishWorkerClient({
  workerUrl,
  mgmtSecret,
  fetchFn,
}: PublishWorkerClientOptions): PublishWorkerClient {
  const doFetch: FetchLike = fetchFn ?? ((input, init) => fetch(input, init))
  const base = workerUrl.replace(/\/+$/, "")

  const request = async (
    path: string,
    init: RequestInit,
    schema: { parse: (value: unknown) => unknown },
  ): Promise<unknown> => {
    let response: Response
    try {
      response = await doFetch(`${base}${path}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${mgmtSecret}`,
        },
      })
    } catch (error) {
      throw new PublishWorkerError({
        message: `Could not reach your publish worker at ${base}: ${describe(error)}`,
        unreachable: true,
      })
    }

    const text = await response.text()
    let payload: unknown = null
    if (text.length > 0) {
      try {
        payload = JSON.parse(text) as unknown
      } catch {
        payload = null
      }
    }

    if (!response.ok) {
      const parsed = PublishErrorResponse.safeParse(payload)
      throw new PublishWorkerError({
        message: parsed.success
          ? (parsed.data.message ?? parsed.data.error)
          : `The publish worker answered ${response.status}`,
        status: response.status,
        code: parsed.success ? parsed.data.error : null,
      })
    }

    try {
      return schema.parse(payload)
    } catch (error) {
      throw new PublishWorkerError({
        message: `The publish worker returned an unexpected response: ${describe(error)}`,
        status: response.status,
      })
    }
  }

  const snapshotBody = (metadata: unknown, snapshot: Uint8Array): FormData => {
    const form = new FormData()
    form.set("metadata", JSON.stringify(metadata))
    form.set(
      "snapshot",
      new File([snapshot], SNAPSHOT_FILE_NAME, { type: "application/zip" }),
    )
    return form
  }

  return {
    async createPublication(createRequest, snapshot) {
      return (await request(
        "/api/publications",
        { method: "POST", body: snapshotBody(createRequest, snapshot) },
        PublicationCreateResponse,
      )) as PublicationCreateResponse
    },

    async createVersion(token, pageManifest, snapshot) {
      return (await request(
        `/api/publications/${token}/versions`,
        { method: "POST", body: snapshotBody({ page_manifest: pageManifest }, snapshot) },
        PublicationVersionCreateResponse,
      )) as PublicationVersionCreateResponse
    },

    async revoke(token) {
      return (await request(
        `/api/publications/${token}/revoke`,
        { method: "POST" },
        PublicationResponse,
      )) as PublicationResponse
    },

    async reinstate(token) {
      return (await request(
        `/api/publications/${token}/reinstate`,
        { method: "POST" },
        PublicationResponse,
      )) as PublicationResponse
    },

    async roomTicket(token) {
      return (await request(
        `/api/publications/${token}/room-ticket`,
        { method: "POST" },
        PublicationRoomTicketResponse,
      )) as PublicationRoomTicketResponse
    },

    async setExpiry(token, expiresAt) {
      return (await request(
        `/api/publications/${token}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expires_at: expiresAt }),
        },
        PublicationResponse,
      )) as PublicationResponse
    },

    async updatePublication(token, update) {
      return (await request(
        `/api/publications/${token}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(update),
        },
        PublicationResponse,
      )) as PublicationResponse
    },

    async listPublications() {
      return (await request(
        "/api/publications",
        { method: "GET" },
        PublicationList,
      )) as PublicationList
    },

    async listReaders(token) {
      return (await request(
        `/api/publications/${token}/readers`,
        { method: "GET" },
        PublicationReaderList,
      )) as PublicationReaderList
    },

    async getPublication(token) {
      return (await request(
        `/api/publications/${token}`,
        { method: "GET" },
        PublicationDetail,
      )) as PublicationDetail
    },

    async listComments(token, query, authorName) {
      return (await request(
        `/p/${token}/comments${commentQueryString(query)}`,
        { method: "GET", headers: authorHeaders(authorName) },
        PublishCommentListResponse,
      )) as PublishCommentListResponse
    },

    async createComment(token, createRequest, authorName) {
      return (await request(
        `/p/${token}/comments`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...authorHeaders(authorName) },
          body: JSON.stringify(createRequest),
        },
        PublishCommentResponse,
      )) as PublishCommentResponse
    },

    async resolveComment(token, id, resolveRequest, authorName) {
      return (await request(
        `/p/${token}/comments/${encodeURIComponent(id)}/resolve`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...authorHeaders(authorName) },
          body: JSON.stringify(resolveRequest),
        },
        PublishCommentResponse,
      )) as PublishCommentResponse
    },

    async updateComment(token, id, updateRequest, authorName) {
      return (await request(
        `/p/${token}/comments/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", ...authorHeaders(authorName) },
          body: JSON.stringify(updateRequest),
        },
        PublishCommentResponse,
      )) as PublishCommentResponse
    },

    async deleteComment(token, id, authorName) {
      return (await request(
        `/p/${token}/comments/${encodeURIComponent(id)}`,
        { method: "DELETE", headers: authorHeaders(authorName) },
        PublishCommentResponse,
      )) as PublishCommentResponse
    },

    async fetchSnapshotFile(token, filePath, headers) {
      const encoded = filePath
        .split("/")
        .filter((segment) => segment.length > 0)
        .map((segment) => encodeURIComponent(segment))
        .join("/")
      try {
        return await doFetch(`${base}/p/${token}/${encoded}`, {
          method: "GET",
          headers: { ...headers, Authorization: `Bearer ${mgmtSecret}` },
        })
      } catch (error) {
        throw new PublishWorkerError({
          message: `Could not reach your publish worker at ${base}: ${describe(error)}`,
          unreachable: true,
        })
      }
    },
  }
}
