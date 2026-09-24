import {
  PublicationDetail,
  PublicationList,
  PublicationDeleteResult,
  PublicationReaderList,
  PublicationResponse,
  PublicationRoomTicketResponse,
  PublicationUploadAbortResponse,
  PublicationUploadCommitResponse,
  PublicationUploadFileResponse,
  PublicationUploadStartResponse,
  PublishErrorResponse,
  PublishCommentCreateRequest,
  PublishCommentListQuery,
  PublishCommentListResponse,
  PublishCommentResolveRequest,
  PublishCommentResponse,
  PublishCommentUpdateRequest,
  type PublicationUploadStartRequest,
  type PublicationUpdateRequest,
  type PublishErrorCode,
} from "@adt/types"
import type { FetchLike } from "./cloudflare/client.js"

export class PublishWorkerError extends Error {
  readonly status: number | null
  readonly code: PublishErrorCode | null
  readonly unreachable: boolean
  readonly neverDelivered: boolean

  constructor(options: {
    message: string
    status?: number | null
    code?: PublishErrorCode | null
    unreachable?: boolean
    neverDelivered?: boolean
  }) {
    super(options.message)
    this.name = "PublishWorkerError"
    this.status = options.status ?? null
    this.code = options.code ?? null
    this.unreachable = options.unreachable ?? false
    this.neverDelivered = options.neverDelivered ?? false
  }
}

export function isPublishWorkerError(error: unknown): error is PublishWorkerError {
  return error instanceof PublishWorkerError
}

export interface PublishWorkerClient {
  startUpload(request: PublicationUploadStartRequest): Promise<PublicationUploadStartResponse>
  uploadFile(
    uploadId: string,
    filePath: string,
    body: Uint8Array,
  ): Promise<PublicationUploadFileResponse>
  commitUpload(uploadId: string): Promise<PublicationUploadCommitResponse>
  abortUpload(uploadId: string): Promise<PublicationUploadAbortResponse>
  completeStaticAssetUpload(uploadId: string): Promise<{ upload_id: string; state: "complete" }>
  listStaticAssets(): Promise<{ assets: Array<{ path: string; hash: string; bytes: number }> }>
  revoke(token: string): Promise<PublicationResponse>
  reinstate(token: string): Promise<PublicationResponse>
  updatePublication(
    token: string,
    update: PublicationUpdateRequest,
  ): Promise<PublicationResponse>
  getPublication(token: string): Promise<PublicationDetail>
  listPublications(): Promise<PublicationList>
  deletePublication(token: string): Promise<PublicationDeleteResult>
  listReaders(token: string): Promise<PublicationReaderList>
  roomTicket(token: string): Promise<PublicationRoomTicketResponse>
  listComments(
    token: string,
    query?: PublishCommentListQuery,
    authorName?: string,
  ): Promise<PublishCommentListResponse>
  createComment(
    token: string,
    body: PublishCommentCreateRequest,
    authorName?: string,
  ): Promise<PublishCommentResponse>
  updateComment(
    token: string,
    commentId: string,
    body: PublishCommentUpdateRequest,
    authorName?: string,
  ): Promise<PublishCommentResponse>
  deleteComment(token: string, commentId: string, authorName?: string): Promise<PublishCommentResponse>
  resolveComment(
    token: string,
    commentId: string,
    body: PublishCommentResolveRequest,
    authorName?: string,
  ): Promise<PublishCommentResponse>
  fetchSnapshotFile(
    token: string,
    filePath: string,
    headers?: Record<string, string>,
  ): Promise<Response>
}

export interface PublishWorkerClientOptions {
  workerUrl: string
  mgmtSecret: string
  fetchFn?: FetchLike
}

interface ResponseSchema<T> {
  parse: (value: unknown) => T
}

function encodePath(filePath: string): string {
  return filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function causeChain(error: unknown): Error[] {
  const chain: Error[] = []
  let current: unknown = error
  while (current instanceof Error && chain.length < 4) {
    chain.push(current)
    current = (current as { cause?: unknown }).cause
  }
  return chain
}

function errorCode(error: unknown): string | null {
  for (const link of causeChain(error)) {
    const code = (link as { code?: unknown }).code
    if (typeof code === "string" && code.length > 0) return code
  }
  return null
}

function describeTransportFailure(error: unknown): string {
  const chain = causeChain(error)
  const code = errorCode(error)
  const deepest = chain.at(-1)
  const detail = deepest && deepest !== chain[0] ? deepest.message : null
  if (code && detail) return `${code} — ${detail}`
  if (code) return `${code} — ${describe(error)}`
  return detail ?? describe(error)
}

const UNDELIVERED_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
  "UND_ERR_CONNECT_TIMEOUT",
  "EPIPE",
  "ECONNABORTED",
])

function neverDelivered(error: unknown): boolean {
  const code = errorCode(error)
  return code !== null && UNDELIVERED_CODES.has(code)
}

const TRANSIENT_READ_CODES = new Set([
  "ECONNRESET",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "ETIMEDOUT",
])

function worthRepeating(error: unknown, method: string): boolean {
  if (neverDelivered(error)) return true
  if (method !== "GET" && method !== "HEAD") return false
  const code = errorCode(error)
  return code !== null && TRANSIENT_READ_CODES.has(code)
}

const RETRY_DELAYS_MS = [200, 600, 1200]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sendWithRetry(
  send: () => Promise<Response>,
  method: string,
  base: string,
): Promise<Response> {
  let attempt = 0
  for (;;) {
    try {
      return await send()
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt]
      if (delay === undefined || !worthRepeating(error, method)) {
        throw new PublishWorkerError({
          message:
            `Could not reach your publish worker at ${base}: ` +
            describeTransportFailure(error),
          unreachable: true,
          neverDelivered: neverDelivered(error),
        })
      }
      attempt += 1
      await sleep(delay)
    }
  }
}

export function createPublishWorkerClient({
  workerUrl,
  mgmtSecret,
  fetchFn,
}: PublishWorkerClientOptions): PublishWorkerClient {
  const doFetch: FetchLike = fetchFn ?? ((input, init) => fetch(input, init))
  const base = workerUrl.replace(/\/+$/, "")

  const authorized = (headers: Record<string, string> | undefined): Record<string, string> => ({
    ...headers,
    Authorization: `Bearer ${mgmtSecret}`,
  })

  const request = async <T>(
    path: string,
    init: RequestInit,
    schema: ResponseSchema<T>,
  ): Promise<T> => {
    const method = (init.method ?? "GET").toUpperCase()
    const response = await sendWithRetry(
      () =>
        doFetch(`${base}${path}`, {
          ...init,
          headers: authorized(init.headers as Record<string, string> | undefined),
        }),
      method,
      base,
    )

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

  const jsonBody = (
    method: string,
    body: unknown,
    headers?: Record<string, string>,
  ): RequestInit => ({
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })

  const authorHeaders = (authorName: string | undefined): Record<string, string> =>
    authorName === undefined ? {} : { "X-Adt-Author-Name": authorName }

  const commentQuery = (query: PublishCommentListQuery | undefined): string => {
    if (query === undefined) return ""
    const params = new URLSearchParams()
    if (query.page_section_id !== undefined) params.set("page_section_id", query.page_section_id)
    if (query.version !== undefined) params.set("version", String(query.version))
    if (query.include_resolved !== undefined) {
      params.set("include_resolved", String(query.include_resolved))
    }
    const encoded = params.toString()
    return encoded.length === 0 ? "" : `?${encoded}`
  }

  return {
    startUpload(startRequest) {
      return request(
        "/api/publication-uploads",
        jsonBody("POST", startRequest),
        PublicationUploadStartResponse,
      )
    },

    uploadFile(uploadId, filePath, body) {
      return request(
        `/api/publication-uploads/${encodeURIComponent(uploadId)}/files/${encodePath(filePath)}`,
        {
          method: "PUT",
          body,
          headers: { "content-type": "application/octet-stream" },
        },
        PublicationUploadFileResponse,
      )
    },

    commitUpload(uploadId) {
      return request(
        `/api/publication-uploads/${encodeURIComponent(uploadId)}/commit`,
        { method: "POST" },
        PublicationUploadCommitResponse,
      )
    },

    abortUpload(uploadId) {
      return request(
        `/api/publication-uploads/${encodeURIComponent(uploadId)}`,
        { method: "DELETE" },
        PublicationUploadAbortResponse,
      )
    },

    completeStaticAssetUpload(uploadId) {
      return request(
        `/api/publication-uploads/${encodeURIComponent(uploadId)}/complete-static-assets`,
        { method: "POST" },
        { parse: (value) => {
          const result = value as { upload_id?: unknown; state?: unknown }
          if (typeof result.upload_id !== "string" || result.state !== "complete") throw new Error("Invalid static asset completion")
          return { upload_id: result.upload_id, state: "complete" as const }
        } },
      )
    },

    listStaticAssets() {
      return request(
        "/api/static-assets/manifest",
        { method: "GET" },
        { parse: (value) => {
          const result = value as { assets?: unknown }
          if (!Array.isArray(result.assets)) throw new Error("Invalid static asset manifest")
          const assets = result.assets.flatMap((entry) => {
            if (typeof entry !== "object" || entry === null) return []
            const asset = entry as Record<string, unknown>
            return typeof asset.path === "string" && typeof asset.hash === "string" && typeof asset.bytes === "number"
              ? [{ path: asset.path, hash: asset.hash, bytes: asset.bytes }]
              : []
          })
          if (assets.length !== result.assets.length) throw new Error("Invalid static asset manifest")
          return { assets }
        } },
      )
    },

    revoke(token) {
      return request(
        `/api/publications/${encodeURIComponent(token)}/revoke`,
        { method: "POST" },
        PublicationResponse,
      )
    },

    reinstate(token) {
      return request(
        `/api/publications/${encodeURIComponent(token)}/reinstate`,
        { method: "POST" },
        PublicationResponse,
      )
    },

    updatePublication(token, update) {
      return request(
        `/api/publications/${encodeURIComponent(token)}`,
        jsonBody("PATCH", update),
        PublicationResponse,
      )
    },

    listPublications() {
      return request("/api/publications", { method: "GET" }, PublicationList)
    },

    getPublication(token) {
      return request(
        `/api/publications/${encodeURIComponent(token)}`,
        { method: "GET" },
        PublicationDetail,
      )
    },

    deletePublication(token) {
      return request(
        `/api/publications/${encodeURIComponent(token)}`,
        { method: "DELETE" },
        PublicationDeleteResult,
      )
    },

    listReaders(token) {
      return request(
        `/api/publications/${encodeURIComponent(token)}/readers`,
        { method: "GET" },
        PublicationReaderList,
      )
    },

    roomTicket(token) {
      return request(
        `/api/publications/${encodeURIComponent(token)}/room-ticket`,
        { method: "POST" },
        PublicationRoomTicketResponse,
      )
    },

    listComments(token, query, authorName) {
      return request(
        `/p/${encodeURIComponent(token)}/comments${commentQuery(query)}`,
        { method: "GET", headers: authorHeaders(authorName) },
        PublishCommentListResponse,
      )
    },

    createComment(token, body, authorName) {
      return request(
        `/p/${encodeURIComponent(token)}/comments`,
        jsonBody("POST", body, authorHeaders(authorName)),
        PublishCommentResponse,
      )
    },

    updateComment(token, commentId, body, authorName) {
      return request(
        `/p/${encodeURIComponent(token)}/comments/${encodeURIComponent(commentId)}`,
        jsonBody("PATCH", body, authorHeaders(authorName)),
        PublishCommentResponse,
      )
    },

    deleteComment(token, commentId, authorName) {
      return request(
        `/p/${encodeURIComponent(token)}/comments/${encodeURIComponent(commentId)}`,
        { method: "DELETE", headers: authorHeaders(authorName) },
        PublishCommentResponse,
      )
    },

    resolveComment(token, commentId, body, authorName) {
      return request(
        `/p/${encodeURIComponent(token)}/comments/${encodeURIComponent(commentId)}/resolve`,
        jsonBody("POST", body, authorHeaders(authorName)),
        PublishCommentResponse,
      )
    },

    fetchSnapshotFile(token, filePath, headers) {
      const path = encodePath(filePath.replace(/^\/+/, ""))
      return sendWithRetry(
        () =>
          doFetch(`${base}/p/${encodeURIComponent(token)}/${path}`, {
            method: "GET",
            headers: authorized(headers),
          }),
        "GET",
        base,
      )
    },
  }
}
