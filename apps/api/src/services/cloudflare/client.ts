import { PublishWorkerHealth } from "@adt/types"

export const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4"

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>

export interface CloudflareApiIssue {
  code: number
  message: string
}

export class CloudflareApiError extends Error {
  readonly status: number
  readonly issues: CloudflareApiIssue[]

  constructor(status: number, issues: CloudflareApiIssue[], fallback: string) {
    const detail = issues.map((issue) => issue.message).filter(Boolean).join("; ")
    super(detail || fallback)
    this.name = "CloudflareApiError"
    this.status = status
    this.issues = issues
  }

  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403
  }

  get isNotFound(): boolean {
    return this.status === 404
  }

  hasCode(code: number): boolean {
    return this.issues.some((issue) => issue.code === code)
  }
}

export interface D1Database {
  uuid: string
  name: string
}

export interface D1QueryResult {
  success: boolean
  results: Array<Record<string, unknown>>
}

export interface CloudflareAccount {
  id: string
  name: string
}

export interface WorkerScriptUpload {
  name: string
  script: string
  metadata: Record<string, unknown>
}

export interface CloudflareClient {
  readonly accountId: string
  verifyToken(): Promise<{ status: string }>
  getAccount(): Promise<CloudflareAccount>
  listD1Databases(name?: string): Promise<D1Database[]>
  createD1Database(name: string): Promise<D1Database>
  deleteD1Database(uuid: string): Promise<void>
  queryD1(uuid: string, sql: string, params?: string[]): Promise<D1QueryResult[]>
  listR2Buckets(): Promise<Array<{ name: string }>>
  createR2Bucket(name: string): Promise<void>
  deleteR2Bucket(name: string): Promise<void>
  listWorkerScripts(): Promise<Array<{ id: string }>>
  uploadWorkerScript(upload: WorkerScriptUpload): Promise<void>
  deleteWorkerScript(name: string): Promise<void>
  getWorkersDevSubdomain(): Promise<string | null>
  enableScriptSubdomain(name: string): Promise<void>
}

export interface CloudflareClientOptions {
  token: string
  accountId: string
  fetchFn?: FetchLike
  baseUrl?: string
}

interface CloudflareEnvelope<T> {
  success?: boolean
  errors?: CloudflareApiIssue[]
  result?: T
}

function normalizeIssues(value: unknown): CloudflareApiIssue[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return []
    const record = entry as Record<string, unknown>
    return [
      {
        code: typeof record.code === "number" ? record.code : 0,
        message: typeof record.message === "string" ? record.message : "",
      },
    ]
  })
}

export function createCloudflareClient(
  options: CloudflareClientOptions,
): CloudflareClient {
  const { token, accountId } = options
  const fetchFn: FetchLike = options.fetchFn ?? ((input, init) => fetch(input, init))
  const baseUrl = (options.baseUrl ?? CLOUDFLARE_API_BASE_URL).replace(/\/$/, "")

  async function request<T>(
    pathname: string,
    init: RequestInit = {},
  ): Promise<T | undefined> {
    const headers = new Headers(init.headers)
    headers.set("Authorization", `Bearer ${token}`)
    const response = await fetchFn(`${baseUrl}${pathname}`, { ...init, headers })
    const text = await response.text()

    let envelope: CloudflareEnvelope<T> | null = null
    if (text.length > 0) {
      try {
        envelope = JSON.parse(text) as CloudflareEnvelope<T>
      } catch {
        envelope = null
      }
    }

    if (!response.ok || envelope?.success === false) {
      throw new CloudflareApiError(
        response.status,
        normalizeIssues(envelope?.errors),
        `Cloudflare API ${init.method ?? "GET"} ${pathname} failed with status ${response.status}`,
      )
    }

    return envelope?.result
  }

  async function requestJson<T>(
    pathname: string,
    method: string,
    body: unknown,
  ): Promise<T | undefined> {
    return request<T>(pathname, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  const account = `/accounts/${encodeURIComponent(accountId)}`

  return {
    accountId,

    async verifyToken() {
      const result = await request<{ status?: string }>("/user/tokens/verify")
      return { status: result?.status ?? "unknown" }
    },

    async getAccount() {
      const result = await request<{ id?: string; name?: string }>(account)
      return { id: result?.id ?? accountId, name: result?.name ?? "" }
    },

    async listD1Databases(name) {
      const query = name ? `?name=${encodeURIComponent(name)}&per_page=100` : "?per_page=100"
      const result = await request<Array<{ uuid?: string; name?: string }>>(
        `${account}/d1/database${query}`,
      )
      return (result ?? []).flatMap((entry) =>
        entry.uuid && entry.name ? [{ uuid: entry.uuid, name: entry.name }] : [],
      )
    },

    async createD1Database(name) {
      const result = await requestJson<{ uuid?: string; name?: string }>(
        `${account}/d1/database`,
        "POST",
        { name },
      )
      if (!result?.uuid) {
        throw new CloudflareApiError(200, [], `Cloudflare returned no uuid for D1 database ${name}`)
      }
      return { uuid: result.uuid, name: result.name ?? name }
    },

    async deleteD1Database(uuid) {
      await request(`${account}/d1/database/${encodeURIComponent(uuid)}`, {
        method: "DELETE",
      })
    },

    async queryD1(uuid, sql, params) {
      const result = await requestJson<D1QueryResult[]>(
        `${account}/d1/database/${encodeURIComponent(uuid)}/query`,
        "POST",
        params && params.length > 0 ? { sql, params } : { sql },
      )
      return (result ?? []).map((entry) => ({
        success: entry.success !== false,
        results: Array.isArray(entry.results) ? entry.results : [],
      }))
    },

    async listR2Buckets() {
      const result = await request<{ buckets?: Array<{ name?: string }> }>(
        `${account}/r2/buckets?per_page=1000`,
      )
      return (result?.buckets ?? []).flatMap((entry) =>
        entry.name ? [{ name: entry.name }] : [],
      )
    },

    async createR2Bucket(name) {
      await requestJson(`${account}/r2/buckets`, "POST", { name })
    },

    async deleteR2Bucket(name) {
      await request(`${account}/r2/buckets/${encodeURIComponent(name)}`, {
        method: "DELETE",
      })
    },

    async listWorkerScripts() {
      const result = await request<Array<{ id?: string }>>(`${account}/workers/scripts`)
      return (result ?? []).flatMap((entry) => (entry.id ? [{ id: entry.id }] : []))
    },

    async uploadWorkerScript({ name, script, metadata }) {
      const form = new FormData()
      const mainModule = String(metadata.main_module ?? "worker.js")
      form.append(
        "metadata",
        new Blob([JSON.stringify(metadata)], { type: "application/json" }),
      )
      form.append(
        mainModule,
        new Blob([script], { type: "application/javascript+module" }),
        mainModule,
      )
      await request(`${account}/workers/scripts/${encodeURIComponent(name)}`, {
        method: "PUT",
        body: form,
      })
    },

    async deleteWorkerScript(name) {
      await request(
        `${account}/workers/scripts/${encodeURIComponent(name)}?force=true`,
        { method: "DELETE" },
      )
    },

    async getWorkersDevSubdomain() {
      try {
        const result = await request<{ subdomain?: string | null }>(
          `${account}/workers/subdomain`,
        )
        return result?.subdomain ? result.subdomain : null
      } catch (error) {
        if (error instanceof CloudflareApiError && error.isNotFound) {
          return null
        }
        throw error
      }
    },

    async enableScriptSubdomain(name) {
      await requestJson(
        `${account}/workers/scripts/${encodeURIComponent(name)}/subdomain`,
        "POST",
        { enabled: true, previews_enabled: false },
      )
    },
  }
}

export interface WorkerHealth {
  reachable: boolean
  version: string | null
}

export async function fetchWorkerHealth(
  workerUrl: string,
  fetchFn: FetchLike = (input, init) => fetch(input, init),
  timeoutMs = 5000,
): Promise<WorkerHealth> {
  try {
    const response = await fetchFn(`${workerUrl.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      return { reachable: true, version: null }
    }
    const parsed = PublishWorkerHealth.safeParse(await response.json())
    return { reachable: true, version: parsed.success ? parsed.data.version : null }
  } catch {
    return { reachable: false, version: null }
  }
}
