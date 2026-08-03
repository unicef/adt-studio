import {
  PublicationCreateResponse,
  PublicationDetail,
  PublicationResponse,
  PublicationVersionCreateResponse,
  PublishErrorResponse,
  type PublicationCreateRequest,
  type PublicationPageEntry,
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
  setExpiry(token: string, expiresAt: string | null): Promise<PublicationResponse>
  getPublication(token: string): Promise<PublicationDetail>
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

    async getPublication(token) {
      return (await request(
        `/api/publications/${token}`,
        { method: "GET" },
        PublicationDetail,
      )) as PublicationDetail
    },
  }
}
